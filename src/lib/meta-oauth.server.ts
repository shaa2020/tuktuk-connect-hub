// Server-only: Meta one-click connect (Facebook Login) for Messenger + Instagram.
// The owner saves their Meta App ID + App Secret once; afterwards each account connects
// with a single "Allow" in the Facebook/Instagram app. Tokens never reach the browser.
import { GRAPH, tokenKind } from "./channels.server";
import { decrypt, deleteSecrets, encrypt, getSecret, setSecret } from "./secrets.server";

export const META_SCOPES = [
  "pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement",
  "instagram_basic", "instagram_manage_messages", "business_management",
].join(",");
export const callbackPath = "/api/public/oauth/meta/callback";
const PENDING_TTL = 15 * 60_000;

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function graph(path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, init);
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || j?.error) throw new Error(`Meta: ${String(j?.error?.message ?? res.status).slice(0, 200)}`);
  return j;
}

export async function appCreds(ws: string) {
  const [id, secret] = await Promise.all([getSecret(ws, "meta_app_id"), getSecret(ws, "meta_app_secret")]);
  return id && secret ? { id, secret } : null;
}

/** Validates the app and registers the webhook automatically, so nothing must be pasted into Meta. */
export async function saveAppAndSubscribe(ws: string, appId: string, appSecret: string, origin: string, userId: string) {
  const appToken = `${appId}|${appSecret}`;
  const app = await graph(`/${encodeURIComponent(appId)}?fields=name&access_token=${encodeURIComponent(appToken)}`);
  let verify = await getSecret(ws, "meta_verify_token");
  if (!verify) { verify = crypto.randomUUID() + crypto.randomUUID(); await setSecret(ws, "meta_verify_token", verify, userId); }
  await setSecret(ws, "meta_app_id", appId, userId);
  await setSecret(ws, "meta_app_secret", appSecret, userId);
  const callback = `${origin}/api/public/webhooks/meta/${ws}`;
  const warnings: string[] = [];
  for (const [object, fields] of [["page", "messages,message_deliveries,message_reads,messaging_postbacks"], ["instagram", "messages"]] as const) {
    const body = new URLSearchParams({ object, callback_url: callback, fields, verify_token: verify, access_token: appToken });
    try { await graph(`/${encodeURIComponent(appId)}/subscriptions`, { method: "POST", body }); }
    catch (e) { warnings.push(`${object === "page" ? "Messenger" : "Instagram"} webhook: ${(e as Error).message}`); }
  }
  return { name: app.name as string, warnings };
}

export async function makeState(payload: { ws: string; uid: string; ch: "messenger" | "instagram"; redirect: string }) {
  return encodeURIComponent(await encrypt(JSON.stringify({ ...payload, exp: Date.now() + PENDING_TTL })));
}
export async function readState(raw: string) {
  const s = JSON.parse(await decrypt(decodeURIComponent(raw))) as { ws: string; uid: string; ch: "messenger" | "instagram"; redirect: string; exp: number };
  if (!s.exp || s.exp < Date.now()) throw new Error("This connect link expired. Please tap Connect again.");
  return s;
}

/** Callback: code → long-lived user token, kept encrypted for 15 min while the admin picks accounts. */
export async function finishLogin(state: Awaited<ReturnType<typeof readState>>, code: string) {
  const creds = await appCreds(state.ws);
  if (!creds) throw new Error("Meta app is not set up.");
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const short = await graph(`/oauth/access_token?${q({ client_id: creds.id, client_secret: creds.secret, redirect_uri: state.redirect, code })}`);
  const long = await graph(`/oauth/access_token?${q({ grant_type: "fb_exchange_token", client_id: creds.id, client_secret: creds.secret, fb_exchange_token: short.access_token })}`);
  const nonce = crypto.randomUUID();
  await setSecret(state.ws, `meta_pending:${nonce}`, JSON.stringify({ uid: state.uid, token: long.access_token, exp: Date.now() + PENDING_TTL }), state.uid);
  return nonce;
}

async function pending(ws: string, nonce: string, uid: string) {
  const raw = await getSecret(ws, `meta_pending:${nonce}`);
  if (!raw) throw new Error("This connection session expired. Please tap Connect again.");
  const p = JSON.parse(raw) as { uid: string; token: string; exp: number };
  if (p.uid !== uid || p.exp < Date.now()) throw new Error("This connection session expired. Please tap Connect again.");
  return p.token;
}

type Page = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };
async function pages(token: string) {
  const j = await graph(`/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(token)}`);
  return (j.data ?? []) as Page[];
}

/** Accounts the owner can pick from — names only, no tokens. */
export async function listChoices(ws: string, nonce: string, uid: string) {
  const list = await pages(await pending(ws, nonce, uid));
  return list.map((p) => ({ pageId: p.id, pageName: p.name, igId: p.instagram_business_account?.id ?? null, igUsername: p.instagram_business_account?.username ?? null }));
}

export async function connectChoice(ws: string, nonce: string, uid: string, channel: "messenger" | "instagram", pageId: string) {
  const page = (await pages(await pending(ws, nonce, uid))).find((p) => p.id === pageId);
  if (!page) throw new Error("That Page wasn't shared with TukTuk24. Tap Connect again and select it.");
  const accountId = channel === "messenger" ? page.id : page.instagram_business_account?.id;
  if (!accountId) throw new Error("This Facebook Page has no Instagram professional account linked to it.");
  // Receive messages for this Page (and its Instagram account).
  await graph(`/${page.id}/subscribed_apps`, { method: "POST", body: new URLSearchParams({ subscribed_fields: "messages,message_deliveries,message_reads,messaging_postbacks", access_token: page.access_token }) });
  const name = channel === "messenger" ? page.name : page.instagram_business_account?.username ? `@${page.instagram_business_account.username}` : page.name;
  const config: Record<string, string> = channel === "messenger" ? { page_id: page.id, mode: "oauth" } : { account_id: accountId, page_id: page.id, mode: "oauth" };
  const sb = await db();
  const rows = (await sb.from("channel_connections").select("id, account_id, status").eq("workspace_id", ws).eq("channel", channel)).data ?? [];
  const fields = { status: "connected" as const, display_name: name, config, account_id: accountId, last_error: null, last_checked_at: new Date().toISOString() };
  let row = rows.find((r) => r.account_id === accountId) || rows.find((r) => !r.account_id && r.status !== "connected");
  if (row) {
    const { error } = await sb.from("channel_connections").update(fields).eq("id", row.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await sb.from("channel_connections").insert({ workspace_id: ws, channel, ...fields }).select("id, account_id, status").single();
    if (error) throw new Error(error.message);
    row = data;
  }
  await setSecret(ws, tokenKind(channel, row!.id), page.access_token, uid);
  return name;
}

export async function dropPending(ws: string, nonce: string) { await deleteSecrets(ws, [`meta_pending:${nonce}`]); }
