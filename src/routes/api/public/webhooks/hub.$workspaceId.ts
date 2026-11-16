import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Automation Hub inbound (n8n / Make). Caller must send the workspace hub key in X-TT24-Key.
const UUID = /^[0-9a-f-]{36}$/i;
const Msg = z.object({
  channel: z.enum(["whatsapp", "instagram", "messenger", "email"]),
  account: z.string().trim().min(1).max(150),
  account_label: z.string().trim().max(60).optional(),
  from: z.string().trim().min(1).max(254),
  name: z.string().trim().max(200).optional(),
  text: z.string().max(10000),
  message_id: z.string().trim().min(1).max(300),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

export const Route = createFileRoute("/api/public/webhooks/hub/$workspaceId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ws = params.workspaceId;
        if (!UUID.test(ws)) return new Response("Not found", { status: 404 });
        const { rateLimit, clientIp, tooMany } = await import("@/lib/rate-limit.server");
        if (
          !(await rateLimit(`hub:${ws}`, 600, 60)) ||
          !(await rateLimit(`hub-ip:${clientIp(request)}`, 1200, 60))
        )
          return tooMany();
        const { getSecret, safeEqual } = await import("@/lib/secrets.server");
        const key = await getSecret(ws, "hub_key");
        const got = request.headers.get("x-tt24-key") ?? "";
        if (!key || !safeEqual(got, key)) return new Response("Forbidden", { status: 403 });
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const list = Array.isArray(raw) ? raw : [raw];
        if (list.length > 50)
          return Response.json({ error: "Max 50 messages per call" }, { status: 400 });
        const parsed = z.array(Msg).safeParse(list);
        if (!parsed.success)
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid body" },
            { status: 400 },
          );
        const { hubConnection } = await import("@/lib/hub.server");
        const { ingestInbound } = await import("@/lib/channels.server");
        try {
          for (const m of parsed.data) {
            const connectionId = await hubConnection(ws, m.channel, m.account, m.account_label);
            const from = m.channel === "whatsapp" ? m.from.replace(/\D/g, "") : m.from;
            const at = m.timestamp
              ? new Date(
                  typeof m.timestamp === "number" && m.timestamp < 1e12
                    ? m.timestamp * 1000
                    : m.timestamp,
                )
              : undefined;
            await ingestInbound(ws, m.channel, {
              from,
              name: m.name,
              externalMessageId: `hub:${m.message_id}`,
              text: m.text,
              at: at && !isNaN(+at) ? at : undefined,
              connectionId,
            });
          }
        } catch (e) {
          console.error("hub webhook", e);
          return Response.json({ error: "Temporary error, retry" }, { status: 500 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await (supabaseAdmin as any).rpc("kick_ai_operator", { _ws: ws });
        } catch {
          /* periodic job retries */
        }
        return Response.json({ ok: true, received: parsed.data.length });
      },
    },
  },
});
