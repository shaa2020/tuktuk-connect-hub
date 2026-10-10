import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { ToneBadge } from "@/components/kit";
import { CHANNEL_LABEL, type ChannelType } from "@/lib/domain";
import { ChannelIcon } from "./inbox";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Channel connection status." }] }),
  component: IntegrationsPage,
});

const NEEDS: Record<string, string> = {
  whatsapp: "A Meta Business account with WhatsApp Business Platform (Cloud API) access, a verified business phone number and a permanent access token.",
  instagram: "An Instagram Professional account linked to a Facebook Page, plus a Meta app approved for instagram_manage_messages.",
  messenger: "A Facebook Page and a Meta app approved for pages_messaging.",
  email: "An email domain and inbox (e.g. bookings@yourdomain) we can receive and send from.",
};

function IntegrationsPage() {
  const { workspaceId } = useWorkspace();
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
                <div className="flex-1"><div className="text-sm font-semibold">{CHANNEL_LABEL[c.channel]}</div>{c.last_error && <div className="text-xs text-destructive">{c.last_error}</div>}</div>
                <ToneBadge tone={c.status === "connected" ? "success" : c.status === "error" ? "danger" : "muted"}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}</ToneBadge>
              </div>
              {c.status !== "connected" && <p className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Needed for Phase 2:</span> {NEEDS[c.channel]}</p>}
            </Panel>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
