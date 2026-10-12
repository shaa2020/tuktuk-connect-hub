import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Hand, AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel } from "@/components/states";
import { fmtDateTime } from "@/components/kit";
import { outcomeOf, reasonOf, type Outcome } from "@/lib/ai-operator-outcomes";

const META: Record<Outcome, { label: string; icon: typeof Hand; cls: string }> = {
  reply: { label: "Replied", icon: CheckCircle2, cls: "text-success" },
  handover: { label: "Handed over", icon: Hand, cls: "text-warning" },
  parse_fail: { label: "Parsing failure", icon: AlertTriangle, cls: "text-destructive" },
};

export function AiOperatorMonitor() {
  const ws = useWorkspace();
  const [days, setDays] = useState(7);
  const [filter, setFilter] = useState<Outcome | "all">("all");
  const q = useQuery({
    queryKey: ["ai-operator-monitor", ws.workspaceId, days],
    enabled: !!ws.workspaceId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase.from("ai_operator_log")
        .select("id, kind, summary, conversation_id, created_at")
        .eq("workspace_id", ws.workspaceId!).in("kind", ["reply", "handoff", "parse_fail", "error"])
        .gte("created_at", since).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((r) => r.conversation_id).filter(Boolean))] as string[];
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: cs } = await supabase.from("conversations").select("id, channel, contacts(full_name)").in("id", ids);
        for (const c of (cs ?? []) as any[]) names[c.id] = `${c.contacts?.full_name || "Guest"} · ${c.channel}`;
      }
      return (data ?? []).flatMap((r) => {
        const o = outcomeOf(r.kind, r.summary);
        return o ? [{ ...r, outcome: o, reason: reasonOf(o, r.summary), who: r.conversation_id ? names[r.conversation_id] ?? "Conversation" : "—" }] : [];
      });
    },
  });
  const rows = q.data ?? [];
  const counts = useMemo(() => ({
    reply: rows.filter((r) => r.outcome === "reply").length,
    handover: rows.filter((r) => r.outcome === "handover").length,
    parse_fail: rows.filter((r) => r.outcome === "parse_fail").length,
  }), [rows]);
  const total = counts.reply + counts.handover + counts.parse_fail;
  const shown = filter === "all" ? rows : rows.filter((r) => r.outcome === filter);

  return (
    <Panel className="p-4">
      <h2 className="text-base font-semibold">AI Operator monitoring</h2>
      <p className="mb-3 text-sm text-muted-foreground">Every reply, handover and parsing failure, linked to its conversation.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-full border px-3 py-1 text-xs ${days === d ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            {d === 1 ? "24 hours" : `${d} days`}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(Object.keys(META) as Outcome[]).map((k) => {
          const M = META[k];
          return (
            <button key={k} onClick={() => setFilter(filter === k ? "all" : k)} aria-pressed={filter === k}
              className={`rounded-lg border p-3 text-left transition ${filter === k ? "border-primary bg-primary/5" : "bg-card"}`}>
              <M.icon className={`h-4 w-4 ${M.cls}`} />
              <div className="mt-1 text-xl font-semibold">{counts[k]}</div>
              <div className="text-xs text-muted-foreground">{M.label}{total ? ` · ${Math.round((counts[k] / total) * 100)}%` : ""}</div>
            </button>
          );
        })}
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
        : q.error ? <p className="text-sm text-destructive">Couldn't load activity.</p>
        : !shown.length ? <p className="text-sm text-muted-foreground">No outcomes in this period.</p>
        : (
          <ul className="divide-y rounded-lg border">
            {shown.map((r) => {
              const M = META[r.outcome];
              const body = (
                <div className="flex items-start gap-3 p-3">
                  <M.icon className={`mt-0.5 h-4 w-4 shrink-0 ${M.cls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-2">
                      <span className="truncate text-sm font-medium">{r.who}</span>
                      <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                    </div>
                    <div className={`text-xs font-medium ${M.cls}`}>{M.label}</div>
                    <p className="line-clamp-2 break-words text-sm text-muted-foreground">{r.reason}</p>
                  </div>
                  {r.conversation_id && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                </div>
              );
              return (
                <li key={r.id}>
                  {r.conversation_id
                    ? <Link to="/inbox" search={{ c: r.conversation_id } as any} className="block hover:bg-muted/50">{body}</Link>
                    : body}
                </li>
              );
            })}
          </ul>
        )}
    </Panel>
  );
}
