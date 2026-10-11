import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { listPlatformWorkspaces, setWorkspacePlan } from "@/lib/platform.functions";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { NativeSelect, fmtDateTime } from "@/components/kit";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/platform")({
  head: () => ({ meta: [{ title: "Platform — TeamInbox" }, { name: "description", content: "Platform owner console." }] }),
  component: PlatformPage,
});

const PLANS = ["internal", "free", "pro", "business"] as const;

function PlatformPage() {
  const qc = useQueryClient();
  const fetchWorkspaces = useServerFn(listPlatformWorkspaces);
  const setPlan = useServerFn(setWorkspacePlan);
  const q = useQuery({ queryKey: ["platform", "workspaces"], queryFn: () => fetchWorkspaces(), retry: false });

  async function changePlan(workspaceId: string, plan: string) {
    try {
      await setPlan({ data: { workspaceId, plan: plan as (typeof PLANS)[number] } });
      toast.success("Plan updated");
      qc.invalidateQueries({ queryKey: ["platform"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const forbidden = q.error && (q.error as Error).message.includes("Platform admins only");

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Platform console" description="All businesses on this platform. Only visible to the platform owner." />
      {q.isLoading ? <Panel><ListSkeleton /></Panel> :
        forbidden ? <Panel><EmptyState icon={<ShieldCheck />} title="Owner only" description="This page is only available to the platform owner." /></Panel> :
        q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> :
        !q.data?.length ? <Panel><EmptyState icon={<ShieldCheck />} title="No businesses yet" /></Panel> : (
          <Panel>
            <ul className="divide-y">
              {q.data.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{w.name}</span>
                      <Badge variant="outline" className="text-[10px]">{w.plan}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {w.members} member{w.members === 1 ? "" : "s"} · {w.conversations} conversations · {w.connected_channels} connected channels · joined {fmtDateTime(w.created_at)}
                    </div>
                  </div>
                  <NativeSelect value={w.plan} onChange={(e) => changePlan(w.id, e.target.value)} aria-label="Plan" className="w-32">
                    {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </NativeSelect>
                </li>
              ))}
            </ul>
          </Panel>
        )}
    </PageContainer>
  );
}
