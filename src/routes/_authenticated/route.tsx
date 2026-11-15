import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Ban, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkspaceProvider, switchWorkspace, type WorkspaceSummary } from "@/hooks/use-workspace";
import { AppShell, useSignOut } from "@/components/app-shell";
import { MfaGate } from "@/components/mfa-gate";
import { ErrorState, FullScreenLoader } from "@/components/states";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: AuthenticatedLayout,
});

function NoAccess() {
  const signOut = useSignOut();
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto size-10 text-warning" />
        <h1 className="mt-3 text-xl font-bold">No workspace access yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn't part of a business workspace yet. Ask a Business Admin to send you an invitation link and open it while signed in — or create your own business.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild><a href="/onboarding">Create a business workspace</a></Button>
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function Suspended({ name, reason, workspaces }: { name: string; reason: string | null; workspaces: WorkspaceSummary[] }) {
  const signOut = useSignOut();
  const others = workspaces.filter((w) => !w.suspended);
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <Ban className="mx-auto size-10 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">{name} is suspended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access to this workspace is paused{reason ? `: ${reason}` : "."} Your data is kept safe. Contact support to reactivate it.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {others.map((w) => (
            <Button key={w.id} variant="secondary" onClick={() => switchWorkspace(w.id)}>Open {w.name}</Button>
          ))}
          <Button variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  return (
    <WorkspaceProvider
      loading={<FullScreenLoader />}
      noAccess={<NoAccess />}
      suspended={(info) => <Suspended {...info} />}
      error={(m, retry) => <div className="mx-auto max-w-md p-8"><ErrorState message={m} onRetry={retry} /></div>}
    >
      <MfaGate>
        <AppShell>
          <Outlet />
        </AppShell>
      </MfaGate>
    </WorkspaceProvider>
  );
}
