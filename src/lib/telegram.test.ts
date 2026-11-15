import { describe, expect, it } from "vitest";
import { isBotToken, parseUpdate } from "./telegram";

describe("telegram", () => {
  it("validates bot tokens", () => {
    expect(isBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(isBotToken("not-a-token")).toBe(false);
  });
  it("imports private text messages", () => {
    const r = parseUpdate({ message: { message_id: 7, date: 1700000000, chat: { id: 42, type: "private" }, from: { first_name: "Ana", last_name: "Silva" }, text: "Olá" } });
    expect(r).toMatchObject({ chatId: "42", name: "Ana Silva", text: "Olá", messageId: "tg:42:7" });
  });
  it("describes media honestly and ignores groups and bots", () => {
    expect(parseUpdate({ message: { message_id: 1, chat: { id: 1, type: "private" }, from: { first_name: "A" }, photo: [{}], caption: "look" } })?.text).toBe("[photo received: look — open Telegram to view]");
    expect(parseUpdate({ message: { message_id: 1, chat: { id: 1, type: "group" }, from: { first_name: "A" }, text: "x" } })).toBeNull();
    expect(parseUpdate({ message: { message_id: 1, chat: { id: 1, type: "private" }, from: { is_bot: true }, text: "x" } })).toBeNull();
    expect(parseUpdate({ callback_query: {} })).toBeNull();
  });
});
