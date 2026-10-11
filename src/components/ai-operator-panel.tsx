import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bot, Play, AlertTriangle, MessageSquare, CalendarPlus, UserCheck, Bell, Hand } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, fmtDateTime } from "@/components/kit";
import { MemberSelect } from "@/components/pickers";
import { runOperatorNow } from "@/lib/ai-operator.functions";

type Settings = {
  away_mode: boolean; allow_reply: boolean; allow_booking: boolean; allow_assign: boolean; allow_alert: boolean;
  default_assignee: string | null; max_replies: number; notes: string; paused_reason: string | null; last_run_at: string | null;
};
const DEFAULTS: Settings = { away_mode: false, allow_reply: true, allow_booking: true, allow_assign: true, allow_alert: true, default_assignee: null, max_replies: 6, notes: "", paused_reason: null, last_run_at: null };

const KIND_ICON: Record<string, React.ReactNode> = {
  reply: <MessageSquare className="size-4 text-primary" />, booking: <CalendarPlus className="size-4 text-teal" />,
  assign: <UserCheck className="size-4 text-muted-foreground" />, handoff: <Hand className="size-4 text-warning" />,
  suggest: <MessageSquare className="size-4 text-muted-foreground" />, error: <AlertTriangle className="size-4 text-destructive" />,
  paused: <AlertTriangle className="size-4 text-destructive" />,
};

export function AiOperatorPanel() {
  const ws = useWorkspace();
  const canEdit = ws.role === "admin" || ws.role === "manager";
  const run = useServerFn(runOperatorNow);
  const [form, setForm] = useState<Settings>(DEFAULTS);
  const [running, setRunning] = useState(false);

  const q = useQuery({
    queryKey: ["ai-operator", ws.workspaceId],
    queryFn: async () => {
      const [s, ai] = await Promise.all([
        supabase.from("ai_operator_settings").select("*").eq("workspace_id", ws.workspaceId).maybeSingle(),
        supabase.from("ai_settings").select("enabled").eq("workspace_id", ws.workspaceId).maybeSingle(),
      ]);
      if (s.error) throw s.error;
      return { settings: (s.data as Settings | null) ?? DEFAULTS, aiEnabled: !!ai.data?.enabled };
    },
  });
  const log = useQuery({
    queryKey: ["ai-operator-log", ws.workspaceId],
    refetchInterval: 30_000,
    queryFn: async () => (await supabase.from("ai_operator_log").select("id, kind, summary, conversation_id, created_at").eq("workspace_id", ws.workspaceId).order("created_at", { ascending: false }).limit(30)).data ?? [],
  });
  useEffect(() => { if (q.data) setForm(q.data.settings); }, [q.data]);

  async function save(patch: Partial<Settings>) {
    const next = { ...form, ...patch };
    setForm(next);
    const { paused_reason: _p, last_run_at: _l, ...rest } = next;
    const extra = patch.away_mode !== undefined ? { paused_reason: null } : {};
    const { error } = await supabase.from("ai_operator_settings").upsert({ workspace_id: ws.workspaceId, ...rest, ...extra, updated_by: ws.userId ?? null });
    if (error) { toast.error(error.message); q.refetch(); return; }
    if (patch.away_mode !== undefined) toast.success(patch.away_mode ? "Away mode on — the AI Operator is now handling chats" : "Away mode off — your team is in control");
    q.refetch();
  }
  async function runNow() {
    setRunning(true);
    const r = await run({ data: { workspaceId: ws.workspaceId } });
    setRunning(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.result;
    if (res.skipped === "off") toast.info("Turn on Away mode first.");
    else if (res.skipped === "ai_disabled") toast.error("AI is turned off on the AI Assistant page.");
    else if (res.skipped === "locked") toast.info("It's already running — check back in a minute.");
    else toast.success(res.handled ? `Handled ${res.handled} chat(s)` : "No new guest messages to handle");
    q.refetch(); log.refetch();
  }

  if (q.isLoading) return <Panel className="mb-4 h-40 animate-pulse" />;
  const on = form.away_mode;

  return (
    <div className="mb-6 space-y-4">
      <Panel className={`overflow-hidden ${on ? "border-primary/40" : ""}`}>
        <div className={`flex items-start gap-3 p-4 ${on ? "bg-primary/5" : ""}`}>
          <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Bot className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">AI Operator</h2>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{on ? "Away mode ON" : "Off"}</span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">When you're away, it answers guests, takes booking requests, sorts chats and alerts you — using only your business knowledge.</p>
            {form.last_run_at && <p className="mt-1 text-xs text-muted-foreground">Last checked {fmtDateTime(form.last_run_at)}</p>}
          </div>
          <Switch checked={on} disabled={!canEdit} onCheckedChange={(v) => save({ away_mode: v })} aria-label="Away mode" className="mt-1" />
        </div>
        {q.data && !q.data.aiEnabled && (
          <div className="flex items-center gap-2 border-t bg-warning/10 px-4 py-2 text-sm"><AlertTriangle className="size-4 shrink-0" /> AI is turned off. <Link to="/ai" className="font-medium underline">Turn it on</Link> for the operator to work.</div>
        )}
        {form.paused_reason && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-destructive/10 px-4 py-2 text-sm"><AlertTriangle className="size-4 shrink-0" /> Paused: {form.paused_reason}. Fix it, then press Run now.</div>
        )}
        <div className="grid gap-2 border-t p-4 sm:grid-cols-2">
          <Toggle icon={<MessageSquare className="size-4" />} label="Reply to guests" hint="Off = it only suggests replies in the activity list" checked={form.allow_reply} disabled={!canEdit} onChange={(v) => save({ allow_reply: v })} />
          <Toggle icon={<CalendarPlus className="size-4" />} label="Create booking requests" hint="Added as Tentative in the Tour Calendar for you to confirm" checked={form.allow_booking} disabled={!canEdit} onChange={(v) => save({ allow_booking: v })} />
          <Toggle icon={<UserCheck className="size-4" />} label="Assign & tag chats" hint="Labels chats, marks urgent ones, assigns hand-offs" checked={form.allow_assign} disabled={!canEdit} onChange={(v) => save({ allow_assign: v })} />
          <Toggle icon={<Bell className="size-4" />} label="Alert me" hint="Push alerts for complaints, urgent chats, new bookings" checked={form.allow_alert} disabled={!canEdit} onChange={(v) => save({ allow_alert: v })} />
        </div>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2">
          <Field label="Hand chats over to"><MemberSelect value={form.default_assignee ?? ""} onChange={(v) => save({ default_assignee: v || null })} emptyLabel="Nobody (leave unassigned)" /></Field>
          <Field label="Max AI replies per chat"><Input type="number" inputMode="numeric" min={1} max={20} value={form.max_replies} disabled={!canEdit}
            onChange={(e) => setForm({ ...form, max_replies: Number(e.target.value) })}
            onBlur={() => save({ max_replies: Math.min(20, Math.max(1, Math.round(form.max_replies) || 6)) })} /></Field>
          <Field label="Notes for the AI while you're away" className="sm:col-span-2"><Textarea rows={3} value={form.notes} disabled={!canEdit} maxLength={2000}
            placeholder="e.g. We're fully booked on Saturday. Offer the Sunset Tour first. Never offer discounts."
            onChange={(e) => setForm({ ...form, notes: e.target.value })} onBlur={() => save({ notes: form.notes })} /></Field>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <p className="text-xs text-muted-foreground">Checks new guest messages every 5 minutes on the live app. It never confirms payments and hands tricky chats to you.</p>
          {canEdit && <Button size="sm" onClick={runNow} disabled={running}><Play /> {running ? "Running…" : "Run now"}</Button>}
        </div>
      </Panel>

      <Panel>
        <h3 className="border-b px-4 py-3 text-sm font-semibold">What the AI Operator did</h3>
        {!log.data?.length ? <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing yet. Activity appears here once Away mode handles a chat.</p> : (
          <ul className="divide-y">{log.data.map((l) => (
            <li key={l.id} className="flex gap-3 px-4 py-2.5">
              <span className="mt-0.5 shrink-0">{KIND_ICON[l.kind] ?? <Bot className="size-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm">{l.summary}</p>
                <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                  <span>{fmtDateTime(l.created_at)}</span>
                  {l.conversation_id && <Link to="/inbox" search={{ c: l.conversation_id }} className="font-medium text-primary">Open chat</Link>}
                </div>
              </div>
            </li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}

function Toggle({ icon, label, hint, checked, disabled, onChange }: { icon: React.ReactNode; label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
