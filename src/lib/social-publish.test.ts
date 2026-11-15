import { describe, expect, it } from "vitest";
import { facebookRequest, finalStatus, instagramContainer, planPublish, type Connection } from "./social-publish";

const conns: Connection[] = [
  { id: "c1", channel: "messenger", account_id: "PAGE1", status: "connected", label: "Main page" },
  { id: "c2", channel: "instagram", account_id: "IG1", status: "connected", label: null },
  { id: "c3", channel: "messenger", account_id: "PAGE2", status: "disconnected", label: null },
];

describe("social publishing plan", () => {
  it("publishes to every connected account of each target network", () => {
    const p = planPublish({ targets: [{ network: "facebook" }, { network: "instagram" }], media_urls: ["https://x.test/a.jpg"] }, conns);
    expect(p.jobs.map((j) => j.accountId)).toEqual(["PAGE1", "IG1"]);
    expect(p.skipped).toEqual([]);
  });
  it("explains unsupported or impossible targets instead of pretending", () => {
    const p = planPublish({ targets: [{ network: "tiktok" }, { network: "instagram" }], media_urls: [] }, conns);
    expect(p.jobs).toEqual([]);
    expect(p.skipped.map((s) => s.network)).toEqual(["tiktok", "instagram"]);
    expect(planPublish({ targets: [{ network: "facebook" }], media_urls: [] }, []).skipped[0]?.reason).toMatch(/No connected Facebook Page/);
  });
  it("builds the right Graph API calls", () => {
    expect(facebookRequest("P", { title: "t", body: "hi", media_urls: [] })).toEqual({ path: "/P/feed", params: { message: "hi" } });
    expect(facebookRequest("P", { title: "t", body: "", media_urls: ["https://x/a.png"] }).path).toBe("/P/photos");
    expect(facebookRequest("P", { title: "t", body: "", media_urls: ["https://x/a.mp4"] }).path).toBe("/P/videos");
    expect(instagramContainer("I", { title: "t", body: "c", media_urls: ["https://x/v.mp4"] }).params).toMatchObject({ media_type: "REELS" });
  });
  it("derives a truthful final status", () => {
    expect(finalStatus([{ network: "facebook", ok: true }], 1).status).toBe("published");
    expect(finalStatus([{ network: "facebook", ok: true }, { network: "instagram", ok: false, error: "x" }], 1).status).toBe("partially_published");
    expect(finalStatus([{ network: "facebook", ok: false, error: "timeout" }], 1).status).toBe("scheduled");
    expect(finalStatus([{ network: "facebook", ok: false, error: "timeout" }], 3).status).toBe("failed");
    expect(finalStatus([{ network: "tiktok", ok: false, error: "TikTok publishing needs approval" }], 1).status).toBe("failed");
  });
});
