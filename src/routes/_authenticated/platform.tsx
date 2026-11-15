import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { NativeSelect, fmtDateTime } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformOps } from "@/components/platform-ops";

// Platform owner console. Every call is a SECURITY DEFINER RPC that re-checks platform_admins
// and writes an audit entry; it shows counts only — never conversation content or secrets.
export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({ meta: [{ title: "Platform console" }, { name: "description", content: "Platform owner console." }] }),
  component: PlatformPage,
});

type Row = {
  id: string; name: string; plan: string; industry: string | null; created_at: string; suspended_at: string | null;
  suspended_reason: string | null; owner_email: string | null; members: number; connected_channels: number;
  conversations_this_month: number; ai_requests_this_month: number; subscription_status: string | null;
};

function PlatformPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const q = useQuery({
    queryKey: ["platform", "workspaces"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_workspace_overview");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const plans = useQuery({
    queryKey: ["platform", "plans"],
    queryFn: async () => ((await supabase.from("plans").select("key, name").order("sort")).data ?? []) as { key: string; name: string }[],
  });
  const rows = useMemo(() => {
    const t = query.trim().toLowerCase();
    return (q.data ?? []).filter((w) => !t || w.name.toLowerCase().includes(t) || (w.owner_email ?? "").toLowerCase().includes(t));
  }, [q.data, query]);

  async function changePlan(id: string, plan: string) {
    const { error } = await supabase.rpc("platform_set_workspace_plan", { _ws: id, _plan: plan });
    if (error) return toast.error(error.message);
    toast.success("Plan updated");
    qc.invalidateQueries({ queryKey: ["platform"] });
  }
  async function toggleSuspend(w: Row) {
    const suspend = !w.suspended_at;
    let reason: string | null = null;
    if (suspend) {
      reason = window.prompt(`Why are you suspending "${w.name}"? Members will lose access until reactivated.`);
      if (!reason) return;
    } else if (!window.confirm(`Reactivate "${w.name}"?`)) return;
    const { error } = await supabase.rpc("platform_set_workspace_suspension", { _ws: w.id, _suspend: suspend, _reason: reason ?? undefined });
    if (error) return toast.error(error.message);
    toast.success(suspend ? "Workspace suspended" : "Workspace reactivated");
    qc.invalidateQueries({ queryKey: ["platform"] });
  }

  const forbidden = q.error && (q.error as Error).message.includes("Platform admins only");
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Platform console" description="All businesses on the platform. Counts only — customer conversations stay private. Every action is audited." />
      {q.isLoading ? <Panel><ListSkeleton /></Panel> :
        forbidden ? <Panel><EmptyState icon={<ShieldCheck />} title="Owner only" description="This page is only available to platform administrators." /></Panel> :
        q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> : (
          <>
            <PlatformOps workspaces={(q.data ?? []).map((w) => ({ id: w.id, name: w.name }))} />
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by business or owner email" className="pl-9" aria-label="Search businesses" />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{rows.length} of {q.data?.length ?? 0}</span>
            </div>
            {!rows.length ? <Panel><EmptyState icon={<ShieldCheck />} title="No businesses found" /></Panel> : (
              <Panel>
                <ul className="divide-y">
                  {rows.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-60">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">{w.name}</span>
                          {w.suspended_at && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                          {w.subscription_status && <Badge variant="outline" className="text-[10px]">{w.subscription_status}</Badge>}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {w.owner_email ?? "no owner"} · {w.industry ?? "industry not set"} · joined {fmtDateTime(w.created_at)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {w.members} member{w.members === 1 ? "" : "s"} · {w.connected_channels} channels · {w.conversations_this_month} conversations · {w.ai_requests_this_month} AI requests this month
                        </div>
                        {w.suspended_reason && <div className="mt-0.5 text-xs text-destructive">Reason: {w.suspended_reason}</div>}
                      </div>
                      <NativeSelect value={w.plan} onChange={(e) => changePlan(w.id, e.target.value)} aria-label={`Plan for ${w.name}`} className="w-40">
                        {(plans.data ?? [{ key: w.plan, name: w.plan }]).map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                      </NativeSelect>
                      <Button size="sm" variant={w.suspended_at ? "secondary" : "outline"} onClick={() => toggleSuspend(w)}>
                        {w.suspended_at ? "Reactivate" : "Suspend"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
    </PageContainer>
  );
}
