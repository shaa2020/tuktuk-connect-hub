// Server-only: send a reply into an existing conversation through the account the guest contacted.
// Only called after the caller is authorised (team member via RLS, or the AI Operator job).
export async function sendToConversation(convId: string, body: string, authorId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendMeta } = await import("./channels.server");
  const { data: conv } = await supabaseAdmin.from("conversations").select("id, workspace_id, channel, connection_id").eq("id", convId).maybeSingle();
  if (!conv) return { ok: false, error: "Conversation not found." };
  if (!["whatsapp", "messenger", "instagram", "email"].includes(conv.channel)) return { ok: false, error: "This channel can't send messages." };
  const [{ data: cc }, { data: part }] = await Promise.all([
    conv.connection_id
      ? supabaseAdmin.from("channel_connections").select("id, status, config").eq("id", conv.connection_id).maybeSingle()
      : supabaseAdmin.from("channel_connections").select("id, status, config").eq("workspace_id", conv.workspace_id).eq("channel", conv.channel).eq("status", "connected").limit(1).maybeSingle(),
    supabaseAdmin.from("conversation_participants").select("external_identities(external_id)").eq("conversation_id", conv.id).limit(1).maybeSingle(),
  ]);
  if (cc?.status !== "connected") return { ok: false, error: "This channel isn't connected." };
  const to = (part as any)?.external_identities?.external_id as string | undefined;
  if (!to) return { ok: false, error: "No customer address for this conversation." };
  try {
    const cfg = (cc.config ?? {}) as Record<string, string>;
    const extId = cfg.mode === "hub"
      ? await (await import("./hub.server")).sendViaHub(conv.workspace_id, conv.channel, cfg, to, body, conv.id)
      : conv.channel === "email" && cfg.mode === "imap"
      ? await sendViaApp(conv.workspace_id, conv.id, cc.id, cfg, to, body)
      : conv.channel === "email"
      ? await (await import("./email-channel.server")).sendEmail(conv.workspace_id, conv.id, to, body)
      : await sendMeta(conv.workspace_id, conv.channel as any, cfg, to, body, cc.id);
    await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body, status: "sent", external_id: extId ?? null, author_id: authorId });
    if (conv.channel === "whatsapp") await (await import("./whatsapp-inbox.server")).recover().catch(() => {});
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body, status: "failed", error_message: msg, author_id: authorId });
    return { ok: false, error: msg };
  }
}

async function sendViaApp(ws: string, convId: string, connId: string, cfg: Record<string, string>, to: string, body: string) {
  const { getSecret } = await import("./secrets.server");
  const { passKind, sendSmtp } = await import("./imap-mail.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pass = await getSecret(ws, passKind(connId));
  if (!pass) throw new Error("This Gmail account needs its app password again.");
  const { data: last } = await supabaseAdmin.from("messages").select("body").eq("conversation_id", convId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const s = /^Subject: (.+)/.exec(last?.body ?? "")?.[1]?.trim();
  // Sender name and default subject come from the business's own workspace name.
  const { data: w } = await supabaseAdmin.from("workspaces").select("name").eq("id", ws).maybeSingle();
  const brand = (w?.name as string | undefined)?.trim() || cfg.address || "Customer service";
  const subject = s ? (/^re:/i.test(s) ? s : `Re: ${s}`) : brand;
  return `im-out:${await sendSmtp(cfg.address ?? "", pass, to, subject, body, brand)}`;
}
