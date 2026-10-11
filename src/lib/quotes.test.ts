import { describe, expect, it } from "vitest";
import { TOUR_PACKAGES, formatQuote, quoteTotal, tuksNeeded } from "./quotes";

const alfama = TOUR_PACKAGES.find((p) => p.id === "alfama")!;

describe("quotes", () => {
  it("fits guests into tuk tuks", () => {
    expect(tuksNeeded(1, 4)).toBe(1);
    expect(tuksNeeded(4, 4)).toBe(1);
    expect(tuksNeeded(5, 4)).toBe(2);
    expect(tuksNeeded(8, 4)).toBe(2);
    expect(tuksNeeded(9, 4)).toBe(3);
    expect(tuksNeeded(0, 4)).toBe(1);
  });

  it("prices per tuk tuk, not per person", () => {
    expect(quoteTotal(alfama, 2)).toEqual({ tuks: 1, total: 60 });
    expect(quoteTotal(alfama, 6)).toEqual({ tuks: 2, total: 120 });
  });

  it("formats a sendable summary with total and confirm line", () => {
    const q = formatQuote(alfama, 6, "2026-10-15", "10:00", "Cruise Terminal");
    expect(q).toContain("Historic Alfama (1h)");
    expect(q).toContain("Guests: 6 · 2 tuk tuks");
    expect(q).toContain("Date: 2026-10-15 at 10:00");
    expect(q).toContain("Pick-up: Cruise Terminal");
    expect(q).toContain("Total: €120");
    expect(q).toContain("Reply YES to confirm");
  });

  it("omits date and pickup lines when not given", () => {
    const q = formatQuote(alfama, 2, "", "", "");
    expect(q).not.toContain("Date:");
    expect(q).not.toContain("Pick-up:");
  });
});
