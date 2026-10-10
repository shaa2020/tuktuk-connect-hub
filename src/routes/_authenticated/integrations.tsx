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
import { connectEmailChannel, syncEmailNow } from "@/lib/admin.functions";
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

function IntegrationsPage() {
  const { workspaceId, role } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["channels-full", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("channel_connections").select("*").eq("workspace_id", workspaceId).order("channel");
      if (error) throw error;
      return data;
    },
  });
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Integrations" description="Status shown here is the real connection state — nothing is marked connected until it's been set up and tested." />
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState message={(q.error as Error).message} /> : (
        <div className="space-y-3">
          {q.data?.map((c) => (
            <Panel key={c.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><ChannelIcon channel={c.channel as ChannelType} className="size-5" /></div>
                <div className="flex-1"><div className="text-sm font-semibold">{CHANNEL_LABEL[c.channel]}</div>{c.display_name && <div className="text-xs text-muted-foreground">{c.display_name}</div>}{c.last_error && <div className="text-xs text-destructive">{c.last_error}</div>}</div>
                <ToneBadge tone={c.status === "connected" ? "success" : c.status === "error" ? "danger" : "muted"}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}</ToneBadge>
              </div>
              {role === "admin" && c.channel !== "email" && <Button size="sm" variant="outline" className="mt-3" onClick={() => setOpen(open === c.channel ? null : c.channel)}>{c.status === "connected" ? "Manage" : "Connect"}</Button>}
              {open === c.channel && <MetaConnectForm workspaceId={workspaceId} channel={c.channel as "whatsapp"} connected={c.status === "connected"} onDone={() => q.refetch()} />}
              {c.channel === "email" && role === "admin" && <EmailControls workspaceId={workspaceId} connected={c.status === "connected"} onDone={() => q.refetch()} />}
            </Panel>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
