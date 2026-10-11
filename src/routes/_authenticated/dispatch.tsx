import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { syncWebsiteBookings } from "@/lib/website.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Euro, Globe, MapPin, MessageCircle, Pencil, Phone, Plus, RefreshCw, StickyNote, Truck, Trash2, User, Users } from "lucide-react";
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
const endTime = (start: string, mins: number | null) => {
  const [h, m] = start.split(":").map(Number);
  const t = (h ?? 0) * 60 + (m ?? 0) + (mins ?? 60);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const DOT: Record<DispatchStatus, string> = { scheduled: "bg-muted-foreground", dispatched: "bg-primary", on_tour: "bg-accent-foreground", done: "bg-success" };
const PILL: Record<DispatchStatus, string> = { scheduled: "bg-secondary text-secondary-foreground", dispatched: "bg-primary-soft text-primary", on_tour: "bg-accent text-accent-foreground", done: "bg-success/15 text-success" };
function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2", warn && "border-destructive/40 bg-destructive/5")}>
      <div className={cn("text-xl font-bold tabular-nums", warn && "text-destructive")}>{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex min-w-0 items-start gap-2"><span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span><span className="min-w-0">{children}</span></div>;
}
/** Missing details that would stop a tour running smoothly. */
function tourIssues(t: { pickup_location: string | null; vehicle_id: string | null; driver_id: string | null; contacts: { phone: string | null } | null }) {
  const out: string[] = [];
  if (!t.pickup_location?.trim()) out.push("No pickup location");
  if (!t.contacts?.phone?.trim()) out.push("No guest phone");
  if (!t.vehicle_id) out.push("No tuk tuk");
  if (!t.driver_id) out.push("No driver");
  return out;
}

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
        .select("id, reference, tour_name, tour_date, start_time, duration_minutes, guests, pickup_location, status, payment_status, amount, currency, language, notes, vehicle_id, driver_id, dispatch_status, is_demo, source_system, external_reference, contacts(full_name, phone)")
        .eq("workspace_id", workspaceId).gte("tour_date", day).lte("tour_date", end)
        .order("tour_date").order("start_time", { nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
  const undated = useQuery({
    queryKey: ["dispatch", workspaceId, "undated"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, reference, tour_name, contacts(full_name)")
        .eq("workspace_id", workspaceId).is("tour_date", null).neq("status", "cancelled").limit(100);
      if (error) throw error;
      return data;
    },
  });
  const conflicts = useMemo(() => findConflicts(tours.data ?? []), [tours.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["dispatch", workspaceId] });
  const syncFn = useServerFn(syncWebsiteBookings);
  const [syncing, setSyncing] = useState(false);
  const didSync = useRef(false);
  async function syncWeb(manual: boolean) {
    setSyncing(true);
    const r = await syncFn({ data: { workspaceId } }).catch((e) => ({ ok: false as const, error: (e as Error).message, added: 0 }));
    setSyncing(false);
    if (!r.ok) { if (manual) toast.error(`Website: ${r.error}`); return; }
    if (r.added > 0 || manual) toast.success(r.added ? `${r.added} new website booking${r.added > 1 ? "s" : ""} added` : "Website bookings are up to date");
    if (r.added > 0) { refresh(); qc.invalidateQueries({ queryKey: ["bookings"] }); }
  }
  useEffect(() => {
    if (!workspaceId || didSync.current) return;
    didSync.current = true; syncWeb(false);
    const t = setInterval(() => syncWeb(false), 120_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function patch(id: string, values: { vehicle_id?: string | null; driver_id?: string | null; dispatch_status?: string }) {
    const { error } = await supabase.from("bookings").update(values).eq("id", id);
    if (error) toast.error(errMsg(error)); else refresh();
  }

  const active = (vehicles.data ?? []).filter((v) => v.active);
  const days = view === "day" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(day, i));

  return (
    <PageContainer>
      <PageHeader title="Tour Calendar" description="Tap a tour to edit or delete it. Assign tuk tuks and drivers." actions={<Button asChild size="sm"><Link to="/bookings" search={{ new: true }}><Plus /> New booking</Link></Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Previous" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))}><ChevronLeft /></Button>
        <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto" />
        <Button size="icon" variant="outline" aria-label="Next" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))}><ChevronRight /></Button>
        <Button size="sm" variant="ghost" onClick={() => setDay(iso(new Date()))}>Today</Button>
        <Button size="sm" variant="outline" onClick={() => syncWeb(true)} disabled={syncing}><RefreshCw className={syncing ? "animate-spin" : ""} /> Sync website</Button>
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
        <div className="space-y-6">
          {days.map((d) => {
            const list = (tours.data ?? []).filter((t) => t.tour_date === d);
            const live = list.filter((t) => t.status !== "cancelled");
            const pax = live.reduce((s, t) => s + (t.guests ?? 0), 0);
            const open = live.filter((t) => !t.vehicle_id || !t.driver_id).length;
            const vName = (id: string | null) => active.find((v) => v.id === id)?.name ?? (vehicles.data ?? []).find((v) => v.id === id)?.name;
            const dName = (id: string | null) => { const m = members.find((x) => x.user_id === id); return m ? (m.full_name || m.email) : undefined; };
            const sheet = () => {
              const head = new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
              const lines = live.map((t) => [
                `🕐 ${t.start_time?.slice(0, 5) ?? "TBC"}${t.start_time ? `–${endTime(t.start_time, t.duration_minutes)}` : ""} · ${t.tour_name}`,
                `👤 ${t.contacts?.full_name ?? "Guest"}${t.contacts?.phone ? ` (${t.contacts.phone})` : ""} · ${t.guests ?? "?"} guests`,
                t.pickup_location ? `📍 ${t.pickup_location}` : null,
                `🛺 ${vName(t.vehicle_id) ?? "No tuk tuk"} · 🧑‍✈️ ${dName(t.driver_id) ?? "No driver"}`,
                t.notes ? `📝 ${t.notes}` : null,
              ].filter(Boolean).join("\n"));
              navigator.clipboard.writeText(`Tuk Tuk 24 Lisbon — ${head}\n${live.length} tours · ${pax} guests\n\n${lines.join("\n\n")}`)
                .then(() => toast.success("Run sheet copied — paste it in WhatsApp"), () => toast.error("Could not copy"));
            };
            return (
              <section key={d}>
                <div className="mb-3 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-wide text-primary">{d === iso(new Date()) ? "Today" : new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}</div>
                    <h2 className="truncate text-lg font-bold">{new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</h2>
                  </div>
                  {live.length > 0 && <Button size="sm" variant="outline" className="shrink-0" onClick={sheet}><Copy /> Copy run sheet</Button>}
                </div>
                {list.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <Stat label="Tours" value={live.length} />
                    <Stat label="Guests" value={pax} />
                    <Stat label="Need crew" value={open} warn={open > 0} />
                  </div>
                )}
                {(() => {
                  const bad = live.filter((t) => conflicts.has(t.id) || tourIssues(t).length > 0).length;
                  return bad > 0 ? <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm font-semibold text-destructive"><AlertTriangle className="size-4 shrink-0" /> {bad} tour{bad > 1 ? "s" : ""} need attention before departure</div> : null;
                })()}
                {list.length === 0 ? (
                  view === "day" ? <EmptyState icon={<Truck />} title="No tours this day" description="Bookings with a tour date appear here." action={<Button asChild size="sm"><Link to="/bookings" search={{ new: true }}>New booking</Link></Button>} /> : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No tours</p>
                ) : (
                  <div className="relative space-y-3 border-l-2 border-primary/20 pl-4">
                    {list.map((t) => {
                      const c = conflicts.get(t.id);
                      const ds = (t.dispatch_status ?? "scheduled") as DispatchStatus;
                      const nx = nextDispatch(ds);
                      const phone = t.contacts?.phone?.replace(/[^\d+]/g, "");
                      const first = t.contacts?.full_name?.split(" ")[0] ?? "";
                      const wa = phone ? `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(`Hello ${first}, this is Tuk Tuk 24 Lisbon about your ${t.tour_name} on ${new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}${t.start_time ? ` at ${t.start_time.slice(0, 5)}` : ""}.`)}` : null;
                      return (
                        <Panel key={t.id} className={cn("relative overflow-hidden p-0", c && "border-destructive ring-1 ring-destructive/40", t.status === "cancelled" && "opacity-50")}>
                          <span className={cn("absolute -left-[23px] top-5 size-3 rounded-full border-2 border-background", DOT[ds])} />
                          <div className="flex items-stretch">
                            <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-primary-soft px-2 py-3 text-primary">
                              <div className="text-xl font-bold tabular-nums leading-none">{t.start_time?.slice(0, 5) ?? "TBC"}</div>
                              {t.start_time && <div className="mt-1 text-[11px] tabular-nums">to {endTime(t.start_time, t.duration_minutes)}</div>}
                              <div className="mt-1 text-[11px] opacity-80">{t.duration_minutes ? `${t.duration_minutes} min` : "flexible"}</div>
                            </div>
                            <div className="min-w-0 flex-1 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <Link to="/bookings" search={{ b: t.id }} className="min-w-0 font-semibold leading-snug hover:underline">{t.tour_name}</Link>
                                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", PILL[ds])}>{DISPATCH_LABEL[ds]}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                <SampleBadge show={t.is_demo} />
                                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">{t.reference}</span>
                                {t.source_system === "website" && <span className="inline-flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 font-semibold text-primary"><Globe className="size-3" /> Website {t.external_reference}</span>}
                                <span className="rounded bg-secondary px-1.5 py-0.5 capitalize">{t.status}</span>
                                {t.payment_status && <span className="rounded bg-secondary px-1.5 py-0.5 capitalize">{String(t.payment_status).replace(/_/g, " ")}</span>}
                              </div>
                              <dl className="mt-2 space-y-1 text-sm">
                                <Row icon={<User className="size-3.5" />}>{t.contacts?.full_name ?? "Guest"}{t.language ? ` · ${t.language}` : ""}</Row>
                                <Row icon={<Users className="size-3.5" />}>{t.guests ?? "?"} guests</Row>
                                {t.pickup_location && <Row icon={<MapPin className="size-3.5" />}><a className="hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.pickup_location + ", Lisbon")}`}>{t.pickup_location}</a></Row>}
                                {t.amount != null && <Row icon={<Euro className="size-3.5" />}>{t.amount} {t.currency}</Row>}
                                {t.notes && <Row icon={<StickyNote className="size-3.5" />}><span className="line-clamp-2">{t.notes}</span></Row>}
                              </dl>
                              {c && <div className="mt-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive"><AlertTriangle className="size-3.5 shrink-0" /> Overlap: same {c.join(" & ")} as another tour at this time</div>}
                              {t.status !== "cancelled" && tourIssues(t).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {tourIssues(t).map((m) => <span key={m} className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning-foreground"><AlertTriangle className="size-3 shrink-0" /> {m}</span>)}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-2 border-t bg-muted/30 p-3 sm:grid-cols-2">
                            <NativeSelect aria-label="Tuk tuk" value={t.vehicle_id ?? ""} onChange={(e) => patch(t.id, { vehicle_id: e.target.value || null })}>
                              <option value="">🛺 No tuk tuk</option>
                              {active.map((v) => <option key={v.id} value={v.id}>🛺 {v.name}{v.plate ? ` (${v.plate})` : ""}</option>)}
                            </NativeSelect>
                            <NativeSelect aria-label="Driver" value={t.driver_id ?? ""} onChange={(e) => patch(t.id, { driver_id: e.target.value || null })}>
                              <option value="">🧑‍✈️ No driver</option>
                              {members.filter((m) => m.active).map((m) => <option key={m.user_id} value={m.user_id}>🧑‍✈️ {m.full_name || m.email}</option>)}
                            </NativeSelect>
                            <div className="flex flex-wrap gap-2 sm:col-span-2">
                              {phone && <Button asChild size="sm" variant="outline"><a href={`tel:${phone}`}><Phone /> Call</a></Button>}
                              {wa && <Button asChild size="sm" variant="outline"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
                              <Button asChild size="sm" variant="ghost"><Link to="/bookings" search={{ b: t.id }}><Pencil /> Edit</Link></Button>
                              {nx && <Button size="sm" className="ml-auto" onClick={() => patch(t.id, { dispatch_status: nx })}>Mark {DISPATCH_LABEL[nx].toLowerCase()}</Button>}
                            </div>
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

      {(undated.data?.length ?? 0) > 0 && (
        <Panel className="mt-6 p-4">
          <h2 className="mb-2 font-semibold">Bookings without a date ({undated.data!.length})</h2>
          <ul className="divide-y">
            {undated.data!.map((u) => (
              <li key={u.id} className="py-2 text-sm">
                <Link to="/bookings" search={{ b: u.id }} className="font-medium hover:underline">{u.tour_name}</Link>
                <span className="text-muted-foreground"> · {u.reference}{u.contacts?.full_name ? ` · ${u.contacts.full_name}` : ""} · add a date to place it on the calendar</span>
              </li>
            ))}
          </ul>
        </Panel>
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
