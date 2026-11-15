import { describe, expect, it } from "vitest";
import { findConflicts, nextDispatch } from "./dispatch";

const b = (
  id: string,
  start: string,
  dur: number,
  v: string | null,
  d: string | null,
  status = "confirmed",
) => ({
  id,
  tour_date: "2026-10-12",
  start_time: start,
  duration_minutes: dur,
  vehicle_id: v,
  driver_id: d,
  status,
});

describe("dispatch conflicts", () => {
  it("flags the same tuk tuk booked for overlapping times", () => {
    const c = findConflicts([b("a", "10:00", 60, "v1", null), b("b", "10:30", 60, "v1", null)]);
    expect(c.get("a")).toEqual(["vehicle"]);
    expect(c.get("b")).toEqual(["vehicle"]);
  });
  it("flags the same driver booked for overlapping times", () => {
    const c = findConflicts([b("a", "10:00", 120, "v1", "d1"), b("b", "11:00", 60, "v2", "d1")]);
    expect(c.get("a")).toEqual(["driver"]);
  });
  it("back-to-back tours do not conflict", () => {
    expect(
      findConflicts([b("a", "10:00", 60, "v1", "d1"), b("b", "11:00", 60, "v1", "d1")]).size,
    ).toBe(0);
  });
  it("cancelled tours never conflict", () => {
    expect(
      findConflicts([b("a", "10:00", 60, "v1", null), b("b", "10:00", 60, "v1", null, "cancelled")])
        .size,
    ).toBe(0);
  });
  it("moves through the tour lifecycle and stops at completed", () => {
    expect(nextDispatch("scheduled")).toBe("dispatched");
    expect(nextDispatch("on_tour")).toBe("done");
    expect(nextDispatch("done")).toBeNull();
  });
});
