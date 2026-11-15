// Server-only: Telegram Bot API. Each business brings its own bot (token from @BotFather), stored
// encrypted as telegram_token:<connectionId>. Webhooks are authenticated with a per-connection
// random secret that Telegram echoes in X-Telegram-Bot-Api-Secret-Token.
import { getSecret, setSecret, deleteSecrets } from "./secrets.server";
import { telegramWebhookPath } from "./telegram";

const API = "https://api.telegram.org";
export const tokenKey = (id: string) => `telegram_token:${id}`;
export const secretKey = (id: string) => `telegram_secret:${id}`;

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

async function call(token: string, method: string, body?: unknown) {
  const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !j.ok) throw new Error(`Telegram: ${String(j?.description ?? res.status).replaceAll(token, "••••").slice(0, 200)}`);
  return j.result;
}

async function appBaseUrl() {
  const { data } = await (await db()).from("app_config").select("value").eq("key", "app_base_url").maybeSingle();
  if (!data?.value) throw new Error("The app's public address isn't configured (app_config.app_base_url).");
  return String(data.value).replace(/\/$/, "");
}

/** Verifies the token, registers the webhook and saves the connection. */
export async function connectBot(ws: string, token: string, label: string | null, userId: string) {
  const me = await call(token, "getMe");
  const sb = await db();
  const fields = { status: "connected", display_name: me.username ? `@${me.username}` : me.first_name, account_id: String(me.id), account_label: label, config: { username: me.username ?? null }, last_error: null, last_checked_at: new Date().toISOString() };
  const { data: existing } = await sb.from("channel_connections").select("id").eq("workspace_id", ws).eq("channel", "telegram").eq("account_id", String(me.id)).maybeSingle();
  let id: string = existing?.id;
  if (id) {
    const { error } = await sb.from("channel_connections").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from("channel_connections").insert({ workspace_id: ws, channel: "telegram", ...fields }).select("id").single();
    if (error) throw new Error(error.message.includes("PLAN_LIMIT") ? "Your plan's connected-account limit is reached." : error.message);
    id = data.id;
  }
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  await setSecret(ws, tokenKey(id), token, userId);
  await setSecret(ws, secretKey(id), secret, userId);
  await call(token, "setWebhook", { url: `${await appBaseUrl()}${telegramWebhookPath(id)}`, secret_token: secret, allowed_updates: ["message", "edited_message"], drop_pending_updates: false });
  return { id, name: fields.display_name as string };
}

export async function disconnectBot(ws: string, connectionId: string) {
  const token = await getSecret(ws, tokenKey(connectionId));
  if (token) await call(token, "deleteWebhook").catch(() => {});
  await deleteSecrets(ws, [tokenKey(connectionId), secretKey(connectionId)]);
  await (await db()).from("channel_connections").update({ status: "disconnected", last_error: null }).eq("id", connectionId).eq("workspace_id", ws);
}

export async function sendTelegram(ws: string, connectionId: string, chatId: string, text: string) {
  const token = await getSecret(ws, tokenKey(connectionId));
  if (!token) throw new Error("This Telegram bot needs to be connected again.");
  const r = await call(token, "sendMessage", { chat_id: chatId, text: text.slice(0, 4096) });
  return `tg:${chatId}:${r.message_id}`;
}
