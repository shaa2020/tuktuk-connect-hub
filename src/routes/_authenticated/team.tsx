import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, UserPlus, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace, workspaceQueryKey } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { PageHeader, Panel, errMsg } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, Confirm, Field, NativeSelect, ToneBadge, fmtDate } from "@/components/kit";
import { useServerFn } from "@tanstack/react-start";
import { resetMemberMfa } from "@/lib/admin.functions";
import { ROLE_LABEL, canManageTeam, type AppRole } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Tuk Tuk 24 Lisbon" }, { name: "description", content: "Team members and invitations." }] }),
  component: TeamPage,
});

function TeamPage() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const admin = canManageTeam(ws.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("agent");
  const resetMfa = useServerFn(resetMemberMfa);
  const invites = useQuery({
    queryKey: ["invites", ws.workspaceId],
    enabled: admin,
    queryFn: async () => (await supabase.from("invitations").select("*").eq("workspace_id", ws.workspaceId).is("accepted_at", null).is("revoked_at", null).order("created_at", { ascending: false })).data ?? [],
  });

  const link = (token: string) => `${window.location.origin}/invite/${token}`;
  async function invite() {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast.error("Enter a valid email");
    const { data, error } = await supabase.from("invitations").insert({ workspace_id: ws.workspaceId, email: e, role, invited_by: ws.userId }).select("token").single();
    if (error) return toast.error(errMsg(error));
    setEmail("");
    invites.refetch();
    try { await navigator.clipboard.writeText(link(data.token)); toast.success("Invitation created — link copied. Send it to your teammate."); }
    catch { toast.success("Invitation created. Copy the link below and send it to your teammate."); }
  }
  async function revoke(id: string) {
    const { error } = await supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    invites.refetch();
  }
  async function updateMember(id: string, patch: { role?: AppRole; active?: boolean }) {
    const { error } = await supabase.from("workspace_members").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Member updated");
    qc.invalidateQueries({ queryKey: workspaceQueryKey });
  }

  return (
    <PageContainer>
      <PageHeader title="Team" description={`${ws.members.filter((m) => m.active).length} active members`} />
      {admin && (
        <Panel className="mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold">Invite a teammate</h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
            <Field label="Role"><NativeSelect value={role} onChange={(e) => setRole(e.target.value as AppRole)}>{(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</NativeSelect></Field>
            <Button className="self-end" onClick={invite}><UserPlus /> Create invite</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Invitation emails aren't sent automatically yet — copy the link and share it. Links expire after 14 days and only work for that email address.</p>
          {!!invites.data?.length && (
            <ul className="mt-4 divide-y rounded-lg border">
              {invites.data.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.email} · {ROLE_LABEL[i.role]} · expires {fmtDate(i.expires_at)}</span>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link(i.token)).then(() => toast.success("Link copied"))}><Copy /> Copy link</Button>
                  <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}><Ban /> Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Panel>
        <ul className="divide-y">
          {ws.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={m.full_name || m.email} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">{m.full_name || m.email}{m.user_id === ws.userId && <ToneBadge tone="blue">You</ToneBadge>}{!m.active && <ToneBadge tone="muted">Deactivated</ToneBadge>}</div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              {admin ? (
                <div className="flex items-center gap-2">
                  <NativeSelect className="h-9 w-40" value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value as AppRole })} aria-label="Role">
                    {(Object.keys(ROLE_LABEL) as AppRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </NativeSelect>
                  {m.active ? (
                    <Confirm trigger={<Button size="sm" variant="outline">Deactivate</Button>} title={`Deactivate ${m.full_name || m.email}?`} description="They'll immediately lose access to all workspace data. You can reactivate them later." confirmLabel="Deactivate" onConfirm={() => updateMember(m.id, { active: false })} />
                  ) : <Button size="sm" variant="outline" onClick={() => updateMember(m.id, { active: true })}>Reactivate</Button>}
                  {m.user_id !== ws.userId && (
                    <Confirm trigger={<Button size="sm" variant="ghost">Reset 2-step</Button>} title={`Reset two-step sign-in for ${m.full_name || m.email}?`} description="Use this only if they lost their phone. They'll be signed out and must set up an authenticator app again." confirmLabel="Reset" onConfirm={async () => { try { await resetMfa({ data: { workspaceId: ws.workspaceId, userId: m.user_id } }); toast.success("Two-step sign-in reset"); } catch (e) { toast.error((e as Error).message); } }} />
                  )}
                </div>
              ) : <ToneBadge tone="secondary">{ROLE_LABEL[m.role]}</ToneBadge>}
            </li>
          ))}
        </ul>
      </Panel>
    </PageContainer>
  );
}
