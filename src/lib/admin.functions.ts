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
export const connectMetaChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    workspaceId: z.string().uuid(),
    channel: z.enum(["whatsapp", "messenger", "instagram"]),
    accountId: idStr,
    token: secretStr.optional().or(z.literal("")),
    appSecret: secretStr.optional().or(z.literal("")),
    verifyToken: z.string().trim().min(12).max(200).optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { setSecret, getSecret } = await import("./secrets.server");
    const { testMeta, TOKEN_KIND } = await import("./channels.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config: Record<string, string> = data.channel === "whatsapp" ? { phone_number_id: data.accountId } : data.channel === "messenger" ? { page_id: data.accountId } : { account_id: data.accountId };
    const token = data.token || (await getSecret(data.workspaceId, TOKEN_KIND[data.channel]));
    if (!token) return { ok: false as const, error: "Enter the access token." };
    if (!data.appSecret && !(await getSecret(data.workspaceId, "meta_app_secret"))) return { ok: false as const, error: "Enter the Meta app secret (used to verify incoming messages)." };
    if (!data.verifyToken && !(await getSecret(data.workspaceId, "meta_verify_token"))) return { ok: false as const, error: "Choose a webhook verify token (12+ characters)." };
    let name: string;
    try { name = await testMeta(data.channel, config, token); }
    catch (e) {
      await supabaseAdmin.from("channel_connections").upsert({ workspace_id: data.workspaceId, channel: data.channel, status: "error", last_error: (e as Error).message, last_checked_at: new Date().toISOString() }, { onConflict: "workspace_id,channel" });
      return { ok: false as const, error: (e as Error).message };
    }
    if (data.token) await setSecret(data.workspaceId, TOKEN_KIND[data.channel], data.token, context.userId);
    if (data.appSecret) await setSecret(data.workspaceId, "meta_app_secret", data.appSecret, context.userId);
    if (data.verifyToken) await setSecret(data.workspaceId, "meta_verify_token", data.verifyToken, context.userId);
    await supabaseAdmin.from("channel_connections").upsert({ workspace_id: data.workspaceId, channel: data.channel, status: "connected", display_name: name, config, last_error: null, last_checked_at: new Date().toISOString() }, { onConflict: "workspace_id,channel" });
    return { ok: true as const, name };
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), channel: z.enum(["whatsapp", "messenger", "instagram"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { deleteSecrets } = await import("./secrets.server");
    const { TOKEN_KIND } = await import("./channels.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await deleteSecrets(data.workspaceId, [TOKEN_KIND[data.channel]]);
    await supabaseAdmin.from("channel_connections").update({ status: "disconnected", config: {}, display_name: null, last_error: null }).eq("workspace_id", data.workspaceId).eq("channel", data.channel);
    return { ok: true as const };
  });

/** Sends a reply to the customer through the conversation's connected channel. */
export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4096) }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: only returns the conversation if the caller may see it
    const { data: conv } = await context.supabase.from("conversations").select("id, workspace_id, channel").eq("id", data.conversationId).maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    if (!["whatsapp", "messenger", "instagram", "email"].includes(conv.channel)) return { ok: false as const, error: "This channel can't send messages." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMeta } = await import("./channels.server");
    const [{ data: cc }, { data: part }] = await Promise.all([
      supabaseAdmin.from("channel_connections").select("status, config").eq("workspace_id", conv.workspace_id).eq("channel", conv.channel).maybeSingle(),
      supabaseAdmin.from("conversation_participants").select("external_identities(external_id)").eq("conversation_id", conv.id).limit(1).maybeSingle(),
    ]);
    if (cc?.status !== "connected") return { ok: false as const, error: "This channel isn't connected." };
    const to = (part as any)?.external_identities?.external_id as string | undefined;
    if (!to) return { ok: false as const, error: "No customer address for this conversation." };
    try {
      const extId = conv.channel === "email"
        ? await (await import("./email-channel.server")).sendEmail(conv.workspace_id, conv.id, to, data.body)
        : await sendMeta(conv.workspace_id, conv.channel as any, cc.config as Record<string, string>, to, data.body);
      await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body: data.body, status: "sent", external_id: extId ?? null, author_id: context.userId });
      return { ok: true as const };
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body: data.body, status: "failed", error_message: msg, author_id: context.userId });
      return { ok: false as const, error: msg };
    }
  });

/** Admin: verify the linked Gmail account and mark the email channel connected. */
export const connectEmailChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), connect: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!data.connect) {
      await supabaseAdmin.from("channel_connections").update({ status: "disconnected", display_name: null, last_error: null }).eq("workspace_id", data.workspaceId).eq("channel", "email");
      return { ok: true as const };
    }
    const { gmailProfile, syncEmail } = await import("./email-channel.server");
    try {
      const address = await gmailProfile();
      await supabaseAdmin.from("channel_connections").upsert({ workspace_id: data.workspaceId, channel: "email", status: "connected", display_name: address, config: { address }, last_error: null, last_checked_at: new Date().toISOString() }, { onConflict: "workspace_id,channel" });
      const imported = await syncEmail(data.workspaceId, address);
      return { ok: true as const, address, imported };
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      await supabaseAdmin.from("channel_connections").upsert({ workspace_id: data.workspaceId, channel: "email", status: "error", last_error: msg, last_checked_at: new Date().toISOString() }, { onConflict: "workspace_id,channel" });
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
    const { data: cc } = await supabaseAdmin.from("channel_connections").select("status, config").eq("workspace_id", data.workspaceId).eq("channel", "email").maybeSingle();
    if (cc?.status !== "connected") return { ok: true as const, imported: 0 };
    try {
      const { syncEmail } = await import("./email-channel.server");
      return { ok: true as const, imported: await syncEmail(data.workspaceId, (cc.config as any)?.address ?? "") };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 300) };
    }
  });
