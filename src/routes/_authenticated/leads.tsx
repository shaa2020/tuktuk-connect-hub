import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, LayoutGrid, List, CalendarClock, Users as UsersIcon, Trash2 } from "lucide-react";
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
import { Confirm, Field, NativeSelect, SampleBadge, ToneBadge, emptyToNull, fmtDate, fmtDateTime, fromLocalInput, toLocalInput } from "@/components/kit";
import { ContactSelect, MemberSelect } from "@/components/pickers";
import { LEAD_STAGES, LEAD_STAGE_META, type LeadStage, canDeleteLeads } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Lead = Database["public"]["Tables"]["leads"]["Row"];

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: z.object({ l: z.string().optional(), new: z.boolean().optional(), contact: z.string().optional(), conversation: z.string().optional() }),
  head: () => ({ meta: [{ title: "Leads — TeamInbox" }, { name: "description", content: "Tour enquiry pipeline." }] }),
  component: LeadsPage,
});

function LeadsPage() {
  const { workspaceId, memberName, userId } = useWorkspace();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/leads" });
  const [view, setView] = useState<"board" | "list">("board");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [term, setTerm] = useState("");

  const q = useQuery({
    queryKey: ["leads", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*, contacts(full_name)").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const t = term.trim().toLowerCase();
  const rows = (q.data ?? []).filter((l) =>
    (!ownerFilter || (ownerFilter === "me" ? l.owner_id === userId : l.owner_id === ownerFilter)) &&
    (!t || l.title.toLowerCase().includes(t) || (l.contacts?.full_name ?? "").toLowerCase().includes(t) || (l.tour_interest ?? "").toLowerCase().includes(t)));
  const open = (id?: string) => navigate({ search: id ? { l: id } : { new: true } });
  const close = () => navigate({ search: {} });
  const sheetOpen = !!search.l || !!search.new;

  return (
    <PageContainer className="max-w-none">
      <PageHeader title="Leads" description="Track tour enquiries from first message to booking."
        actions={<>
          <div className="flex rounded-lg border bg-card p-0.5">
            <button onClick={() => setView("board")} className={cn("flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium", view === "board" ? "bg-primary-soft text-primary" : "text-muted-foreground")} aria-pressed={view === "board"}><LayoutGrid className="size-3.5" />Board</button>
            <button onClick={() => setView("list")} className={cn("flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium", view === "list" ? "bg-primary-soft text-primary" : "text-muted-foreground")} aria-pressed={view === "list"}><List className="size-3.5" />List</button>
          </div>
          <Button size="sm" onClick={() => open()}><Plus /> New lead</Button>
        </>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search leads" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Search leads" />
        <NativeSelect className="w-auto" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Filter by owner">
          <option value="">All owners</option>
          <option value="me">My leads</option>
          {useWorkspace().members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </NativeSelect>
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /> :
        !q.data?.length ? (
          <Panel><EmptyState icon={<Target />} title="No leads yet" description="Create a lead manually or from a conversation in the inbox." action={<Button onClick={() => open()}><Plus /> New lead</Button>} /></Panel>
        ) : view === "board" ? (
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
            {LEAD_STAGES.map((s) => {
              const col = rows.filter((l) => l.stage === s);
              return (
                <div key={s} className="w-72 shrink-0 snap-start rounded-xl bg-muted/70 p-2">
                  <div className="mb-2 flex items-center justify-between px-1.5 py-1">
                    <ToneBadge tone={LEAD_STAGE_META[s].tone}>{LEAD_STAGE_META[s].label}</ToneBadge>
                    <span className="text-xs font-semibold text-muted-foreground">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((l) => <LeadCard key={l.id} l={l} owner={memberName(l.owner_id)} onClick={() => open(l.id)} />)}
                    {!col.length && <p className="px-2 py-4 text-center text-xs text-muted-foreground">Empty</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Panel>
            <ul className="divide-y">
              {rows.map((l) => (
                <li key={l.id}>
                  <button onClick={() => open(l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{l.title}</span><SampleBadge show={l.is_demo} /></div>
                      <div className="truncate text-xs text-muted-foreground">{l.contacts?.full_name ?? "No contact"} · {memberName(l.owner_id)}{l.follow_up_at ? ` · Follow up ${fmtDateTime(l.follow_up_at)}` : ""}</div>
                    </div>
                    <ToneBadge tone={LEAD_STAGE_META[l.stage].tone}>{LEAD_STAGE_META[l.stage].label}</ToneBadge>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      <Sheet open={sheetOpen} onOpenChange={(v) => !v && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {sheetOpen && <LeadEditor key={search.l ?? "new"} id={search.l} defaults={{ contact_id: search.contact, conversation: search.conversation }} onClose={close} />}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}

function LeadCard({ l, owner, onClick }: { l: Lead & { contacts: { full_name: string } | null }; owner: string; onClick: () => void }) {
  const overdue = l.follow_up_at && new Date(l.follow_up_at) < new Date() && l.stage !== "won" && l.stage !== "lost";
  return (
    <button onClick={onClick} className="w-full rounded-lg border bg-card p-3 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]">
      <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-snug">{l.title}</span><SampleBadge show={l.is_demo} /></div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{l.contacts?.full_name ?? "No contact"}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {l.group_size && <span className="flex items-center gap-1"><UsersIcon className="size-3" />{l.group_size}</span>}
        {l.preferred_date && <span>{fmtDate(l.preferred_date)}</span>}
        {l.follow_up_at && <span className={cn("flex items-center gap-1", overdue && "font-semibold text-destructive")}><CalendarClock className="size-3" />{overdue ? "Overdue" : fmtDate(l.follow_up_at)}</span>}
        <span className="ml-auto">{owner}</span>
      </div>
    </button>
  );
}

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  stage: z.enum(LEAD_STAGES as [LeadStage, ...LeadStage[]]),
  contact_id: z.string(),
  owner_id: z.string(),
  tour_interest: z.string().max(200),
  group_size: z.string().refine((v) => !v || (/^\d+$/.test(v) && +v >= 1 && +v <= 500), "Group size must be 1–500"),
  preferred_date: z.string(),
  preferred_language: z.string().max(40),
  budget: z.string().refine((v) => !v || (!isNaN(+v) && +v >= 0), "Budget must be a positive number"),
  duration_hours: z.string().refine((v) => !v || (!isNaN(+v) && +v > 0), "Duration must be positive"),
  follow_up_at: z.string(),
  source: z.string().max(60),
  notes: z.string().max(5000),
  lost_reason: z.string().max(500),
}).refine((v) => v.stage !== "lost" || v.lost_reason.trim().length > 0, { message: "Please record why the lead was lost", path: ["lost_reason"] });

function LeadEditor({ id, defaults, onClose }: { id?: string; defaults: { contact_id?: string; conversation?: string }; onClose: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => {
      const [l, a, b, c] = await Promise.all([
        supabase.from("leads").select("*").eq("id", id!).maybeSingle(),
        supabase.from("lead_activities").select("*").eq("lead_id", id!).order("created_at", { ascending: false }).limit(50),
        supabase.from("bookings").select("id, reference, tour_name, status").eq("lead_id", id!),
        supabase.from("conversations").select("id, subject, channel").eq("lead_id", id!),
      ]);
      if (l.error) throw l.error;
      return { l: l.data, acts: a.data ?? [], bookings: b.data ?? [], convs: c.data ?? [] };
    },
  });
  if (id && q.isLoading) return <ListSkeleton />;
  if (id && (q.error || !q.data?.l)) return <ErrorState message={q.error ? (q.error as Error).message : "Lead not found or not accessible."} />;
  const l = q.data?.l;
  return <LeadForm key={l?.updated_at ?? "new"} lead={l ?? undefined} defaults={defaults} acts={q.data?.acts ?? []} bookings={q.data?.bookings ?? []} convs={q.data?.convs ?? []}
    onSaved={() => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["lead"] }); }} onClose={onClose} canDelete={canDeleteLeads(ws.role)} />;
}

function LeadForm({ lead, defaults, acts, bookings, convs, onSaved, onClose, canDelete }: {
  lead?: Lead; defaults: { contact_id?: string; conversation?: string };
  acts: { id: string; kind: string; body: string | null; actor_id: string | null; created_at: string }[];
  bookings: { id: string; reference: string; tour_name: string }[];
  convs: { id: string; subject: string | null }[];
  onSaved: () => void; onClose: () => void; canDelete: boolean;
}) {
  const ws = useWorkspace();
  const [f, setF] = useState({
    title: lead?.title ?? "", stage: (lead?.stage ?? "new") as LeadStage, contact_id: lead?.contact_id ?? defaults.contact_id ?? "",
    owner_id: lead?.owner_id ?? ws.userId, tour_interest: lead?.tour_interest ?? "", group_size: lead?.group_size?.toString() ?? "",
    preferred_date: lead?.preferred_date ?? "", preferred_language: lead?.preferred_language ?? "", budget: lead?.budget?.toString() ?? "",
    duration_hours: lead?.duration_hours?.toString() ?? "", follow_up_at: toLocalInput(lead?.follow_up_at), source: lead?.source ?? (defaults.conversation ? "conversation" : "manual"),
    notes: lead?.notes ?? "", lost_reason: lead?.lost_reason ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setV = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr(null);
    const p = schema.safeParse(f);
    if (!p.success) return setErr(p.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    try {
      const v = emptyToNull({ ...p.data }) as Record<string, string | null>;
      const payload = {
        title: v.title!, stage: p.data.stage, contact_id: v.contact_id, owner_id: v.owner_id, tour_interest: v.tour_interest,
        group_size: v.group_size ? +v.group_size : null, preferred_date: v.preferred_date, preferred_language: v.preferred_language,
        budget: v.budget ? +v.budget : null, duration_hours: v.duration_hours ? +v.duration_hours : null,
        follow_up_at: fromLocalInput(f.follow_up_at), source: v.source, notes: v.notes, lost_reason: p.data.stage === "lost" ? v.lost_reason : null,
      };
      if (lead) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
        if (lead.stage !== p.data.stage) await supabase.from("lead_activities").insert({ workspace_id: ws.workspaceId, lead_id: lead.id, kind: "stage_change", body: `${LEAD_STAGE_META[lead.stage].label} → ${LEAD_STAGE_META[p.data.stage].label}` });
        toast.success("Lead saved");
      } else {
        const { data, error } = await supabase.from("leads").insert({ ...payload, workspace_id: ws.workspaceId }).select("id").single();
        if (error) throw error;
        await supabase.from("lead_activities").insert({ workspace_id: ws.workspaceId, lead_id: data.id, kind: "created", body: null });
        if (defaults.conversation) await supabase.from("conversations").update({ lead_id: data.id }).eq("id", defaults.conversation);
        toast.success("Lead created");
        onClose();
      }
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }
  async function addNote() {
    if (!lead || !note.trim()) return;
    const { error } = await supabase.from("lead_activities").insert({ workspace_id: ws.workspaceId, lead_id: lead.id, kind: "note", body: note.trim().slice(0, 5000) });
    if (error) return toast.error(error.message);
    setNote("");
    onSaved();
  }
  async function del() {
    if (!lead) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success("Lead deleted");
    onSaved();
    onClose();
  }

  return (
    <div className="space-y-4">
      <SheetHeader><SheetTitle className="flex items-center gap-2">{lead ? "Lead" : "New lead"}<SampleBadge show={lead?.is_demo} /></SheetTitle></SheetHeader>
      <p className="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Only record details the customer actually gave you. Leave unknown fields empty.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title *" htmlFor="l-title" className="sm:col-span-2"><Input id="l-title" value={f.title} onChange={set("title")} placeholder="e.g. Family tour, 4 guests" /></Field>
        <Field label="Stage" htmlFor="l-stage"><NativeSelect id="l-stage" value={f.stage} onChange={set("stage")}>{LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>)}</NativeSelect></Field>
        <Field label="Owner" htmlFor="l-owner"><MemberSelect id="l-owner" value={f.owner_id} onChange={setV("owner_id")} /></Field>
        <Field label="Contact" htmlFor="l-contact" className="sm:col-span-2"><ContactSelect id="l-contact" value={f.contact_id} onChange={setV("contact_id")} /></Field>
        <Field label="Tour interest" htmlFor="l-tour"><Input id="l-tour" value={f.tour_interest} onChange={set("tour_interest")} /></Field>
        <Field label="Group size" htmlFor="l-gs"><Input id="l-gs" inputMode="numeric" value={f.group_size} onChange={set("group_size")} /></Field>
        <Field label="Preferred date" htmlFor="l-date"><Input id="l-date" type="date" value={f.preferred_date} onChange={set("preferred_date")} /></Field>
        <Field label="Duration (hours)" htmlFor="l-dur"><Input id="l-dur" inputMode="decimal" value={f.duration_hours} onChange={set("duration_hours")} /></Field>
        <Field label="Language" htmlFor="l-lang"><Input id="l-lang" value={f.preferred_language} onChange={set("preferred_language")} /></Field>
        <Field label="Budget (EUR)" htmlFor="l-budget"><Input id="l-budget" inputMode="decimal" value={f.budget} onChange={set("budget")} /></Field>
        <Field label="Follow up at" htmlFor="l-fu"><Input id="l-fu" type="datetime-local" value={f.follow_up_at} onChange={set("follow_up_at")} /></Field>
        <Field label="Source" htmlFor="l-src"><Input id="l-src" value={f.source} onChange={set("source")} /></Field>
        {f.stage === "lost" && <Field label="Reason lost *" htmlFor="l-lost" className="sm:col-span-2"><Input id="l-lost" value={f.lost_reason} onChange={set("lost_reason")} /></Field>}
        <Field label="Notes" htmlFor="l-notes" className="sm:col-span-2"><Textarea id="l-notes" rows={3} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      {err && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save} disabled={busy}>{lead ? "Save changes" : "Create lead"}</Button>
        {lead && canDelete && <Confirm trigger={<Button variant="outline" size="icon" aria-label="Delete lead"><Trash2 /></Button>} title="Delete lead?" description="This lead and its activity history will be deleted." confirmLabel="Delete" onConfirm={del} />}
      </div>
      {lead && (
        <>
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Linked</h3>
            {convs.map((c) => <Link key={c.id} to="/inbox" search={{ c: c.id }} className="block text-sm text-primary hover:underline">Conversation: {c.subject || "Untitled"}</Link>)}
            {bookings.map((b) => <Link key={b.id} to="/bookings" search={{ b: b.id }} className="block text-sm text-primary hover:underline">Booking {b.reference} · {b.tour_name}</Link>)}
            <Link to="/bookings" search={{ new: true, lead: lead.id, contact: lead.contact_id ?? undefined }} className="inline-block text-sm font-medium text-primary hover:underline">+ Create booking from this lead</Link>
          </div>
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Activity</h3>
            <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" /><Button variant="outline" onClick={addNote} disabled={!note.trim()}>Add</Button></div>
            <ul className="space-y-2">
              {acts.map((a) => (
                <li key={a.id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <div className="text-xs text-muted-foreground">{ws.memberName(a.actor_id)} · {fmtDateTime(a.created_at)}</div>
                  <div>{a.kind === "created" ? "Lead created" : a.body}</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
