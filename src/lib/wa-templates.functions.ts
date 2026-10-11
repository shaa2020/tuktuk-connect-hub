import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STARTER_TEMPLATES, countVars, fillTemplate } from "./wa-templates";

/** Any workspace member: list the business's WhatsApp templates and their approval status. */
export const listWaTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member.", templates: [] };
    try {
      const { listTemplates } = await import("./wa-templates.server");
      return { ok: true as const, templates: await listTemplates() };
    } catch (e) { return { ok: false as const, error: (e as Error).message, templates: [] }; }
  });

/** Admin: submit one of the starter templates to Meta for review. */
export const submitStarterTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), name: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: ["admin"] });
    if (ok !== true) return { ok: false as const, error: "Only a Business Admin can do this." };
    const t = STARTER_TEMPLATES.find((x) => x.name === data.name);
    if (!t) return { ok: false as const, error: "Unknown template." };
    try {
      const { createTemplate } = await import("./wa-templates.server");
      await createTemplate({ name: t.name, category: t.category, body: t.body, example: [...t.example] });
      return { ok: true as const };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

/** Sends an approved template in a WhatsApp conversation (works outside the 24-hour window). */
export const sendWaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversationId: z.string().uuid(), name: z.string().min(1).max(512), language: z.string().min(2).max(15),
    params: z.array(z.string().trim().min(1).max(1000)).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase.from("conversations").select("id, workspace_id, channel, connection_id").eq("id", data.conversationId).maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    if (conv.channel !== "whatsapp") return { ok: false as const, error: "Templates are only for WhatsApp chats." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listTemplates, sendTemplate } = await import("./wa-templates.server");
    const [{ data: cc }, { data: part }] = await Promise.all([
      conv.connection_id
        ? supabaseAdmin.from("channel_connections").select("status, config").eq("id", conv.connection_id).maybeSingle()
        : supabaseAdmin.from("channel_connections").select("status, config").eq("workspace_id", conv.workspace_id).eq("channel", "whatsapp").eq("status", "connected").limit(1).maybeSingle(),
      supabaseAdmin.from("conversation_participants").select("external_identities(external_id)").eq("conversation_id", conv.id).limit(1).maybeSingle(),
    ]);
    if (cc?.status !== "connected" || (cc.config as any)?.mode !== "connector") return { ok: false as const, error: "This WhatsApp number isn't connected for templates." };
    const to = (part as any)?.external_identities?.external_id as string | undefined;
    if (!to) return { ok: false as const, error: "No customer number for this conversation." };
    let body = "";
    try {
      const t = (await listTemplates()).find((x) => x.name === data.name && x.language === data.language);
      if (!t || t.status !== "APPROVED") return { ok: false as const, error: "That template isn't approved by WhatsApp yet." };
      if (countVars(t.body) !== data.params.length) return { ok: false as const, error: "Please fill in every field of the template." };
      body = fillTemplate(t.body, data.params);
      const extId = await sendTemplate(to, t.name, t.language, data.params);
      await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body, status: "sent", external_id: extId ?? null, author_id: context.userId });
      await (await import("./whatsapp-inbox.server")).recover().catch(() => {});
      return { ok: true as const };
    } catch (e) {
      const msg = (e as Error).message;
      if (body) await supabaseAdmin.from("messages").insert({ workspace_id: conv.workspace_id, conversation_id: conv.id, direction: "outbound", body, status: "failed", error_message: msg, author_id: context.userId });
      return { ok: false as const, error: msg };
    }
  });
