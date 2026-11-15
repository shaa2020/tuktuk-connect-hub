import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake service-role client: each test decides what the workspaces lookup returns.
let lookup: { data: unknown; error: unknown } = { data: null, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const fetchSpy = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => lookup };
  return { supabaseAdmin: { from: () => chain, rpc: async () => rpcResult } };
});

beforeEach(() => {
  lookup = { data: null, error: null };
  rpcResult = { data: null, error: null };
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  process.env.LOVABLE_API_KEY = "test";
  process.env.WHATSAPP_API_KEY = "test";
  process.env.WEBSITE_API_KEY = "test";
});

const WS = "11111111-1111-1111-1111-111111111111";

describe("assertPlatformConnectors", () => {
  it("allows the operator workspace", async () => {
    lookup = { data: { platform_connectors: true, suspended_at: null }, error: null };
    const { assertPlatformConnectors } = await import("./tenancy.server");
    await expect(assertPlatformConnectors(WS)).resolves.toBeUndefined();
  });
  it("refuses other businesses", async () => {
    lookup = { data: { platform_connectors: false, suspended_at: null }, error: null };
    const { assertPlatformConnectors } = await import("./tenancy.server");
    await expect(assertPlatformConnectors(WS)).rejects.toThrow(/isn't available/);
  });
  it("fails closed when the lookup errors or finds nothing", async () => {
    const { assertPlatformConnectors } = await import("./tenancy.server");
    lookup = { data: null, error: { message: "db down" } };
    await expect(assertPlatformConnectors(WS)).rejects.toThrow();
    lookup = { data: null, error: null };
    await expect(assertPlatformConnectors(WS)).rejects.toThrow();
    await expect(assertPlatformConnectors("")).rejects.toThrow();
  });
  it("refuses suspended workspaces even if they are the operator", async () => {
    lookup = { data: { platform_connectors: true, suspended_at: "2026-01-01" }, error: null };
    const { assertPlatformConnectors } = await import("./tenancy.server");
    await expect(assertPlatformConnectors(WS)).rejects.toThrow(/suspended/);
  });
});

describe("operator-owned integrations never act for another tenant", () => {
  beforeEach(() => {
    lookup = { data: { platform_connectors: false, suspended_at: null }, error: null };
  });
  it("WhatsApp connector send is refused before any network call", async () => {
    const { sendWhatsAppConnector } = await import("./channels.server");
    await expect(sendWhatsAppConnector(WS, "351900000000", "hi")).rejects.toThrow(
      /isn't available/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("website API is refused before any network call", async () => {
    const { websiteGet } = await import("./website-api.server");
    await expect(websiteGet(WS, "/booking-requests")).rejects.toThrow(/isn't available/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("Gmail connector sync is refused before any network call", async () => {
    const { syncEmail } = await import("./email-channel.server");
    await expect(syncEmail(WS, "x@example.com")).rejects.toThrow(/isn't available/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("WhatsApp templates are refused before any network call", async () => {
    const { listTemplates } = await import("./wa-templates.server");
    await expect(listTemplates(WS)).rejects.toThrow(/isn't available/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("consumeUsage", () => {
  it("returns usage when under the limit", async () => {
    rpcResult = { data: { ok: true, used: 3, limit: 50 }, error: null };
    const { consumeUsage } = await import("./tenancy.server");
    await expect(consumeUsage(WS, "monthly_ai_requests")).resolves.toEqual({ used: 3, limit: 50 });
  });
  it("throws a plan-limit error when the allowance is used up", async () => {
    rpcResult = { data: { ok: false, used: 50, limit: 50 }, error: null };
    const { consumeUsage, TenantGuardError } = await import("./tenancy.server");
    const err = await consumeUsage(WS, "monthly_ai_requests").catch((e) => e);
    expect(err).toBeInstanceOf(TenantGuardError);
    expect(err.message).toMatch(/AI requests this month \(50\)/);
  });
  it("fails closed when metering itself fails", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    const { consumeUsage } = await import("./tenancy.server");
    await expect(consumeUsage(WS, "monthly_ai_requests")).rejects.toThrow(/metering failed/);
  });
});
