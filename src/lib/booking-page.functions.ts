import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Public (no sign-in) server functions behind the online booking page. All database work runs in
// SECURITY DEFINER functions that only accept services belonging to the page's own business.
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/);

// Hand-extended types (see KNOWN_LIMITATIONS L-13) lack the services→workspaces relation and the
// nullable RPC args; drop this cast after regenerating types.ts.
async function admin() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export const getBookingPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug }).parse(d))
  .handler(async ({ data }) => {
    const { rateLimit, clientIp } = await import("./rate-limit.server");
    if (!(await rateLimit(`bp-page:${clientIp()}`, 120, 60))) return null;
    const { data: page } = await (await admin()).rpc("public_booking_page", { _slug: data.slug });
    return (page ?? null) as import("./booking-page").PublicPage | null;
  });

export const getSlots = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({ slug, serviceId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { rateLimit, clientIp } = await import("./rate-limit.server");
    if (!(await rateLimit(`bp-slots:${clientIp()}`, 240, 60)))
      return { slots: [] as { time: string | null; remaining: number }[] };
    const sb = await admin();
    // The service must be public, active and belong to this page's business.
    const { data: svc } = await sb
      .from("services")
      .select("id, workspaces!inner(public_slug, booking_page_enabled, suspended_at)")
      .eq("id", data.serviceId)
      .eq("active", true)
      .eq("public", true)
      .eq("workspaces.public_slug", data.slug)
      .maybeSingle();
    if (!svc || !svc.workspaces?.booking_page_enabled || svc.workspaces?.suspended_at)
      return { slots: [] };
    const { data: rows } = await sb.rpc("service_availability", {
      _service: data.serviceId,
      _date: data.date,
    });
    return {
      slots: ((rows ?? []) as { start_time: string | null; remaining: number }[]).map((r) => ({
        time: r.start_time?.slice(0, 5) ?? null,
        remaining: r.remaining,
      })),
    };
  });

export const createPublicBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        slug,
        serviceId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        guests: z.number().int().min(1).max(1000),
        nights: z.number().int().min(1).max(30).default(1),
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().max(254).optional().or(z.literal("")),
        phone: z.string().trim().max(40).optional().or(z.literal("")),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
        website: z.string().max(0).optional().or(z.literal("")), // honeypot: bots fill hidden fields
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { rateLimit, clientIp } = await import("./rate-limit.server");
    if (data.website) return { ok: false as const, error: "Please try again." };
    if (!(await rateLimit(`bp-book:${clientIp()}`, 5, 600, { failClosed: true })))
      return {
        ok: false as const,
        error: "Too many bookings from this device. Please try again in a few minutes.",
      };
    const { data: r, error } = await (
      await admin()
    ).rpc("public_create_booking", {
      _slug: data.slug,
      _service: data.serviceId,
      _date: data.date,
      _time: data.time,
      _guests: data.guests,
      _name: data.name,
      _email: data.email || null,
      _phone: data.phone || null,
      _note: data.note || null,
      _nights: data.nights,
    });
    if (error) {
      const msg = /PLAN_LIMIT/.test(error.message)
        ? "This business can't take more online bookings right now. Please contact them directly."
        : error.message;
      return { ok: false as const, error: msg.slice(0, 200) };
    }
    return {
      ok: true as const,
      booking: r as { reference: string; status: string; amount: number | null; currency: string },
    };
  });
