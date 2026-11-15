import { describe, expect, it } from "vitest";
import { passwordProblems, timeZones, validateBusinessName } from "./signup";

describe("signup helpers", () => {
  it("lists every missing password rule", () => {
    expect(passwordProblems("short")).toEqual(["at least 10 characters", "an uppercase letter", "a number", "a symbol"]);
    expect(passwordProblems("Str0ng!Passw0rd")).toEqual([]);
    expect(passwordProblems("A1!" + "a".repeat(80))).toContain("at most 72 characters");
  });
  it("validates business names", () => {
    expect(validateBusinessName(" ")).toMatch(/at least 2/);
    expect(validateBusinessName("x".repeat(121))).toMatch(/120/);
    expect(validateBusinessName("Hotel Sol")).toBeNull();
  });
  it("offers time zones including Lisbon", () => {
    expect(timeZones()).toContain("Europe/Lisbon");
  });
});
