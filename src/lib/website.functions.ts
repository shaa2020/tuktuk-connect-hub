import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseDurationMinutes, type TourPackage } from "./quotes";

const ws = z.object({ workspaceId: z.string().uuid() });

/** Any member: live tour list from the website, shaped for Quick Quotes. */
export const listWebsiteTours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member.", tours: [] as TourPackage[] };
    try {
      const { websiteGet } = await import("./website-api.server");
      const tours = await websiteGet<any[]>("/tours");
      const out: TourPackage[] = tours.map((t) => ({
        id: String(t.id), name: String(t.title),
        durationMinutes: parseDurationMinutes(String(t.duration ?? "")),
        pricePerTuk: Number(t.sale_price ?? t.price ?? 0),
        pricing: t.pricing_type === "per_person" ? "per_person" : "per_tuk",
        maxGuestsPerTuk: 6,
        highlights: Array.isArray(t.highlights) ? t.highlights.slice(0, 5).map(String) : [],
      }));
      return { ok: true as const, tours: out };
    } catch (e) { return { ok: false as const, error: (e as Error).message, tours: [] as TourPackage[] }; }
  });

/** Any member: connection check. */
export const websiteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member." };
    try {
      const { websiteGet } = await import("./website-api.server");
      const b = await websiteGet<any>("/ai/business");
      const tours = await websiteGet<any[]>("/tours");
      const { data: doc } = await context.supabase.from("knowledge_documents").select("updated_at").eq("workspace_id", data.workspaceId).eq("category", "website").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      return { ok: true as const, company: String(b.company_name ?? "Website"), tourCount: tours.length, lastSync: doc?.updated_at ?? null };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

/** Admin: copy business info, policies, FAQs and tours into the AI knowledge base. */
export const syncWebsiteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", { _ws: data.workspaceId, _roles: ["admin", "manager"] });
    if (ok !== true) return { ok: false as const, error: "Only admins or managers can sync." };
    try {
      const { websiteGet } = await import("./website-api.server");
      const [b, tours] = await Promise.all([websiteGet<any>("/ai/business"), websiteGet<any[]>("/tours")]);
      const docs: { title: string; content: string }[] = [
        { title: "[Website] Business info & policies", content: [
          `Company: ${b.company_name}`, `Website: ${b.website}`, `Phone: ${b.phone}`, `WhatsApp: ${b.whatsapp}`, `Email: ${b.email}`, `Address: ${b.address}`,
          `Tour start times: ${(b.operating_slots ?? []).join(", ")}`,
          `Minimum guests: ${b.booking_policy?.minimum_guests ?? "-"}; deposit from ${b.booking_policy?.deposit_minimum_percent ?? "-"}%`,
          `Hotel pickup: ${b.pickup_policy?.note ?? ""} (€${b.pickup_policy?.fee ?? "-"})`,
          `Payment methods: ${(b.payment_methods ?? []).join(", ")}`,
          `Cancellation: ${b.cancellation_policy?.full ?? ""}`,
        ].join("\n") },
        { title: "[Website] FAQ", content: (b.faq ?? []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n") },
        { title: "[Website] Tours & prices", content: tours.map((t) => {
          const price = t.sale_price != null ? `€${t.sale_price} (was €${t.price})` : `€${t.price}`;
          return `${t.title} — ${t.duration} — ${price} ${t.pricing_type === "per_person" ? "per person" : ""}\n${t.tagline ?? ""}\nHighlights: ${(t.highlights ?? []).join(", ")}\nLink: https://tuktuk24lisbon.com/tours/${t.slug}`;
        }).join("\n\n") },
      ];
      const now = new Date().toISOString();
      for (const d of docs) {
        const { data: existing } = await context.supabase.from("knowledge_documents").select("id").eq("workspace_id", data.workspaceId).eq("title", d.title).maybeSingle();
        const res = existing
          ? await context.supabase.from("knowledge_documents").update({ content: d.content, category: "website", updated_at: now }).eq("id", existing.id)
          : await context.supabase.from("knowledge_documents").insert({ workspace_id: data.workspaceId, title: d.title, content: d.content, category: "website" });
        if (res.error) throw new Error("Could not save to the knowledge base.");
      }
      return { ok: true as const, tours: tours.length };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

const bookingInput = z.object({
  workspaceId: z.string().uuid(),
  customer_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(5).max(40),
  email: z.string().trim().email().max(200),
  tour_title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().trim().max(20).optional(),
  party_size: z.number().int().min(1).max(60),
  pickup_location: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(4000).optional(),
});

/** Any member: create a booking request on the website. Returns the website reference. */
export const createWebsiteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bookingInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member." };
    try {
      const { websitePost } = await import("./website-api.server");
      const { workspaceId: _w, ...body } = data;
      const r = await websitePost<{ reference: string }>("/booking-requests", { ...body, source: "team_platform" });
      return { ok: true as const, reference: String(r.reference) };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

export type WebsiteBooking = {
  id: string; reference: string; tour_title: string; tour_slug: string; customer_name: string; email: string; phone: string;
  travel_date: string | null; travel_time: string | null; guests: number; notes: string | null; status: string; payment_status: string;
  source: string; created_at: string; imported_booking_id: string | null;
};

/** Any member: live bookings from the website, marked when already copied into this platform. */
export const listWebsiteBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member.", bookings: [] as WebsiteBooking[] };
    try {
      const { websiteGet } = await import("./website-api.server");
      const rows = await websiteGet<any[]>("/booking-requests?limit=100");
      const refs = rows.map((r) => String(r.id).slice(0, 8).toUpperCase());
      const { data: local } = await context.supabase.from("bookings").select("id, external_reference").eq("workspace_id", data.workspaceId).in("external_reference", refs.length ? refs : ["-"]);
      const map = new Map((local ?? []).map((l) => [l.external_reference, l.id]));
      const bookings: WebsiteBooking[] = rows.map((r) => {
        const reference = String(r.id).slice(0, 8).toUpperCase();
        return {
          id: String(r.id), reference, tour_title: String(r.tour_title ?? "Tour"), tour_slug: String(r.tour_slug ?? ""),
          customer_name: String(r.customer_name ?? ""), email: String(r.email ?? ""), phone: String(r.phone ?? ""),
          travel_date: r.travel_date ?? null, travel_time: r.travel_time ?? null, guests: Number(r.guests ?? 1),
          notes: r.notes ?? null, status: String(r.status ?? "new"), payment_status: String(r.payment_status ?? ""),
          source: String(r.source ?? ""), created_at: String(r.created_at ?? ""), imported_booking_id: map.get(reference) ?? null,
        };
      });
      return { ok: true as const, bookings };
    } catch (e) { return { ok: false as const, error: (e as Error).message, bookings: [] as WebsiteBooking[] }; }
  });

const importInput = z.object({ workspaceId: z.string().uuid(), websiteId: z.string().min(1).max(100) });

/** Any member: copy one website booking into the platform (contact + booking) so it can be dispatched. */
export const importWebsiteBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: member } = await sb.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member." };
    try {
      const { websiteGet } = await import("./website-api.server");
      const rows = await websiteGet<any[]>("/booking-requests?limit=100");
      const r = rows.find((x) => String(x.id) === data.websiteId);
      if (!r) return { ok: false as const, error: "Booking not found on the website." };
      const reference = String(r.id).slice(0, 8).toUpperCase();
      const { data: existing } = await sb.from("bookings").select("id").eq("workspace_id", data.workspaceId).eq("external_reference", reference).maybeSingle();
      if (existing) return { ok: true as const, bookingId: existing.id };
      const email = r.email ? String(r.email).toLowerCase() : null;
      const phone = r.phone ? String(r.phone) : null;
      let contactId: string | null = null;
      if (email || phone) {
        let cq = sb.from("contacts").select("id").eq("workspace_id", data.workspaceId).is("merged_into", null).limit(1);
        cq = email && phone ? cq.or(`email.eq.${email},phone.eq.${phone}`) : email ? cq.eq("email", email) : cq.eq("phone", phone!);
        const { data: c } = await cq.maybeSingle();
        contactId = c?.id ?? null;
      }
      if (!contactId) {
        const { data: c, error } = await sb.from("contacts").insert({ workspace_id: data.workspaceId, full_name: String(r.customer_name || "Website guest").slice(0, 200), email, phone, created_by: context.userId }).select("id").single();
        if (error) throw new Error("Could not create the guest contact.");
        contactId = c.id;
      }
      const time = typeof r.travel_time === "string" && /^\d{1,2}:\d{2}/.test(r.travel_time) ? r.travel_time.slice(0, 5) : null;
      const pickup = typeof r.notes === "string" ? (r.notes.match(/Pickup: (.+)/)?.[1] ?? null) : null;
      const { data: b, error } = await sb.from("bookings").insert({
        workspace_id: data.workspaceId, contact_id: contactId, tour_name: String(r.tour_title || "Website booking").slice(0, 200),
        tour_date: r.travel_date ?? null, start_time: time, guests: Math.max(1, Math.min(500, Number(r.guests) || 1)),
        pickup_location: pickup ? pickup.slice(0, 300) : null, status: "tentative", source_system: "website",
        external_reference: reference, notes: typeof r.notes === "string" ? r.notes.slice(0, 5000) : null, created_by: context.userId,
      } as any).select("id").single();
      if (error) throw new Error("Could not save the booking.");
      return { ok: true as const, bookingId: b.id };
    } catch (e) { return { ok: false as const, error: (e as Error).message }; }
  });

/** Any member: copy every website booking not yet in the platform onto the calendar. Existing ones are left as the team edited them. */
export const syncWebsiteBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ws.parse(d))
  .handler(async ({ data, context }) => {
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Not a member.", added: 0 };
    try {
      const { syncWebsiteBookingsFor } = await import("./background-sync.server");
      return { ok: true as const, added: await syncWebsiteBookingsFor(context.supabase, data.workspaceId, context.userId) };
    } catch (e) { return { ok: false as const, error: (e as Error).message, added: 0 }; }
  });
