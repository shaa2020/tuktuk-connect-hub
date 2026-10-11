import { describe, expect, it } from "vitest";
import { shouldImportEmail, type EmailMeta } from "./email-filter";

const base: EmailMeta = { from: "anna@gmail.com", subject: "", body: "", headers: {}, labels: ["INBOX"] };

describe("email filter", () => {
  it("imports a guest booking inquiry", () => {
    expect(shouldImportEmail({ ...base, subject: "Tour tomorrow", body: "Hi, 4 people, how much?" })).toBe(true);
  });
  it("skips newsletters with List-Unsubscribe", () => {
    expect(shouldImportEmail({ ...base, subject: "Lisbon tour deals", headers: { "list-unsubscribe": "<mailto:x>" } })).toBe(false);
  });
  it("skips no-reply senders", () => {
    expect(shouldImportEmail({ ...base, from: "no-reply@booking.com", subject: "Your booking" })).toBe(false);
  });
  it("skips Gmail promotions/updates categories", () => {
    expect(shouldImportEmail({ ...base, subject: "Tour", labels: ["CATEGORY_UPDATES"] })).toBe(false);
  });
  it("skips unrelated personal email from unknown sender", () => {
    expect(shouldImportEmail({ ...base, subject: "Hello", body: "Let's catch up soon" })).toBe(false);
  });
  it("keeps replies and known contacts", () => {
    expect(shouldImportEmail({ ...base, subject: "Re: Test", body: "Ok done" })).toBe(true);
    expect(shouldImportEmail({ ...base, subject: "Hello", body: "thanks" }, true)).toBe(true);
  });
});
