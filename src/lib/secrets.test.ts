import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, hintOf, hmacSha256Hex, safeEqual } from "./secrets.server";

beforeAll(() => { process.env.CREDENTIALS_ENCRYPTION_KEY = "test-key-for-unit-tests-only"; });

describe("credential storage", () => {
  it("encrypted value does not contain the secret and decrypts back", async () => {
    const c = await encrypt("sk-super-secret-1234");
    expect(c).not.toContain("sk-super-secret");
    expect(await decrypt(c)).toBe("sk-super-secret-1234");
  });
  it("hint shows only the last 4 characters", () => {
    expect(hintOf("sk-super-secret-1234")).toBe("••••1234");
  });
  it("webhook signature check rejects a tampered body", async () => {
    const sig = await hmacSha256Hex("appsecret", '{"a":1}');
    expect(safeEqual(sig, await hmacSha256Hex("appsecret", '{"a":2}'))).toBe(false);
    expect(safeEqual(sig, await hmacSha256Hex("appsecret", '{"a":1}'))).toBe(true);
  });
});
