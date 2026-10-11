import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Platform console: only rows in platform_admins may use these. Verified server-side every call.
async function assertPlatformAdmin(supabase: any) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Platform admins only.");
}

export const listPlatformWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: wss, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, plan, created_at")
      .order("created_at");
    if (error) throw error;
    const out = [];
    for (const w of wss ?? []) {
      const [{ count: members }, { count: convs }, { count: channels }] = await Promise.all([
        supabaseAdmin.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("active", true),
        supabaseAdmin.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", w.id),
        supabaseAdmin.from("channel_connections").select("id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("status", "connected"),
      ]);
      out.push({ ...w, members: members ?? 0, conversations: convs ?? 0, connected_channels: channels ?? 0 });
    }
    return out;
  });

export const setWorkspacePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    workspaceId: z.string().uuid(),
    plan: z.enum(["internal", "free", "pro", "business"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").update({ plan: data.plan }).eq("id", data.workspaceId);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      workspace_id: data.workspaceId, actor_id: context.userId, action: "plan_change",
      entity_type: "workspaces", entity_id: data.workspaceId, details: { plan: data.plan },
    });
    return { ok: true as const };
  });
