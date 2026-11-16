import { describe, expect, it } from "vitest";
import { isBotToken, parseUpdate } from "./telegram";

describe("telegram", () => {
  it("validates bot tokens", () => {
    expect(isBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(isBotToken("not-a-token")).toBe(false);
  });
  it("imports private text messages", () => {
    const r = parseUpdate({
      message: {
        message_id: 7,
        date: 1700000000,
        chat: { id: 42, type: "private" },
        from: { first_name: "Ana", last_name: "Silva" },
        text: "Olá",
      },
    });
    expect(r).toMatchObject({ chatId: "42", name: "Ana Silva", text: "Olá", messageId: "tg:42:7" });
  });
  it("describes media honestly and ignores groups and bots", () => {
    expect(
      parseUpdate({
        message: {
          message_id: 1,
          chat: { id: 1, type: "private" },
          from: { first_name: "A" },
          photo: [{}],
          caption: "look",
        },
      })?.text,
    ).toBe("[photo received: look — open Telegram to view]");
    expect(
      parseUpdate({
        message: {
          message_id: 1,
          chat: { id: 1, type: "group" },
          from: { first_name: "A" },
          text: "x",
        },
      }),
    ).toBeNull();
    expect(
      parseUpdate({
        message: {
          message_id: 1,
          chat: { id: 1, type: "private" },
          from: { is_bot: true },
          text: "x",
        },
      }),
    ).toBeNull();
    expect(parseUpdate({ callback_query: {} })).toBeNull();
  });
});

describe("telegram media", () => {
  it("extracts the largest photo, voice notes and documents", async () => {
    const { parseUpdate } = await import("./telegram");
    const photo = parseUpdate({
      message: {
        message_id: 5,
        chat: { id: 1, type: "private" },
        from: { first_name: "A" },
        photo: [{ file_id: "small" }, { file_id: "big" }],
      },
    });
    expect(photo?.media).toEqual({ fileId: "big", mime: "image/jpeg", name: "photo-5.jpg" });
    const voice = parseUpdate({
      message: {
        message_id: 6,
        chat: { id: 1, type: "private" },
        from: { first_name: "A" },
        voice: { file_id: "v1", mime_type: "audio/ogg" },
      },
    });
    expect(voice?.media?.mime).toBe("audio/ogg");
    const text = parseUpdate({
      message: {
        message_id: 7,
        chat: { id: 1, type: "private" },
        from: { first_name: "A" },
        text: "hi",
      },
    });
    expect(text?.media).toBeUndefined();
  });
});
