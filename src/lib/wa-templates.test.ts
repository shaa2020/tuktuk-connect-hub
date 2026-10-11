import { describe, expect, it } from "vitest";
import { countVars, fillTemplate, windowOpen } from "./wa-templates";

describe("whatsapp templates", () => {
  const now = new Date("2026-10-11T12:00:00Z").getTime();
  it("window is open within 24 hours of the guest's last message", () => {
    expect(windowOpen("2026-10-10T12:30:00Z", now)).toBe(true);
  });
  it("window is closed after 24 hours or with no guest message", () => {
    expect(windowOpen("2026-10-10T11:59:00Z", now)).toBe(false);
    expect(windowOpen(null, now)).toBe(false);
  });
  it("counts and fills positional variables", () => {
    const b = "Hi {{1}}, tour on {{2}} at {{3}}";
    expect(countVars(b)).toBe(3);
    expect(fillTemplate(b, ["Anna", "Mon", "Rossio"])).toBe("Hi Anna, tour on Mon at Rossio");
  });
});
