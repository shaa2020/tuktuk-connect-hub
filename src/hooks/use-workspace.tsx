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
};

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
  const { data: mem, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, active, workspaces(name, agents_see_unassigned)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (!mem) return { user, profile, mem: null, members: [] as Member[] };
  const { data: rows, error: me } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, active, whatsapp_phone, profiles(full_name, email)")
    .eq("workspace_id", mem.workspace_id)
    .order("created_at");
  if (me) throw me;
  const members: Member[] = (rows ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    active: r.active,
    whatsapp_phone: (r as any).whatsapp_phone ?? null,
    full_name: r.profiles?.full_name ?? null,
    email: r.profiles?.email ?? null,
  }));
  return { user, profile, mem, members };
}

export const workspaceQueryKey = ["workspace"];

export function WorkspaceProvider({
  children,
  noAccess,
  loading,
  error,
}: {
  children: ReactNode;
  noAccess: ReactNode;
  loading: ReactNode;
  error: (msg: string, retry: () => void) => ReactNode;
}) {
  const q = useQuery({ queryKey: workspaceQueryKey, queryFn: loadWorkspace, staleTime: 60_000 });
  if (q.isLoading) return <>{loading}</>;
  if (q.error) return <>{error((q.error as Error).message, () => q.refetch())}</>;
  const d = q.data!;
  if (!d.mem) return <>{noAccess}</>;
  const ws = d.mem.workspaces as { name: string; agents_see_unassigned: boolean } | null;
  const value: WorkspaceCtx = {
    userId: d.user.id,
    email: d.user.email ?? "",
    fullName: d.profile?.full_name ?? d.user.email ?? "",
    workspaceId: d.mem.workspace_id,
    workspaceName: ws?.name ?? "Workspace",
    agentsSeeUnassigned: ws?.agents_see_unassigned ?? true,
    role: d.mem.role,
    members: d.members,
    memberName: (id) => {
      if (!id) return "Unassigned";
      const m = d.members.find((x) => x.user_id === id);
      return m?.full_name || m?.email || "Former member";
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
