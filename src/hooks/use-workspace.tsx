import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/domain";

export type Member = {
  id: string;
  user_id: string;
  role: AppRole;
  active: boolean;
  full_name: string | null;
  email: string | null;
  whatsapp_phone: string | null;
};

export type WorkspaceSummary = { id: string; name: string; role: AppRole; suspended: boolean };

export type WorkspaceCtx = {
  userId: string;
  email: string;
  fullName: string;
  workspaceId: string;
  workspaceName: string;
  agentsSeeUnassigned: boolean;
  role: AppRole;
  members: Member[];
  memberName: (id: string | null | undefined) => string;
  /** Every business this person belongs to (for the switcher). */
  workspaces: WorkspaceSummary[];
  plan: string;
  industry: string | null;
  /** True only for the platform operator's own workspace (operator-owned integrations). */
  platformConnectors: boolean;
  /** Optional feature modules switched on for this business. */
  modules: Modules;
};

export type Modules = { tours: boolean };
/** Tour tools (tour calendar, dispatch, tickets) are for tour/travel businesses and legacy workspaces. */
export function modulesFor(
  industry: string | null | undefined,
  platformConnectors: boolean,
): Modules {
  return {
    tours:
      platformConnectors ||
      !industry ||
      industry === "tour_operator" ||
      industry === "travel_agency",
  };
}

// The chosen business is remembered per browser. Access is still decided by the database:
// a stale or foreign id here simply falls back to the first membership.
const SELECTED_KEY = "tt.selectedWorkspace";
export function getSelectedWorkspaceId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}
export function setSelectedWorkspaceId(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    /* private mode: falls back to first workspace */
  }
}

/** Picks the remembered workspace if the user still belongs to it, otherwise the first one. */
export function pickWorkspace<T extends { workspace_id: string }>(
  memberships: T[],
  preferred: string | null,
): T | null {
  if (!memberships.length) return null;
  return memberships.find((m) => m.workspace_id === preferred) ?? memberships[0] ?? null;
}

/** True when the person belongs to 2+ businesses and hasn't picked a valid one on this device. */
export function needsBusinessChoice(
  memberships: { workspace_id: string }[],
  preferred: string | null,
) {
  return memberships.length > 1 && !memberships.some((m) => m.workspace_id === preferred);
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}

async function loadWorkspace() {
  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u.user) throw new Error("Your session has expired. Please sign in again.");
  const user = u.user;
  const { data: mems, error } = await supabase
    .from("workspace_members")
    .select(
      "workspace_id, role, active, created_at, workspaces(name, agents_see_unassigned, plan, suspended_at, suspended_reason, industry, platform_connectors)",
    )
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  const all = (mems ?? []) as any[];
  const preferred = getSelectedWorkspaceId();
  const mem = pickWorkspace(all, preferred);
  const workspaces: WorkspaceSummary[] = all.map((m) => ({
    id: m.workspace_id,
    name: m.workspaces?.name ?? "Workspace",
    role: m.role,
    suspended: !!m.workspaces?.suspended_at,
  }));
  // Several businesses and none chosen on this device yet: ask instead of silently opening the
  // first one, so nobody mistakes one business's bookings for another's.
  if (needsBusinessChoice(all, preferred))
    return {
      user,
      profile: null,
      mem: null,
      members: [] as Member[],
      workspaces,
      needsChoice: true,
    };
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!mem)
    return { user, profile, mem: null, members: [] as Member[], workspaces, needsChoice: false };
  if (mem.workspaces?.suspended_at)
    return { user, profile, mem, members: [] as Member[], workspaces, needsChoice: false };
  const { data: rows, error: me } = await (supabase as any)
    .from("workspace_members")
    .select("id, user_id, role, active, whatsapp_phone, profiles(full_name, email)")
    .eq("workspace_id", mem.workspace_id)
    .order("created_at");
  if (me) throw me;
  const members: Member[] = ((rows ?? []) as any[]).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    active: r.active,
    whatsapp_phone: (r as any).whatsapp_phone ?? null,
    full_name: r.profiles?.full_name ?? null,
    email: r.profiles?.email ?? null,
  }));
  return { user, profile, mem, members, workspaces, needsChoice: false };
}

export const workspaceQueryKey = ["workspace"];

export function WorkspaceProvider({
  children,
  noAccess,
  suspended,
  loading,
  error,
  choose,
}: {
  children: ReactNode;
  noAccess: ReactNode;
  choose: (workspaces: WorkspaceSummary[]) => ReactNode;
  suspended: (info: {
    name: string;
    reason: string | null;
    workspaces: WorkspaceSummary[];
  }) => ReactNode;
  loading: ReactNode;
  error: (msg: string, retry: () => void) => ReactNode;
}) {
  const q = useQuery({ queryKey: workspaceQueryKey, queryFn: loadWorkspace, staleTime: 60_000 });
  if (q.isLoading) return <>{loading}</>;
  if (q.error) return <>{error((q.error as Error).message, () => q.refetch())}</>;
  const d = q.data!;
  if (d.needsChoice) return <>{choose(d.workspaces)}</>;
  if (!d.mem) return <>{noAccess}</>;
  const ws = d.mem.workspaces as {
    name: string;
    agents_see_unassigned: boolean;
    plan: string;
    suspended_at: string | null;
    suspended_reason: string | null;
    industry: string | null;
    platform_connectors: boolean;
  } | null;
  if (ws?.suspended_at)
    return (
      <>{suspended({ name: ws.name, reason: ws.suspended_reason, workspaces: d.workspaces })}</>
    );
  const value: WorkspaceCtx = {
    userId: d.user.id,
    email: d.user.email ?? "",
    fullName: d.profile?.full_name ?? d.user.email ?? "",
    workspaceId: d.mem.workspace_id,
    workspaceName: ws?.name ?? "Workspace",
    agentsSeeUnassigned: ws?.agents_see_unassigned ?? true,
    role: d.mem.role,
    members: d.members,
    workspaces: d.workspaces,
    plan: ws?.plan ?? "free",
    industry: ws?.industry ?? null,
    platformConnectors: ws?.platform_connectors === true,
    modules: modulesFor(ws?.industry, ws?.platform_connectors === true),
    memberName: (id) => {
      if (!id) return "Unassigned";
      const m = d.members.find((x) => x.user_id === id);
      return m?.full_name || m?.email || "Former member";
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Switch the active business. A full reload guarantees no cached data, realtime channel or
 * in-flight request from the previous business survives the switch.
 */
export function switchWorkspace(id: string, to = "/dashboard") {
  setSelectedWorkspaceId(id);
  window.location.assign(to);
}
