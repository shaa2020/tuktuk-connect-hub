import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2, Merge, EyeOff, MessageSquare, Target, CalendarCheck, ShieldCheck, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, ListSkeleton, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, Confirm, NativeSelect, SampleBadge, ToneBadge, fmtDate, fmtDateTime } from "@/components/kit";
import { ContactFormDialog } from "@/components/contact-form";
import { BOOKING_STATUS_META, CHANNEL_LABEL, LEAD_STAGE_META, STATUS_META, canDeleteContacts } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  head: () => ({ meta: [{ title: "Contact — TeamInbox" }, { name: "description", content: "Contact details and history." }] }),
  component: ContactDetail,
});

function ContactDetail() {
  const { id } = Route.useParams();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);
  const [merge, setMerge] = useState(false);

  const q = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const [c, conv, leads, bookings, consents] = await Promise.all([
        supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
        supabase.from("conversations").select("id, channel, subject, status, last_message_at, last_message_preview").eq("contact_id", id).order("last_message_at", { ascending: false }).limit(20),
        supabase.from("leads").select("id, title, stage, preferred_date").eq("contact_id", id).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id, reference, tour_name, tour_date, status").eq("contact_id", id).order("tour_date", { ascending: false }),
        supabase.from("contact_consents").select("*").eq("contact_id", id).order("recorded_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      return { c: c.data, conv: conv.data ?? [], leads: leads.data ?? [], bookings: bookings.data ?? [], consents: consents.data ?? [] };
    },
  });

  if (q.isLoading) return <PageContainer><ListSkeleton /></PageContainer>;
  if (q.error) return <PageContainer><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></PageContainer>;
  const d = q.data!;
  if (!d.c) return <PageContainer><ErrorState message="This contact doesn't exist or you don't have access to it." /></PageContainer>;
  const c = d.c;
  const canDel = canDeleteContacts(ws.role);

  async function del() {
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Contact deleted");
    qc.invalidateQueries({ queryKey: ["contacts"] });
    navigate({ to: "/contacts" });
  }
  // Guest data request (GDPR): everything this contact has, readable under the caller's access rules.
  async function exportData() {
    const [contact, convs, leads, bookings, consents] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", id).maybeSingle(),
      supabase.from("conversations").select("id, channel, subject, status, created_at").eq("contact_id", id),
      supabase.from("leads").select("*").eq("contact_id", id),
      supabase.from("bookings").select("*").eq("contact_id", id),
      supabase.from("contact_consents").select("*").eq("contact_id", id),
    ]);
    const ids = (convs.data ?? []).map((c) => c.id);
    const msgs = ids.length ? (await supabase.from("messages").select("conversation_id, direction, body, created_at").in("conversation_id", ids).order("created_at")).data : [];
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), contact: contact.data, consents: consents.data, conversations: convs.data, messages: msgs, leads: leads.data, bookings: bookings.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `guest-data-${id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await supabase.from("audit_logs").insert({ workspace_id: ws.workspaceId, actor_id: ws.userId, action: "export", entity_type: "contacts", entity_id: id, details: {} });
    toast.success("Guest data downloaded");
  }

  async function anonymize() {
    const { error } = await supabase.rpc("anonymize_contact", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Contact anonymized");
    q.refetch();
  }
  // Latest consent per purpose
  const latest = new Map<string, (typeof d.consents)[number]>();
  for (const r of d.consents) if (!latest.has(r.purpose)) latest.set(r.purpose, r);

  return (
    <PageContainer>
      <Link to="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Contacts</Link>
      {c.merged_into && (
        <div className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
          This contact was merged. <Link to="/contacts/$id" params={{ id: c.merged_into }} className="font-semibold underline">Open the kept contact</Link>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={c.full_name} className="size-12 text-sm" />
          <div>
            <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{c.full_name}</h1><SampleBadge show={c.is_demo} /></div>
            <p className="text-sm text-muted-foreground">Added {fmtDate(c.created_at)} · Last interaction {c.last_interaction_at ? fmtDateTime(c.last_interaction_at) : "none yet"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!c.anonymized_at && <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}
          {canDel && <Button variant="outline" size="sm" onClick={() => setMerge(true)}><Merge /> Merge duplicate</Button>}
          {canDel && <Button variant="outline" size="sm" onClick={exportData}><Download /> Export data</Button>}
          {canDel && !c.anonymized_at && (
            <Confirm trigger={<Button variant="outline" size="sm"><EyeOff /> Anonymize</Button>} title="Anonymize this contact?"
              description="Name, email, phone, country and notes will be permanently removed. Conversations and bookings stay for reporting." confirmLabel="Anonymize" onConfirm={anonymize} />
          )}
          {canDel && (
            <Confirm trigger={<Button variant="outline" size="sm" className="text-destructive"><Trash2 /> Delete</Button>} title="Delete this contact?"
              description="The contact is deleted. Linked conversations, leads and bookings are kept but unlinked. This can't be undone." confirmLabel="Delete" onConfirm={del} />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold">Details</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Preferred name", c.preferred_name], ["Email", c.email], ["Phone", c.phone],
              ["Language", c.preferred_language], ["Country", c.country], ["Assigned to", ws.memberName(c.assigned_to)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right font-medium">{v || "—"}</dd></div>
            ))}
          </dl>
          {c.notes && <div className="mt-4 rounded-lg bg-note p-3 text-sm whitespace-pre-wrap">{c.notes}</div>}
        </Panel>

        <div className="space-y-4 lg:col-span-2">
          <Section icon={<MessageSquare />} title="Conversations" empty="No conversations linked.">
            {d.conv.map((v) => (
              <Link key={v.id} to="/inbox" search={{ c: v.id }} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/60">
                <div className="min-w-0"><div className="truncate text-sm font-medium">{v.subject || CHANNEL_LABEL[v.channel]}</div><div className="truncate text-xs text-muted-foreground">{v.last_message_preview}</div></div>
                <ToneBadge tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</ToneBadge>
              </Link>
            ))}
          </Section>
          <Section icon={<Target />} title="Leads" empty="No leads.">
            {d.leads.map((l) => (
              <Link key={l.id} to="/leads" search={{ l: l.id }} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/60">
                <span className="truncate text-sm font-medium">{l.title}</span>
                <ToneBadge tone={LEAD_STAGE_META[l.stage].tone}>{LEAD_STAGE_META[l.stage].label}</ToneBadge>
              </Link>
            ))}
          </Section>
          <Section icon={<CalendarCheck />} title="Bookings" empty="No bookings.">
            {d.bookings.map((b) => (
              <Link key={b.id} to="/bookings" search={{ b: b.id }} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/60">
                <span className="truncate text-sm"><span className="font-mono text-xs text-muted-foreground">{b.reference}</span> · {b.tour_name} · {fmtDate(b.tour_date)}</span>
                <ToneBadge tone={BOOKING_STATUS_META[b.status].tone}>{BOOKING_STATUS_META[b.status].label}</ToneBadge>
              </Link>
            ))}
          </Section>
          <ConsentPanel contactId={id} latest={latest} onSaved={() => q.refetch()} />
        </div>
      </div>
      {edit && (
        <ContactFormDialog open={edit} onOpenChange={setEdit} contactId={id}
          initial={{ full_name: c.full_name, preferred_name: c.preferred_name ?? "", email: c.email ?? "", phone: c.phone ?? "", preferred_language: c.preferred_language ?? "", country: c.country ?? "", notes: c.notes ?? "", assigned_to: c.assigned_to ?? "" }} />
      )}
      {merge && <MergeDialog keepId={id} keepName={c.full_name} onClose={() => setMerge(false)} onDone={() => { setMerge(false); q.refetch(); }} />}
    </PageContainer>
  );
}

function Section({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Panel>
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">{icon}{title}</div>
      {children.length ? <div className="divide-y">{children}</div> : <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>}
    </Panel>
  );
}

const PURPOSES = [
  ["service_messages", "Service messages"], ["marketing", "Marketing"], ["whatsapp", "WhatsApp"], ["email", "Email"], ["sms", "SMS"],
] as const;

function ConsentPanel({ contactId, latest, onSaved }: { contactId: string; latest: Map<string, { granted: boolean; recorded_at: string; source: string | null }>; onSaved: () => void }) {
  const { workspaceId } = useWorkspace();
  async function record(purpose: string, granted: boolean) {
    const source = prompt("How was this consent given? (e.g. verbal on phone, booking form)") ?? "";
    const { error } = await supabase.from("contact_consents").insert({ workspace_id: workspaceId, contact_id: contactId, purpose, granted, source: source.slice(0, 200) || null });
    if (error) return toast.error(error.message);
    toast.success("Consent recorded");
    onSaved();
  }
  return (
    <Panel>
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold"><ShieldCheck className="size-4 text-muted-foreground" />Communication preferences</div>
      <ul className="divide-y">
        {PURPOSES.map(([k, label]) => {
          const r = latest.get(k);
          return (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-muted-foreground">{r ? `${r.granted ? "Granted" : "Refused"} · ${fmtDateTime(r.recorded_at)}${r.source ? ` · ${r.source}` : ""}` : "Not recorded"}</div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant={r?.granted ? "teal" : "outline"} onClick={() => record(k, true)}>Granted</Button>
                <Button size="sm" variant={r && !r.granted ? "destructive" : "outline"} onClick={() => record(k, false)}>Refused</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MergeDialog({ keepId, keepName, onClose, onDone }: { keepId: string; keepName: string; onClose: () => void; onDone: () => void }) {
  const { workspaceId } = useWorkspace();
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState("");
  const t = term.trim().replace(/[%,()]/g, "");
  const q = useQuery({
    queryKey: ["merge-search", t],
    enabled: t.length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("id, full_name, email, phone").eq("workspace_id", workspaceId).is("merged_into", null).neq("id", keepId)
        .or(`full_name.ilike.%${t}%,email.ilike.%${t}%,phone.ilike.%${t}%`).limit(10);
      return data ?? [];
    },
  });
  const chosen = q.data?.find((x) => x.id === sel);
  async function go() {
    const { error } = await supabase.rpc("merge_contacts", { _keep: keepId, _merge: sel });
    if (error) return toast.error(error.message);
    toast.success("Contacts merged");
    onDone();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge a duplicate into {keepName}</DialogTitle>
          <DialogDescription>Only merge when you're sure it's the same person — a matching name alone isn't enough. Check the email or phone.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search the duplicate by name, email or phone" value={term} onChange={(e) => setTerm(e.target.value)} />
        <NativeSelect value={sel} onChange={(e) => setSel(e.target.value)} size={Math.min(6, (q.data?.length ?? 0) + 1)} className="h-auto py-1">
          <option value="">{q.data?.length ? "Choose a contact…" : "Type at least 2 characters"}</option>
          {q.data?.map((x) => <option key={x.id} value={x.id}>{x.full_name} — {x.email || x.phone || "no email/phone"}</option>)}
        </NativeSelect>
        {chosen && (
          <Confirm trigger={<Button className="w-full">Merge "{chosen.full_name}" into this contact</Button>}
            title="Confirm merge" description={`All conversations, leads, bookings and consents of "${chosen.full_name}" will move to "${keepName}". The duplicate will be marked as merged.`}
            confirmLabel="Merge" destructive={false} onConfirm={go} />
        )}
      </DialogContent>
    </Dialog>
  );
}
