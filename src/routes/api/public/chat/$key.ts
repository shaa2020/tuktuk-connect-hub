import { createFileRoute } from "@tanstack/react-router";

// Public website-chat API used by public/chat-widget.js.
//   GET  ?visitor=v_…&after=ISO   → business name, greeting, messages for this visitor
//   POST { visitor, name?, email?, text } → new visitor message into the unified inbox
export const Route = createFileRoute("/api/public/chat/$key")({
  server: {
    handlers: {
      OPTIONS: async ({ request, params }) => {
        const { WIDGET_KEY } = await import("@/lib/webchat");
        if (!WIDGET_KEY.test(params.key)) return new Response(null, { status: 404 });
        const { connectionForKey, corsHeaders } = await import("@/lib/webchat.server");
        const cc = await connectionForKey(params.key);
        const h = cc && corsHeaders(request.headers.get("origin"), cc.config.allowed_origins);
        return new Response(null, { status: h ? 204 : 403, headers: h ?? {} });
      },
      GET: async ({ request, params }) => {
        const { WIDGET_KEY, VISITOR_ID } = await import("@/lib/webchat");
        if (!WIDGET_KEY.test(params.key)) return new Response("Not found", { status: 404 });
        const { rateLimit, clientIp, tooMany } = await import("@/lib/rate-limit.server");
        if (!(await rateLimit(`wc-get:${clientIp(request)}`, 120, 60))) return tooMany();
        const { connectionForKey, corsHeaders, visitorMessages } = await import("@/lib/webchat.server");
        const cc = await connectionForKey(params.key);
        if (!cc) return new Response("Not found", { status: 404 });
        const h = corsHeaders(request.headers.get("origin"), cc.config.allowed_origins);
        if (!h) return new Response("Forbidden", { status: 403 });
        const u = new URL(request.url);
        const visitor = u.searchParams.get("visitor") ?? "";
        const after = u.searchParams.get("after");
        const messages = VISITOR_ID.test(visitor) ? await visitorMessages(cc.workspace_id, visitor, after && !isNaN(Date.parse(after)) ? after : null) : [];
        return Response.json({ business: cc.businessName, greeting: cc.config.greeting ?? "Hi! How can we help?", messages }, { headers: h });
      },
      POST: async ({ request, params }) => {
        const { WIDGET_KEY, VisitorMessage } = await import("@/lib/webchat");
        if (!WIDGET_KEY.test(params.key)) return new Response("Not found", { status: 404 });
        const { rateLimit, clientIp, tooMany } = await import("@/lib/rate-limit.server");
        const ip = clientIp(request);
        if (!(await rateLimit(`wc-post:${ip}`, 20, 60, { failClosed: true })) || !(await rateLimit(`wc-key:${params.key}`, 600, 60))) return tooMany();
        const { connectionForKey, corsHeaders } = await import("@/lib/webchat.server");
        const cc = await connectionForKey(params.key);
        if (!cc) return new Response("Not found", { status: 404 });
        const h = corsHeaders(request.headers.get("origin"), cc.config.allowed_origins);
        if (!h) return new Response("Forbidden", { status: 403 });
        const parsed = VisitorMessage.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid message" }, { status: 400, headers: h });
        const m = parsed.data;
        try {
          const { ingestInbound } = await import("@/lib/channels.server");
          await ingestInbound(cc.workspace_id, "webchat", { from: m.visitor, name: m.name || (m.email ? m.email : "Website visitor"), externalMessageId: `wc:${crypto.randomUUID()}`, text: m.email ? `${m.text}\n\n(email: ${m.email})` : m.text, connectionId: cc.id });
        } catch (e) {
          console.error("webchat", e);
          return Response.json({ error: "Please try again" }, { status: 500, headers: h });
        }
        try { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); await (supabaseAdmin as any).rpc("kick_ai_operator", { _ws: cc.workspace_id }); } catch { /* periodic job retries */ }
        return Response.json({ ok: true }, { headers: h });
      },
    },
  },
});
