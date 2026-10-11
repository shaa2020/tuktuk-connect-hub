import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Every admin action verifies the caller's role via RLS-backed RPC before touching credentials.
async function assertAdmin(supabase: any, workspaceId: string) {
  const { data, error } = await supabase.rpc("has_ws_role", { _ws: workspaceId, _roles: ["admin"] });
  if (error || data !== true) throw new Error("Only a Business Admin can do this.");
}
const secretStr = z.string().trim().min(8).max(1000);

export const getCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { secretHints } = await import("./secrets.server");
    return secretHints(data.workspaceId); // masked hints only (e.g. ••••a1b2)
  });

const aiSchema = z.object({
  workspaceId: z.string().uuid(),
  provider: z.enum(["lovable", "openai", "anthropic", "gemini", "openrouter", "custom"]),
  model: z.string().trim().max(120).optional(),
  baseUrl: z.string().trim().url().startsWith("https://").max(300).optional().or(z.literal("")),
  apiKey: secretStr.optional().or(z.literal("")),
});

export const saveAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => aiSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { setSecret, getSecret } = await import("./secrets.server");
    const { callProvider } = await import("./ai-provider.server");
    const settings = { provider: data.provider, model: data.model || null, base_url: data.provider === "custom" ? data.baseUrl || null : null };
    if (data.provider !== "lovable") {
      if (!settings.model) return { ok: false as const, error: "Enter a model name." };
      if (data.provider === "custom" && !settings.base_url) return { ok: false as const, error: "Enter the provider's https address." };
      const key = data.apiKey || (await getSecret(data.workspaceId, "ai_api_key"));
      if (!key) return { ok: false as const, error: "Enter your API key." };
      try { await callProvider(settings, key, { instructions: "Reply with OK.", input: "ping" }); }
      catch (e) { return { ok: false as const, error: (e as Error).message }; }
      if (data.apiKey) await setSecret(data.workspaceId, "ai_api_key", data.apiKey, context.userId);
    }
    const { error } = await context.supabase.from("ai_settings").upsert({ workspace_id: data.workspaceId, ...settings, updated_at: new Date().toISOString() });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const removeAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { deleteSecrets } = await import("./secrets.server");
    await deleteSecrets(data.workspaceId, ["ai_api_key"]);
    await context.supabase.from("ai_settings").upsert({ workspace_id: data.workspaceId, provider: "lovable", model: null, base_url: null });
    return { ok: true as const };
  });

const idStr = z.string().trim().regex(/^[0-9A-Za-z_-]{3,64}$/, "Invalid ID");
const labelStr = z.string().trim().max(60).optional().or(z.literal(""));
export const connectMetaChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    workspaceId: z.string().uuid(),
    channel: z.enum(["whatsapp", "messenger", "instagram"]),
    connectionId: z.string().uuid().optional(),
    label: labelStr,
    accountId: idStr,
    token: secretStr.optional().or(z.literal("")),
    appSecret: secretStr.optional().or(z.literal("")),
    verifyToken: z.string().trim().min(12).max(200).optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { setSecret, getSecret } = await import("./secrets.server");
    const { testMeta, tokenKind } = await import("./channels.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config: Record<string, string> = data.channel === "whatsapp" ? { phone_number_id: data.accountId } : data.channel === "messenger" ? { page_id: data.accountId } : { account_id: data.accountId };
    // Pick the row: the one being managed, an existing row for this account, or an unused placeholder for the channel.
    const rows = (await supabaseAdmin.from("channel_connections").select("id, account_id, status").eq("workspace_id", data.workspaceId).eq("channel", data.channel)).data ?? [];
    let row = (data.connectionId && rows.find((r) => r.id === data.connectionId)) || rows.find((r) => r.account_id === data.accountId) || rows.find((r) => !r.account_id && r.status !== "connected");
    if (data.connectionId && !row) return { ok: false as const, error: "Connection not found." };
    if (row && row.account_id !== data.accountId && rows.some((r) => r.account_id === data.accountId && r.id !== row!.id)) return { ok: false as const, error: "That account is already connected." };
    const savedToken = row ? (await getSecret(data.workspaceId, tokenKind(data.channel, row.id))) || (rows.length === 1 ? await getSecret(data.workspaceId, tokenKind(data.channel)) : null) : null;
    const token = data.token || savedToken;
    if (!token) return { ok: false as const, error: "Enter the access token." };
    if (!data.appSecret && !(await getSecret(data.workspaceId, "meta_app_secret"))) return { ok: false as const, error: "Enter the Meta app secret (used to verify incoming messages)." };
    if (!data.verifyToken && !(await getSecret(data.workspaceId, "meta_verify_token"))) return { ok: false as const, error: "Choose a webhook verify token (12+ characters)." };
    let name: string;
    try { name = await testMeta(data.channel, config, token); }
    catch (e) {
      if (row) await supabaseAdmin.from("channel_connections").update({ status: "error", last_error: (e as Error).message, last_checked_at: new Date().toISOString() }).eq("id", row.id);
      return { ok: false as const, error: (e as Error).message };
    }
    const fields = { status: "connected" as const, display_name: name, config, account_id: data.accountId, account_label: data.label || null, last_error: null, last_checked_at: new Date().toISOString() };
    if (row) {
      const { error } = await supabaseAdmin.from("channel_connections").update(fields).eq("id", row.id);
      if (error) return { ok: false as const, error: error.message };
    } else {
      const { data: ins, error } = await supabaseAdmin.from("channel_connections").insert({ workspace_id: data.workspaceId, channel: data.channel, ...fields }).select("id, account_id, status").single();
      if (error) return { ok: false as const, error: error.message };
      row = ins;
    }
    await setSecret(data.workspaceId, tokenKind(data.channel, row!.id), token, context.userId);
    if (data.appSecret) await setSecret(data.workspaceId, "meta_app_secret", data.appSecret, context.userId);
    if (data.verifyToken) await setSecret(data.workspaceId, "meta_verify_token", data.verifyToken, context.userId);
    return { ok: true as const, name };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { deleteSecrets } = await import("./secrets.server");
    const { tokenKind } = await import("./channels.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("channel_connections").select("id, channel").eq("id", data.connectionId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (row?.channel === "email") {
      const { passKind } = await import("./imap-mail.server");
      await deleteSecrets(data.workspaceId, [passKind(row.id)]);
      await supabaseAdmin.from("channel_connections").update({ status: "disconnected", last_error: null }).eq("id", row.id);
      return { ok: true as const };
    }
    if (!row || !["whatsapp", "messenger", "instagram"].includes(row.channel)) return { ok: false as const, error: "Connection not found." };
    const ch = row.channel as "whatsapp";
    await deleteSecrets(data.workspaceId, [tokenKind(ch, row.id), tokenKind(ch)]);
    await supabaseAdmin.from("channel_connections").update({ status: "disconnected", config: {}, display_name: null, last_error: null }).eq("id", row.id);
    return { ok: true as const };
  });

export const renameConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), connectionId: z.string().uuid(), label: labelStr }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("channel_connections").update({ account_label: data.label || null }).eq("id", data.connectionId).eq("workspace_id", data.workspaceId);
    return error ? { ok: false as const, error: error.message } : { ok: true as const };
  });

/** Sends a reply to the customer through the conversation's connected channel. */
export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4096) }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: only returns the conversation if the caller may see it
    const { data: conv } = await context.supabase.from("conversations").select("id, workspace_id, channel, connection_id").eq("id", data.conversationId).maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    if (!["whatsapp", "messenger", "instagram", "email"].includes(conv.channel)) return { ok: false as const, error: "This channel can't send messages." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMeta } = await import("./channels.server");
    const [{ data: cc }, { data: part }] = await Promise.all([
      conv.connection_id
        ? supabaseAdmin.from("channel_connections").select("id, status, config").eq("id", conv.connection_id).maybeSingle()
        : supabaseAdmin.from("channel_connections").select("id, status, config").eq("workspace_id", conv.workspace_id).eq("channel", conv.channel).eq("status", "connected").limit(1).maybeSingle(),
      supabaseAdmin.from("conversation_participants").select("external_identities(external_id)").eq("conversation_id", conv.id).limit(1).maybeSingle(),
    ]);
    if (cc?.status !== "connected") return { ok: false as const, error: "This channel isn't connected." };
    const to = (part as any)?.external_identities?.external_id as string | undefined;
    if (!to) return { ok: false as const, error: "No customer address for this conversation." };
    try {
      const cfg = (cc.config ?? {}) as Record<string, string>;
      const extId = conv.channel === "email" && cfg.mode === "imap"
        ? await sendViaApp(conv.workspace_id, conv.id, cc.id, cfg, to, data.body)
        : conv.channel === "email"
        ? await (await import("./email-channel.server")).sendEmail(conv.workspace_id, conv.id, to, data.body)
        : await sendMeta(conv.workspace_id, conv.channel as any, cc.config as Record<string, string>, to, data.body, cc.id);
      await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body: data.body, status: "sent", external_id: extId ?? null, author_id: context.userId });
      return { ok: true as const };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body: data.body, status: "failed", error_message: msg, author_id: context.userId });
      return { ok: false as const, error: msg };
    }
  });

async function sendViaApp(ws: string, convId: string, connId: string, cfg: Record<string, string>, to: string, body: string) {
  const { getSecret } = await import("./secrets.server");
  const { passKind, sendSmtp } = await import("./imap-mail.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const pass = await getSecret(ws, passKind(connId));
  if (!pass) throw new Error("This Gmail account needs its app password again.");
  const { data: last } = await supabaseAdmin.from("messages").select("body").eq("conversation_id", convId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const s = /^Subject: (.+)/.exec(last?.body ?? "")?.[1]?.trim();
  const subject = s ? (/^re:/i.test(s) ? s : `Re: ${s}`) : "Tuk Tuk 24 Lisbon";
  return `im-out:${await sendSmtp(cfg.address, pass, to, subject, body, "Tuk Tuk 24 Lisbon")}`;
}

async function saveEmailRow(sb: any, ws: string, fields: Record<string, unknown>) {
  const { data: row } = await sb.from("channel_connections").select("id").eq("workspace_id", ws).eq("channel", "email").is("config->>mode", null).limit(1).maybeSingle();
  if (row) await sb.from("channel_connections").update(fields).eq("id", row.id);
  else await sb.from("channel_connections").insert({ workspace_id: ws, channel: "email", ...fields });
}

/** Admin: verify the linked Gmail account and mark the email channel connected. */
export const connectEmailChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), connect: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.connect) {
      await supabaseAdmin.from("channel_connections").update({ status: "disconnected", display_name: null, last_error: null }).eq("workspace_id", data.workspaceId).eq("channel", "email").is("config->>mode", null);
      return { ok: true as const };
    }
    const { gmailProfile, syncEmail } = await import("./email-channel.server");
    try {
      const address = await gmailProfile();
      await saveEmailRow(supabaseAdmin, data.workspaceId, { status: "connected", display_name: address, config: { address }, account_id: address, last_error: null, last_checked_at: new Date().toISOString() });
      const imported = await syncEmail(data.workspaceId, address);
      return { ok: true as const, address, imported };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await saveEmailRow(supabaseAdmin, data.workspaceId, { status: "error", last_error: msg, last_checked_at: new Date().toISOString() });
      return { ok: false as const, error: msg };
    }
  });

/** Any workspace member: pull new emails into the inbox. */
export const syncEmailNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("channel_connections").select("id, status, config").eq("workspace_id", data.workspaceId).eq("channel", "email").eq("status", "connected");
    let imported = 0; const errors: string[] = [];
    for (const cc of rows ?? []) {
      const cfg = (cc.config ?? {}) as Record<string, string>;
      try {
        if (cfg.mode === "imap") {
          const { getSecret } = await import("./secrets.server");
          const { passKind, syncImap } = await import("./imap-mail.server");
          const pass = await getSecret(data.workspaceId, passKind(cc.id));
          if (pass) imported += await syncImap(data.workspaceId, cc.id, cfg.address, pass);
        } else {
          const { syncEmail } = await import("./email-channel.server");
          imported += await syncEmail(data.workspaceId, cfg.address ?? "");
        }
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        errors.push(`${cfg.address}: ${msg}`);
        await supabaseAdmin.from("channel_connections").update({ last_error: msg, last_checked_at: new Date().toISOString() }).eq("id", cc.id);
      }
    }
    return errors.length && !imported ? { ok: false as const, error: errors.join("; ") } : { ok: true as const, imported };
  });

/** Admin: add or update an extra Gmail inbox using a Gmail App Password (IMAP + SMTP). */
export const connectGmailAppPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    workspaceId: z.string().uuid(),
    connectionId: z.string().uuid().optional(),
    address: z.string().trim().toLowerCase().email().max(254),
    appPassword: z.string().transform((v) => v.replace(/\s+/g, "")).pipe(z.string().regex(/^[a-zA-Z]{16}$/, "App password must be the 16-letter code from Google.")),
    label: z.string().trim().max(60).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { testImap, passKind, syncImap } = await import("./imap-mail.server");
    const { setSecret } = await import("./secrets.server");
    try { await testImap(data.address, data.appPassword); }
    catch (e) { return { ok: false as const, error: (e as Error).message.slice(0, 300) }; }
    const fields = { status: "connected" as const, display_name: data.address, account_id: data.address, account_label: data.label || null, config: { address: data.address, mode: "imap" }, last_error: null, last_checked_at: new Date().toISOString() };
    let id = data.connectionId;
    if (!id) id = (await supabaseAdmin.from("channel_connections").select("id").eq("workspace_id", data.workspaceId).eq("channel", "email").eq("account_id", data.address).maybeSingle()).data?.id;
    if (id) {
      const { error } = await supabaseAdmin.from("channel_connections").update(fields).eq("id", id).eq("workspace_id", data.workspaceId);
      if (error) return { ok: false as const, error: error.message };
    } else {
      const { data: row, error } = await supabaseAdmin.from("channel_connections").insert({ workspace_id: data.workspaceId, channel: "email", ...fields }).select("id").single();
      if (error) return { ok: false as const, error: error.message.includes("duplicate") ? "This Gmail is already connected." : error.message };
      id = row.id;
    }
    await setSecret(data.workspaceId, passKind(id), data.appPassword, context.userId);
    let imported = 0;
    try { imported = await syncImap(data.workspaceId, id, data.address, data.appPassword); } catch { /* shown on next sync */ }
    return { ok: true as const, imported };
  });
