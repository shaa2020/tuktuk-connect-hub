import { describe, expect, it } from "vitest";
import { parseClassification } from "./classify";

describe("classification parsing", () => {
  it("reads valid JSON", () => {
    expect(
      parseClassification(
        '{"intent":"complaint","sentiment":"negative","summary":"Guide was late"}',
      ),
    ).toEqual({ intent: "complaint", sentiment: "negative", summary: "Guide was late" });
  });
  it("extracts JSON from prose and falls back safely", () => {
    expect(
      parseClassification(
        'Sure!\n```json\n{"intent":"pricing","sentiment":"positive","summary":"x"}\n```',
      ).intent,
    ).toBe("pricing");
    expect(parseClassification("garbage")).toEqual({
      intent: "other",
      sentiment: "neutral",
      summary: "",
    });
    expect(parseClassification('{"intent":"hack","sentiment":"rage"}')).toMatchObject({
      intent: "other",
      sentiment: "neutral",
    });
  });
});
