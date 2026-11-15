import { createFileRoute } from "@tanstack/react-router";

// Scheduled every few minutes by the database. Token is a server-only random value
// stored in a table with no browser access. Work is idempotent (imports skip duplicates).
//
// Body shapes:
//   {}                                   scheduler tick → global tasks + fan-out (one request per workspace)
//   { workspace }                        process one workspace (sent by the fan-out)
//   { operatorOnly: true, workspace }    immediate AI Operator run (sent by webhooks)
const UUID = /^[0-9a-f-]{36}$/;

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
        const body = (await request.json().catch(() => ({}))) as { operatorOnly?: unknown; workspace?: unknown };
        const ws = typeof body.workspace === "string" && UUID.test(body.workspace) ? body.workspace : null;

        if (body.operatorOnly === true && ws) {
          let r: unknown;
          try { r = await (await import("@/lib/ai-operator.server")).runOperatorFor(ws); } catch (e) { r = { error: (e as Error).message.slice(0, 200) }; }
          return Response.json({ ok: true, operator: r });
        }

        const jobs = await import("@/lib/background-jobs.server");
        const { activeWorkspaces } = await import("@/lib/tenancy.server");

        if (ws) {
          // One workspace (fan-out request). Suspended workspaces are skipped.
          const w = (await activeWorkspaces()).find((x) => x.id === ws);
          if (!w) return Response.json({ ok: true, skipped: "inactive" });
          const r = await jobs.processWorkspace(sb, w);
          console.log("background-sync workspace", ws, JSON.stringify(r));
          return Response.json({ ok: true });
        }

        // Scheduler tick.
        const out: Record<string, unknown> = await jobs.processGlobal(sb);
        const queued = await jobs.fanOut(sb);
        if (queued === null) {
          // Database without fan-out support: process serially (previous behaviour).
          for (const w of await activeWorkspaces()) out[w.id] = await jobs.processWorkspace(sb, w);
        } else {
          out.fannedOut = queued;
        }
        console.log("background-sync", JSON.stringify(out));
        return Response.json({ ok: true });
      },
    },
  },
});
