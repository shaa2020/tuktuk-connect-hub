import { describe, expect, it } from "vitest";
import { nextDates, priceLabel, slugify, SLUG_RE } from "./booking-page";

describe("booking page helpers", () => {
  it("makes valid slugs", () => {
    expect(slugify("Hotel Sol Pôrto!")).toBe("hotel-sol-porto");
    expect(SLUG_RE.test(slugify("Tuk Tuk 24 Lisbon"))).toBe(true);
    expect(slugify("!!!")).toBe("my-business");
  });
  it("prices per person and per night", () => {
    expect(
      priceLabel({ price_cents: 2500, currency: "EUR", price_per: "person", mode: "slot" }, 3),
    ).toBe("€75.00");
    expect(
      priceLabel({ price_cents: 9000, currency: "EUR", price_per: "booking", mode: "day" }, 2, 3),
    ).toBe("€270.00");
    expect(
      priceLabel({ price_cents: null, currency: "EUR", price_per: "booking", mode: "slot" }),
    ).toBeNull();
  });
  it("lists dates in the business time zone", () => {
    const d = nextDates("Europe/Lisbon", 3, new Date("2030-01-01T23:30:00Z"));
    expect(d).toEqual(["2030-01-01", "2030-01-02", "2030-01-03"]);
    expect(nextDates("Asia/Tokyo", 1, new Date("2030-01-01T23:30:00Z"))).toEqual(["2030-01-02"]);
  });
});
