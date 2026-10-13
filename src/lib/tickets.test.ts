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
