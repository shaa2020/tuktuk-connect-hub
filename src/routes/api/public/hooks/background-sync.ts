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
        // Fast path: a webhook asked for an immediate AI Operator run for one workspace.
        const body = (await request.json().catch(() => ({}))) as { operatorOnly?: unknown; workspace?: unknown };
        if (body.operatorOnly === true && typeof body.workspace === "string" && /^[0-9a-f-]{36}$/.test(body.workspace)) {
          let r: unknown;
          try { r = await (await import("@/lib/ai-operator.server")).runOperatorFor(body.workspace); } catch (e) { r = { error: (e as Error).message.slice(0, 200) }; }
          return Response.json({ ok: true, operator: r });
        }
        const { syncAllEmailFor, syncWebsiteBookingsFor, alertBrokenChannels } = await import("@/lib/background-sync.server");
        const { recover } = await import("@/lib/whatsapp-inbox.server");
        const { data: wss } = await sb.from("workspaces").select("id");
        const out: Record<string, unknown> = {};
        for (const w of wss ?? []) {
          const r: Record<string, unknown> = {};
          try { r.email = await syncAllEmailFor(w.id); } catch (e) { r.emailError = (e as Error).message.slice(0, 200); }
          try { r.bookings = await syncWebsiteBookingsFor(sb, w.id, null); } catch (e) { r.bookingsError = (e as Error).message.slice(0, 200); }
          try { r.alerts = await alertBrokenChannels(w.id); } catch { /* next run */ }
          try { r.operator = await (await import("@/lib/ai-operator.server")).runOperatorFor(w.id); } catch (e) { r.operatorError = (e as Error).message.slice(0, 200); }
          try { r.tickets = await (await import("@/lib/tickets.server")).autoSendTicketsFor(w.id); } catch (e) { r.ticketsError = (e as Error).message.slice(0, 200); }
          try { r.autoAssigned = await (await import("@/lib/driver-dispatch.server")).flushAutoAssigned(w.id); } catch (e) { r.autoAssignError = (e as Error).message.slice(0, 200); }
          try { r.drivers = await (await import("@/lib/driver-dispatch.server")).autoSendSchedulesFor(w.id); } catch (e) { r.driversError = (e as Error).message.slice(0, 200); }
          try { r.guests = await (await import("@/lib/guest-messages.server")).autoGuestMessagesFor(w.id); } catch (e) { r.guestsError = (e as Error).message.slice(0, 200); }
          out[w.id] = r;
        }
        try { await recover(); } catch { /* retried next run */ }
        try {
          const { sendPendingPushes } = await import("@/lib/push.server");
          out.push = await sendPendingPushes(sb);
        } catch (e) { out.pushError = (e as Error).message.slice(0, 200); }
        console.log("background-sync", JSON.stringify(out));
        return Response.json({ ok: true });
      },
    },
  },
});
