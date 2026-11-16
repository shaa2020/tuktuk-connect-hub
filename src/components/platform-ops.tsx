import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Euro, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel } from "@/components/states";
import { NativeSelect, fmtDateTime } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Platform console: estimated revenue, job backlog and integration health (counts only). */
export function PlatformOps({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const rev = useQuery({
    queryKey: ["platform", "revenue"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_revenue_summary" as never);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const health = useQuery({
    queryKey: ["platform", "health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_health" as never);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const backlog = useQuery({
    queryKey: ["platform", "backlog"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_job_backlog" as never);
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const mrr = (rev.data ?? []).reduce((s, r) => s + Number(r.mrr_cents ?? 0), 0);
  const issues = (health.data ?? []).filter(
    (h) =>
      h.broken_channels > 0 ||
      h.failed_automations_24h > 0 ||
      h.pending_automations > 0 ||
      h.failed_social_posts > 0 ||
      h.ai_operator_paused,
  );
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <Panel className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Euro className="size-4" /> Revenue (estimated from list prices)
        </h2>
        <div className="text-2xl font-bold tabular-nums">
          €{(mrr / 100).toLocaleString("en", { maximumFractionDigits: 0 })}{" "}
          <span className="text-sm font-normal text-muted-foreground">MRR</span>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {(rev.data ?? [])
            .filter((r) => r.active_subscriptions || r.trialing || r.past_due)
            .map((r) => (
              <li key={r.plan}>
                {r.plan}: {r.active_subscriptions} active · {r.trialing} trial · {r.past_due} past
                due
              </li>
            ))}
        </ul>
        {!rev.data?.some((r) => r.active_subscriptions || r.trialing) && (
          <p className="text-xs text-muted-foreground">No paid subscriptions yet.</p>
        )}
      </Panel>
      <Panel className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4" /> System health
        </h2>
        {backlog.data && (
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(backlog.data).map(([k, v]) => (
              <li
                key={k}
                className={
                  v > 0 && /stuck|overdue|unprocessed/.test(k)
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {k.replaceAll("_", " ")}: <b>{v}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-xs font-medium">
          {issues.length
            ? `${issues.length} business${issues.length === 1 ? "" : "es"} need attention`
            : "No integration problems reported."}
        </div>
        <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
          {issues.map((h) => (
            <li key={h.workspace_id}>
              <b>{h.name}</b>:{" "}
              {[
                h.broken_channels && `${h.broken_channels} broken channel(s) — ${h.channel_errors}`,
                h.failed_automations_24h && `${h.failed_automations_24h} failed automations`,
                h.pending_automations && `${h.pending_automations} overdue automations`,
                h.failed_social_posts && `${h.failed_social_posts} failed posts`,
                h.ai_operator_paused && `AI paused: ${h.ai_operator_paused}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </li>
          ))}
        </ul>
      </Panel>
      <SupportViewer workspaces={workspaces} />
    </div>
  );
}

function SupportViewer({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [ws, setWs] = useState("");
  const [snap, setSnap] = useState<any>(null);
  return (
    <Panel className="p-4 lg:col-span-2">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="size-4" /> Support view (needs the business's permission)
      </h2>
      <div className="flex gap-2">
        <NativeSelect
          value={ws}
          onChange={(e) => {
            setWs(e.target.value);
            setSnap(null);
          }}
          aria-label="Business"
        >
          <option value="">Choose a business…</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
        <Button
          size="sm"
          disabled={!ws}
          onClick={async () => {
            const { data, error } = await supabase.rpc(
              "support_workspace_snapshot" as never,
              { _ws: ws } as never,
            );
            if (error) return toast.error(error.message);
            setSnap(data);
          }}
        >
          Open
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Read-only. Each view is recorded in the business's audit log.
      </p>
      {snap && (
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <b>Channels</b>
            <ul>
              {snap.channels.map((c: any, i: number) => (
                <li key={i}>
                  {c.channel} · {c.label ?? "—"} · {c.status}
                  {c.last_error ? (
                    <span className="text-destructive"> · {c.last_error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <b>Team</b>
            <ul>
              {snap.members.map((m: any, i: number) => (
                <li key={i}>
                  {m.name ?? "—"} · {m.role}
                  {m.active ? "" : " (inactive)"}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <b>Recent conversations</b>
            <ul>
              {snap.recent_conversations.map((c: any, i: number) => (
                <li key={i}>
                  {c.channel} · {c.status} · {fmtDateTime(c.last_message_at)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <b>Failures</b>
            <ul>
              {[...snap.failed_messages, ...snap.automation_failures]
                .slice(0, 15)
                .map((f: any, i: number) => (
                  <li key={i} className="text-destructive">
                    {fmtDateTime(f.created_at)} · {f.error}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Business admin: allow the platform support team to look (read-only, time-limited). */
export function SupportAccessPanel() {
  const ws = useWorkspace();
  const [hours, setHours] = useState("4");
  const [reason, setReason] = useState("");
  const grants = useQuery({
    queryKey: ["support-grants", ws.workspaceId],
    queryFn: async () =>
      ((
        await supabase
          .from("support_access_grants" as never)
          .select("id, reason, expires_at, revoked_at")
          .eq("workspace_id", ws.workspaceId)
          .order("created_at", { ascending: false })
          .limit(5)
      ).data as any[]) ?? [],
  });
  const active = (grants.data ?? []).filter(
    (g) => !g.revoked_at && new Date(g.expires_at) > new Date(),
  );
  return (
    <Panel className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <LifeBuoy className="size-4" /> Support access
      </h2>
      <p className="text-xs text-muted-foreground">
        Let the platform support team see your channel status, team list and recent errors
        (read-only) for a limited time. Every view appears in your audit log.
      </p>
      {active.map((g) => (
        <div key={g.id} className="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
          <span className="flex-1">
            Active until {new Date(g.expires_at).toLocaleString()} — {g.reason}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { error } = await supabase.rpc(
                "revoke_support_access" as never,
                { _id: g.id } as never,
              );
              if (error) toast.error(error.message);
              else grants.refetch();
            }}
          >
            Revoke
          </Button>
        </div>
      ))}
      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <NativeSelect
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          aria-label="Duration"
        >
          {["1", "4", "24", "72"].map((h) => (
            <option key={h} value={h}>
              {h} hour{h === "1" ? "" : "s"}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What do you need help with?"
          maxLength={300}
          aria-label="Reason"
        />
        <Button
          size="sm"
          disabled={reason.trim().length < 3}
          onClick={async () => {
            const { error } = await supabase.rpc(
              "grant_support_access" as never,
              { _ws: ws.workspaceId, _hours: Number(hours), _reason: reason.trim() } as never,
            );
            if (error) return toast.error(error.message);
            toast.success("Support access granted");
            setReason("");
            grants.refetch();
          }}
        >
          Grant access
        </Button>
      </div>
    </Panel>
  );
}
