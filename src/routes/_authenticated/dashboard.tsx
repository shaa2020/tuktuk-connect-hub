import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MessageSquare, Clock, Target, CalendarCheck, AlertTriangle, CheckSquare, Plug, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, PageHeader, Panel } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeSelect, ToneBadge, fmtRelative } from "@/components/kit";
import { CHANNEL_LABEL, STATUS_META, type ChannelType, type ConversationStatus } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Team dashboard." }] }),
  component: Dashboard,
});

type Stats = {
  total: number; open: number; unread: number; awaiting: number; failed: number;
  frt_samples: number; avg_frt_minutes: number | null; res_samples: number; avg_res_minutes: number | null;
  by_channel: Record<string, number>; by_status: Record<string, number>; workload: { user_id: string | null; n: number }[];
  new_leads: number; followup_leads: number; upcoming_bookings: number; overdue_tasks: number;
};

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months" };
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function fmtMinutes(m: number | null) {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${(m / 60).toFixed(1)} h`;
  return `${(m / 1440).toFixed(1)} d`;
}

function Dashboard() {
  const ws = useWorkspace();
  const [range, setRange] = useState<keyof typeof RANGES>("30");
  const [channel, setChannel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");

  const stats = useQuery({
    queryKey: ["dashboard", ws.workspaceId, range, channel, assignee, status],
    queryFn: async () => {
      const to = new Date(Date.now() + 60_000);
      const from = new Date(Date.now() - +range * 86400_000);
      const { data, error } = await supabase.rpc("dashboard_stats", {
        _ws: ws.workspaceId, _from: from.toISOString(), _to: to.toISOString(),
        _channel: (channel || undefined) as ChannelType | undefined, _assignee: assignee || undefined, _status: (status || undefined) as ConversationStatus | undefined,
      });
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const activity = useQuery({
    queryKey: ["dashboard-activity", ws.workspaceId],
    queryFn: async () => {
      const [conv, bookings, channels] = await Promise.all([
        supabase.from("conversations").select("id, last_message_at, last_message_preview, channel, contacts(full_name)").eq("workspace_id", ws.workspaceId).order("last_message_at", { ascending: false }).limit(6),
        supabase.from("bookings").select("id, reference, tour_name, status, updated_at, tour_date").eq("workspace_id", ws.workspaceId).order("updated_at", { ascending: false }).limit(6),
        supabase.from("channel_connections").select("channel, status, last_error").eq("workspace_id", ws.workspaceId),
      ]);
      return { conv: conv.data ?? [], bookings: bookings.data ?? [], channels: channels.data ?? [] };
    },
  });

  const today = useQuery({
    queryKey: ["dashboard-today", ws.workspaceId],
    queryFn: async () => {
      const d = new Date();
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase.from("bookings")
        .select("id, tour_name, start_time, guests, pickup_location, driver_id, vehicle_id, status, contacts(full_name, phone)")
        .eq("workspace_id", ws.workspaceId).eq("tour_date", iso).neq("status", "cancelled")
        .order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [showFilters, setShowFilters] = useState(false);

  const s = stats.data;
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 19 ? "Boa tarde" : "Boa noite";
  const tours = today.data ?? [];
  const needsAttention = tours.filter((b) => !b.pickup_location || !b.driver_id || !b.vehicle_id || !b.contacts?.phone).length;
  const guestsToday = tours.reduce((a, b) => a + (b.guests ?? 0), 0);
  const filtersActive = range !== "30" || channel || assignee || status;

  return (
    <PageContainer>
      <PageHeader title={`${greeting}, ${ws.fullName.split(" ")[0]}`} description={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} />

      {/* Today command center */}
      <div className="mb-5 grid min-w-0 gap-3 lg:grid-cols-3">
        <div className="min-w-0 rounded-2xl bg-navy p-4 text-navy-foreground shadow-pop lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Today's tours</h2>
            <Link to="/dispatch" className="shrink-0 text-xs font-medium text-navy-foreground/80 underline-offset-2 hover:underline">Open calendar</Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Tours" value={today.isLoading ? "…" : tours.length} />
            <MiniStat label="Guests" value={today.isLoading ? "…" : guestsToday} />
            <MiniStat label="Need info" value={today.isLoading ? "…" : needsAttention} warn={needsAttention > 0} />
          </div>
          {!today.isLoading && (tours.length ? (
            <ul className="mt-3 space-y-1.5">
              {tours.slice(0, 4).map((b) => {
                const missing = !b.pickup_location || !b.driver_id || !b.vehicle_id || !b.contacts?.phone;
                return (
                  <li key={b.id}>
                    <Link to="/dispatch" className="flex min-w-0 items-center gap-3 rounded-xl bg-navy-foreground/10 px-3 py-2 hover:bg-navy-foreground/15">
                      <span className="w-11 shrink-0 font-display text-sm font-bold">{b.start_time?.slice(0, 5) ?? "—"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.tour_name}</span>
                        <span className="block truncate text-[11px] text-navy-foreground/70">{b.contacts?.full_name ?? "Guest"} · {b.guests ?? "?"} pax</span>
                      </span>
                      {missing && <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Missing details" />}
                    </Link>
                  </li>
                );
              })}
              {tours.length > 4 && <li className="text-center text-[11px] text-navy-foreground/70">+{tours.length - 4} more today</li>}
            </ul>
          ) : <p className="mt-3 text-sm text-navy-foreground/70">No tours booked for today.</p>)}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-1">
          <QuickLink to="/inbox" icon={<Inbox />} label="Unread messages" value={s?.unread} tone="primary" />
          <QuickLink to="/inbox" icon={<Clock />} label="Awaiting reply" value={s?.awaiting} tone={s && s.awaiting > 0 ? "warning" : undefined} />
          <QuickLink to="/tasks" icon={<CheckSquare />} label="Overdue tasks" value={s?.overdue_tasks} tone={s?.overdue_tasks ? "danger" : undefined} className="col-span-2 lg:col-span-1" />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Performance <span className="font-normal text-muted-foreground">· {RANGES[range]}</span></h2>
        <button onClick={() => setShowFilters((v) => !v)} className="rounded-full border bg-card px-3 py-1 text-xs font-medium md:hidden">
          {showFilters ? "Hide filters" : filtersActive ? "Filters •" : "Filters"}
        </button>
      </div>
      <div className={`mb-5 grid-cols-2 gap-2 md:grid md:grid-cols-4 ${showFilters ? "grid" : "hidden"}`}>
        <NativeSelect value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)} aria-label="Date range">{Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
        <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel"><option value="">All channels</option>{(Object.keys(CHANNEL_LABEL) as ChannelType[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</NativeSelect>
        <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Team member"><option value="">All team members</option>{ws.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{(Object.keys(STATUS_META) as ConversationStatus[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}</NativeSelect>
      </div>

      {stats.error ? <ErrorState message={(stats.error as Error).message} onRetry={() => stats.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<MessageSquare />} label="Conversations" value={s?.total} hint={RANGES[range]} />
            <Stat icon={<Inbox />} label="Open" value={s?.open} />
            <Stat icon={<Clock />} label="Avg. first response" value={s ? (s.frt_samples && (s.avg_frt_minutes ?? 0) >= 0 ? fmtMinutes(s.avg_frt_minutes) : "Not enough data") : undefined} hint={s?.frt_samples ? `${s.frt_samples} conversations` : "Needs logged customer messages and replies"} small />
            <Stat icon={<CheckSquare />} label="Avg. resolution" value={s ? (s.res_samples ? fmtMinutes(s.avg_res_minutes) : "Not enough data") : undefined} hint={s?.res_samples ? `${s.res_samples} resolved` : undefined} small />
            <Stat icon={<Target />} label="New leads" value={s?.new_leads} hint={s?.followup_leads ? `${s.followup_leads} need follow-up` : "No follow-ups due"} />
            <Stat icon={<CalendarCheck />} label="Upcoming bookings" value={s?.upcoming_bookings} hint="Next 14 days" />
          </div>

          <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
            <Panel className="min-w-0 overflow-hidden p-4">
              <h2 className="text-sm font-semibold">By channel</h2>
              <ChartOrEmpty data={Object.entries(s?.by_channel ?? {}).map(([k, v]) => ({ name: CHANNEL_LABEL[k as ChannelType] ?? k, value: v }))} loading={!s} kind="pie" />
            </Panel>
            <Panel className="min-w-0 overflow-hidden p-4">
              <h2 className="text-sm font-semibold">By status</h2>
              <ChartOrEmpty data={Object.entries(s?.by_status ?? {}).map(([k, v]) => ({ name: STATUS_META[k as ConversationStatus]?.label ?? k, value: v }))} loading={!s} kind="bar" />
            </Panel>
            <Panel className="min-w-0 overflow-hidden p-4">
              <h2 className="mb-3 text-sm font-semibold">Team workload <span className="font-normal text-muted-foreground">(open now)</span></h2>
              {!s ? <Skeleton className="h-32" /> : !s.workload.length ? <p className="py-8 text-center text-sm text-muted-foreground">No open conversations.</p> : (
                <ul className="space-y-2">
                  {s.workload.sort((a, b) => b.n - a.n).map((w) => {
                    const max = Math.max(...s.workload.map((x) => x.n));
                    return (
                      <li key={w.user_id ?? "none"}>
                        <div className="flex justify-between text-xs"><span className="font-medium">{ws.memberName(w.user_id)}</span><span className="text-muted-foreground">{w.n}</span></div>
                        <div className="mt-1 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-teal" style={{ width: `${(w.n / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
            <Panel className="min-w-0 overflow-hidden lg:col-span-1">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Recent customer activity</h2><Link to="/inbox" className="text-xs font-medium text-primary">Inbox</Link></div>
              {activity.isLoading ? <div className="p-4"><Skeleton className="h-24" /></div> : !activity.data?.conv.length ? <p className="px-4 py-6 text-sm text-muted-foreground">No conversations yet.</p> : (
                <ul className="divide-y">{activity.data.conv.map((c) => (
                  <li key={c.id}><Link to="/inbox" search={{ c: c.id }} className="block px-4 py-2.5 hover:bg-muted/60">
                    <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate font-medium">{c.contacts?.full_name ?? "Unknown customer"}</span><span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(c.last_message_at)}</span></div>
                    <div className="truncate text-xs text-muted-foreground">{c.last_message_preview}</div>
                  </Link></li>
                ))}</ul>
              )}
            </Panel>
            <Panel className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Recent booking activity</h2><Link to="/bookings" className="text-xs font-medium text-primary">Bookings</Link></div>
              {!activity.data?.bookings.length ? <p className="px-4 py-6 text-sm text-muted-foreground">No bookings yet.</p> : (
                <ul className="divide-y">{activity.data.bookings.map((b) => (
                  <li key={b.id}><Link to="/bookings" search={{ b: b.id }} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/60">
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{b.tour_name}</div><div className="font-mono text-[11px] text-muted-foreground">{b.reference}</div></div>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(b.updated_at)}</span>
                  </Link></li>
                ))}</ul>
              )}
            </Panel>
            <Panel className="min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Health</h2><Link to="/integrations" className="text-xs font-medium text-primary">Integrations</Link></div>
              <ul className="divide-y text-sm">
                {activity.data?.channels.map((c) => (
                  <li key={c.channel} className="flex items-center justify-between px-4 py-2.5">
                    <span className="flex items-center gap-2"><Plug className="size-3.5 text-muted-foreground" />{CHANNEL_LABEL[c.channel]}</span>
                    <ToneBadge tone={c.status === "connected" ? "success" : c.status === "error" ? "danger" : "muted"}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}</ToneBadge>
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-2.5">
                  <span className="flex items-center gap-2"><AlertTriangle className="size-3.5 text-muted-foreground" />Failed deliveries</span>
                  <span className="font-semibold">{s?.failed ?? "—"}</span>
                </li>
                <li className="flex items-center justify-between px-4 py-2.5">
                  <Link to="/tasks" className="flex items-center gap-2"><CheckSquare className="size-3.5 text-muted-foreground" />Overdue tasks</Link>
                  <span className={s?.overdue_tasks ? "font-semibold text-destructive" : "font-semibold"}>{s?.overdue_tasks ?? "—"}</span>
                </li>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </PageContainer>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-navy-foreground/10 px-3 py-2">
      <div className={`font-display text-xl font-bold ${warn ? "text-warning" : ""}`}>{value}</div>
      <div className="text-[11px] text-navy-foreground/70">{label}</div>
    </div>
  );
}

function QuickLink({ to, icon, label, value, tone, className }: { to: "/inbox" | "/tasks"; icon: React.ReactNode; label: string; value: number | undefined; tone?: "primary" | "warning" | "danger"; className?: string }) {
  const color = tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Link to={to} className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:bg-muted/50 ${className ?? ""}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted [&_svg]:size-4 ${color}`}>{icon}</span>
      <span className="min-w-0">
        {value === undefined ? <Skeleton className="h-6 w-8" /> : <span className={`block font-display text-xl font-bold ${color}`}>{value}</span>}
        <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

function Stat({ icon, label, value, hint, tone, small }: { icon: React.ReactNode; label: string; value: number | string | undefined; hint?: string; tone?: "primary" | "warning"; small?: boolean }) {
  return (
    <Panel className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">{icon}{label}</div>
      {value === undefined ? <Skeleton className="mt-2 h-7 w-16" /> : (
        <div className={`mt-1.5 font-display font-bold ${small && typeof value === "string" && value.length > 8 ? "text-sm text-muted-foreground" : "text-2xl"} ${tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</div>
      )}
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </Panel>
  );
}

function ChartOrEmpty({ data, loading, kind }: { data: { name: string; value: number }[]; loading: boolean; kind: "pie" | "bar" }) {
  if (loading) return <Skeleton className="mt-3 h-40" />;
  if (!data.length) return <p className="py-14 text-center text-sm text-muted-foreground">No data for this period.</p>;
  return (
    <div className="mt-2 h-44">
      <ResponsiveContainer width="100%" height="100%">
        {kind === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : (
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
