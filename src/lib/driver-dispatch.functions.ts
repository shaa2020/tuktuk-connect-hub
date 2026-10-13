import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF = ["admin", "manager"] as const;

export const notifyDriverFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), bookingId: z.string().uuid(), kind: z.enum(["assigned", "cancelled", "reassigned"]), driverId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: [...STAFF] });
    if (!ok) throw new Error("Only admins and managers can message drivers.");
    const { data: b } = await context.supabase.from("bookings").select("id").eq("id", data.bookingId).eq("workspace_id", data.workspaceId).maybeSingle();
    if (!b) throw new Error("Booking not found.");
    const { notifyDriver } = await import("./driver-dispatch.server");
    return notifyDriver(data.workspaceId, data.bookingId, data.kind, data.driverId);
  });

export const sendDriverScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), driverIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: [...STAFF] });
    if (!ok) throw new Error("Only admins and managers can message drivers.");
    const { sendDriverSchedule } = await import("./driver-dispatch.server");
    let sent = 0; const errors: string[] = [];
    for (const id of data.driverIds) { const r = await sendDriverSchedule(data.workspaceId, id, data.date); if (r.ok) sent++; else errors.push(r.error); }
    return { sent, failed: errors.length, firstError: errors[0] ?? null };
  });

export const setDriverAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), on: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: [...STAFF] });
    if (!ok) throw new Error("Only admins and managers can change this.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("workspaces") as any).update({ driver_auto: data.on }).eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
