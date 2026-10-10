import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/components/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Your notifications." }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { userId } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["count"] }); };
  async function readAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    refresh();
  }
  async function open(n: { id: string; link: string | null; read_at: string | null }) {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    refresh();
    if (n.link?.startsWith("/inbox?c=")) navigate({ to: "/inbox", search: { c: n.link.split("=")[1] } });
  }
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Notifications" description="Assignments and escalations." actions={<Button variant="outline" size="sm" onClick={readAll}><CheckCheck /> Mark all read</Button>} />
      <Panel>
        {q.isLoading ? <ListSkeleton /> : q.error ? <div className="p-4"><ErrorState message={(q.error as Error).message} /></div> :
          !q.data?.length ? <EmptyState icon={<Bell />} title="You're all caught up" description="You'll be notified here when a conversation is assigned to you or escalated." /> : (
            <ul className="divide-y">{q.data.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60", !n.read_at && "bg-primary-soft/50")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{n.title}</div>{n.body && <div className="truncate text-xs text-muted-foreground">{n.body}</div>}</div>
                  <span className="text-xs text-muted-foreground">{fmtRelative(n.created_at)}</span>
                </button>
              </li>
            ))}</ul>
          )}
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Push and email notifications aren't set up yet — notifications appear here while the app is open.</p>
    </PageContainer>
  );
}
