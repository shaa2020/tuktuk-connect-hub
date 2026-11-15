import { describe, expect, it } from "vitest";
import { allowedOrigin, embedSnippet, newWidgetKey, normaliseOrigins, VisitorMessage, WIDGET_KEY } from "./webchat";

describe("webchat", () => {
  it("generates valid widget keys", () => { expect(WIDGET_KEY.test(newWidgetKey())).toBe(true); });
  it("validates visitor messages", () => {
    const v = "v_" + crypto.randomUUID();
    expect(VisitorMessage.safeParse({ visitor: v, text: "Hi" }).success).toBe(true);
    expect(VisitorMessage.safeParse({ visitor: "guess", text: "Hi" }).success).toBe(false);
    expect(VisitorMessage.safeParse({ visitor: v, text: "" }).success).toBe(false);
    expect(VisitorMessage.safeParse({ visitor: v, text: "x".repeat(2001) }).success).toBe(false);
  });
  it("enforces allowed origins when configured", () => {
    expect(allowedOrigin("https://shop.example", undefined)).toBe("https://shop.example");
    expect(allowedOrigin("https://shop.example", ["https://shop.example/"])).toBe("https://shop.example");
    expect(allowedOrigin("https://evil.example", ["https://shop.example"])).toBeNull();
    expect(allowedOrigin(null, ["https://shop.example"])).toBeNull();
  });
  it("normalises origins and builds the snippet", () => {
    expect(normaliseOrigins("shop.example, https://www.shop.example/path ftp://x")).toEqual(["https://shop.example", "https://www.shop.example"]);
    expect(embedSnippet("https://app.test/", "wk_x")).toBe('<script src="https://app.test/chat-widget.js" data-key="wk_x" async></script>');
  });
});
