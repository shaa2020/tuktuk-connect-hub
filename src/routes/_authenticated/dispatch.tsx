import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Truck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, SampleBadge } from "@/components/kit";
import { canManageWorkspace } from "@/lib/domain";
import { DISPATCH_LABEL, findConflicts, nextDispatch, type DispatchStatus } from "@/lib/dispatch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dispatch")({
  head: () => ({ meta: [
    { title: "Tour Calendar & Dispatch — Tuk Tuk 24 Lisbon" },
    { name: "description", content: "Daily tour run sheet with tuk tuk and driver assignment." },
  ] }),
  component: DispatchPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };

function DispatchPage() {
  const { workspaceId, role, members } = useWorkspace();
  const qc = useQueryClient();
  const [day, setDay] = useState(iso(new Date()));
  const [view, setView] = useState<"day" | "week">("day");
  const end = view === "day" ? day : addDays(day, 6);
  const canFleet = canManageWorkspace(role) || role === "manager";

  const vehicles = useQuery({
    queryKey: ["vehicles", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").eq("workspace_id", workspaceId).order("name");
      if (error) throw error;
      return data;
    },
  });
  const tours = useQuery({
    queryKey: ["dispatch", workspaceId, day, end],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("id, reference, tour_name, tour_date, start_time, duration_minutes, guests, pickup_location, status, vehicle_id, driver_id, dispatch_status, is_demo, contacts(full_name, phone)")
        .eq("workspace_id", workspaceId).gte("tour_date", day).lte("tour_date", end)
        .order("tour_date").order("start_time", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const conflicts = useMemo(() => findConflicts(tours.data ?? []), [tours.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["dispatch", workspaceId] });

  async function patch(id: string, values: { vehicle_id?: string | null; driver_id?: string | null; dispatch_status?: string }) {
    const { error } = await supabase.from("bookings").update(values).eq("id", id);
    if (error) toast.error(errMsg(error)); else refresh();
  }

  const active = (vehicles.data ?? []).filter((v) => v.active);
  const days = view === "day" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(day, i));

  return (
    <PageContainer>
      <PageHeader title="Tour Calendar" description="Assign tuk tuks and drivers, and move each tour through its day." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Previous" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))}><ChevronLeft /></Button>
        <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" />
        <Button size="icon" variant="outline" aria-label="Next" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))}><ChevronRight /></Button>
        <Button size="sm" variant="ghost" onClick={() => setDay(iso(new Date()))}>Today</Button>
        <div className="ml-auto flex rounded-lg border p-0.5">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1 text-sm capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{v}</button>
          ))}
        </div>
      </div>

      {conflicts.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {conflicts.size} tours share a tuk tuk or driver at the same time. Fix the highlighted ones.
        </div>
      )}

      {tours.isLoading ? <ListSkeleton /> : tours.error ? <ErrorState message={errMsg(tours.error)} onRetry={() => tours.refetch()} /> : (
        <div className="space-y-5">
          {days.map((d) => {
            const list = (tours.data ?? []).filter((t) => t.tour_date === d);
            return (
              <section key={d}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })} · {list.length} tours
                </h2>
                {list.length === 0 ? (
                  view === "day" ? <EmptyState icon={<Truck />} title="No tours this day" description="Bookings with a tour date appear here." action={<Button asChild size="sm"><Link to="/bookings" search={{ new: true }}>New booking</Link></Button>} /> : null
                ) : (
                  <div className="space-y-2">
                    {list.map((t) => {
                      const c = conflicts.get(t.id);
                      const ds = (t.dispatch_status ?? "scheduled") as DispatchStatus;
                      const nx = nextDispatch(ds);
                      return (
                        <Panel key={t.id} className={cn("p-3", c && "border-destructive ring-1 ring-destructive/40", t.status === "cancelled" && "opacity-50")}>
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="w-14 shrink-0 text-center">
                              <div className="text-lg font-bold tabular-nums">{t.start_time?.slice(0, 5) ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{t.duration_minutes ?? 60} min</div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link to="/bookings" search={{ b: t.id }} className="font-semibold hover:underline">{t.tour_name}</Link> <SampleBadge show={t.is_demo} />
                              <div className="text-sm text-muted-foreground">
                                {t.contacts?.full_name ?? "Guest"}{t.guests ? ` · ${t.guests} guests` : ""}{t.pickup_location ? ` · ${t.pickup_location}` : ""}
                              </div>
                              {c && <div className="mt-1 text-xs font-medium text-destructive">Double-booked {c.join(" & ")}</div>}
                            </div>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{DISPATCH_LABEL[ds]}</span>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                            <NativeSelect aria-label="Tuk tuk" value={t.vehicle_id ?? ""} onChange={(e) => patch(t.id, { vehicle_id: e.target.value || null })}>
                              <option value="">No tuk tuk</option>
                              {active.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ""}</option>)}
                            </NativeSelect>
                            <NativeSelect aria-label="Driver" value={t.driver_id ?? ""} onChange={(e) => patch(t.id, { driver_id: e.target.value || null })}>
                              <option value="">No driver</option>
                              {members.filter((m) => m.active).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
                            </NativeSelect>
                            {nx && <Button size="sm" onClick={() => patch(t.id, { dispatch_status: nx })}>Mark {DISPATCH_LABEL[nx].toLowerCase()}</Button>}
                          </div>
                        </Panel>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Fleet canEdit={canFleet} rows={vehicles.data ?? []} onChange={() => qc.invalidateQueries({ queryKey: ["vehicles", workspaceId] })} />
    </PageContainer>
  );
}

function Fleet({ canEdit, rows, onChange }: { canEdit: boolean; rows: { id: string; name: string; plate: string | null; seats: number }[]; onChange: () => void }) {
  const { workspaceId } = useWorkspace();
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("vehicles").insert({ workspace_id: workspaceId, name: name.trim(), plate: plate.trim() || null });
    if (error) return toast.error(errMsg(error));
    setName(""); setPlate(""); onChange();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) toast.error(errMsg(error)); else onChange();
  }
  return (
    <Panel className="mt-8 p-4">
      <h2 className="mb-3 font-semibold">Your tuk tuks</h2>
      {rows.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No tuk tuks added yet.</p>}
      <ul className="mb-3 divide-y">
        {rows.map((v) => (
          <li key={v.id} className="flex items-center gap-2 py-2 text-sm">
            <Truck className="size-4 text-muted-foreground" /> <span className="font-medium">{v.name}</span>
            {v.plate && <span className="text-muted-foreground">{v.plate}</span>}
            {canEdit && <Button size="icon" variant="ghost" className="ml-auto" aria-label={`Remove ${v.name}`} onClick={() => remove(v.id)}><Trash2 /></Button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Name, e.g. Tuk Tuk 1" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Input placeholder="Plate (optional)" value={plate} onChange={(e) => setPlate(e.target.value)} className="w-40" />
          <Button onClick={add}><Plus /> Add</Button>
        </div>
      )}
    </Panel>
  );
}
