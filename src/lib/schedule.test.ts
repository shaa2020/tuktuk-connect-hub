import { describe, expect, it } from "vitest";
import { dayKey, hours, shiftRange, shiftsByDay, startOfWeek, weekDays, workload } from "./schedule";

describe("schedule helpers", () => {
  it("weeks start on Monday", () => {
    expect(dayKey(startOfWeek(new Date(2030, 0, 3)))).toBe("2029-12-31"); // Thu 3 Jan 2030 → Mon 31 Dec
    expect(weekDays(startOfWeek(new Date(2030, 0, 3)))).toHaveLength(7);
  });
  it("builds shift ranges, rolling overnight shifts to the next day", () => {
    const r = shiftRange("2030-01-01", "22:00", "06:00")!;
    expect(hours(r)).toBe(8);
    expect(shiftRange("bad", "09:00", "10:00")).toBeNull();
  });
  it("groups by day and sums workload", () => {
    const a = shiftRange("2030-01-01", "09:00", "17:00")!, b = shiftRange("2030-01-02", "09:00", "13:00")!;
    const shifts = [{ id: "1", user_id: "u1", position: null, ...a }, { id: "2", user_id: "u1", position: null, ...b }, { id: "3", user_id: "u2", position: null, ...b }];
    expect(Object.keys(shiftsByDay(shifts))).toEqual(["2030-01-01", "2030-01-02"]);
    expect(workload(shifts)).toEqual([{ user_id: "u1", hours: 12, shifts: 2 }, { user_id: "u2", hours: 4, shifts: 1 }]);
  });
});
