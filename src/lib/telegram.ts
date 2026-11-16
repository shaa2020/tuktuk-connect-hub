// Pure helpers for the Telegram Bot API channel (tested).

export type TgInbound = { chatId: string; name: string; text: string; messageId: string; at: Date };

/** Telegram bot tokens look like 123456789:AA... (digits, colon, 30+ url-safe chars). */
export function isBotToken(t: string) {
  return /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(t.trim());
}

/** Normalises a Telegram webhook update. Only private chats with a person are imported. */
export function parseUpdate(u: any): TgInbound | null {
  const m = u?.message ?? u?.edited_message;
  if (!m || m.chat?.type !== "private" || m.from?.is_bot) return null;
  const name =
    [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") ||
    m.from?.username ||
    `Telegram ${m.chat.id}`;
  const kind = m.photo
    ? "photo"
    : m.voice
      ? "voice message"
      : m.video
        ? "video"
        : m.document
          ? "file"
          : m.sticker
            ? "sticker"
            : m.location
              ? "location"
              : null;
  const text =
    m.text ??
    (kind
      ? `[${kind} received${m.caption ? `: ${m.caption}` : ""} — open Telegram to view]`
      : (m.caption ?? ""));
  if (!text) return null;
  return {
    chatId: String(m.chat.id),
    name: String(name).slice(0, 200),
    text: String(text).slice(0, 10000),
    messageId: `tg:${m.chat.id}:${m.message_id}${u.edited_message ? ":e" : ""}`,
    at: new Date((m.date ?? Date.now() / 1000) * 1000),
  };
}

export const telegramWebhookPath = (connectionId: string) =>
  `/api/public/webhooks/telegram/${connectionId}`;
