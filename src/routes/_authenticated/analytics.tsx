import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect } from "@/components/kit";
import {
  BOOKING_STATUS_META,
  LEAD_STAGES,
  LEAD_STAGE_META,
  type BookingStatus,
} from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — TeamInbox" },
      { name: "description", content: "Reports from your real data." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const ws = useWorkspace();
  const [days, setDays] = useState("30");
  const q = useQuery({
    queryKey: ["analytics", ws.workspaceId, days],
    queryFn: async () => {
      const from = new Date(Date.now() - +days * 86400_000).toISOString();
      const [conv, leads, bookings] = await Promise.all([
        supabase
          .from("conversations")
          .select("created_at, first_inbound_at, first_response_at, assigned_to")
          .eq("workspace_id", ws.workspaceId)
          .gte("created_at", from)
          .limit(5000),
        supabase
          .from("leads")
          .select("stage, created_at")
          .eq("workspace_id", ws.workspaceId)
          .gte("created_at", from)
          .limit(5000),
        supabase
          .from("bookings")
          .select("status, amount, created_at")
          .eq("workspace_id", ws.workspaceId)
          .gte("created_at", from)
          .limit(5000),
      ]);
      if (conv.error) throw conv.error;
      const perDay = new Map<string, number>();
      for (let i = +days - 1; i >= 0; i--)
        perDay.set(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), 0);
      for (const c of conv.data) {
        const d = c.created_at.slice(0, 10);
        if (perDay.has(d)) perDay.set(d, perDay.get(d)! + 1);
      }
      const funnel = LEAD_STAGES.map((s) => ({
        name: LEAD_STAGE_META[s].label,
        value: (leads.data ?? []).filter((l) => l.stage === s).length,
      }));
      const won = (leads.data ?? []).filter((l) => l.stage === "won").length;
      const closed = won + (leads.data ?? []).filter((l) => l.stage === "lost").length;
      const bStatus = (Object.keys(BOOKING_STATUS_META) as BookingStatus[]).map((s) => ({
        name: BOOKING_STATUS_META[s].label,
        value: (bookings.data ?? []).filter((b) => b.status === s).length,
      }));
      const confirmedValue = (bookings.data ?? [])
        .filter((b) => b.status === "confirmed" || b.status === "completed")
        .reduce((a, b) => a + (b.amount ?? 0), 0);
      const perAgent = new Map<string, { n: number; frt: number[] }>();
      for (const c of conv.data) {
        const k = c.assigned_to ?? "none";
        const e = perAgent.get(k) ?? { n: 0, frt: [] };
        e.n++;
        if (c.first_inbound_at && c.first_response_at && c.first_response_at >= c.first_inbound_at)
          e.frt.push((+new Date(c.first_response_at) - +new Date(c.first_inbound_at)) / 60000);
        perAgent.set(k, e);
      }
      return {
        perDay: [...perDay].map(([d, n]) => ({ day: d.slice(5), n })),
        funnel,
        bStatus,
        confirmedValue,
        winRate: closed ? Math.round((won / closed) * 100) : null,
        closed,
        agents: [...perAgent].map(([k, v]) => ({
          id: k === "none" ? null : k,
          n: v.n,
          frt: v.frt.length ? Math.round(v.frt.reduce((a, b) => a + b, 0) / v.frt.length) : null,
          samples: v.frt.length,
        })),
        raw: {
          conv: conv.data.length,
          leads: leads.data?.length ?? 0,
          bookings: bookings.data?.length ?? 0,
        },
      };
    },
  });

  async function exportCsv() {
    if (!q.data) return;
    const rows = [
      ["metric", "value"],
      ["conversations", q.data.raw.conv],
      ["leads", q.data.raw.leads],
      ["bookings", q.data.raw.bookings],
      ["confirmed_or_completed_value_eur", q.data.confirmedValue],
      ["lead_win_rate_pct", q.data.winRate ?? "insufficient data"],
      ...q.data.funnel.map((f) => [`leads_${f.name}`, f.value]),
      ...q.data.bStatus.map((b) => [`bookings_${b.name}`, b.value]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from("audit_logs").insert({
      workspace_id: ws.workspaceId,
      actor_id: ws.userId,
      action: "export",
      entity_type: "reports",
      details: { days },
    });
    toast.success("Report exported");
  }

  const d = q.data;
  return (
    <PageContainer>
      <PageHeader
        title="Analytics & Reports"
        description="Calculated from your real records only."
        actions={
          <>
            <NativeSelect
              className="w-40"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-label="Period"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </NativeSelect>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!d}>
              <Download /> Export
            </Button>
          </>
        }
      />
      {q.error ? (
        <ErrorState message={(q.error as Error).message} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">New conversations per day</h2>
            {!d ? (
              <Skeleton className="mt-3 h-48" />
            ) : (
              <div className="mt-2 h-52">
                <ResponsiveContainer>
                  <BarChart data={d.perDay}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
                    <Tooltip />
                    <Bar
                      dataKey="n"
                      name="Conversations"
                      fill="var(--chart-1)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Lead pipeline</h2>
              <span className="text-xs text-muted-foreground">
                Win rate:{" "}
                {d
                  ? d.winRate == null
                    ? "not enough closed leads"
                    : `${d.winRate}% of ${d.closed}`
                  : "…"}
              </span>
            </div>
            {!d ? (
              <Skeleton className="mt-3 h-48" />
            ) : (
              <div className="mt-2 h-56">
                <ResponsiveContainer>
                  <BarChart data={d.funnel} layout="vertical">
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Leads" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          <Panel className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Bookings by status</h2>
              <span className="text-xs text-muted-foreground">
                Confirmed value: {d ? `€${d.confirmedValue.toFixed(2)}` : "…"}
              </span>
            </div>
            {!d ? (
              <Skeleton className="mt-3 h-48" />
            ) : (
              <div className="mt-2 h-56">
                <ResponsiveContainer>
                  <BarChart data={d.bStatus} layout="vertical">
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="Bookings"
                      fill="var(--chart-3)"
                      radius={[0, 3, 3, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Amounts are as entered on bookings; payment is not verified by a payment provider.
            </p>
          </Panel>
          <Panel className="lg:col-span-2">
            <h2 className="border-b px-4 py-3 text-sm font-semibold">Team performance</h2>
            {!d ? (
              <Skeleton className="m-4 h-20" />
            ) : !d.agents.length ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No conversations in this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Conversations</th>
                    <th className="px-4 py-2 font-medium">Avg. first response</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {d.agents.map((a) => (
                    <tr key={a.id ?? "none"}>
                      <td className="px-4 py-2">{ws.memberName(a.id)}</td>
                      <td className="px-4 py-2">{a.n}</td>
                      <td className="px-4 py-2">
                        {a.frt == null ? (
                          <span className="text-muted-foreground">Not enough data</span>
                        ) : (
                          `${a.frt} min (${a.samples})`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
    </PageContainer>
  );
}
