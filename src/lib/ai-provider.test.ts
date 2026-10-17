import { describe, it, expect, vi } from "vitest";
vi.mock("./ai-gateway.server", () => ({ AiError: class extends Error {}, generateText: vi.fn() }));
vi.mock("./secrets.server", () => ({ getSecret: vi.fn() }));
import { detectProvider, pickModel } from "./ai-provider.server";

describe("AI key auto-setup", () => {
  it("detects provider from key prefix", () => {
    expect(detectProvider("AIzaSyX")).toBe("gemini");
    expect(detectProvider("sk-ant-abc")).toBe("anthropic");
    expect(detectProvider("sk-or-v1")).toBe("openrouter");
    expect(detectProvider("sk-proj-1")).toBe("openai");
    expect(detectProvider("xyz")).toBeNull();
  });
  it("picks newest stable Gemini flash model", () => {
    expect(pickModel("gemini", ["models/gemini-2.5-flash", "models/gemini-3.0-flash", "models/gemini-3.0-flash-lite", "models/gemini-3.1-flash-preview", "models/gemini-2.5-pro"])).toBe("gemini-3.0-flash");
  });
});
