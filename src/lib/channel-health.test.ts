import { describe, expect, it } from "vitest";
import { channelHealth } from "./channel-health";

describe("channel health", () => {
  it("shows each channel once, hides placeholders, flags errors first", () => {
    const r = channelHealth([
      { channel: "whatsapp", status: "not_connected" },
      { channel: "whatsapp", status: "connected" },
      { channel: "instagram", status: "not_connected" },
      { channel: "instagram", status: "error", last_error: "token expired" },
      { channel: "telegram", status: "connected" },
      { channel: "telegram", status: "connected" },
      { channel: "email", status: "connected", last_error: "Gmail [401]" },
    ]);
    expect(r.map((x) => x.channel)).toEqual(["email", "instagram", "telegram", "whatsapp"]);
    expect(r.find((x) => x.channel === "telegram")?.label).toBe("2 connected");
    expect(r.find((x) => x.channel === "instagram")).toMatchObject({
      tone: "danger",
      label: "1 needs attention",
    });
    expect(channelHealth([{ channel: "messenger", status: "not_connected" }])).toEqual([]);
  });
});
