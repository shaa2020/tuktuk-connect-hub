// Pure Stripe helpers (tested): webhook signature verification and subscription → plan mapping.
// Works in Workers and Node (Web Crypto only; no Stripe SDK dependency).

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafe(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Verifies a Stripe-Signature header (t=…,v1=…) per Stripe's scheme, with replay tolerance. */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => timingSafe(s, expected));
}

export type PriceMap = { key: string; stripe_price_monthly: string | null; stripe_price_annual: string | null }[];

export function planForPrice(priceId: string | undefined, plans: PriceMap): { plan: string; interval: "month" | "year" } | null {
  if (!priceId) return null;
  for (const p of plans) {
    if (p.stripe_price_monthly === priceId) return { plan: p.key, interval: "month" };
    if (p.stripe_price_annual === priceId) return { plan: p.key, interval: "year" };
  }
  return null;
}

const STATUS = new Set(["trialing", "active", "past_due", "canceled", "incomplete", "paused"]);
const iso = (s: unknown) => (typeof s === "number" ? new Date(s * 1000).toISOString() : null);

/**
 * Decides what a Stripe subscription means for the workspace. Paid plan only while the
 * subscription is active/trialing/past_due (Stripe is still retrying); otherwise back to Free.
 * Data is never deleted on downgrade — limits just block new items.
 */
export function subscriptionEffect(sub: any, plans: PriceMap) {
  const item = sub?.items?.data?.[0];
  const mapped = planForPrice(item?.price?.id, plans);
  const status = STATUS.has(sub?.status) ? sub.status : sub?.status === "unpaid" || sub?.status === "incomplete_expired" ? "canceled" : "incomplete";
  const paidAccess = ["active", "trialing", "past_due"].includes(status);
  return {
    workspaceId: (sub?.metadata?.workspace_id as string | undefined) ?? null,
    planKey: mapped?.plan ?? null,
    interval: mapped?.interval ?? "month",
    status: status as "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused",
    effectivePlan: paidAccess && mapped ? mapped.plan : "free",
    currentPeriodEnd: iso(item?.current_period_end ?? sub?.current_period_end),
    cancelAt: iso(sub?.cancel_at),
    trialEndsAt: iso(sub?.trial_end),
    graceUntil: status === "past_due" ? new Date(Date.now() + 7 * 86400_000).toISOString() : null,
  };
}

/** Stripe's API takes form encoding with bracketed keys. */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}
