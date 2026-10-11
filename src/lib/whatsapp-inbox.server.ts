// Server-only: durable inbox for WhatsApp connector webhooks + idempotent processing.
import { applyStatus, ingestInbound } from "./channels.server";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

type Row = { id: string; event: string; payload: any; attempts: number };
const MAX_ATTEMPTS = 10;

async function connectorTarget(phoneNumberId?: string) {
  const sb = await db();
  let q = sb.from("channel_connections").select("id, workspace_id").eq("channel", "whatsapp").eq("status", "connected").eq("config->>mode", "connector");
  if (phoneNumberId) q = q.eq("account_id", String(phoneNumberId));
  const { data } = await q.limit(1).maybeSingle();
  return data;
}

/** Returns "done" or "pending" (status for a message not saved yet). Throws on real failures. */
async function processRow(row: Row): Promise<"done" | "pending"> {
  const v = row.payload?.entry?.[0]?.changes?.[0]?.value ?? {};
  const target = await connectorTarget(v.metadata?.phone_number_id);
  if (!target) return "done"; // no workspace linked; payload kept in the inbox
  const ws = target.workspace_id;
  if (row.event === "whatsapp.message") {
    const names: Record<string, string> = Object.fromEntries((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
    for (const m of v.messages ?? []) {
      const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption;
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
        ?? (m.type ? `[${m.type} received${caption ? `: ${caption}` : ""} — open WhatsApp to view]` : "");
      await ingestInbound(ws, "whatsapp", { from: m.from, name: names[m.from], externalMessageId: m.id, text, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined, connectionId: target.id });
    }
    return "done";
  }
  if (row.event === "whatsapp.smb_message_echoes") {
    // Replies typed in the WhatsApp Business app on the phone: show them in the conversation.
    for (const m of v.message_echoes ?? []) {
      if (!m.to || !m.id) continue;
      const text = m.text?.body ?? (m.type ? `[${m.type} sent from the WhatsApp app]` : "");
      await ingestInbound(ws, "whatsapp", { from: m.to, externalMessageId: m.id, text, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined, connectionId: target.id, direction: "outbound" });
    }
    return "done";
  }
  if (row.event === "whatsapp.status") {
    let pending = false;
    for (const s of v.statuses ?? []) {
      const ok = await applyStatus(ws, s.id, s.status, `${s.id}:${s.status}`, s.errors?.[0]?.title ?? s.errors?.[0]?.message);
      if (!ok) pending = true;
    }
    return pending ? "pending" : "done";
  }
  return "done"; // other events are stored for reference
}

async function run(row: Row) {
  const sb = await db();
  try {
    const r = await processRow(row);
    const giveUp = r === "pending" && row.attempts + 1 >= MAX_ATTEMPTS;
    await sb.from("whatsapp_webhook_events").update({
      attempts: row.attempts + 1,
      processed_at: r === "done" || giveUp ? new Date().toISOString() : null,
      processing_error: r === "pending" ? (giveUp ? "Message not found — gave up" : "Waiting for the sent message to be saved") : null,
    }).eq("id", row.id);
    return true;
  } catch (e) {
    await sb.from("whatsapp_webhook_events").update({ attempts: row.attempts + 1, processing_error: String((e as Error).message).slice(0, 300) }).eq("id", row.id);
    return false;
  }
}

/** Store then process. Returns HTTP status to send back. */
export async function receive(deliveryId: string, event: string, payload: unknown): Promise<number> {
  const sb = await db();
  const ins = await sb.from("whatsapp_webhook_events").insert({ delivery_id: deliveryId, event, payload: payload as any }).select("id, event, payload, attempts, processed_at").maybeSingle();
  let row: any = ins.data;
  if (ins.error) {
    if (ins.error.code !== "23505") { console.error("wa inbox insert", ins.error); return 500; }
    row = (await sb.from("whatsapp_webhook_events").select("id, event, payload, attempts, processed_at").eq("delivery_id", deliveryId).maybeSingle()).data;
    if (!row) return 500;
  }
  const ok = row.processed_at ? true : await run(row);
  await recover(row.id);
  return ok ? 200 : 500;
}

/** Bounded retry of unfinished rows, least-attempted first so blocked rows can't starve others. */
export async function recover(skipId?: string) {
  const sb = await db();
  const { data } = await sb.from("whatsapp_webhook_events").select("id, event, payload, attempts").is("processed_at", null)
    .order("attempts", { ascending: true }).order("received_at", { ascending: true }).limit(6);
  for (const r of (data ?? []).filter((x) => x.id !== skipId).slice(0, 5)) await run(r as Row);
}
