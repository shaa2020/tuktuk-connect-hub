import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { aiAsk } from "@/lib/ai.functions";
import { AiProviderPanel } from "@/components/admin-connections";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Assistant — Tuk Tuk 24 Lisbon" }, { name: "description", content: "AI drafting and translation settings." }] }),
  component: AiPage,
});

function AiPage() {
  const ws = useWorkspace();
  const admin = ws.role === "admin";
  const s = useQuery({
    queryKey: ["ai-settings", ws.workspaceId],
    queryFn: async () => (await supabase.from("ai_settings").select("*").eq("workspace_id", ws.workspaceId).maybeSingle()).data,
  });
  const [enabled, setEnabled] = useState(false);
  const [instr, setInstr] = useState("");
  useEffect(() => { if (s.data !== undefined) { setEnabled(s.data?.enabled ?? false); setInstr(s.data?.instructions ?? ""); } }, [s.data]);
  const ask = useServerFn(aiAsk);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next?: boolean) {
    const row = { workspace_id: ws.workspaceId, enabled: next ?? enabled, instructions: instr.slice(0, 5000), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("ai_settings").upsert(row);
    if (error) return toast.error(error.message);
    toast.success("AI settings saved");
    s.refetch();
  }
  async function run() {
    if (!q.trim()) return;
    setBusy(true); setAnswer(null);
    try {
      const r = await ask({ data: { workspaceId: ws.workspaceId, question: q.trim() } });
      if (r.ok) setAnswer(r.text); else toast.error(r.error);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="AI Assistant" description="Suggests replies, translations and summaries in the inbox. Your team always reviews before anything is used." />
      <div className="space-y-4">
        <Panel className="space-y-4 p-4">
          <label className="flex items-center justify-between gap-4">
            <span><span className="block text-sm font-semibold">AI assistance</span><span className="text-xs text-muted-foreground">{enabled ? "On — available in every conversation." : "Off — no AI requests are made."}</span></span>
            <Switch checked={enabled} disabled={!admin} onCheckedChange={(v) => { setEnabled(v); save(v); }} />
          </label>
          <div className="space-y-1.5">
            <label htmlFor="ai-instr" className="text-xs font-semibold text-muted-foreground">Business instructions & tone</label>
            <Textarea id="ai-instr" rows={6} value={instr} disabled={!admin} onChange={(e) => setInstr(e.target.value)} placeholder="e.g. Always greet by first name. Sign off as 'The Tuk Tuk 24 team'. Offer the 2-hour Highlights tour first for families." />
          </div>
          {admin ? <Button onClick={() => save()}>Save instructions</Button> : <p className="text-xs text-muted-foreground">Only a Business Admin can change these settings.</p>}
          <p className="text-xs text-muted-foreground">Facts like prices and meeting points come from the <Link to="/knowledge" className="font-medium text-primary">Knowledge Base</Link>. Missing facts appear as placeholders like [confirm price].</p>
        </Panel>
        {admin && <AiProviderPanel workspaceId={ws.workspaceId} current={s.data ?? null} onSaved={() => s.refetch()} />}
        <Panel className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" />Try it</h2>
          <Textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Write a short reply explaining our sunset tour to a French couple" />
          <Button onClick={run} disabled={busy || !q.trim()}>{busy && <Loader2 className="animate-spin" />}Ask</Button>
          {answer && (
            <div className="rounded-lg border border-primary/30 bg-primary-soft p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase text-primary">AI suggestion — review before using</div>
              <p className="whitespace-pre-wrap text-sm">{answer}</p>
            </div>
          )}
        </Panel>
      </div>
    </PageContainer>
  );
}
