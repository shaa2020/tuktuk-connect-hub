import { describe, expect, it } from "vitest";
import { setupProgress, setupSteps } from "./setup-checklist";

describe("setup checklist", () => {
  it("starts with nothing done for a brand-new workspace", () => {
    const s = setupSteps({
      connectedChannels: 0,
      teamSize: 1,
      pendingInvites: 0,
      aiEnabled: false,
      knowledgeDocs: 0,
    });
    expect(setupProgress(s)).toEqual({ done: 0, total: 4 });
  });
  it("marks steps done only from real data", () => {
    const s = setupSteps({
      connectedChannels: 1,
      teamSize: 1,
      pendingInvites: 2,
      aiEnabled: true,
      knowledgeDocs: 3,
    });
    expect(setupProgress(s)).toEqual({ done: 4, total: 4 });
    expect(s.find((x) => x.key === "team")?.done).toBe(true);
  });
});
