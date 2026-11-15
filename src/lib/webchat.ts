// Pure helpers for the website live-chat channel (tested).
import { z } from "zod";

/** Public widget key (not a secret: it only lets visitors start chats with this business). */
export const WIDGET_KEY = /^wk_[A-Za-z0-9]{24}$/;
/** Visitor session id, generated in the visitor's browser (122 random bits) — acts as their chat password. */
export const VISITOR_ID = /^v_[0-9a-f-]{36}$/;

export const VisitorMessage = z.object({
  visitor: z.string().regex(VISITOR_ID),
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  text: z.string().trim().min(1).max(2000),
});

export function newWidgetKey(): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return (
    "wk_" +
    Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => abc[b % abc.length]).join("")
  );
}

/** CORS: if the business listed allowed website origins, only those may embed the widget. */
export function allowedOrigin(origin: string | null, allowed: string[] | undefined): string | null {
  if (!allowed?.length) return origin ?? "*";
  if (!origin) return null;
  const o = origin.toLowerCase().replace(/\/$/, "");
  return allowed.some((a) => a.toLowerCase().replace(/\/$/, "") === o) ? origin : null;
}

export function normaliseOrigins(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        const u = new URL(s.includes("://") ? s : `https://${s}`);
        return u.origin;
      } catch {
        return "";
      }
    })
    .filter((s) => s.startsWith("https://") || s.startsWith("http://localhost"))
    .slice(0, 20);
}

export function embedSnippet(appOrigin: string, key: string) {
  return `<script src="${appOrigin.replace(/\/$/, "")}/chat-widget.js" data-key="${key}" async></script>`;
}
