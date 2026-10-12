import { describe, expect, it } from "vitest";
import { decisionFromRaw, parseDecision, replyAllowed, vehiclesFor } from "./ai-operator";

describe("AI Operator decisions", () => {
  it("malformed AI output hands the chat to a human instead of replying", () => {
    expect(parseDecision("sorry, no json").action).toBe("handoff");
  });
  it("a plain-text answer becomes the guest reply instead of a silent handover", () => {
    const d = decisionFromRaw("Thanks for your message! A team member will confirm shortly.");
    expect(d.action).toBe("reply");
    expect(d.reply).toContain("Thanks for your message");
  });
  it("broken JSON still hands over (no readable reply to send)", () => {
    expect(decisionFromRaw('{"action":"reply","reply":"cut off...').action).toBe("handoff");
  });
  it("valid JSON decisions are untouched by the fallback", () => {
    const d = decisionFromRaw('{"action":"reply","reply":"Hello!","tags":[],"urgent":false,"alert":"","booking":null}');
    expect(d.action).toBe("reply");
    expect(d.reply).toBe("Hello!");
  });
  it("a reply action with no text becomes a hand-off", () => {
    expect(parseDecision('{"action":"reply","reply":""}').action).toBe("handoff");
  });
  it("only creates a booking when the guest confirmed a real date and group size", () => {
    expect(parseDecision('{"action":"reply","reply":"ok","booking":{"ready":false,"date":"2026-10-20","guests":4}}').booking?.ready).toBe(false);
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
