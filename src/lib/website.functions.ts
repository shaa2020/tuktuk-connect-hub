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
