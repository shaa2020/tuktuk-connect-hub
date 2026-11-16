import { describe, expect, it } from "vitest";
import { modulesFor, needsBusinessChoice, pickWorkspace } from "@/hooks/use-workspace";

describe("industry modules", () => {
  it("shows tour tools to tour/travel businesses, the operator and legacy workspaces", () => {
    expect(modulesFor("tour_operator", false).tours).toBe(true);
    expect(modulesFor("travel_agency", false).tours).toBe(true);
    expect(modulesFor(null, false).tours).toBe(true);
    expect(modulesFor("hotel", true).tours).toBe(true);
  });
  it("hides tour tools from other industries", () => {
    expect(modulesFor("restaurant", false).tours).toBe(false);
    expect(modulesFor("hotel", false).tours).toBe(false);
  });
});

describe("workspace selection", () => {
  const m = [{ workspace_id: "a" }, { workspace_id: "b" }];
  it("uses the remembered workspace only if the user still belongs to it", () => {
    expect(pickWorkspace(m, "b")?.workspace_id).toBe("b");
    expect(pickWorkspace(m, "zzz")?.workspace_id).toBe("a");
    expect(pickWorkspace(m, null)?.workspace_id).toBe("a");
    expect(pickWorkspace([], "a")).toBeNull();
  });
  it("asks which business to open when several exist and none is remembered", () => {
    expect(needsBusinessChoice(m, null)).toBe(true);
    expect(needsBusinessChoice(m, "gone")).toBe(true);
    expect(needsBusinessChoice(m, "b")).toBe(false);
    expect(needsBusinessChoice([{ workspace_id: "a" }], null)).toBe(false);
    expect(needsBusinessChoice([], null)).toBe(false);
  });
});
