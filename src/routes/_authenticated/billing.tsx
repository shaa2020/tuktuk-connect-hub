import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { billingConfig, openBillingPortal, startCheckout } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { canViewAudit } from "@/lib/domain";
import { formatLimit, LIMIT_LABEL, SOFT_LIMITS, usageLevel, usageRatio, type UsageRow } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Plan & usage" }, { name: "description", content: "Your plan, limits and usage this month." }] }),
  component: BillingPage,
});

type Summary = { plan: string; usage: Record<string, UsageRow> };
type Plan = { key: string; name: string; sort: number; monthly_price_cents: number | null; annual_price_cents: number | null; currency: string; limits: Record<string, number | null>; stripe_price_monthly: string | null; stripe_price_annual: string | null };

const LEVEL_TONE = { ok: "bg-primary", warning: "bg-warning", full: "bg-destructive", over: "bg-destructive", unlimited: "bg-teal" } as const;

function BillingPage() {
  const ws = useWorkspace();
  const allowed = canViewAudit(ws.role);
  const summary = useQuery({
    queryKey: ["usage-summary", ws.workspaceId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("workspace_usage_summary", { _ws: ws.workspaceId });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
  const plans = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plans").select("key, name, sort, monthly_price_cents, annual_price_cents, currency, limits, stripe_price_monthly, stripe_price_annual").eq("public", true).order("sort");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const isAdmin = ws.role === "admin";
  const [interval, setBillingInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const cfgFn = useServerFn(billingConfig);
  const checkoutFn = useServerFn(startCheckout);
  const portalFn = useServerFn(openBillingPortal);
  const cfg = useQuery({ queryKey: ["billing-config"], queryFn: () => cfgFn(), enabled: allowed });
  const sub = useQuery({
    queryKey: ["subscription", ws.workspaceId],
    enabled: isAdmin,
    queryFn: async () => (await supabase.from("workspace_subscriptions").select("status, plan_key, billing_interval, current_period_end, cancel_at, grace_until").eq("workspace_id", ws.workspaceId).maybeSingle()).data,
  });
  async function go(fn: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>, id: string) {
    setBusy(id);
    try { const r = await fn(); if (!r.ok) return toast.error(r.error); window.location.assign(r.url); } finally { setBusy(null); }
  }

  if (!allowed) {
    return <PageContainer><Panel><EmptyState icon={<Gauge />} title="Admins and managers only" description="Ask your workspace admin about the plan." /></Panel></PageContainer>;
  }

  const current = plans.data?.find((p) => p.key === summary.data?.plan);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Plan & usage" description="What your plan includes and how much you've used this month (resets on the 1st, UTC)." />
      {summary.isLoading ? <Panel><ListSkeleton /></Panel> : summary.error ? <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} /> : summary.data && (
        <Panel className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Current plan</h2>
            <Badge>{current?.name ?? summary.data.plan}</Badge>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {Object.entries(summary.data.usage).map(([key, u]) => {
              const level = usageLevel(u);
              const ratio = usageRatio(u);
              return (
                <li key={key} className="rounded-xl border p-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{LIMIT_LABEL[key] ?? key}</span>
                    <span className="tabular-nums text-muted-foreground">{u.used.toLocaleString("en")} / {formatLimit(u.limit)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={LIMIT_LABEL[key] ?? key} aria-valuemin={0} aria-valuemax={u.limit ?? undefined} aria-valuenow={u.used}>
                    <div className={cn("h-full rounded-full", LEVEL_TONE[level])} style={{ width: `${Math.round((ratio ?? 0.04) * 100)}%` }} />
                  </div>
                  {(level === "full" || level === "over") && (
                    <p className="mt-1.5 text-xs text-destructive">
                      {SOFT_LIMITS.has(key) ? "Over the plan allowance — messages are still received; please upgrade." : "Limit reached — upgrade to add more."}
                    </p>
                  )}
                  {level === "warning" && <p className="mt-1.5 text-xs text-warning">Almost at your limit.</p>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {sub.data && (
        <Panel className="mt-4 flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold">Subscription: {sub.data.status.replace("_", " ")}</div>
            <div className="text-xs text-muted-foreground">
              {sub.data.billing_interval === "year" ? "Annual" : "Monthly"} billing
              {sub.data.current_period_end ? ` · renews ${new Date(sub.data.current_period_end).toLocaleDateString()}` : ""}
              {sub.data.cancel_at ? ` · ends ${new Date(sub.data.cancel_at).toLocaleDateString()}` : ""}
            </div>
            {sub.data.status === "past_due" && <div className="mt-1 text-xs text-destructive">Payment failed — please update your card. Your plan stays active while we retry.</div>}
          </div>
          {cfg.data?.online && <Button size="sm" variant="outline" disabled={busy === "portal"} onClick={() => go(() => portalFn({ data: { workspaceId: ws.workspaceId } }), "portal")}>Manage billing & invoices</Button>}
        </Panel>
      )}

      <div className="mb-3 mt-8 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Plans</h2>
        {cfg.data?.online && (
          <div className="inline-flex rounded-lg border bg-card p-1 text-xs" role="tablist" aria-label="Billing period">
            {(["month", "year"] as const).map((i) => (
              <button key={i} role="tab" aria-selected={interval === i} onClick={() => setBillingInterval(i)} className={cn("rounded-md px-2.5 py-1 font-medium", interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{i === "month" ? "Monthly" : "Annual"}</button>
            ))}
          </div>
        )}
      </div>
      {plans.isLoading ? <Panel><ListSkeleton /></Panel> : plans.error ? <ErrorState message={(plans.error as Error).message} onRetry={() => plans.refetch()} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(plans.data ?? []).map((p) => (
            <Panel key={p.key} className={cn("p-4", p.key === summary.data?.plan && "ring-2 ring-primary")}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                {p.key === summary.data?.plan && <Badge variant="outline">Current</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {p.monthly_price_cents === null ? (p.key === "free" ? "Free" : p.key === "enterprise" ? "Custom pricing" : "Price coming soon") : `${(p.monthly_price_cents / 100).toFixed(0)} ${p.currency} / month`}
              </p>
              {isAdmin && cfg.data?.online && p.key !== summary.data?.plan && (interval === "year" ? p.stripe_price_annual : p.stripe_price_monthly) && !(sub.data && ["active", "trialing", "past_due"].includes(sub.data.status)) && (
                <Button size="sm" className="mt-3 w-full" disabled={busy === p.key} onClick={() => go(() => checkoutFn({ data: { workspaceId: ws.workspaceId, plan: p.key, interval } }), p.key)}>Choose {p.name}</Button>
              )}
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {["members", "channel_accounts", "monthly_ai_requests", "monthly_bookings"].map((k) => (
                  <li key={k}>{LIMIT_LABEL[k]}: <span className="font-medium text-foreground">{formatLimit(p.limits?.[k] ?? null)}</span></li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {cfg.data?.online ? "Payments are handled securely by Stripe; card details never touch our servers." : "Online checkout isn't switched on yet. To change plan, contact the platform team"} — your data is never deleted when a plan changes.
      </p>
    </PageContainer>
  );
}
