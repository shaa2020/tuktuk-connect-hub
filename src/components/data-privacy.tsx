import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { exportWorkspaceData } from "@/lib/privacy.functions";
import { Panel } from "@/components/states";
import { NativeSelect } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Admin/owner data controls: full export, retention, ownership transfer, workspace deletion. */
export function DataPrivacyPanel() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const exportFn = useServerFn(exportWorkspaceData);
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const info = useQuery({
    queryKey: ["privacy", ws.workspaceId],
    queryFn: async () => (await supabase.from("workspaces").select("owner_id, deletion_scheduled_for, message_retention_days").eq("id", ws.workspaceId).maybeSingle()).data,
  });
  const isOwner = info.data?.owner_id === ws.userId;
  const refresh = () => qc.invalidateQueries({ queryKey: ["privacy"] });

  async function doExport() {
    setBusy(true);
    try {
      const json = await exportFn({ data: { workspaceId: ws.workspaceId } });
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `workspace-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function setRetention(v: string) {
    const { error } = await supabase.from("workspaces").update({ message_retention_days: v ? Number(v) : null }).eq("id", ws.workspaceId);
    if (error) toast.error(error.message); else { toast.success("Retention saved"); refresh(); }
  }
  async function call(fn: "transfer_workspace_ownership" | "request_workspace_deletion" | "cancel_workspace_deletion", args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn as never, args as never);
    if (error) return toast.error(error.message);
    toast.success(ok); setConfirmName(""); refresh(); qc.invalidateQueries({ queryKey: ["workspace"] });
  }

  return (
    <Panel className="space-y-4 p-4">
      <h2 className="text-sm font-semibold">Data & privacy</h2>
      <div className="space-y-1">
        <Button variant="outline" size="sm" disabled={busy} onClick={doExport}><Download /> {busy ? "Preparing export…" : "Export all workspace data (JSON)"}</Button>
        <p className="text-xs text-muted-foreground">Contacts, conversations, bookings, tasks and more — for backups or a data-portability request. Passwords and credentials are never included.</p>
      </div>
      <label className="block space-y-1">
        <span className="block text-sm font-medium">Delete messages older than</span>
        <NativeSelect value={info.data?.message_retention_days?.toString() ?? ""} onChange={(e) => setRetention(e.target.value)} aria-label="Message retention">
          <option value="">Keep forever</option>
          {[90, 180, 365, 730, 1095].map((d) => <option key={d} value={d}>{d >= 365 ? `${d / 365} year${d > 365 ? "s" : ""}` : `${d} days`}</option>)}
        </NativeSelect>
        <span className="block text-xs text-muted-foreground">Applied nightly. Deleted messages can't be recovered.</span>
      </label>
      {isOwner && (
        <div className="space-y-2 border-t pt-4">
          <span className="block text-sm font-medium">Transfer ownership</span>
          <div className="flex gap-2">
            <NativeSelect value={newOwner} onChange={(e) => setNewOwner(e.target.value)} aria-label="New owner">
              <option value="">Choose a team member…</option>
              {ws.members.filter((m) => m.active && m.user_id !== ws.userId).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
            </NativeSelect>
            <Button variant="outline" disabled={!newOwner} onClick={() => window.confirm("Transfer ownership? You stay a Business Admin.") && call("transfer_workspace_ownership", { _ws: ws.workspaceId, _new_owner: newOwner }, "Ownership transferred")}>Transfer</Button>
          </div>
        </div>
      )}
      {isOwner && (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive"><ShieldAlert className="size-4" /> Delete workspace</div>
          {info.data?.deletion_scheduled_for ? (
            <>
              <p className="text-sm">Scheduled for permanent deletion on <b>{new Date(info.data.deletion_scheduled_for).toLocaleDateString()}</b>.</p>
              <Button size="sm" variant="outline" onClick={() => call("cancel_workspace_deletion", { _ws: ws.workspaceId }, "Deletion cancelled")}>Cancel deletion</Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Everything in this workspace is permanently deleted 30 days after you confirm. Export your data first. Cancel any time before then.</p>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Type "${ws.workspaceName}" to confirm`} aria-label="Confirm workspace name" />
              <Button size="sm" variant="destructive" disabled={confirmName.trim() !== ws.workspaceName} onClick={() => call("request_workspace_deletion", { _ws: ws.workspaceId, _confirm_name: confirmName.trim() }, "Deletion scheduled in 30 days")}>Schedule deletion</Button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
