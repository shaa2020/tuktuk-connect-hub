import { describe, expect, it } from "vitest";
import { parseDecision, replyAllowed, vehiclesFor } from "./ai-operator";

describe("AI Operator decisions", () => {
  it("malformed AI output hands the chat to a human instead of replying", () => {
    expect(parseDecision("sorry, no json").action).toBe("handoff");
  });
  it("a reply action with no text becomes a hand-off", () => {
    expect(parseDecision('{"action":"reply","reply":""}').action).toBe("handoff");
  });
  it("only creates a booking when the guest confirmed a real date and group size", () => {
    expect(parseDecision('{"action":"reply","reply":"ok","booking":{"ready":false,"date":"2026-10-20","guests":4}}').booking).toBeNull();
    expect(parseDecision('{"action":"reply","reply":"ok","booking":{"ready":true,"date":"tomorrow","guests":4}}').booking).toBeNull();
    expect(parseDecision('{"action":"reply","reply":"ok","booking":{"ready":true,"date":"2026-10-20","time":"15:00","guests":4}}').booking?.guests).toBe(4);
  });
  it("stops replying after the per-conversation limit", () => {
    expect(replyAllowed(5, 6)).toBe(true);
    expect(replyAllowed(6, 6)).toBe(false);
  });
  it("one tuk-tuk per 6 guests", () => {
    expect(vehiclesFor(6)).toBe(1);
    expect(vehiclesFor(7)).toBe(2);
  });
});
