import { describe, expect, it } from "vitest";
import {
  commandFor,
  isSnoozed,
  isTypingTarget,
  moveSelection,
  snoozeLabel,
  snoozeUntil,
} from "./inbox-keys";

describe("inbox shortcuts", () => {
  it("maps keys to commands", () => {
    expect(commandFor({ key: "j" })).toBe("next");
    expect(commandFor({ key: "k" })).toBe("prev");
    expect(commandFor({ key: "e" })).toBe("resolve");
    expect(commandFor({ key: "?" })).toBe("help");
    expect(commandFor({ key: "q" })).toBeNull();
  });
  it("ignores keys typed into fields and modified keys", () => {
    expect(commandFor({ key: "e", target: { tagName: "TEXTAREA" } })).toBeNull();
    expect(commandFor({ key: "j", target: { tagName: "INPUT", type: "text" } })).toBeNull();
    expect(commandFor({ key: "x", target: { tagName: "INPUT", type: "checkbox" } })).toBe("select");
    expect(commandFor({ key: "a", target: { isContentEditable: true } })).toBeNull();
    expect(commandFor({ key: "k", ctrlKey: true })).toBeNull();
    // Escape always works, even from the message box
    expect(commandFor({ key: "Escape", target: { tagName: "TEXTAREA" } })).toBe("close");
    expect(isTypingTarget(null)).toBe(false);
  });
  it("moves through the list and clamps at the ends", () => {
    const ids = ["a", "b", "c"];
    expect(moveSelection(ids, undefined, 1)).toBe("a");
    expect(moveSelection(ids, "a", 1)).toBe("b");
    expect(moveSelection(ids, "c", 1)).toBe("c");
    expect(moveSelection(ids, "a", -1)).toBe("a");
    expect(moveSelection(ids, "gone", 1)).toBe("a");
    expect(moveSelection([], "a", 1)).toBeUndefined();
  });
});

describe("snooze", () => {
  const now = new Date(2026, 10, 18, 15, 30); // Wednesday 18 Nov 2026, 15:30 local
  it("computes presets", () => {
    expect(snoozeUntil("1h", now).getTime() - now.getTime()).toBe(3600_000);
    const t = snoozeUntil("tomorrow", now);
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([19, 9, 0]);
    const m = snoozeUntil("monday", now);
    expect([m.getDay(), m.getDate(), m.getHours()]).toEqual([1, 23, 9]);
    const mon = new Date(2026, 10, 23, 8, 0); // on a Monday → the following Monday
    expect(snoozeUntil("monday", mon).getDate()).toBe(30);
  });
  it("knows when a snooze is active", () => {
    expect(isSnoozed(null, now)).toBe(false);
    expect(isSnoozed(new Date(now.getTime() + 1000).toISOString(), now)).toBe(true);
    expect(isSnoozed(new Date(now.getTime() - 1000).toISOString(), now)).toBe(false);
  });
  it("labels the wake-up time", () => {
    const later = new Date(2026, 10, 18, 17, 0).toISOString();
    const tomorrow = new Date(2026, 10, 19, 9, 0).toISOString();
    expect(snoozeLabel(later, now)).not.toMatch(/\s\w{3}\s/);
    expect(snoozeLabel(tomorrow, now).split(" ").length).toBeGreaterThan(1);
  });
});
