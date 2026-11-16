import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_BOOT } from "./theme";

describe("theme", () => {
  it("resolves system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("boot script is valid JavaScript", () => {
    expect(() => new Function(THEME_BOOT)).not.toThrow();
  });
});
