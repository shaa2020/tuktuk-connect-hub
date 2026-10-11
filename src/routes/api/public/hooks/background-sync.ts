import { createFileRoute } from "@tanstack/react-router";

// Scheduled every few minutes by the database. Token is a server-only random value
// stored in a table with no browser access. Work is idempotent (imports skip duplicates).
export const Route = createFileRoute("/api/public/hooks/background-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return new Response("Unauthorized", { status: 401 });
        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const { safeEqual } = await import("@/lib/secrets.server");
        const { data: row } = await sb.from("internal_job_tokens").select("token").eq("name", "background_sync").maybeSingle();
        if (!row || !safeEqual(token, row.token)) return new Response("Unauthorized", { status: 401 });
        const { syncAllEmailFor, syncWebsiteBookingsFor } = await import("@/lib/background-sync.server");
        const { recover } = await import("@/lib/whatsapp-inbox.server");
        const { data: wss } = await sb.from("workspaces").select("id");
        const out: Record<string, unknown> = {};
        for (const w of wss ?? []) {
          const r: Record<string, unknown> = {};
          try { r.email = await syncAllEmailFor(w.id); } catch (e) { r.emailError = (e as Error).message.slice(0, 200); }
          try { r.bookings = await syncWebsiteBookingsFor(sb, w.id, null); } catch (e) { r.bookingsError = (e as Error).message.slice(0, 200); }
          out[w.id] = r;
        }
        try { await recover(); } catch { /* retried next run */ }
        console.log("background-sync", JSON.stringify(out));
        return Response.json({ ok: true });
      },
    },
  },
});
