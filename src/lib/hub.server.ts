// Server-only: Automation Hub (n8n / Make) bridge. Inbound posts arrive at /api/public/webhooks/hub/$workspaceId
// with the workspace hub key; replies to hub conversations are POSTed to the saved outbound URL, signed with HMAC.
export const HUB_CHANNELS = ["whatsapp", "instagram", "messenger", "email"] as const;
export type HubChannel = (typeof HUB_CHANNELS)[number];

export async function hubConnection(ws: string, channel: HubChannel, account: string, label?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const accountId = `hub:${account}`.slice(0, 200);
  const { data } = await supabaseAdmin.from("channel_connections").select("id, status").eq("workspace_id", ws).eq("channel", channel).eq("account_id", accountId).maybeSingle();
  if (data) {
    if (data.status !== "connected") await supabaseAdmin.from("channel_connections").update({ status: "connected" }).eq("id", data.id);
    return data.id;
  }
  const { data: row, error } = await supabaseAdmin.from("channel_connections").insert({
    workspace_id: ws, channel, account_id: accountId, account_label: (label || account).slice(0, 60), display_name: account.slice(0, 120),
    status: "connected", config: { mode: "hub", account },
  }).select("id").single();
  if (error) throw error;
  return row.id;
}

export async function sendViaHub(ws: string, channel: string, cfg: Record<string, string>, to: string, body: string, convId: string) {
  const { getSecret, hmacSha256Hex } = await import("./secrets.server");
  const [url, key] = await Promise.all([getSecret(ws, "hub_outbound_url"), getSecret(ws, "hub_key")]);
  if (!url || !key) throw new Error("Automation Hub reply address isn't set yet.");
  const payload = JSON.stringify({ channel, account: cfg.account ?? "", to, text: body, conversation_id: convId });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-TT24-Signature": `sha256=${await hmacSha256Hex(key, payload)}` }, body: payload });
  if (!res.ok) throw new Error(`Automation Hub returned ${res.status}`);
  const j = await res.json().catch(() => ({}) as any);
  return `hub:${j?.message_id ?? crypto.randomUUID()}`;
}
