// Server-only: tenant guards shared by every integration and background job.
//
// "Platform connectors" are integrations whose credentials belong to the platform operator
// (Lovable Gmail + WhatsApp connectors, the tuktuk24lisbon.com website API). They must only ever
// act for the operator's own workspace (workspaces.platform_connectors = true, set by migration
// 0019 and never writable from a browser). Without this check, any newly registered business could
// read the operator's mailbox, import its website bookings or message guests from its WhatsApp number.
import { planLimitError } from "./plans";

export class TenantGuardError extends Error {
  constructor(message: string, public readonly code: "platform_connector" | "suspended" | "plan_limit") {
    super(message);
  }
}

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/** Throws unless the workspace is allowed to use operator-owned integrations. */
export async function assertPlatformConnectors(workspaceId: string): Promise<void> {
  if (!workspaceId) throw new TenantGuardError("This integration isn't available for this workspace.", "platform_connector");
  const { data, error } = await (await db())
    .from("workspaces")
    .select("platform_connectors, suspended_at")
    .eq("id", workspaceId)
    .maybeSingle();
  // Fail closed: a lookup error never grants access.
  if (error || !data) throw new TenantGuardError("This integration isn't available for this workspace.", "platform_connector");
  const row = data as { platform_connectors?: boolean; suspended_at?: string | null };
  if (row.suspended_at) throw new TenantGuardError("This workspace is suspended.", "suspended");
  if (row.platform_connectors !== true) {
    throw new TenantGuardError("This integration isn't available for this workspace. Connect your own account instead.", "platform_connector");
  }
}

/** True when the workspace may use operator-owned integrations (never throws; false on error). */
export async function hasPlatformConnectors(workspaceId: string): Promise<boolean> {
  try {
    await assertPlatformConnectors(workspaceId);
    return true;
  } catch {
    return false;
  }
}

/** Workspaces background jobs should process (suspended ones are skipped). */
export async function activeWorkspaces(): Promise<{ id: string; platform_connectors: boolean }[]> {
  const { data, error } = await (await db()).from("workspaces").select("id, platform_connectors, suspended_at");
  if (error) throw error;
  return ((data ?? []) as { id: string; platform_connectors: boolean; suspended_at: string | null }[])
    .filter((w) => !w.suspended_at)
    .map((w) => ({ id: w.id, platform_connectors: w.platform_connectors === true }));
}

/**
 * Atomically counts one metered action against the workspace's plan. Throws a
 * TenantGuardError("plan_limit") when the monthly allowance is used up.
 */
export async function consumeUsage(workspaceId: string, metric: string, amount = 1): Promise<{ used: number; limit: number | null }> {
  const { data, error } = await (await db()).rpc("consume_usage" as never, { _ws: workspaceId, _metric: metric, _amount: amount } as never);
  if (error) throw new Error(`Usage metering failed: ${error.message}`);
  const r = data as unknown as { ok: boolean; used: number; limit: number | null };
  if (!r?.ok) throw new TenantGuardError(planLimitError(metric, r?.limit ?? 0), "plan_limit");
  return { used: r.used, limit: r.limit };
}
