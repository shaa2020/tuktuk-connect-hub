import { describe, expect, it } from "vitest";
import { generateCodes, hashCode, looksLikeCode, normalizeCode } from "./mfa-recovery";

describe("MFA recovery codes", () => {
  it("generates 10 unique, readable codes", () => {
    const c = generateCodes();
    expect(c).toHaveLength(10);
    expect(new Set(c).size).toBe(10);
    expect(c.every((x) => /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(x))).toBe(true);
    expect(c.every(looksLikeCode)).toBe(true);
  });
  it("normalises typing differences and hashes per user", async () => {
    expect(normalizeCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    expect(await hashCode("u1", "abcde fghjk")).toBe(await hashCode("u1", "ABCDE-FGHJK"));
    expect(await hashCode("u1", "ABCDE-FGHJK")).not.toBe(await hashCode("u2", "ABCDE-FGHJK"));
    expect(looksLikeCode("hello")).toBe(false);
  });
});
