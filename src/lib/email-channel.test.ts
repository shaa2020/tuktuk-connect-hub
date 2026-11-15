import { describe, expect, it } from "vitest";
import { parseFrom, extractBody } from "./email-channel.server";

describe("email parsing", () => {
  it("reads sender name and lowercased address", () => {
    expect(parseFrom('"Ana Silva" <Ana@Example.com>')).toEqual({
      name: "Ana Silva",
      email: "ana@example.com",
    });
  });
  it("drops quoted reply history", () => {
    const data = btoa("Is 10am free?\n\nOn Mon, 1 Jan 2026 Tuk Tuk wrote:\n> old")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(extractBody({ payload: { mimeType: "text/plain", body: { data } } })).toBe(
      "Is 10am free?",
    );
  });
});
