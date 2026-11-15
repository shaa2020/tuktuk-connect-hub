// Server-only: Stripe Billing for the SaaS subscription (separate from businesses' own customer
// payments). Needs STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET and price ids on the plans table.
import { formEncode, subscriptionEffect, type PriceMap } from "./stripe";

const API = "https://api.stripe.com/v1";
export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

async function stripe(method: "GET" | "POST", path: string, params?: Record<string, unknown>) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Online payments aren't switched on yet.");
  const res = await fetch(`${API}${path}${method === "GET" && params ? `?${formEncode(params)}` : ""}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "stripe-version": "2024-06-20" },
    body: method === "POST" && params ? formEncode(params) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(`Stripe: ${String(j?.error?.message ?? res.status).slice(0, 200)}`);
  return j;
}

async function priceMap(): Promise<PriceMap> {
  const { data } = await (await db()).from("plans").select("key, stripe_price_monthly, stripe_price_annual");
  return (data ?? []) as PriceMap;
}

export async function createCheckout(ws: string, planKey: string, interval: "month" | "year", email: string, origin: string) {
  const sb = await db();
  const { data: plan } = await sb.from("plans").select("key, stripe_price_monthly, stripe_price_annual, trial_days, active").eq("key", planKey).maybeSingle();
  const price = interval === "year" ? plan?.stripe_price_annual : plan?.stripe_price_monthly;
  if (!plan?.active || !price) throw new Error("This plan can't be bought online yet.");
  const { data: sub } = await sb.from("workspace_subscriptions").select("provider_customer_id, status").eq("workspace_id", ws).maybeSingle();
  if (sub && ["active", "trialing", "past_due"].includes(sub.status)) throw new Error("You already have a subscription — use “Manage billing” to change plan.");
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price, quantity: 1 } },
    client_reference_id: ws,
    ...(sub?.provider_customer_id ? { customer: sub.provider_customer_id } : { customer_email: email }),
    subscription_data: { metadata: { workspace_id: ws }, ...(plan.trial_days ? { trial_period_days: plan.trial_days } : {}) },
    metadata: { workspace_id: ws },
    allow_promotion_codes: "true",
    automatic_tax: { enabled: "true" },
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
  });
  return session.url as string;
}

export async function createPortal(ws: string, origin: string) {
  const { data: sub } = await (await db()).from("workspace_subscriptions").select("provider_customer_id").eq("workspace_id", ws).maybeSingle();
  if (!sub?.provider_customer_id) throw new Error("No billing account yet.");
  const s = await stripe("POST", "/billing_portal/sessions", { customer: sub.provider_customer_id, return_url: `${origin}/billing` });
  return s.url as string;
}

/** Applies one verified webhook event. Idempotent: duplicate event ids are ignored. */
export async function handleEvent(event: any): Promise<"processed" | "duplicate" | "ignored"> {
  const sb = await db();
  const { error: dup } = await sb.from("billing_events").insert({ provider: "stripe", event_id: event.id, type: event.type, payload: event });
  if (dup) { if (dup.code === "23505") return "duplicate"; throw new Error(dup.message); }
  try {
    const obj = event.data?.object ?? {};
    let sub: any = null;
    if (event.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
      sub = await stripe("GET", `/subscriptions/${obj.subscription}`);
    } else if (event.type.startsWith("customer.subscription.")) {
      sub = obj;
    } else if ((event.type === "invoice.payment_failed" || event.type === "invoice.paid") && obj.subscription) {
      sub = await stripe("GET", `/subscriptions/${obj.subscription}`);
    }
    if (!sub) { await sb.from("billing_events").update({ processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("event_id", event.id); return "ignored"; }
    const eff = subscriptionEffect(sub, await priceMap());
    const ws = eff.workspaceId ?? obj.client_reference_id ?? null;
    if (!ws) throw new Error("Subscription has no workspace_id metadata");
    const { data: w } = await sb.from("workspaces").select("id, plan").eq("id", ws).maybeSingle();
    if (!w) throw new Error("Unknown workspace");
    await sb.from("workspace_subscriptions").upsert({
      workspace_id: ws, provider: "stripe", provider_customer_id: String(sub.customer), provider_subscription_id: String(sub.id),
      plan_key: eff.planKey ?? w.plan, billing_interval: eff.interval, status: eff.status, trial_ends_at: eff.trialEndsAt,
      current_period_end: eff.currentPeriodEnd, cancel_at: eff.cancelAt, grace_until: eff.graceUntil, updated_at: new Date().toISOString(),
    });
    // Never touch the operator's internal plan; otherwise follow the subscription.
    if (w.plan !== "internal" && w.plan !== eff.effectivePlan) {
      await sb.from("workspaces").update({ plan: eff.effectivePlan }).eq("id", ws);
      await sb.from("audit_logs").insert({ workspace_id: ws, actor_id: null, action: "billing.plan_change", entity_type: "workspaces", entity_id: ws, details: { from: w.plan, to: eff.effectivePlan, stripe_status: eff.status, event: event.id } });
    }
    await sb.from("billing_events").update({ workspace_id: ws, processed_at: new Date().toISOString(), error: null }).eq("provider", "stripe").eq("event_id", event.id);
    return "processed";
  } catch (e) {
    // Keep the event and remove the dedupe claim so Stripe's retry can process it again.
    await sb.from("billing_events").delete().eq("provider", "stripe").eq("event_id", event.id);
    throw e;
  }
}
