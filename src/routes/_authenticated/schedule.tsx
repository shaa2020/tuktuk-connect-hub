import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { NativeSelect } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addDays, dayKey, shiftRange, shiftsByDay, startOfWeek, weekDays, workload, type Shift } from "@/lib/schedule";

// Staff schedule: shifts, time off, swaps and clock in/out. Rules are enforced in the database
// (migration 0025); this page only reflects them. Times are shown in your device's time zone.
export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Schedule — TeamInbox" }, { name: "description", content: "Staff shifts, time off and attendance." }] }),
  component: SchedulePage,
});

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function SchedulePage() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const manager = ws.role === "admin" || ws.role === "manager";
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const days = weekDays(weekStart);
  const from = weekStart.toISOString(), to = addDays(weekStart, 7).toISOString();
  const refresh = () => qc.invalidateQueries({ queryKey: ["schedule"] });

  const shifts = useQuery({
    queryKey: ["schedule", "shifts", ws.workspaceId, from],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_shifts").select("id, user_id, starts_at, ends_at, position").eq("workspace_id", ws.workspaceId).gte("starts_at", from).lt("starts_at", to).order("starts_at");
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
  const timeOff = useQuery({
    queryKey: ["schedule", "timeoff", ws.workspaceId],
    queryFn: async () => (await supabase.from("time_off_requests").select("*").eq("workspace_id", ws.workspaceId).order("starts_on", { ascending: false }).limit(50)).data ?? [],
  });
  const swaps = useQuery({
    queryKey: ["schedule", "swaps", ws.workspaceId],
    queryFn: async () => (await supabase.from("shift_swap_requests").select("*").eq("workspace_id", ws.workspaceId).eq("status", "pending").order("created_at")).data ?? [],
  });
  const attendance = useQuery({
    queryKey: ["schedule", "attendance", ws.workspaceId, ws.userId],
    queryFn: async () => (await supabase.from("staff_attendance").select("id, clock_in").eq("workspace_id", ws.workspaceId).eq("user_id", ws.userId).is("clock_out", null).maybeSingle()).data,
  });

  const byDay = useMemo(() => shiftsByDay(shifts.data ?? []), [shifts.data]);
  const load = useMemo(() => workload(shifts.data ?? []), [shifts.data]);
  const people = ws.members.filter((m) => m.active);

  async function rpc(name: "clock_in" | "clock_out" | "decide_time_off" | "decide_shift_swap", args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(name as never, args as never);
    if (error) return toast.error(error.message);
    toast.success(ok); refresh();
  }

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Schedule" description="Shifts, time off and attendance. Attendance is an operational record, not certified payroll timekeeping." />

      <Panel className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <Clock className="size-5 text-primary" />
        <div className="min-w-0 flex-1 text-sm">
          {attendance.data ? <>Clocked in since <b>{fmtTime(attendance.data.clock_in)}</b></> : "You're not clocked in."}
        </div>
        {attendance.data
          ? <Button size="sm" variant="outline" onClick={() => rpc("clock_out", { _ws: ws.workspaceId }, "Clocked out")}>Clock out</Button>
          : <Button size="sm" onClick={() => rpc("clock_in", { _ws: ws.workspaceId }, "Clocked in")}>Clock in</Button>}
      </Panel>

      <div className="mb-3 flex items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Previous week" onClick={() => setWeekStart((d) => addDays(d, -7))}><ChevronLeft /></Button>
        <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
        <Button size="icon" variant="outline" aria-label="Next week" onClick={() => setWeekStart((d) => addDays(d, 7))}><ChevronRight /></Button>
        <span className="ml-2 text-sm font-medium">{days[0]!.toLocaleDateString([], { day: "numeric", month: "short" })} – {days[6]!.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>

      {manager && <AddShift workspaceId={ws.workspaceId} people={people} defaultDate={dayKey(days[0]!)} onDone={refresh} />}

      {shifts.isLoading ? <Panel><ListSkeleton /></Panel> : shifts.error ? <ErrorState message={(shifts.error as Error).message} onRetry={() => shifts.refetch()} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {days.map((d) => {
            const list = byDay[dayKey(d)] ?? [];
            return (
              <Panel key={dayKey(d)} className="p-3">
                <div className="mb-2 text-sm font-semibold">{d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>
                {!list.length ? <p className="text-xs text-muted-foreground">No shifts</p> : (
                  <ul className="space-y-2">
                    {list.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
                        <span className="font-medium tabular-nums">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
                        <span className="min-w-0 flex-1 truncate">{ws.memberName(s.user_id)}{s.position ? ` · ${s.position}` : ""}</span>
                        {s.user_id === ws.userId && <SwapButton shift={s} workspaceId={ws.workspaceId} people={people.filter((p) => p.user_id !== ws.userId)} onDone={refresh} />}
                        {manager && <Button size="icon" variant="ghost" aria-label="Delete shift" onClick={async () => {
                          if (!window.confirm("Delete this shift?")) return;
                          const { error } = await supabase.from("staff_shifts").delete().eq("id", s.id);
                          if (error) toast.error(error.message); else refresh();
                        }}><Trash2 /></Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {manager && load.length > 0 && (
        <Panel className="mt-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Workload this week</h2>
          <ul className="space-y-1 text-sm">{load.map((l) => <li key={l.user_id} className="flex justify-between"><span>{ws.memberName(l.user_id)}</span><span className="tabular-nums text-muted-foreground">{l.hours} h · {l.shifts} shift{l.shifts === 1 ? "" : "s"}</span></li>)}</ul>
        </Panel>
      )}

      {manager && (swaps.data?.length ?? 0) > 0 && (
        <Panel className="mt-4 p-4">
          <h2 className="mb-2 text-sm font-semibold">Swap requests</h2>
          <ul className="space-y-2">{swaps.data!.map((r: any) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">{ws.memberName(r.from_user)} → {ws.memberName(r.to_user)}{r.note ? ` · ${r.note}` : ""}</span>
              <Button size="sm" onClick={() => rpc("decide_shift_swap", { _id: r.id, _approve: true }, "Swap approved")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => rpc("decide_shift_swap", { _id: r.id, _approve: false }, "Swap declined")}>Decline</Button>
            </li>
          ))}</ul>
        </Panel>
      )}

      <TimeOff workspaceId={ws.workspaceId} rows={timeOff.data ?? []} manager={manager} me={ws.userId} name={ws.memberName} onDecide={(id, ok) => rpc("decide_time_off", { _id: id, _approve: ok }, ok ? "Approved" : "Declined")} onDone={refresh} />
    </PageContainer>
  );
}

function AddShift({ workspaceId, people, defaultDate, onDone }: { workspaceId: string; people: { user_id: string; full_name: string | null; email: string | null }[]; defaultDate: string; onDone: () => void }) {
  const [user, setUser] = useState(people[0]?.user_id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [position, setPosition] = useState("");
  async function add() {
    const r = shiftRange(date, start, end);
    if (!user || !r) return toast.error("Pick a person, date and times");
    const { error } = await supabase.from("staff_shifts").insert({ workspace_id: workspaceId, user_id: user, ...r, position: position.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Shift added"); onDone();
  }
  return (
    <Panel className="mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto_auto_1fr_auto] sm:items-end">
      <NativeSelect value={user} onChange={(e) => setUser(e.target.value)} aria-label="Team member">
        {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
      </NativeSelect>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
      <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time" />
      <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position (optional)" maxLength={60} aria-label="Position" />
      <Button onClick={add}><Plus /> Add shift</Button>
    </Panel>
  );
}

function SwapButton({ shift, workspaceId, people, onDone }: { shift: Shift; workspaceId: string; people: { user_id: string; full_name: string | null; email: string | null }[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(people[0]?.user_id ?? "");
  if (!people.length) return null;
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Offer swap</Button>;
  return (
    <span className="flex w-full gap-2">
      <NativeSelect value={to} onChange={(e) => setTo(e.target.value)} aria-label="Swap with" className="flex-1">
        {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name || p.email}</option>)}
      </NativeSelect>
      <Button size="sm" onClick={async () => {
        const { error } = await supabase.from("shift_swap_requests").insert({ workspace_id: workspaceId, shift_id: shift.id, to_user: to });
        if (error) return toast.error(error.message);
        toast.success("Swap requested — a manager will decide"); setOpen(false); onDone();
      }}>Request</Button>
    </span>
  );
}

function TimeOff({ workspaceId, rows, manager, me, name, onDecide, onDone }: { workspaceId: string; rows: any[]; manager: boolean; me: string; name: (id: string) => string; onDecide: (id: string, ok: boolean) => void; onDone: () => void }) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  async function request() {
    if (!startsOn || !endsOn) return toast.error("Pick the dates");
    const { error } = await supabase.from("time_off_requests").insert({ workspace_id: workspaceId, starts_on: startsOn, ends_on: endsOn, reason: reason.trim() || null });
    if (error) return toast.error(error.message);
    setReason(""); toast.success("Request sent"); onDone();
  }
  return (
    <Panel className="mt-4 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarRange className="size-4" /> Time off</h2>
      <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label="First day off" />
        <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-label="Last day off" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={500} aria-label="Reason" />
        <Button variant="secondary" onClick={request}>Request time off</Button>
      </div>
      {!rows.length ? <EmptyState title="No time-off requests" /> : (
        <ul className="mt-3 divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">{r.user_id === me ? "You" : name(r.user_id)} · {r.starts_on} – {r.ends_on}{r.reason ? ` · ${r.reason}` : ""}</span>
              <Badge variant={r.status === "approved" ? "default" : r.status === "declined" ? "destructive" : "outline"}>{r.status}</Badge>
              {manager && r.status === "pending" && r.user_id !== me && <>
                <Button size="sm" onClick={() => onDecide(r.id, true)}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => onDecide(r.id, false)}>Decline</Button>
              </>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
