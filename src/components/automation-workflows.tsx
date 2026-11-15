import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Workflow as WorkflowIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { EmptyState, Panel } from "@/components/states";
import { NativeSelect, fmtDateTime } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CHANNEL_LABEL, type ChannelType } from "@/lib/domain";
import { TRIGGERS, Workflow, type Action, type Trigger } from "@/lib/automation";

type Row = { id: string; name: string; enabled: boolean; trigger: Trigger; conditions: Record<string, string>; actions: Action[]; delay_minutes: number };

const ACTION_LABEL: Record<Action["type"], string> = {
  send_message: "Send a message to the customer",
  notify: "Notify the team",
  assign: "Assign the conversation",
  add_tag: "Add a tag",
  set_priority: "Set priority",
  create_task: "Create a task",
};

const RECIPES: { name: string; trigger: Trigger; conditions: Record<string, string>; actions: Action[]; delay_minutes: number }[] = [
  { name: "Booking confirmation", trigger: "booking_confirmed", conditions: {}, delay_minutes: 0, actions: [{ type: "send_message", text: "Hi {{contact_name}}, your booking {{booking_reference}} for {{tour_name}} on {{tour_date}} {{start_time}} is confirmed. See you soon! — {{business_name}}" }] },
  { name: "Ask for a review", trigger: "booking_completed", conditions: {}, delay_minutes: 120, actions: [{ type: "send_message", text: "Thank you for choosing {{business_name}}, {{contact_name}}! We'd love a short review of your experience." }] },
  { name: "Unhappy customer alert", trigger: "message_received", conditions: { keyword: "refund, complaint, angry, terrible, reembolso, reclamação" }, delay_minutes: 0, actions: [{ type: "set_priority", priority: "urgent" }, { type: "notify", to: "managers", text: "Possible unhappy customer: {{contact_name}}" }] },
  { name: "Follow up new leads", trigger: "lead_created", conditions: {}, delay_minutes: 0, actions: [{ type: "create_task", title: "Follow up with {{contact_name}}", due_hours: 24 }] },
];

/** Workflow builder: trigger → conditions → actions, optional delay. Runs in the background job. */
export function AutomationWorkflows() {
  const ws = useWorkspace();
  const admin = ws.role === "admin";
  const [draft, setDraft] = useState<(typeof RECIPES)[number] | null>(null);
  const list = useQuery({
    queryKey: ["workflows", ws.workspaceId],
    queryFn: async () => ((await supabase.from("automation_workflows").select("id, name, enabled, trigger, conditions, actions, delay_minutes").eq("workspace_id", ws.workspaceId).order("created_at")).data ?? []) as unknown as Row[],
  });
  const history = useQuery({
    queryKey: ["workflow-events", ws.workspaceId],
    queryFn: async () => (await supabase.from("automation_events").select("id, workflow_id, status, error, created_at, finished_at, attempts").eq("workspace_id", ws.workspaceId).order("created_at", { ascending: false }).limit(25)).data ?? [],
  });
  const nameOf = (id: string) => list.data?.find((w) => w.id === id)?.name ?? "Deleted workflow";

  async function save() {
    if (!draft) return;
    const parsed = Workflow.safeParse({ ...draft, conditions: Object.fromEntries(Object.entries(draft.conditions).filter(([, v]) => v)) });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Check the workflow");
    const { error } = await supabase.from("automation_workflows").insert({ workspace_id: ws.workspaceId, ...parsed.data, conditions: parsed.data.conditions as never, actions: parsed.data.actions as never });
    if (error) return toast.error(error.message);
    toast.success("Workflow created"); setDraft(null); list.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Workflows</h2>
        {admin && !draft && <Button size="sm" onClick={() => setDraft({ name: "", trigger: "message_received", conditions: {}, actions: [{ type: "notify", to: "managers", text: "New message from {{contact_name}}" }], delay_minutes: 0 })}><Plus /> New workflow</Button>}
      </div>
      {admin && !draft && (
        <div className="flex flex-wrap gap-2">
          {RECIPES.map((r) => <Button key={r.name} size="sm" variant="outline" onClick={() => setDraft(structuredClone(r))}>{r.name}</Button>)}
        </div>
      )}
      {draft && <Builder draft={draft} setDraft={setDraft} onSave={save} members={ws.members.filter((m) => m.active)} />}

      <Panel>
        {!list.data?.length ? <EmptyState icon={<WorkflowIcon />} title="No workflows yet" description={admin ? "Start from a recipe above." : "A Business Admin can create workflows."} /> : (
          <ul className="divide-y">{list.data.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{w.name}</div>
                <div className="text-xs text-muted-foreground">
                  {TRIGGERS[w.trigger]}{w.delay_minutes ? ` · wait ${w.delay_minutes >= 60 ? `${Math.round(w.delay_minutes / 60)} h` : `${w.delay_minutes} min`}` : ""} → {w.actions.map((a) => ACTION_LABEL[a.type]).join(", ")}
                </div>
              </div>
              <Switch checked={w.enabled} disabled={!admin} aria-label={`Enable ${w.name}`} onCheckedChange={async (v) => { const { error } = await supabase.from("automation_workflows").update({ enabled: v }).eq("id", w.id); if (error) toast.error(error.message); else list.refetch(); }} />
              {admin && <Button size="icon" variant="ghost" aria-label={`Delete ${w.name}`} onClick={async () => { if (!window.confirm("Delete this workflow?")) return; const { error } = await supabase.from("automation_workflows").delete().eq("id", w.id); if (error) toast.error(error.message); else list.refetch(); }}><Trash2 /></Button>}
            </li>
          ))}</ul>
        )}
      </Panel>

      {!!history.data?.length && (
        <Panel>
          <h3 className="border-b px-4 py-3 text-sm font-semibold">Execution history</h3>
          <ul className="divide-y text-sm">{history.data.map((e: any) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate">{nameOf(e.workflow_id)}{e.error ? <span className="text-destructive"> · {e.error}</span> : null}</span>
              <Badge variant={e.status === "done" ? "default" : e.status === "failed" ? "destructive" : "outline"}>{e.status}{e.attempts > 1 ? ` ×${e.attempts}` : ""}</Badge>
              <span className="text-xs text-muted-foreground">{fmtDateTime(e.finished_at ?? e.created_at)}</span>
            </li>
          ))}</ul>
        </Panel>
      )}
    </div>
  );
}

function Builder({ draft, setDraft, onSave, members }: { draft: (typeof RECIPES)[number]; setDraft: (d: (typeof RECIPES)[number] | null) => void; onSave: () => void; members: { user_id: string; full_name: string | null; email: string | null }[] }) {
  const set = (p: Partial<typeof draft>) => setDraft({ ...draft, ...p });
  const setCond = (k: string, v: string) => set({ conditions: { ...draft.conditions, [k]: v } });
  const setAction = (i: number, a: Action) => set({ actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  const conv = draft.trigger === "conversation_created" || draft.trigger === "message_received";
  const blank = (type: Action["type"]): Action => type === "send_message" ? { type, text: "" } : type === "notify" ? { type, to: "managers", text: "" } : type === "assign" ? { type, user_id: members[0]?.user_id ?? "" } : type === "add_tag" ? { type, tag: "" } : type === "set_priority" ? { type, priority: "high" } : { type, title: "", due_hours: 24 };
  return (
    <Panel className="space-y-3 p-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">New workflow</h3><Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setDraft(null)}><X /></Button></div>
      <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Workflow name" maxLength={100} aria-label="Workflow name" />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">When
          <NativeSelect className="mt-1" value={draft.trigger} onChange={(e) => set({ trigger: e.target.value as Trigger, conditions: {} })}>
            {(Object.keys(TRIGGERS) as Trigger[]).map((t) => <option key={t} value={t}>{TRIGGERS[t]}</option>)}
          </NativeSelect>
        </label>
        <label className="text-xs font-medium">Wait before acting (minutes)
          <Input className="mt-1" type="number" min={0} max={43200} value={draft.delay_minutes} onChange={(e) => set({ delay_minutes: Math.max(0, Math.min(43200, Number(e.target.value) || 0)) })} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {conv && <label className="text-xs font-medium">Only on channel
          <NativeSelect className="mt-1" value={draft.conditions.channel ?? ""} onChange={(e) => setCond("channel", e.target.value)}>
            <option value="">Any channel</option>{(Object.keys(CHANNEL_LABEL) as ChannelType[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </NativeSelect></label>}
        {(draft.trigger === "message_received" || draft.trigger === "lead_created") && <label className="text-xs font-medium">Only if text contains (comma-separated)
          <Input className="mt-1" value={draft.conditions.keyword ?? ""} onChange={(e) => setCond("keyword", e.target.value)} placeholder="price, availability" /></label>}
        {draft.trigger.startsWith("booking_") && <label className="text-xs font-medium">Only if tour/service contains
          <Input className="mt-1" value={draft.conditions.tour_contains ?? ""} onChange={(e) => setCond("tour_contains", e.target.value)} /></label>}
      </div>
      <div className="space-y-2">
        <div className="text-xs font-medium">Then</div>
        {draft.actions.map((a, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-2">
            <div className="flex gap-2">
              <NativeSelect value={a.type} onChange={(e) => setAction(i, blank(e.target.value as Action["type"]))} aria-label="Action">
                {(Object.keys(ACTION_LABEL) as Action["type"][]).map((t) => <option key={t} value={t}>{ACTION_LABEL[t]}</option>)}
              </NativeSelect>
              {draft.actions.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove action" onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}><Trash2 /></Button>}
            </div>
            {(a.type === "send_message" || a.type === "notify") && <textarea className="min-h-16 w-full rounded-lg border bg-card p-2 text-sm" value={a.text} maxLength={a.type === "notify" ? 300 : 2000} onChange={(e) => setAction(i, { ...a, text: e.target.value })} aria-label="Text" />}
            {a.type === "notify" && <NativeSelect value={a.to} onChange={(e) => setAction(i, { ...a, to: e.target.value })} aria-label="Who to notify"><option value="managers">Admins & managers</option><option value="assignee">Assigned person</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect>}
            {a.type === "assign" && <NativeSelect value={a.user_id} onChange={(e) => setAction(i, { ...a, user_id: e.target.value })} aria-label="Assign to">{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</NativeSelect>}
            {a.type === "add_tag" && <Input value={a.tag} maxLength={40} onChange={(e) => setAction(i, { ...a, tag: e.target.value })} placeholder="Tag name" aria-label="Tag" />}
            {a.type === "set_priority" && <NativeSelect value={a.priority} onChange={(e) => setAction(i, { ...a, priority: e.target.value as "low" })} aria-label="Priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></NativeSelect>}
            {a.type === "create_task" && <Input value={a.title} maxLength={200} onChange={(e) => setAction(i, { ...a, title: e.target.value })} placeholder="Task title" aria-label="Task title" />}
            {(a.type === "send_message" || a.type === "create_task" || a.type === "notify") && <p className="text-[11px] text-muted-foreground">Placeholders: {"{{contact_name}} {{booking_reference}} {{tour_name}} {{tour_date}} {{start_time}} {{business_name}}"}</p>}
          </div>
        ))}
        {draft.actions.length < 10 && <Button size="sm" variant="outline" onClick={() => set({ actions: [...draft.actions, blank("notify")] })}><Plus /> Add action</Button>}
      </div>
      {draft.actions.some((a) => a.type === "send_message") && <p className="rounded-lg bg-warning-soft p-2 text-xs">This workflow sends real messages to customers from the account they contacted. WhatsApp only allows free-text replies within 24 h of the customer's last message.</p>}
      <Button onClick={onSave}>Save workflow</Button>
    </Panel>
  );
}
