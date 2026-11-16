import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, workspaceQueryKey } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Confirm, Field } from "@/components/kit";
import { MfaSettingsPanel } from "@/components/mfa-gate";
import { RecoveryCodesPanel } from "@/components/mfa-recovery";
import { ROLE_LABEL, canManageWorkspace } from "@/lib/domain";
import { INDUSTRIES } from "@/lib/signup";
import { NativeSelect } from "@/components/kit";
import { CustomFieldDefinitions } from "@/components/custom-fields";
import { DataPrivacyPanel } from "@/components/data-privacy";
import { SupportAccessPanel } from "@/components/platform-ops";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TeamInbox" },
      { name: "description", content: "Profile and workspace settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const admin = canManageWorkspace(ws.role);
  const [name, setName] = useState(ws.fullName);
  const [wsName, setWsName] = useState(ws.workspaceName);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: workspaceQueryKey });

  async function saveProfile() {
    if (!name.trim()) return toast.error("Name is required");
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name.trim().slice(0, 120) })
      .eq("id", ws.userId);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
    refresh();
  }
  async function changePw() {
    if (pw.length < 8) return toast.error("New password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as {
      password: string;
    });
    if (error) return toast.error(error.message);
    setPw("");
    setCur("");
    toast.success("Password changed");
  }
  async function saveWs(patch: {
    name?: string;
    agents_see_unassigned?: boolean;
    industry?: string;
  }) {
    const { error } = await supabase.from("workspaces").update(patch).eq("id", ws.workspaceId);
    if (error) return toast.error(error.message);
    toast.success("Workspace updated");
    refresh();
  }
  async function demo(load: boolean) {
    const { error } = await supabase.rpc(load ? "load_demo_data" : "clear_demo_data", {
      _ws: ws.workspaceId,
    });
    if (error) return toast.error(error.message);
    toast.success(load ? "Sample records added (marked SAMPLE)" : "Sample records removed");
    qc.invalidateQueries();
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Settings"
        description={`Signed in as ${ws.email} · ${ROLE_LABEL[ws.role]}`}
      />
      <div className="space-y-4">
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Your profile</h2>
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button onClick={saveProfile}>Save profile</Button>
        </Panel>
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Change password</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current password">
              <Input
                type="password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <Button variant="outline" onClick={changePw}>
            Update password
          </Button>
        </Panel>
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Two-step sign-in</h2>
          <MfaSettingsPanel />
          <RecoveryCodesPanel />
        </Panel>
        {admin && (
          <>
            <Panel className="space-y-4 p-4">
              <h2 className="text-sm font-semibold">Workspace</h2>
              <div className="flex gap-2">
                <Input
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  aria-label="Workspace name"
                />
                <Button
                  variant="outline"
                  onClick={() => saveWs({ name: wsName.trim().slice(0, 120) })}
                >
                  Save
                </Button>
              </div>
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">
                    Agents can see unassigned conversations
                  </span>
                  <span className="text-xs text-muted-foreground">
                    When off, agents only see conversations assigned to them.
                  </span>
                </span>
                <Switch
                  checked={ws.agentsSeeUnassigned}
                  onCheckedChange={(v) => saveWs({ agents_see_unassigned: v })}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="block text-sm font-medium">Industry</span>
                <span className="block text-xs text-muted-foreground">
                  Decides which modules appear (tour calendar, dispatch and quotes are for tour and
                  travel businesses).
                </span>
                <NativeSelect
                  value={ws.industry ?? ""}
                  onChange={(e) => saveWs({ industry: e.target.value })}
                  aria-label="Industry"
                >
                  {!ws.industry && <option value="">Not set</option>}
                  {INDUSTRIES.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </Panel>
            <CustomFieldDefinitions workspaceId={ws.workspaceId} />
            <DataPrivacyPanel />
            <SupportAccessPanel />
            <Panel className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">Sample data</h2>
              <p className="text-sm text-muted-foreground">
                Add a few clearly marked "[SAMPLE]" records to explore the app. They're never mixed
                up with real customers and can be removed in one tap.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => demo(true)}>
                  Add sample records
                </Button>
                <Confirm
                  trigger={
                    <Button variant="outline" className="text-destructive">
                      Remove sample records
                    </Button>
                  }
                  title="Remove all sample records?"
                  description="All records marked as sample will be deleted. Real data is not affected."
                  confirmLabel="Remove"
                  onConfirm={() => demo(false)}
                />
              </div>
            </Panel>
          </>
        )}
      </div>
    </PageContainer>
  );
}
