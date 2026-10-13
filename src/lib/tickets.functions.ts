import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), bookingIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: ["admin", "manager", "agent"] });
    if (!ok) throw new Error("Not allowed.");
    // RLS-scoped read: only bookings the caller can see in this workspace.
    const { data: rows } = await context.supabase.from("bookings").select("id").eq("workspace_id", data.workspaceId).in("id", data.bookingIds);
    const { sendTicket } = await import("./tickets.server");
    let sent = 0; const errors: string[] = [];
    for (const r of rows ?? []) { const x = await sendTicket(r.id, context.userId); if (x.ok) sent++; else errors.push(x.error); }
    return { sent, failed: errors.length, firstError: errors[0] ?? null };
  });

export const setTicketAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), mode: z.enum(["off", "all", "paid", "unpaid"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: ["admin", "manager"] });
    if (!ok) throw new Error("Only admins and managers can change this.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("workspaces").update({ ticket_auto: data.mode } as any).eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public: the unguessable ticket code is the access key; returns only ticket fields.
export const getPublicTicket = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b } = await (supabaseAdmin.from("bookings") as any).select("reference, tour_name, tour_date, start_time, guests, pickup_location, status, payment_status, amount, currency, contacts(full_name)").eq("ticket_token", data.token).maybeSingle();
    if (!b || b.status !== "confirmed") return null;
    return { reference: b.reference, tour_name: b.tour_name, tour_date: b.tour_date, start_time: b.start_time, guests: b.guests, pickup_location: b.pickup_location, payment_status: b.payment_status, amount: b.amount, currency: b.currency, guest: (b as any).contacts?.full_name ?? null };
  });
