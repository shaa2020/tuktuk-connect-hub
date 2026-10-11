import { createFileRoute } from "@tanstack/react-router";

// WhatsApp connector callbacks (signed by Lovable with WHATSAPP_API_KEY).
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WHATSAPP_API_KEY;
        if (!secret) return new Response("Not configured", { status: 500 });
        const { verifyWebhookRequest } = await import("@lovable.dev/webhooks-js");
        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 }));
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const deliveryId = request.headers.get("x-lovable-delivery") ?? "";
        const event = request.headers.get("x-lovable-event") ?? "";
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });
        const { receive } = await import("@/lib/whatsapp-inbox.server");
        const status = await receive(deliveryId.slice(0, 200), event.slice(0, 100), payload);
        return new Response(status === 200 ? "OK" : "Error", { status });
      },
    },
  },
});
