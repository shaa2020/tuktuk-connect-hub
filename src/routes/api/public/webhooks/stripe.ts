import { createFileRoute } from "@tanstack/react-router";

// Stripe Billing webhook (SaaS subscriptions). Verified with STRIPE_WEBHOOK_SECRET; idempotent.
export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        const { verifyStripeSignature } = await import("@/lib/stripe");
        if (!(await verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)))
          return new Response("Bad signature", { status: 400 });
        let event: any;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        try {
          const r = await (await import("@/lib/stripe.server")).handleEvent(event);
          return Response.json({ received: true, result: r });
        } catch (e) {
          console.error("stripe webhook", (e as Error).message);
          return new Response("Error", { status: 500 }); // Stripe retries with backoff
        }
      },
    },
  },
});
