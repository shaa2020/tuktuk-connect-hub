import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Workflow } from "lucide-react";
import { Panel } from "@/components/states";
import { ToneBadge } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getHubSetup, saveHubOutbound } from "@/lib/hub.functions";
import { buildN8nWorkflow } from "@/lib/hub-workflow";

const PUBLIC_ORIGIN = "https://tuktuk-connect-hub.lovable.app";

export function AutomationHubPanel({ workspaceId }: { workspaceId: string }) {
  const get = useServerFn(getHubSetup);
  const save = useServerFn(saveHubOutbound);
  const q = useQuery({
    queryKey: ["hub-setup", workspaceId],
    queryFn: () => get({ data: { workspaceId } }),
  });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const inbound = `${PUBLIC_ORIGIN}/api/public/webhooks/hub/${workspaceId}`;
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  const download = () => {
    if (!d) return;
    const blob = new Blob([JSON.stringify(buildN8nWorkflow(inbound, d.key), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tuktuk24-n8n-workflow.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const ready = !!d?.outboundUrl;
  return (
    <Panel className="scroll-mt-20 p-4" id="ch-hub">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Workflow className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Automation Hub · n8n / Make</div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading
              ? "Checking…"
              : q.error
                ? (q.error as Error).message
                : `${d?.accounts ?? 0} accounts linked through the hub`}
          </div>
        </div>
        <ToneBadge tone={ready ? "success" : "muted"}>{ready ? "Ready" : "Setup"}</ToneBadge>
      </div>
      {d && (
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              Download the ready workflow below and import it into n8n (Workflows → Import from
              file). Your address and key are already inside.
            </li>
            <li>
              In n8n, add your WhatsApp, Instagram, Messenger or Gmail accounts — new messages
              appear here automatically.
            </li>
            <li>
              Copy the n8n "Reply" webhook address and paste it below so team and AI replies go back
              out.
            </li>
          </ol>
          <Button size="sm" onClick={download}>
            <Download />
            Download n8n workflow
          </Button>
          <div className="space-y-1">
            <div className="text-xs font-medium">Messages address</div>
            <div className="flex gap-2">
              <Input readOnly value={inbound} className="text-xs" />
              <Button
                size="icon"
                variant="outline"
                aria-label="Copy address"
                onClick={() => copy(inbound)}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium">Hub key (header X-TT24-Key)</div>
            <div className="flex gap-2">
              <Input readOnly type="password" value={d.key} className="text-xs" />
              <Button
                size="icon"
                variant="outline"
                aria-label="Copy key"
                onClick={() => copy(d.key)}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <form
            className="space-y-1"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await save({ data: { workspaceId, url } });
                toast.success("Reply address saved");
                setUrl("");
                q.refetch();
              } catch (err) {
                toast.error((err as Error).message);
              }
              setBusy(false);
            }}
          >
            <div className="text-xs font-medium">
              n8n reply address {ready && <span className="text-muted-foreground">(saved)</span>}
            </div>
            <div className="flex gap-2">
              <Input
                required
                type="url"
                placeholder={ready ? d.outboundUrl : "https://your-n8n…/webhook/tt24-reply"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="text-xs"
              />
              <Button size="sm" type="submit" disabled={busy}>
                Save
              </Button>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}
