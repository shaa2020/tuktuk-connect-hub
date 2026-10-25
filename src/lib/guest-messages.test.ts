import { describe, expect, it } from "vitest";
import { nextDate, pickupPin, reminderMessage, reviewDue, reviewMessage } from "./guest-messages";

describe("guest messages", () => {
  it("pins the Hard Rock meeting point to its exact address", () => {
    expect(pickupPin("Hard Rock Cafe")?.url).toContain(encodeURIComponent("Av. da Liberdade 2"));
  });
  it("reminder includes tour time and map link", () => {
    const m = reminderMessage({ guest_name: "Anna Smith", tour_name: "Old Town", tour_date: "2026-11-01", start_time: "10:30:00", pickup_location: "Fado Museum" });
    expect(m).toContain("Hello Anna");
    expect(m).toContain("Time: 10:30");
    expect(m).toContain("maps.google.com");
  });
  it("review lists only links that are set", () => {
    const m = reviewMessage("Bo", null, "https://g.page/x", null);
    expect(m).toContain("Google: https://g.page/x");
    expect(m).not.toContain("TripAdvisor");
  });
  it("review is due 2 hours after the tour ends", () => {
    // 10:00 start + 120 min = ends 12:00, due 14:00
    expect(reviewDue("2026-11-01", "10:00", 120, "2026-11-01", 13 * 60 + 59)).toBe(false);
    expect(reviewDue("2026-11-01", "10:00", 120, "2026-11-01", 14 * 60)).toBe(true);
    expect(reviewDue("2026-10-31", null, null, "2026-11-01", 0)).toBe(true);
  });
  it("nextDate rolls over months", () => {
    expect(nextDate("2026-10-31")).toBe("2026-11-01");
  });
});
