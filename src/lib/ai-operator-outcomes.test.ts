import { describe, it, expect } from "vitest";
import { outcomeOf, reasonOf } from "./ai-operator-outcomes";

describe("outcomeOf", () => {
  it("counts replies as successes", () =>
    expect(outcomeOf("reply", "Replied to Ana: Hi")).toBe("reply"));
  it("counts handoffs as handovers", () =>
    expect(outcomeOf("handoff", "Handed Ana to the team: refund")).toBe("handover"));
  it("counts unreadable answers as parsing failures", () => {
    expect(outcomeOf("parse_fail", "x")).toBe("parse_fail");
    expect(
      outcomeOf("handoff", "Handed X to the team: The AI could not understand this conversation."),
    ).toBe("parse_fail");
  });
  it("ignores other actions", () => expect(outcomeOf("assign", "Updated chat")).toBeNull());
  it("extracts the handover reason", () =>
    expect(reasonOf("handover", "Handed Ana to the team: Wants a refund.")).toBe("Wants a refund"));
});
