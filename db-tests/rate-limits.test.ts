import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, makeUser, sql } from "./helpers";

afterAll(async () => {
  await sql.end();
});

describe("rate limiter", () => {
  it("allows up to the maximum, then refuses within the window", async () => {
    const r = await asService(async (tx) => {
      const out: boolean[] = [];
      for (let i = 0; i < 4; i++)
        out.push((await tx`select check_rate_limit('test:ip:1.2.3.4', 3, 60) ok`)[0].ok);
      return out;
    });
    expect(r).toEqual([true, true, true, false]);
  });
  it("keys are independent", async () => {
    const r = await asService(async (tx) => {
      await tx`select check_rate_limit('a', 1, 60)`;
      return (await tx`select check_rate_limit('b', 1, 60) ok`)[0].ok;
    });
    expect(r).toBe(true);
  });
  it("browsers cannot call or read the limiter", async () => {
    const u = await makeUser("rl");
    await expect(asUser(u, (tx) => tx`select check_rate_limit('x', 1, 60)`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(asUser(u, (tx) => tx`select * from rate_limits`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
