import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertRole(supabase: any, ws: string, roles: string[]) {
  const { data, error } = await supabase.rpc("has_ws_role", { _ws: ws, _roles: roles });
  if (error || data !== true) throw new Error("You don't have access to finance.");
}
const W = z.object({ workspaceId: z.string().uuid() });

export const paypalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => W.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ["admin", "manager"]);
    const { paypalConfigured } = await import("./paypal.server");
    return { connected: await paypalConfigured(data.workspaceId) };
  });

export const savePaypal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    W.extend({
      clientId: z.string().trim().min(20).max(200),
      secret: z.string().trim().min(20).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ["admin"]);
    const { paypalToken, syncPaypalFor } = await import("./paypal.server");
    try {
      await paypalToken(data.clientId, data.secret);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
    const { setSecret } = await import("./secrets.server");
    await setSecret(data.workspaceId, "paypal_client_id", data.clientId, context.userId);
    await setSecret(data.workspaceId, "paypal_secret", data.secret, context.userId);
    try {
      return { ok: true as const, ...(await syncPaypalFor(data.workspaceId, 31)) };
    } catch (e) {
      return { ok: true as const, warning: (e as Error).message };
    }
  });

export const syncPaypalNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => W.parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context.supabase, data.workspaceId, ["admin", "manager"]);
    const { syncPaypalFor } = await import("./paypal.server");
    try {
      return { ok: true as const, ...(await syncPaypalFor(data.workspaceId, 31)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
