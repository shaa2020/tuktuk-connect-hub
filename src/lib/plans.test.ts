import { describe, expect, it } from "vitest";
import { formatLimit, friendlyError, parsePlanLimitError, usageLevel, usageRatio } from "./plans";

describe("plan helpers", () => {
  it("parses database plan-limit errors into friendly text", () => {
    const r = parsePlanLimitError(
      "PLAN_LIMIT:members: your plan allows 2 (currently 2). Upgrade your plan to add more.",
    );
    expect(r?.metric).toBe("members");
    expect(r?.text).toContain("Team members (2)");
  });
  it("leaves other errors untouched", () => {
    expect(parsePlanLimitError("duplicate key")).toBeNull();
    expect(friendlyError("duplicate key")).toBe("duplicate key");
    expect(friendlyError(undefined)).toMatch(/Something went wrong/);
  });
  it("computes usage levels", () => {
    expect(usageLevel({ used: 1, limit: null })).toBe("unlimited");
    expect(usageLevel({ used: 1, limit: 10 })).toBe("ok");
    expect(usageLevel({ used: 8, limit: 10 })).toBe("warning");
    expect(usageLevel({ used: 10, limit: 10 })).toBe("full");
    expect(usageLevel({ used: 11, limit: 10 })).toBe("over");
    expect(usageRatio({ used: 5, limit: 10 })).toBe(0.5);
    expect(usageRatio({ used: 5, limit: null })).toBeNull();
    expect(usageRatio({ used: 5, limit: 0 })).toBe(1);
  });
  it("formats limits", () => {
    expect(formatLimit(null)).toBe("Unlimited");
    expect(formatLimit(1500)).toBe("1,500");
  });
});
