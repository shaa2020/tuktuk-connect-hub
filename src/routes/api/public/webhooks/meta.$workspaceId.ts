import { createFileRoute } from "@tanstack/react-router";

// Public Meta webhook. GET = subscription check (verify token), POST = events, verified by X-Hub-Signature-256.
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/api/public/webhooks/meta/$workspaceId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID.test(params.workspaceId)) return new Response("Not found", { status: 404 });
        const u = new URL(request.url);
        const { getSecret, safeEqual } = await import("@/lib/secrets.server");
        const expected = await getSecret(params.workspaceId, "meta_verify_token");
        const got = u.searchParams.get("hub.verify_token") ?? "";
        if (u.searchParams.get("hub.mode") === "subscribe" && expected && safeEqual(got, expected)) {
          return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request, params }) => {
        const ws = params.workspaceId;
        if (!UUID.test(ws)) return new Response("Not found", { status: 404 });
        // Generous cap per workspace; Meta retries on 429 so nothing is lost.
        const { rateLimit, tooMany } = await import("@/lib/rate-limit.server");
        if (!(await rateLimit(`meta:${ws}`, 3000, 60))) return tooMany();
        const raw = await request.text();
        const { getSecret, hmacSha256Hex, safeEqual } = await import("@/lib/secrets.server");
        const appSecret = await getSecret(ws, "meta_app_secret");
        const sig = request.headers.get("x-hub-signature-256") ?? "";
        if (!appSecret || !safeEqual(sig, `sha256=${await hmacSha256Hex(appSecret, raw)}`)) return new Response("Forbidden", { status: 403 });
        const { ingestInbound, applyStatus, findConnection } = await import("@/lib/channels.server");
        let body: any;
        try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        let gotInbound = false;
        try {
          if (body.object === "whatsapp_business_account") {
            for (const e of body.entry ?? []) for (const ch of e.changes ?? []) {
              const v = ch.value ?? {};
              const connectionId = await findConnection(ws, "whatsapp", v.metadata?.phone_number_id);
              const names: Record<string, string> = Object.fromEntries((v.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
              for (const m of v.messages ?? []) {
                const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? (m.type ? `[${m.type} received — open WhatsApp to view]` : "");
                await ingestInbound(ws, "whatsapp", { from: m.from, name: names[m.from], externalMessageId: m.id, text, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined, connectionId });
                gotInbound = true;
              }
              for (const s of v.statuses ?? []) await applyStatus(ws, s.id, s.status, `${s.id}:${s.status}`, s.errors?.[0]?.title);
            }
          } else if (body.object === "page" || body.object === "instagram") {
            const channel = body.object === "page" ? "messenger" : "instagram";
            for (const e of body.entry ?? []) {
              const connectionId = await findConnection(ws, channel, e.id);
              for (const ev of e.messaging ?? []) {
              if (ev.message && !ev.message.is_echo) {
                const text = ev.message.text ?? (ev.message.attachments?.length ? "[attachment received — open the app to view]" : "");
                await ingestInbound(ws, channel, { from: ev.sender.id, externalMessageId: ev.message.mid, text, at: ev.timestamp ? new Date(ev.timestamp) : undefined, connectionId });
                gotInbound = true;
              }
              for (const mid of ev.delivery?.mids ?? []) await applyStatus(ws, mid, "delivered", `${mid}:delivered`);
              }
            }
          }
        } catch (err) {
          console.error("meta webhook", err);
          return new Response("Error", { status: 500 }); // Meta will retry
        }
        // New guest message → let the AI Operator answer right away (it no-ops when Away mode is off).
        if (gotInbound) {
          try { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); await (supabaseAdmin as any).rpc("kick_ai_operator", { _ws: ws }); } catch { /* the periodic job retries */ }
        }
        return new Response("OK", { status: 200 });
      },
    },
  },
});
