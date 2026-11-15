import { describe, expect, it } from "vitest";
import { isSafeOutboundUrl, unsafeUrlReason } from "./url-safety";

describe("outbound URL safety (SSRF)", () => {
  it.each([
    "https://api.openai.com/v1",
    "https://openrouter.ai/api/v1",
    "https://my-llm.example.com:443/v1",
  ])("allows public https provider %s", (u) => expect(isSafeOutboundUrl(u)).toBe(true));

  it.each([
    ["http://api.example.com", /https/],
    ["https://user:pw@api.example.com", /username/],
    ["https://api.example.com:8443", /port/],
    ["https://localhost/v1", /Internal/],
    ["https://metadata.google.internal", /Internal/],
    ["https://printer.local", /Internal/],
    ["https://169.254.169.254/latest", /IP addresses/],
    ["https://10.0.0.5", /IP addresses/],
    ["https://8.8.8.8", /IP addresses/],
    ["https://[::1]/", /IP addresses/],
    ["https://intranet/", /full domain/],
    ["not a url", /valid/],
  ])("blocks %s", (u, why) => expect(unsafeUrlReason(u)).toMatch(why));
});
