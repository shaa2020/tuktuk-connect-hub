import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, workspaceId: string) {
  const { data, error } = await supabase.rpc("has_ws_role", {
    _ws: workspaceId,
    _roles: ["admin"],
  });
  if (error || data !== true) throw new Error("Only a Business Admin can do this.");
}
const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

// Admin-only: returns the hub key so the owner can paste it into n8n (it's their own workspace key).
export const getHubSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid(), rotate: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { getSecret, setSecret } = await import("./secrets.server");
    let key = data.rotate ? null : await getSecret(data.workspaceId, "hub_key");
    if (!key) {
      key = newKey();
      await setSecret(data.workspaceId, "hub_key", key, context.userId);
    }
    const outbound = await getSecret(data.workspaceId, "hub_outbound_url");
    const { count } = await context.supabase
      .from("channel_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", data.workspaceId)
      .like("account_id", "hub:%")
      .eq("status", "connected");
    return { key, outboundUrl: outbound ?? "", accounts: count ?? 0 };
  });

export const saveHubOutbound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        url: z.string().trim().url().startsWith("https://").max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    const { setSecret } = await import("./secrets.server");
    await setSecret(data.workspaceId, "hub_outbound_url", data.url, context.userId);
    return { ok: true };
  });
