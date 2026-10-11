import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { ToneBadge } from "@/components/kit";
import { CHANNEL_LABEL, type ChannelType } from "@/lib/domain";
import { ChannelIcon } from "./inbox";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MetaConnectForm } from "@/components/admin-connections";
import { useServerFn } from "@tanstack/react-start";
import { connectEmailChannel, renameConnection, syncEmailNow } from "@/lib/admin.functions";
import { Plus } from "lucide-react";
import { toast } from "sonner";

function EmailControls({ workspaceId, connected, onDone }: { workspaceId: string; connected: boolean; onDone: () => void }) {
  const connect = useServerFn(connectEmailChannel);
  const sync = useServerFn(syncEmailNow);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; imported?: number }>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else toast.success(r.imported !== undefined ? `${r.imported} new email(s) imported` : "Done");
    } finally { setBusy(false); onDone(); }
  };
  return (
    <div className="mt-3 space-y-2">
      {!connected && <p className="rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground">Connects the business Gmail (tuktuklisbon24@gmail.com). Customer emails appear in the Inbox and replies are sent from that address.</p>}
      <div className="flex flex-wrap gap-2">
        {!connected && <Button size="sm" disabled={busy} onClick={() => run(() => connect({ data: { workspaceId, connect: true } }) as any)}>Connect Gmail</Button>}
        {connected && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => sync({ data: { workspaceId } }) as any)}>Check for new emails</Button>}
        {connected && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => connect({ data: { workspaceId, connect: false } }) as any)}>Disconnect</Button>}
      </div>
    </div>
  );
}

const META = ["whatsapp", "instagram", "messenger"] as const;
const ORDER: ChannelType[] = ["whatsapp", "instagram", "messenger", "email"];

function IntegrationsPage() {
  const { workspaceId, role } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);
  const rename = useServerFn(renameConnection);
  const q = useQuery({
    queryKey: ["channels-full", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("channel_connections").select("*").eq("workspace_id", workspaceId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const isAdmin = role === "admin";
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Integrations" description="Connect as many WhatsApp numbers, Instagram accounts and Facebook Pages as you need. Status shown is the real connection state." />
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState message={(q.error as Error).message} /> : (
        <div className="space-y-4">
          {ORDER.map((ch) => {
            const rows = (q.data ?? []).filter((c) => c.channel === ch);
            const isMeta = (META as readonly string[]).includes(ch);
            return (
              <Panel key={ch} className="p-4">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><ChannelIcon channel={ch} className="size-5" /></div>
                  <div className="flex-1 text-sm font-semibold">{CHANNEL_LABEL[ch]}</div>
                  <span className="text-xs text-muted-foreground">{rows.filter((r) => r.status === "connected").length} connected</span>
                </div>
                <div className="divide-y">
                  {rows.map((c) => (
                    <div key={c.id} className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.account_label || c.display_name || "Not set up"}</div>
                          {c.account_label && c.display_name && <div className="truncate text-xs text-muted-foreground">{c.display_name}</div>}
                          {c.last_error && <div className="text-xs text-destructive">{c.last_error}</div>}
                        </div>
                        <ToneBadge tone={c.status === "connected" ? "success" : c.status === "error" ? "danger" : "muted"}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}</ToneBadge>
                      </div>
                      {isAdmin && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isMeta && <Button size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.status === "connected" ? "Manage" : "Connect"}</Button>}
                          {c.status === "connected" && <Button size="sm" variant="ghost" onClick={async () => {
                            const label = window.prompt("Account name (e.g. Main Line, Alfama Desk)", c.account_label ?? "");
                            if (label === null) return;
                            const r = await rename({ data: { workspaceId, connectionId: c.id, label: label.slice(0, 60) } });
                            if (r.ok) { toast.success("Renamed"); q.refetch(); } else toast.error(r.error);
                          }}>Rename</Button>}
                        </div>
                      )}
                      {open === c.id && isMeta && <MetaConnectForm workspaceId={workspaceId} channel={ch as "whatsapp"} connectionId={c.id} initialLabel={c.account_label} initialAccountId={c.account_id} connected={c.status === "connected"} onDone={() => q.refetch()} />}
                      {ch === "email" && isAdmin && <EmailControls workspaceId={workspaceId} connected={c.status === "connected"} onDone={() => q.refetch()} />}
                    </div>
                  ))}
                  {rows.length === 0 && ch === "email" && isAdmin && <EmailControls workspaceId={workspaceId} connected={false} onDone={() => q.refetch()} />}
                </div>
                {isAdmin && isMeta && (
                  <>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(open === `new-${ch}` ? null : `new-${ch}`)}><Plus />Add {rows.some((r) => r.status === "connected") ? "another" : "an"} account</Button>
                    {open === `new-${ch}` && <MetaConnectForm workspaceId={workspaceId} channel={ch as "whatsapp"} connected={false} onDone={() => { q.refetch(); setOpen(null); }} />}
                  </>
                )}
                {ch === "email" && <p className="mt-2 text-xs text-muted-foreground">Have other Gmail addresses? Set them to forward to the connected Gmail and those emails will show here too.</p>}
              </Panel>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Tuk Tuk 24 Lisbon" }] }),
  component: IntegrationsPage,
});
