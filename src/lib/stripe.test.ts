import { describe, expect, it } from "vitest";
import { formEncode, planForPrice, subscriptionEffect, verifyStripeSignature } from "./stripe";

async function sign(secret: string, t: number, body: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const s = new Uint8Array(
    await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${body}`)),
  );
  return `t=${t},v1=${Array.from(s, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const plans = [
  { key: "starter", stripe_price_monthly: "price_S1", stripe_price_annual: "price_S12" },
  { key: "business", stripe_price_monthly: "price_B1", stripe_price_annual: null },
];

describe("stripe webhook signature", () => {
  it("accepts a valid signature and rejects tampering, wrong secret and replays", async () => {
    const body = '{"id":"evt_1"}',
      now = 1_800_000_000;
    const h = await sign("whsec_test", now, body);
    expect(await verifyStripeSignature(body, h, "whsec_test", 300, now)).toBe(true);
    expect(await verifyStripeSignature(body + " ", h, "whsec_test", 300, now)).toBe(false);
    expect(await verifyStripeSignature(body, h, "whsec_other", 300, now)).toBe(false);
    expect(await verifyStripeSignature(body, h, "whsec_test", 300, now + 301)).toBe(false);
    expect(await verifyStripeSignature(body, null, "whsec_test", 300, now)).toBe(false);
  });
});

describe("subscription → plan", () => {
  it("maps prices to plans and intervals", () => {
    expect(planForPrice("price_S12", plans)).toEqual({ plan: "starter", interval: "year" });
    expect(planForPrice("price_unknown", plans)).toBeNull();
  });
  it("grants the paid plan while active or retrying, Free after cancellation", () => {
    const sub = (status: string) => ({
      status,
      metadata: { workspace_id: "ws1" },
      items: { data: [{ price: { id: "price_B1" }, current_period_end: 1_800_000_000 }] },
    });
    expect(subscriptionEffect(sub("active"), plans)).toMatchObject({
      workspaceId: "ws1",
      effectivePlan: "business",
      status: "active",
      graceUntil: null,
    });
    const pd = subscriptionEffect(sub("past_due"), plans);
    expect(pd.effectivePlan).toBe("business");
    expect(pd.graceUntil).not.toBeNull();
    expect(subscriptionEffect(sub("canceled"), plans).effectivePlan).toBe("free");
    expect(subscriptionEffect(sub("unpaid"), plans)).toMatchObject({
      status: "canceled",
      effectivePlan: "free",
    });
  });
  it("form-encodes nested params", () => {
    expect(
      formEncode({
        mode: "subscription",
        line_items: { 0: { price: "price_1", quantity: 1 } },
        x: undefined,
      }),
    ).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1",
    );
  });
});
