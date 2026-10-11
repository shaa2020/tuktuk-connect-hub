import { describe, expect, it } from "vitest";
import { parseFetch } from "./imap-mail.server";

describe("parseFetch", () => {
  it("extracts each message literal with its UID", () => {
    const a = "Subject: Hi\r\n\r\nHello";
    const b = "Subject: Tour\r\n\r\n2 guests";
    const out = `* 1 FETCH (UID 41 BODY[] {${a.length}}\r\n${a})\r\n* 2 FETCH (UID 42 BODY[] {${b.length}}\r\n${b})\r\nA4 OK done\r\n`;
    expect(parseFetch(out)).toEqual([{ uid: "41", raw: a }, { uid: "42", raw: b }]);
  });
});
