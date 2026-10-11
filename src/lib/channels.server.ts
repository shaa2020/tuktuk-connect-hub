// Server-only: Meta (WhatsApp / Messenger / Instagram) Graph API calls and inbound ingestion.
import { getSecret } from "./secrets.server";

export const GRAPH = "https://graph.facebook.com/v21.0";
export type MetaChannel = "whatsapp" | "messenger" | "instagram";
export const TOKEN_KIND: Record<MetaChannel, string> = { whatsapp: "whatsapp_token", messenger: "messenger_token", instagram: "instagram_token" };

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
function scrub(msg: string, token: string) { return msg.replaceAll(token, "••••").slice(0, 300); }

/** Checks credentials against Meta. Returns a display name on success. */
export async function testMeta(channel: MetaChannel, config: Record<string, string>, token: string) {
  const id = channel === "whatsapp" ? config.phone_number_id : channel === "messenger" ? config.page_id : config.account_id;
  if (!id) throw new Error("Missing account ID.");
  const fields = channel === "whatsapp" ? "display_phone_number,verified_name" : channel === "messenger" ? "name" : "username";
  const res = await fetch(`${GRAPH}/${encodeURIComponent(id)}?fields=${fields}`, { headers: { authorization: `Bearer ${token}` } });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(scrub(`Meta: ${j?.error?.message ?? res.status}`, token));
  return (j.verified_name ? `${j.verified_name} (${j.display_phone_number})` : j.display_phone_number || j.name || (j.username && `@${j.username}`) || id) as string;
}

/** Secret kind for one connection's token; older single-account tokens use the plain kind. */
export const tokenKind = (channel: MetaChannel, connectionId?: string | null) => connectionId ? `${TOKEN_KIND[channel]}:${connectionId}` : TOKEN_KIND[channel];

export async function sendMeta(ws: string, channel: MetaChannel, config: Record<string, string>, to: string, body: string, connectionId?: string | null) {
  const token = (connectionId && (await getSecret(ws, tokenKind(channel, connectionId)))) || (await getSecret(ws, TOKEN_KIND[channel]));
  if (!token) throw new Error("Channel credentials are missing.");
  const url = channel === "whatsapp" ? `${GRAPH}/${config.phone_number_id}/messages` : `${GRAPH}/me/messages`;
  const payload = channel === "whatsapp"
    ? { messaging_product: "whatsapp", to, type: "text", text: { body } }
    : { recipient: { id: to }, messaging_type: "RESPONSE", message: { text: body } };
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(scrub(`Meta: ${j?.error?.message ?? res.status}`, token));
  return (j.messages?.[0]?.id ?? j.message_id) as string;
}

export async function ingestInbound(ws: string, channel: MetaChannel | "email", ev: { from: string; name?: string; externalMessageId: string; text: string; at?: Date; connectionId?: string | null }) {
  const sb = await db();
  let { data: ident } = await sb.from("external_identities").select("id, contact_id").eq("workspace_id", ws).eq("channel", channel).eq("external_id", ev.from).maybeSingle();
  if (!ident) {
    let contact: { id: string } | null = null;
    if (channel === "email") contact = (await sb.from("contacts").select("id").eq("workspace_id", ws).ilike("email", ev.from).limit(1).maybeSingle()).data;
    if (!contact) contact = (await sb.from("contacts").insert({
      workspace_id: ws, full_name: (ev.name || ev.from).slice(0, 200), phone: channel === "whatsapp" ? `+${ev.from}`.slice(0, 40) : null,
      email: channel === "email" ? ev.from.slice(0, 254) : null, created_by: null,
    }).select("id").single()).data;
    const r = await sb.from("external_identities").insert({ workspace_id: ws, channel, external_id: ev.from, display_name: ev.name ?? null, contact_id: contact?.id ?? null, verified: true }).select("id, contact_id").single();
    ident = r.data;
  }
  if (!ident) throw new Error("identity");
  const { data: parts } = await sb.from("conversation_participants").select("conversation_id, conversations!inner(id, status, last_message_at, connection_id)").eq("external_identity_id", ident.id);
  const open = (parts ?? []).map((p: any) => p.conversations).filter((c: any) => c && c.status !== "archived" && (!ev.connectionId || !c.connection_id || c.connection_id === ev.connectionId))
    .sort((a: any, b: any) => b.last_message_at.localeCompare(a.last_message_at))[0];
  let convId = open?.id as string | undefined;
  if (open && (open.status === "resolved" || (ev.connectionId && !open.connection_id))) await sb.from("conversations").update({ ...(open.status === "resolved" ? { status: "open" as const } : {}), ...(ev.connectionId ? { connection_id: ev.connectionId } : {}) }).eq("id", open.id);
  if (!convId) {
    const { data: c } = await sb.from("conversations").insert({ workspace_id: ws, channel, contact_id: ident.contact_id, created_by: null, connection_id: ev.connectionId ?? null }).select("id").single();
    convId = c!.id;
    await sb.from("conversation_participants").insert({ conversation_id: convId, external_identity_id: ident.id, workspace_id: ws });
  }
  const { error } = await sb.from("messages").insert({
    workspace_id: ws, conversation_id: convId, direction: "inbound", body: (ev.text || "(unsupported message type)").slice(0, 10000),
    status: "delivered", external_id: ev.externalMessageId, author_id: null, ...(ev.at ? { created_at: ev.at.toISOString() } : {}),
  });
  if (error && error.code !== "23505") throw error; // duplicate webhook delivery is fine
}

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed"> = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
export async function applyStatus(ws: string, externalId: string, status: string, eventId: string, detail?: string) {
  const s = STATUS_MAP[status];
  if (!s) return;
  const sb = await db();
  const { data: m } = await sb.from("messages").select("id, status").eq("workspace_id", ws).eq("external_id", externalId).maybeSingle();
  if (!m) return;
  const rank = { logged: 0, queued: 0, sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 } as Record<string, number>;
  await sb.from("message_delivery_events").insert({ workspace_id: ws, message_id: m.id, status: s, provider_event_id: eventId, detail: detail ?? null });
  if ((rank[s] ?? 0) > (rank[m.status] ?? 0)) await sb.from("messages").update({ status: s, error_message: s === "failed" ? (detail ?? "Delivery failed").slice(0, 300) : null }).eq("id", m.id);
}

/** Finds which connected account received a webhook event (by phone number / page / IG account ID). */
export async function findConnection(ws: string, channel: MetaChannel, accountId: string | undefined) {
  if (!accountId) return null;
  const sb = await db();
  const { data } = await sb.from("channel_connections").select("id").eq("workspace_id", ws).eq("channel", channel).eq("account_id", String(accountId)).maybeSingle();
  return data?.id ?? null;
}
