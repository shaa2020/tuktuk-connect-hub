import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import type { Database } from "@/integrations/supabase/types";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Confirm, Field, NativeSelect, SampleBadge, ToneBadge, emptyToNull, fmtDate } from "@/components/kit";
import { ContactSelect, LeadSelect } from "@/components/pickers";
import { BOOKING_STATUS_META, PAYMENT_LABEL, canDeleteBookings, type BookingStatus, type PaymentStatus } from "@/lib/domain";
import { useServerFn } from "@tanstack/react-start";
import { createWebsiteBooking, listWebsiteBookings, importWebsiteBooking } from "@/lib/website.functions";
import { RefreshCw, Globe } from "lucide-react";

function WebsiteBookings({ workspaceId, onOpen }: { workspaceId: string; onOpen: (id: string) => void }) {
  const list = useServerFn(listWebsiteBookings);
  const imp = useServerFn(importWebsiteBooking);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["website-bookings", workspaceId], queryFn: () => list({ data: { workspaceId } }), refetchInterval: 60_000 });
  async function add(id: string) {
    setBusy(id);
    const r = await imp({ data: { workspaceId, websiteId: id } });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success("Added to our bookings — you can now assign a tuk tuk and driver.");
    qc.invalidateQueries({ queryKey: ["website-bookings"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    onOpen(r.bookingId);
  }
  const rows = q.data?.bookings ?? [];
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Globe className="size-3.5" /> Live from tuktuk24lisbon.com</span>
        <Button size="sm" variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className={q.isFetching ? "animate-spin" : ""} /> Refresh</Button>
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error || (q.data && !q.data.ok) ? <div className="p-4"><ErrorState message={q.data && !q.data.ok ? q.data.error : (q.error as Error).message} onRetry={() => q.refetch()} /></div> :
        !rows.length ? <EmptyState icon={<Globe />} title="No website bookings yet" description="New bookings made on your website will show up here." /> : (
          <ul className="divide-y">
            {rows.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-14 shrink-0 rounded-lg bg-primary-soft py-1.5 text-center text-primary">
                  {b.travel_date ? <><div className="text-[10px] font-semibold uppercase">{new Date(b.travel_date + "T00:00").toLocaleDateString(undefined, { month: "short" })}</div><div className="font-display text-lg font-bold leading-none">{new Date(b.travel_date + "T00:00").getDate()}</div></> : <div className="text-[10px] font-semibold">No date</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{b.tour_title}</div>
                  <div className="truncate text-xs text-muted-foreground"><span className="font-mono">{b.reference}</span> · {b.customer_name}{b.travel_time ? ` · ${b.travel_time.slice(0, 5)}` : ""} · {b.guests} guests</div>
                  <div className="truncate text-xs text-muted-foreground">{b.phone}{b.email ? ` · ${b.email}` : ""} · <span className="capitalize">{b.status}</span></div>
                </div>
                {b.imported_booking_id
                  ? <Button size="sm" variant="outline" onClick={() => onOpen(b.imported_booking_id!)}>Open</Button>
                  : <Button size="sm" onClick={() => add(b.id)} disabled={busy === b.id}>{busy === b.id ? "Adding…" : "Add"}</Button>}
              </li>
            ))}
          </ul>
        )}
    </Panel>
  );
}

type Booking = Database["public"]["Tables"]["bookings"]["Row"];

export const Route = createFileRoute("/_authenticated/bookings")({
  validateSearch: z.object({ b: z.string().optional(), new: z.boolean().optional(), lead: z.string().optional(), contact: z.string().optional() }),
  head: () => ({ meta: [{ title: "Bookings — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Tour bookings." }] }),
  component: BookingsPage,
});

const STATUSES = Object.keys(BOOKING_STATUS_META) as BookingStatus[];

function BookingsPage() {
  const { workspaceId } = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/bookings" });
  const [status, setStatus] = useState("");
  const [when, setWhen] = useState<"upcoming" | "past" | "all">("upcoming");
  const [term, setTerm] = useState("");
  const [view, setView] = useState<"team" | "website">("team");

  const q = useQuery({
    queryKey: ["bookings", workspaceId, status, when],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let r = supabase.from("bookings").select("*, contacts(full_name)").eq("workspace_id", workspaceId).limit(300);
      if (status) r = r.eq("status", status as BookingStatus);
      if (when === "upcoming") r = r.or(`tour_date.gte.${today},tour_date.is.null`).order("tour_date", { ascending: true, nullsFirst: false });
      else if (when === "past") r = r.lt("tour_date", today).order("tour_date", { ascending: false });
      else r = r.order("created_at", { ascending: false });
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });
  const t = term.trim().toLowerCase();
  const rows = (q.data ?? []).filter((b) => !t || b.reference.toLowerCase().includes(t) || b.tour_name.toLowerCase().includes(t) || (b.contacts?.full_name ?? "").toLowerCase().includes(t) || (b.external_reference ?? "").toLowerCase().includes(t));
  const sheetOpen = !!search.b || !!search.new;
  const close = () => navigate({ search: {} });

  return (
    <PageContainer>
      <PageHeader title="Bookings" description="Inquiries, quotes and confirmed tours." actions={<Button size="sm" onClick={() => navigate({ search: { new: true } })}><Plus /> New booking</Button>} />
      <div className="mb-3 inline-flex rounded-lg border bg-card p-1" role="tablist">
        {(["team", "website"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {v === "team" ? "Our bookings" : "Website bookings"}
          </button>
        ))}
      </div>
      {view === "website" ? <WebsiteBookings workspaceId={workspaceId} onOpen={(id) => navigate({ search: { b: id } })} /> : <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search reference, tour or guest" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search bookings" />
        <NativeSelect className="w-auto" value={when} onChange={(e) => setWhen(e.target.value as typeof when)} aria-label="Date range">
          <option value="upcoming">Upcoming</option><option value="past">Past</option><option value="all">All</option>
        </NativeSelect>
        <NativeSelect className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_META[s].label}</option>)}
        </NativeSelect>
      </div>
      <Panel>
        {q.isLoading ? <ListSkeleton /> : q.error ? <div className="p-4"><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></div> :
          !rows.length ? <EmptyState icon={<CalendarCheck />} title="No bookings here" description="Create a booking manually, or from a lead." action={<Button onClick={() => navigate({ search: { new: true } })}><Plus /> New booking</Button>} /> : (
            <ul className="divide-y">
              {rows.map((b) => (
                <li key={b.id}>
                  <button onClick={() => navigate({ search: { b: b.id } })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
                    <div className="w-14 shrink-0 rounded-lg bg-primary-soft py-1.5 text-center text-primary">
                      {b.tour_date ? <><div className="text-[10px] font-semibold uppercase">{new Date(b.tour_date + "T00:00").toLocaleDateString(undefined, { month: "short" })}</div><div className="font-display text-lg font-bold leading-none">{new Date(b.tour_date + "T00:00").getDate()}</div></> : <div className="text-[10px] font-semibold">No date</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{b.tour_name}</span><SampleBadge show={b.is_demo} /></div>
                      <div className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{b.reference}</span> · {b.contacts?.full_name ?? "No contact"}{b.start_time ? ` · ${b.start_time.slice(0, 5)}` : ""}{b.guests ? ` · ${b.guests} guests` : ""}
                      </div>
                    </div>
                    <ToneBadge tone={BOOKING_STATUS_META[b.status].tone}>{BOOKING_STATUS_META[b.status].label}</ToneBadge>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Panel>
      </>}
      <Sheet open={sheetOpen} onOpenChange={(v) => !v && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {sheetOpen && <BookingEditor key={search.b ?? "new"} id={search.b} defaults={{ lead_id: search.lead, contact_id: search.contact }} onClose={close} />}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

function BookingEditor({ id, defaults, onClose }: { id?: string; defaults: { lead_id?: string; contact_id?: string }; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["booking", id], enabled: !!id,
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("*").eq("id", id!).maybeSingle(); if (error) throw error; return data; },
  });
  if (id && q.isLoading) return <ListSkeleton />;
  if (id && !q.data) return <ErrorState message="Booking not found or not accessible." />;
  return <BookingForm key={q.data?.updated_at ?? "new"} b={q.data ?? undefined} defaults={defaults} onClose={onClose} />;
}

const schema = z.object({
  tour_name: z.string().trim().min(1, "Tour name is required").max(200),
  guests: z.string().refine((v) => !v || (/^\d+$/.test(v) && +v >= 1 && +v <= 500), "Guests must be 1–500"),
  duration_minutes: z.string().refine((v) => !v || (/^\d+$/.test(v) && +v >= 15 && +v <= 1440), "Duration must be 15–1440 minutes"),
  amount: z.string().refine((v) => !v || (!isNaN(+v) && +v >= 0), "Amount must be positive"),
}).passthrough();

function BookingForm({ b, defaults, onClose }: { b?: Booking; defaults: { lead_id?: string; contact_id?: string }; onClose: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState({
    reference: b?.reference ?? "", tour_name: b?.tour_name ?? "", contact_id: b?.contact_id ?? defaults.contact_id ?? "", lead_id: b?.lead_id ?? defaults.lead_id ?? "",
    tour_date: b?.tour_date ?? "", start_time: b?.start_time?.slice(0, 5) ?? "", duration_minutes: b?.duration_minutes?.toString() ?? "",
    guests: b?.guests?.toString() ?? "", language: b?.language ?? "", pickup_location: b?.pickup_location ?? "",
    status: (b?.status ?? "inquiry") as BookingStatus, amount: b?.amount?.toString() ?? "", payment_status: (b?.payment_status ?? "unknown") as PaymentStatus,
    notes: b?.notes ?? "", external_reference: b?.external_reference ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [web, setWeb] = useState({ on: false, name: "", phone: "", email: "" });
  const createWebsite = useServerFn(createWebsiteBooking);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setV = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const syncedPayment = b && b.payment_status_source !== "manual";

  async function save() {
    setErr(null);
    const p = schema.safeParse(f);
    if (!p.success) return setErr(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    try {
      const v = emptyToNull({ ...f }) as Record<string, string | null>;
      const payload = {
        tour_name: v.tour_name!, contact_id: v.contact_id, lead_id: v.lead_id, tour_date: v.tour_date, start_time: v.start_time,
        duration_minutes: v.duration_minutes ? +v.duration_minutes : null, guests: v.guests ? +v.guests : null, language: v.language,
        pickup_location: v.pickup_location, status: f.status, amount: v.amount ? +v.amount : null, notes: v.notes, external_reference: v.external_reference,
        ...(syncedPayment ? {} : { payment_status: f.payment_status, payment_status_source: "manual" }),
      };
      if (b) {
        const { error } = await supabase.from("bookings").update({ ...payload, reference: v.reference ?? b.reference }).eq("id", b.id);
        if (error) throw error;
        toast.success("Booking saved");
      } else {
        let extRef = payload.external_reference;
        if (web.on) {
          if (!web.name.trim() || !web.phone.trim() || !web.email.trim()) throw new Error("Website booking needs guest name, phone and email.");
          const r = await createWebsite({ data: {
            workspaceId: ws.workspaceId, customer_name: web.name, phone: web.phone, email: web.email, tour_title: payload.tour_name,
            date: payload.tour_date ?? undefined, time: payload.start_time ?? undefined, party_size: payload.guests ?? 2,
            pickup_location: payload.pickup_location ?? undefined, notes: payload.notes ?? undefined,
          } });
          if (!r.ok) throw new Error(`Website: ${r.error}`);
          extRef = `WEB-${r.reference}`;
          toast.success(`Created on website (${r.reference})`);
        }
        const { error } = await supabase.from("bookings").insert({ ...payload, external_reference: extRef, reference: v.reference ?? "", workspace_id: ws.workspaceId });
        if (error) throw error;
        toast.success("Booking created");
        onClose();
      }
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["booking"] });
    } catch (e) {
      const m = errMsg(e);
      setErr(m.includes("bookings_workspace_id_reference_key") ? "That booking reference is already used." : m);
    } finally { setBusy(false); }
  }
  async function del() {
    if (!b) return;
    const { error } = await supabase.from("bookings").delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("Booking deleted");
    qc.invalidateQueries({ queryKey: ["bookings"] });
    onClose();
  }

  return (
    <div className="space-y-4">
      <SheetHeader><SheetTitle className="flex items-center gap-2">{b ? `Booking ${b.reference}` : "New booking"}<SampleBadge show={b?.is_demo} /></SheetTitle></SheetHeader>
      <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Mark a booking "Confirmed" only once it's actually agreed — a date mentioned in a chat is still an inquiry. Card details are never stored here.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tour name *" htmlFor="b-tour" className="sm:col-span-2"><Input id="b-tour" value={f.tour_name} onChange={set("tour_name")} /></Field>
        <Field label="Reference" htmlFor="b-ref" hint={b ? undefined : "Leave empty to generate one"}><Input id="b-ref" value={f.reference} onChange={set("reference")} /></Field>
        <Field label="Status" htmlFor="b-status"><NativeSelect id="b-status" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_META[s].label}</option>)}</NativeSelect></Field>
        <Field label="Contact" htmlFor="b-contact" className="sm:col-span-2"><ContactSelect id="b-contact" value={f.contact_id} onChange={setV("contact_id")} /></Field>
        <Field label="Lead" htmlFor="b-lead" className="sm:col-span-2"><LeadSelect id="b-lead" value={f.lead_id} onChange={setV("lead_id")} /></Field>
        <Field label="Tour date" htmlFor="b-date"><Input id="b-date" type="date" value={f.tour_date} onChange={set("tour_date")} /></Field>
        <Field label="Start time" htmlFor="b-time"><Input id="b-time" type="time" value={f.start_time} onChange={set("start_time")} /></Field>
        <Field label="Duration (minutes)" htmlFor="b-dur"><Input id="b-dur" inputMode="numeric" value={f.duration_minutes} onChange={set("duration_minutes")} /></Field>
        <Field label="Guests" htmlFor="b-guests"><Input id="b-guests" inputMode="numeric" value={f.guests} onChange={set("guests")} /></Field>
        <Field label="Language" htmlFor="b-lang"><Input id="b-lang" value={f.language} onChange={set("language")} /></Field>
        <Field label="Amount (EUR)" htmlFor="b-amount"><Input id="b-amount" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
        <Field label="Pickup location" htmlFor="b-pickup" className="sm:col-span-2"><Input id="b-pickup" value={f.pickup_location} onChange={set("pickup_location")} /></Field>
        <Field label="Payment status (entered manually)" htmlFor="b-pay" hint={syncedPayment ? "Synced from a connected system — can't be edited here." : "Set to Paid only after you've verified the payment in your payment provider."}>
          <NativeSelect id="b-pay" value={f.payment_status} onChange={set("payment_status")} disabled={!!syncedPayment}>
            {(Object.keys(PAYMENT_LABEL) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_LABEL[s]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="External reference" htmlFor="b-ext"><Input id="b-ext" value={f.external_reference} onChange={set("external_reference")} /></Field>
        <Field label="Notes" htmlFor="b-notes" className="sm:col-span-2"><Textarea id="b-notes" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      {!b && (
        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={web.on} onChange={(e) => setWeb((p) => ({ ...p, on: e.target.checked }))} />
            Also create this booking on tuktuk24lisbon.com
          </label>
          {web.on && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Guest name *" htmlFor="w-name" className="sm:col-span-2"><Input id="w-name" value={web.name} onChange={(e) => setWeb((p) => ({ ...p, name: e.target.value }))} /></Field>
              <Field label="Phone *" htmlFor="w-phone"><Input id="w-phone" type="tel" value={web.phone} onChange={(e) => setWeb((p) => ({ ...p, phone: e.target.value }))} /></Field>
              <Field label="Email *" htmlFor="w-email"><Input id="w-email" type="email" value={web.email} onChange={(e) => setWeb((p) => ({ ...p, email: e.target.value }))} /></Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">Sent to the website as a booking request — confirm it in the website admin.</p>
            </div>
          )}
        </div>
      )}
      {b && <p className="text-xs text-muted-foreground">Source: {b.source_system} · Tour date {fmtDate(b.tour_date)}</p>}
      {err && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={busy}>{b ? "Save changes" : "Create booking"}</Button>
        {b && canDeleteBookings(ws.role) && <Confirm trigger={<Button variant="outline" size="icon" aria-label="Delete booking"><Trash2 /></Button>} title="Delete booking?" description="This booking will be permanently deleted." confirmLabel="Delete" onConfirm={del} />}
      </div>
    </div>
  );
}
