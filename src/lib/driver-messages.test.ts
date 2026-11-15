import { describe, expect, it } from "vitest";
import {
  assignmentMessage,
  lisbonNow,
  paymentLine,
  scheduleMessage,
  type DriverTour,
} from "./driver-messages";

const t = (o: Partial<DriverTour> = {}): DriverTour => ({
  reference: "TT24-1",
  tour_name: "2-hour tour",
  tour_date: "2026-10-14",
  start_time: "14:00:00",
  duration_minutes: 120,
  guests: 4,
  pickup_location: "Hard Rock Cafe",
  payment_status: "pending",
  amount: 140,
  currency: "EUR",
  ...o,
});
const emoji = /\p{Extended_Pictographic}/u;

describe("driver messages", () => {
  it("contain no emojis", () => {
    expect(emoji.test(assignmentMessage("Miguel", t({ notes: "Birthday" })))).toBe(false);
    expect(
      emoji.test(scheduleMessage("Miguel", "2026-10-14", [t(), t({ start_time: "10:00:00" })])),
    ).toBe(false);
  });
  it("tells the driver how many tours they have, in time order", () => {
    const m = scheduleMessage("Miguel", "2026-10-14", [
      t({ reference: "B" }),
      t({ reference: "A", start_time: "10:00:00" }),
    ]);
    expect(m).toContain("Assigned tours: 2");
    expect(m.indexOf("Booking: A")).toBeLessThan(m.indexOf("Booking: B"));
  });
  it("shows the amount to collect for unpaid tours", () => {
    expect(paymentLine(t())).toBe("Payment: NOT PAID (collect 140.00 EUR)");
    expect(paymentLine(t({ payment_status: "paid" }))).toBe("Payment: PAID");
  });
  it("uses Lisbon time", () => {
    expect(lisbonNow(new Date("2026-10-13T23:30:00Z"))).toEqual({
      date: "2026-10-14",
      minutes: 30,
    });
  });
});
