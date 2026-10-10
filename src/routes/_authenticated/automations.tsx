import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Workflow, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Confirm, Field, NativeSelect, fmtDateTime } from "@/components/kit";
import { MemberSelect } from "@/components/pickers";
import { CHANNEL_LABEL, type ChannelType } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({ meta: [{ title: "Automations — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Automatic assignment rules." }] }),
  component: AutomationsPage,
});

type Rule = { id: string; name: string; enabled: boolean; trigger: { event: string; channel: string } | null; actions: { assign_to: string } | null; created_at: string };

function AutomationsPage() {
  const ws = useWorkspace();
  const admin = ws.role === "admin";
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("any");
  const [assign, setAssign] = useState("");
  const rules = useQuery({
    queryKey: ["rules", ws.workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("automation_rules").select("*").eq("workspace_id", ws.workspaceId).order("created_at");
      if (error) throw error;
      return data as unknown as Rule[];
    },
  });
  const runs = useQuery({
    queryKey: ["runs", ws.workspaceId],
    queryFn: async () => (await supabase.from("automation_runs").select("id, rule_id, status, detail, created_at").eq("workspace_id", ws.workspaceId).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function add() {
    if (!name.trim()) return toast.error("Give the rule a name");
    if (!assign) return toast.error("Choose who to assign to");
    const { error } = await supabase.from("automation_rules").insert({
      workspace_id: ws.workspaceId, name: name.trim().slice(0, 100), enabled: true,
      trigger: { event: "conversation_created", channel }, actions: { assign_to: assign },
    });
    if (error) return toast.error(error.message);
    setName(""); setAssign(""); toast.success("Rule created"); rules.refetch();
  }
  async function toggle(r: Rule, v: boolean) {
    const { error } = await supabase.from("automation_rules").update({ enabled: v }).eq("id", r.id);
    if (error) return toast.error(error.message);
    rules.refetch();
  }
  async function del(id: string) {
    const { error } = await supabase.from("automation_rules").delete().eq("id", id);
    if (error) return toast.error(error.message);
    rules.refetch();
  }
  const ruleName = (id: string) => rules.data?.find((r) => r.id === id)?.name ?? "Deleted rule";

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Automations" description="Automatically assign new, unassigned conversations. Rules run in order; the first match wins." />
      {admin && (
        <Panel className="mb-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold">New auto-assign rule</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="WhatsApp to Rita" /></Field>
            <Field label="When a new conversation arrives on"><NativeSelect value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="any">Any channel</option>
              {(Object.keys(CHANNEL_LABEL) as ChannelType[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
            </NativeSelect></Field>
            <Field label="Assign it to"><MemberSelect value={assign} onChange={setAssign} emptyLabel="Choose…" /></Field>
          </div>
          <Button onClick={add}><Plus /> Add rule</Button>
        </Panel>
      )}
      <Panel>
        {rules.isLoading ? <ListSkeleton /> : rules.error ? <div className="p-4"><ErrorState message={(rules.error as Error).message} /></div> :
          !rules.data?.length ? <EmptyState icon={<Workflow />} title="No rules yet" description={admin ? "Create a rule above." : "A Business Admin can create rules."} /> : (
            <ul className="divide-y">{rules.data.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">New {r.trigger?.channel === "any" ? "conversation on any channel" : `${CHANNEL_LABEL[r.trigger?.channel as ChannelType] ?? r.trigger?.channel} conversation`} → assign to {ws.memberName(r.actions?.assign_to)}</div>
                </div>
                <Switch checked={r.enabled} disabled={!admin} onCheckedChange={(v) => toggle(r, v)} aria-label="Enabled" />
                {admin && <Confirm trigger={<Button variant="ghost" size="icon" aria-label="Delete rule"><Trash2 /></Button>} title="Delete rule?" description="This rule will stop running." confirmLabel="Delete" onConfirm={() => del(r.id)} />}
              </li>
            ))}</ul>
          )}
      </Panel>
      {!!runs.data?.length && (
        <Panel className="mt-4">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Recent runs</h2>
          <ul className="divide-y text-sm">{runs.data.map((r) => (
            <li key={r.id} className="flex justify-between gap-2 px-4 py-2"><span>{ruleName(r.rule_id)} · {r.status} · {r.detail}</span><span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span></li>
          ))}</ul>
        </Panel>
      )}
    </PageContainer>
  );
}
