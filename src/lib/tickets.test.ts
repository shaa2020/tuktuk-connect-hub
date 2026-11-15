import { describe, it, expect } from "vitest";
import { ticketEligible, ticketMessage } from "./tickets";

describe("ticket rules", () => {
  const paid = { status: "confirmed", payment_status: "paid" as const };
  const unpaid = { status: "confirmed", payment_status: "pending" as const };
  it("auto off sends nothing", () => expect(ticketEligible("off", paid)).toBe(false));
  it("paid mode only sends paid", () => { expect(ticketEligible("paid", paid)).toBe(true); expect(ticketEligible("paid", unpaid)).toBe(false); });
  it("unpaid mode only sends unpaid", () => { expect(ticketEligible("unpaid", unpaid)).toBe(true); expect(ticketEligible("unpaid", paid)).toBe(false); });
  it("never sends for unconfirmed bookings", () => expect(ticketEligible("all", { status: "tentative", payment_status: "paid" })).toBe(false));
  it("message states payment clearly", () => {
    const base = { tour_name: "Old town", tour_date: "2026-10-20", start_time: "12:30:00", reference: "TT-1", amount: 90, currency: "EUR", ticket_token: "abc" };
    expect(ticketMessage({ ...base, payment_status: "paid" })).toContain("Payment: PAID");
    expect(ticketMessage({ ...base, payment_status: "pending" })).toContain("Payment: NOT PAID");
  });
});

import { ticketMessage as tm } from "./tickets";
describe("ticket message branding", () => {
  const b = { tour_name: "Spa day", tour_date: null, start_time: null, reference: "R1", payment_status: "paid" as const, amount: null, currency: "EUR", ticket_token: "tok" };
  it("keeps the operator's wording and domain by default", () => {
    expect(tm(b)).toContain("Your Tuk Tuk 24 Lisbon ticket");
    expect(tm(b)).toContain("to your driver: https://tickets.tuktuk24lisbon.com/ticket/tok");
  });
  it("uses another business's own name and app address", () => {
    const m = tm(b, "Hotel Sol", "https://app.example.com/");
    expect(m).toContain("Your Hotel Sol ticket");
    expect(m).toContain("when you arrive: https://app.example.com/ticket/tok");
    expect(m).not.toMatch(/Tuk Tuk/);
  });
});
