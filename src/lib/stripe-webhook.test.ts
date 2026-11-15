import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the service-role client, enough for handleEvent.
type Row = Record<string, any>;
let tables: Record<string, Row[]>;
const T = (name: string): Row[] => (tables[name] ??= []);
function q(table: string) {
  const filters: [string, unknown][] = [];
  let op: "select" | "update" | "delete" = "select"; let patch: Row = {};
  const rows = () => T(table).filter((r) => filters.every(([k, v]) => r[k] === v));
  const api: any = {
    select: () => api,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: async (r: Row) => {
      if (table === "billing_events" && T(table).some((x) => x.event_id === r.event_id)) return { error: { code: "23505", message: "dup" } };
      T(table).push({ ...r }); return { error: null };
    },
    upsert: async (r: Row) => { tables[table] = T(table).filter((x) => x.workspace_id !== r.workspace_id); T(table).push(r); return { error: null }; },
    update: (p: Row) => { op = "update"; patch = p; return api; },
    delete: () => { op = "delete"; return api; },
    then: (res: (v: unknown) => void) => {
      if (op === "update") rows().forEach((r) => Object.assign(r, patch));
      if (op === "delete") { const del = new Set(rows()); tables[table] = T(table).filter((r) => !del.has(r)); }
      res({ data: rows(), error: null });
    },
  };
  return api;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => q(t) } }));

beforeEach(() => {
  tables = {
    billing_events: [], workspace_subscriptions: [], audit_logs: [],
    plans: [{ key: "free", stripe_price_monthly: null, stripe_price_annual: null }, { key: "business", stripe_price_monthly: "price_B1", stripe_price_annual: null }],
    workspaces: [{ id: "ws1", plan: "free" }, { id: "op", plan: "internal" }],
  };
});

const subEvent = (id: string, status: string, ws = "ws1") => ({
  id, type: "customer.subscription.updated",
  data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { workspace_id: ws }, items: { data: [{ price: { id: "price_B1" }, current_period_end: 1_800_000_000 }] } } },
});

describe("Stripe webhook handling", () => {
  it("upgrades on an active subscription and records it", async () => {
    const { handleEvent } = await import("./stripe.server");
    expect(await handleEvent(subEvent("evt_1", "active"))).toBe("processed");
    expect(T("workspaces")[0]!.plan).toBe("business");
    expect(T("workspace_subscriptions")[0]).toMatchObject({ provider_customer_id: "cus_1", status: "active", plan_key: "business" });
    expect(T("audit_logs")[0]).toMatchObject({ action: "billing.plan_change" });
  });
  it("ignores duplicate deliveries", async () => {
    const { handleEvent } = await import("./stripe.server");
    await handleEvent(subEvent("evt_1", "active"));
    expect(await handleEvent(subEvent("evt_1", "canceled"))).toBe("duplicate");
    expect(T("workspaces")[0]!.plan).toBe("business");
  });
  it("downgrades to Free on cancellation without deleting anything", async () => {
    const { handleEvent } = await import("./stripe.server");
    await handleEvent(subEvent("evt_1", "active"));
    await handleEvent(subEvent("evt_2", "canceled"));
    expect(T("workspaces")[0]!.plan).toBe("free");
    expect(T("workspace_subscriptions")).toHaveLength(1);
  });
  it("never changes the operator's internal plan", async () => {
    const { handleEvent } = await import("./stripe.server");
    await handleEvent(subEvent("evt_3", "canceled", "op"));
    expect(T("workspaces")[1]!.plan).toBe("internal");
  });
  it("releases the dedupe claim when processing fails so Stripe can retry", async () => {
    const { handleEvent } = await import("./stripe.server");
    await expect(handleEvent(subEvent("evt_4", "active", "unknown-ws"))).rejects.toThrow(/Unknown workspace/);
    expect(T("billing_events")).toHaveLength(0);
  });
});
