import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CheckSquare, Circle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Confirm, Field, NativeSelect, SampleBadge, ToneBadge, fmtDateTime, fromLocalInput, toLocalInput } from "@/components/kit";
import { ContactSelect, LeadSelect, BookingSelect, MemberSelect } from "@/components/pickers";
import { PRIORITY_META, type Priority } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  validateSearch: z.object({ new: z.boolean().optional(), conversation: z.string().optional(), contact: z.string().optional(), lead: z.string().optional() }),
  head: () => ({ meta: [{ title: "Tasks — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Follow-ups and team tasks." }] }),
  component: TasksPage,
});

type Tab = "mine" | "team" | "overdue" | "done";

function TasksPage() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>("mine");
  const [edit, setEdit] = useState<string | "new" | null>(search.new ? "new" : null);

  const q = useQuery({
    queryKey: ["tasks", ws.workspaceId, tab],
    queryFn: async () => {
      let r = supabase.from("tasks").select("*, contacts(full_name)").eq("workspace_id", ws.workspaceId).limit(300);
      if (tab === "done") r = r.eq("status", "done").order("completed_at", { ascending: false });
      else {
        r = r.eq("status", "open").order("due_at", { ascending: true, nullsFirst: false });
        if (tab === "mine") r = r.eq("assigned_to", ws.userId);
        if (tab === "overdue") r = r.lt("due_at", new Date().toISOString());
      }
      const { data, error } = await r;
      if (error) throw error;
      return data;
    },
  });

  async function toggle(id: string, done: boolean) {
    const { error } = await supabase.from("tasks").update({ status: done ? "open" : "done" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(done ? "Task reopened" : "Task completed");
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const tabs: [Tab, string][] = [["mine", "My tasks"], ["team", "Team"], ["overdue", "Overdue"], ["done", "Completed"]];
  return (
    <PageContainer>
      <PageHeader title="Tasks" description="Follow-ups for your team." actions={<Button size="sm" onClick={() => setEdit("new")}><Plus /> New task</Button>} />
      <div className="scrollbar-none mb-3 flex gap-1 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-medium", tab === k ? "bg-navy text-navy-foreground" : "bg-card text-muted-foreground border")}>{l}</button>
        ))}
      </div>
      <Panel>
        {q.isLoading ? <ListSkeleton /> : q.error ? <div className="p-4"><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></div> :
          !q.data?.length ? <EmptyState icon={<CheckSquare />} title={tab === "overdue" ? "Nothing overdue" : "No tasks here"} description="Create a task to track a follow-up." /> : (
            <ul className="divide-y">
              {q.data.map((t) => {
                const done = t.status === "done";
                const overdue = !done && t.due_at && new Date(t.due_at) < new Date();
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <button onClick={() => toggle(t.id, done)} aria-label={done ? "Reopen task" : "Complete task"} className="mt-0.5 text-muted-foreground hover:text-primary">
                      {done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
                    </button>
                    <button onClick={() => setEdit(t.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{t.title}</span>
                        {t.priority !== "normal" && <ToneBadge tone={PRIORITY_META[t.priority].tone}>{PRIORITY_META[t.priority].label}</ToneBadge>}
                        {overdue && <ToneBadge tone="danger">Overdue</ToneBadge>}
                        <SampleBadge show={t.is_demo} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {ws.memberName(t.assigned_to)}{t.due_at ? ` · Due ${fmtDateTime(t.due_at)}` : ""}{t.contacts?.full_name ? ` · ${t.contacts.full_name}` : ""}
                        {done && t.completed_at ? ` · Done ${fmtDateTime(t.completed_at)}` : ""}
                      </div>
                    </button>
                    {t.conversation_id && <Link to="/inbox" search={{ c: t.conversation_id }} className="text-xs font-medium text-primary">Chat</Link>}
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>
      {edit && <TaskDialog id={edit === "new" ? undefined : edit} defaults={search} onClose={() => setEdit(null)} />}
    </PageContainer>
  );
}

export function TaskDialog({ id, defaults, onClose }: { id?: string; defaults?: { conversation?: string; contact?: string; lead?: string }; onClose: () => void }) {
  const q = useQuery({ queryKey: ["task", id], enabled: !!id, queryFn: async () => (await supabase.from("tasks").select("*").eq("id", id!).maybeSingle()).data });
  if (id && q.isLoading) return null;
  return <TaskForm key={q.data?.updated_at ?? "new"} t={q.data ?? undefined} defaults={defaults ?? {}} onClose={onClose} />;
}

function TaskForm({ t, defaults, onClose }: { t?: { id: string; title: string; description: string | null; assigned_to: string | null; due_at: string | null; priority: Priority; contact_id: string | null; lead_id: string | null; booking_id: string | null; conversation_id: string | null; created_by: string | null }; defaults: { conversation?: string; contact?: string; lead?: string }; onClose: () => void }) {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const [f, setF] = useState({
    title: t?.title ?? "", description: t?.description ?? "", assigned_to: t?.assigned_to ?? ws.userId, due_at: toLocalInput(t?.due_at),
    priority: (t?.priority ?? "normal") as Priority, contact_id: t?.contact_id ?? defaults.contact ?? "", lead_id: t?.lead_id ?? defaults.lead ?? "", booking_id: t?.booking_id ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setV = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr(null);
    if (!f.title.trim() || f.title.length > 200) return setErr("Title is required (max 200 characters)");
    const payload = {
      title: f.title.trim(), description: f.description.trim() || null, assigned_to: f.assigned_to || null, due_at: fromLocalInput(f.due_at),
      priority: f.priority, contact_id: f.contact_id || null, lead_id: f.lead_id || null, booking_id: f.booking_id || null,
    };
    try {
      if (t) { const { error } = await supabase.from("tasks").update(payload).eq("id", t.id); if (error) throw error; }
      else { const { error } = await supabase.from("tasks").insert({ ...payload, workspace_id: ws.workspaceId, conversation_id: defaults.conversation ?? null }); if (error) throw error; }
      toast.success(t ? "Task saved" : "Task created");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }
  async function del() {
    if (!t) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tasks"] });
    onClose();
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title *" htmlFor="t-title" className="sm:col-span-2"><Input id="t-title" value={f.title} onChange={set("title")} /></Field>
          <Field label="Assigned to" htmlFor="t-assign"><MemberSelect id="t-assign" value={f.assigned_to} onChange={setV("assigned_to")} /></Field>
          <Field label="Priority" htmlFor="t-pri"><NativeSelect id="t-pri" value={f.priority} onChange={set("priority")}>{(Object.keys(PRIORITY_META) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}</NativeSelect></Field>
          <Field label="Due" htmlFor="t-due" className="sm:col-span-2"><Input id="t-due" type="datetime-local" value={f.due_at} onChange={set("due_at")} /></Field>
          <Field label="Contact" htmlFor="t-contact" className="sm:col-span-2"><ContactSelect id="t-contact" value={f.contact_id} onChange={setV("contact_id")} /></Field>
          <Field label="Lead" htmlFor="t-lead"><LeadSelect id="t-lead" value={f.lead_id} onChange={setV("lead_id")} /></Field>
          <Field label="Booking" htmlFor="t-booking"><BookingSelect id="t-booking" value={f.booking_id} onChange={setV("booking_id")} /></Field>
          <Field label="Description" htmlFor="t-desc" className="sm:col-span-2"><Textarea id="t-desc" rows={3} value={f.description} onChange={set("description")} /></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">Reminders by push or email aren't set up yet — overdue tasks are highlighted here and on the dashboard.</p>
        {err && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{err}</p>}
        <DialogFooter className="gap-2">
          {t && <Confirm trigger={<Button variant="outline" className="text-destructive"><Trash2 /> Delete</Button>} title="Delete task?" description="This task will be deleted." confirmLabel="Delete" onConfirm={del} />}
          <Button onClick={save}>{t ? "Save" : "Create task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
