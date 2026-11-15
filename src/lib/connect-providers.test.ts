import { describe, expect, it } from "vitest";
import { providerState } from "./connect-providers";

describe("providerState", () => {
  it("never shows unbuilt providers as available", () => {
    expect(providerState("outlook", [{ channel: "outlook", status: "connected" }]).kind).toBe("soon");
    expect(providerState("telegram", [{ channel: "telegram", status: "connected" }]).kind).toBe("connected");
  });
  it("offers another account once one is connected", () => {
    expect(providerState("email", [{ channel: "email", status: "connected" }]).action).toBe("Connect another account");
  });
  it("counts multiple connected accounts", () => {
    expect(providerState("whatsapp", [{ channel: "whatsapp", status: "connected" }, { channel: "whatsapp", status: "connected" }]).badge).toBe("2 connected");
  });
  it("asks to reconnect when only errored rows exist", () => {
    expect(providerState("instagram", [{ channel: "instagram", status: "error" }]).kind).toBe("attention");
  });
  it("placeholder rows are not connected", () => {
    expect(providerState("messenger", [{ channel: "messenger", status: "not_connected" }]).kind).toBe("none");
  });
});
