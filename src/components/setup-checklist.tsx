import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel } from "@/components/states";
import { setupProgress, setupSteps } from "@/lib/setup-checklist";

/** Guided setup for new businesses; shown to admins until dismissed (onboarding_completed_at). */
export function SetupChecklist() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["setup-checklist", ws.workspaceId],
    enabled: ws.role === "admin",
    queryFn: async () => {
      const id = ws.workspaceId;
      const [w, ch, inv, ai, kb] = await Promise.all([
        supabase.from("workspaces").select("onboarding_completed_at").eq("id", id).maybeSingle(),
        supabase
          .from("channel_connections")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", id)
          .eq("status", "connected"),
        supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", id)
          .is("accepted_at", null)
          .is("revoked_at", null),
        supabase.from("ai_settings").select("enabled").eq("workspace_id", id).maybeSingle(),
        supabase
          .from("knowledge_documents")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", id),
      ]);
      return {
        completed: !!w.data?.onboarding_completed_at,
        steps: setupSteps({
          connectedChannels: ch.count ?? 0,
          teamSize: ws.members.filter((m) => m.active).length,
          pendingInvites: inv.count ?? 0,
          aiEnabled: !!ai.data?.enabled,
          knowledgeDocs: kb.count ?? 0,
        }),
      };
    },
  });
  if (ws.role !== "admin" || !q.data || q.data.completed) return null;
  const { done, total } = setupProgress(q.data.steps);

  async function dismiss() {
    const { error } = await supabase
      .from("workspaces")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", ws.workspaceId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["setup-checklist"] });
  }

  return (
    <Panel className="mb-5 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Set up {ws.workspaceName}</h2>
          <p className="text-sm text-muted-foreground">
            {done} of {total} steps done
          </p>
        </div>
        <button
          onClick={dismiss}
          className="flex size-9 items-center justify-center rounded-lg hover:bg-accent"
          aria-label="Hide setup checklist"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {q.data.steps.map((s) => (
          <li key={s.key}>
            <Link
              to={s.to}
              className="flex items-start gap-3 rounded-xl border p-3 hover:bg-accent"
            >
              {s.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
              ) : (
                <Circle
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  aria-label="To do"
                />
              )}
              <span className="min-w-0">
                <span
                  className={
                    s.done
                      ? "block text-sm font-medium text-muted-foreground line-through"
                      : "block text-sm font-medium"
                  }
                >
                  {s.label}
                </span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
