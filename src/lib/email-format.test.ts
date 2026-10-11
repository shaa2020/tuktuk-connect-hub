import { describe, it, expect } from "vitest";
import { parseEmailBody } from "./email-format";

describe("parseEmailBody", () => {
  it("separates subject, reply and wrapped Gmail quote", () => {
    const r = parseEmailBody("Subject: Re: Test\n\n\n\nOk done\n\n\n\nOn Sun, 11 Oct 2026, 12:54 am Tuk Tuk 24 Lisbon, <tuktuklisbon24@gmail.com>\n\nwrote:\n\n> Hello!\n>\n");
    expect(r.subject).toBe("Re: Test");
    expect(r.main).toBe("Ok done");
    expect(r.quoted).toContain("> Hello!");
  });
  it("leaves plain messages untouched", () => {
    expect(parseEmailBody("Hi there")).toEqual({ subject: null, main: "Hi there", quoted: null });
  });
});
