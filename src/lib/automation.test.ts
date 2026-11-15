import { describe, expect, it } from "vitest";
import { matches, nextRetry, render, Workflow } from "./automation";

describe("automation conditions", () => {
  it("matches channel, accent-insensitive keywords and tour names", () => {
    expect(matches({ channel: "whatsapp", keyword: "preço, price" }, { channel: "whatsapp", text: "Qual é o PRECO?" })).toBe(true);
    expect(matches({ channel: "email" }, { channel: "whatsapp" })).toBe(false);
    expect(matches({ keyword: "refund" }, { text: "hello" })).toBe(false);
    expect(matches({ tour_contains: "sunset" }, { tour_name: "Sunset Belém Tour" })).toBe(true);
    expect(matches({}, {})).toBe(true);
  });
});

describe("templates", () => {
  it("fills placeholders and never prints undefined", () => {
    expect(render("Hi {{contact_name}}, booking {{booking_reference}} on {{tour_date}} {{unknown}}!", { contact_name: "Ana", booking_reference: "TT24-1" })).toBe("Hi Ana, booking TT24-1 on !");
  });
});

describe("workflow validation", () => {
  it("accepts a valid workflow and rejects unsafe ones", () => {
    const ok = Workflow.safeParse({ name: "Confirm", trigger: "booking_confirmed", conditions: {}, actions: [{ type: "send_message", text: "Confirmed!" }], delay_minutes: 0 });
    expect(ok.success).toBe(true);
    expect(Workflow.safeParse({ name: "x", trigger: "booking_confirmed", conditions: { evil: 1 }, actions: [{ type: "send_message", text: "x" }], delay_minutes: 0 }).success).toBe(false);
    expect(Workflow.safeParse({ name: "x", trigger: "nope", conditions: {}, actions: [{ type: "notify", to: "managers", text: "x" }], delay_minutes: 0 }).success).toBe(false);
    expect(Workflow.safeParse({ name: "x", trigger: "lead_created", conditions: {}, actions: [], delay_minutes: 0 }).success).toBe(false);
  });
  it("retries three times with growing delays", () => {
    expect(nextRetry(1, 0)).toBe(new Date(5 * 60_000).toISOString());
    expect(nextRetry(3, 0)).toBeNull();
  });
});
