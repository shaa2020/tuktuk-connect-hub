import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, ws: string) {
  const { data, error } = await supabase.rpc("has_ws_role", { _ws: ws, _roles: ["admin"] });
  if (error || data !== true) throw new Error("Only a Business Admin can manage billing.");
}
function origin() {
  const r = getRequest();
  return new URL(r.url).origin;
}

export const billingConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { stripeConfigured } = await import("./stripe.server");
    return { online: stripeConfigured() };
  });

export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), plan: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/), interval: z.enum(["month", "year"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    try {
      const { createCheckout } = await import("./stripe.server");
      const email = String((context.claims as any)?.email ?? "");
      return { ok: true as const, url: await createCheckout(data.workspaceId, data.plan, data.interval, email, origin()) };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId);
    try {
      const { createPortal } = await import("./stripe.server");
      return { ok: true as const, url: await createPortal(data.workspaceId, origin()) };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });
