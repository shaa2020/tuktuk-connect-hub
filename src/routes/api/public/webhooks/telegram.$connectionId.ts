import { createFileRoute } from "@tanstack/react-router";

// Telegram webhook for one connected bot. Authenticated by the per-connection secret token.
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/api/public/webhooks/telegram/$connectionId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = params.connectionId;
        if (!UUID.test(id)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
        const { data: cc } = await sb
          .from("channel_connections")
          .select("id, workspace_id, status")
          .eq("id", id)
          .eq("channel", "telegram")
          .maybeSingle();
        if (!cc || cc.status !== "connected") return new Response("Not found", { status: 404 });
        const { getSecret, safeEqual } = await import("@/lib/secrets.server");
        const expected = await getSecret(cc.workspace_id, `telegram_secret:${id}`);
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!expected || !safeEqual(got, expected))
          return new Response("Forbidden", { status: 403 });
        const { rateLimit, tooMany } = await import("@/lib/rate-limit.server");
        if (!(await rateLimit(`tg:${id}`, 1200, 60))) return tooMany();
        let update: unknown;
        try {
          update = await request.json();
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const { parseUpdate } = await import("@/lib/telegram");
        const m = parseUpdate(update);
        if (!m) return new Response("OK"); // not a private message: acknowledge so Telegram stops retrying
        try {
          const { ingestInbound } = await import("@/lib/channels.server");
          const saved = await ingestInbound(cc.workspace_id, "telegram", {
            from: m.chatId,
            name: m.name,
            externalMessageId: m.messageId,
            text: m.text,
            at: m.at,
            connectionId: id,
          });
          // Photos, voice notes and files: download from Telegram into the private inbox storage.
          if (m.media && saved?.messageId) {
            const { downloadTelegramFile } = await import("@/lib/telegram.server");
            const file = await downloadTelegramFile(cc.workspace_id, id, m.media.fileId).catch(
              () => null,
            );
            if (file)
              await (
                await import("@/lib/attachments.server")
              ).storeInboundMedia(
                cc.workspace_id,
                saved.conversationId,
                saved.messageId,
                { bytes: file.bytes, mime: m.media.mime || file.mime },
                m.media.name,
              );
          }
        } catch (e) {
          console.error("telegram webhook", e);
          return new Response("Error", { status: 500 }); // Telegram retries
        }
        try {
          await (sb as any).rpc("kick_ai_operator", { _ws: cc.workspace_id });
        } catch {
          /* periodic job retries */
        }
        return new Response("OK");
      },
    },
  },
});
