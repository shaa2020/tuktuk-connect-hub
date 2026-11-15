// Browser-safe plan helpers. The database is the enforcer (migration 0020: assert_entitlement,
// consume_usage, enforce_plan_limits); this module only formats limits and errors for people.

export const PLAN_KEYS = ["free", "starter", "professional", "business", "enterprise", "internal"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const LIMIT_LABEL: Record<string, string> = {
  members: "Team members",
  channel_accounts: "Connected messaging accounts",
  social_accounts: "Connected social accounts",
  monthly_conversations: "Conversations this month",
  monthly_ai_requests: "AI requests this month",
  monthly_bookings: "Bookings this month",
  scheduled_posts: "Scheduled posts",
  monthly_automation_runs: "Automation runs this month",
  storage_mb: "Storage (MB)",
};

/** Soft limits are shown as warnings only — customer messages are never dropped. */
export const SOFT_LIMITS = new Set(["monthly_conversations"]);

export type UsageRow = { used: number; limit: number | null };

/** 0..1 share of the allowance used; null when unlimited. */
export function usageRatio(u: UsageRow): number | null {
  if (u.limit === null || u.limit === undefined) return null;
  if (u.limit <= 0) return 1;
  return Math.min(1, Math.max(0, u.used / u.limit));
}

export type UsageLevel = "ok" | "warning" | "full" | "over" | "unlimited";
export function usageLevel(u: UsageRow): UsageLevel {
  if (u.limit === null || u.limit === undefined) return "unlimited";
  if (u.used > u.limit) return "over";
  if (u.used >= u.limit) return "full";
  return u.used / Math.max(1, u.limit) >= 0.8 ? "warning" : "ok";
}

export function formatLimit(limit: number | null): string {
  return limit === null || limit === undefined ? "Unlimited" : limit.toLocaleString("en");
}

export function planLimitError(metric: string, limit: number): string {
  const label = LIMIT_LABEL[metric] ?? metric;
  return `Plan limit reached: ${label} (${formatLimit(limit)}). Ask your workspace admin to upgrade the plan.`;
}

/**
 * Turns a database PLAN_LIMIT error ("PLAN_LIMIT:members: your plan allows 2 …") into a friendly
 * sentence; returns null for any other error so callers can show the original message.
 */
export function parsePlanLimitError(message: string | null | undefined): { metric: string; text: string } | null {
  const m = /PLAN_LIMIT:([a-z_]+):\s*your plan allows (\d+)/.exec(message ?? "");
  if (!m) return null;
  const metric = m[1] ?? "";
  return { metric, text: planLimitError(metric, Number(m[2])) };
}

/** Friendly message for any Supabase/server error, mapping plan limits specially. */
export function friendlyError(message: string | null | undefined): string {
  return parsePlanLimitError(message)?.text ?? (message || "Something went wrong. Please try again.");
}
