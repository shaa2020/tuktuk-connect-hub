import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Ban, Building2, ChevronRight, ShieldAlert } from "lucide-react";
import { ROLE_LABEL } from "@/lib/domain";
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
      <div className="glass max-w-sm rounded-3xl p-6 text-center sm:p-8">
        <ShieldAlert className="mx-auto size-10 text-warning" />
        <h1 className="mt-3 text-xl font-bold">No workspace access yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account isn't part of a business workspace yet. Ask a Business Admin to send you an
          invitation link and open it while signed in — or create your own business.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <a href="/onboarding">Create a business workspace</a>
          </Button>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function Suspended({
  name,
  reason,
  workspaces,
}: {
  name: string;
  reason: string | null;
  workspaces: WorkspaceSummary[];
}) {
  const signOut = useSignOut();
  const others = workspaces.filter((w) => !w.suspended);
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="glass max-w-sm rounded-3xl p-6 text-center sm:p-8">
        <Ban className="mx-auto size-10 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">{name} is suspended</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Access to this workspace is paused{reason ? `: ${reason}` : "."} Your data is kept safe.
          Contact support to reactivate it.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {others.map((w) => (
            <Button key={w.id} variant="secondary" onClick={() => switchWorkspace(w.id)}>
              Open {w.name}
            </Button>
          ))}
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChooseBusiness({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const signOut = useSignOut();
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8">
        <Building2 className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-center text-xl font-bold">Choose a business</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          You're part of several businesses. Each one has its own inbox, bookings and customers —
          you can switch any time from your profile menu.
        </p>
        <ul className="mt-6 divide-y overflow-hidden rounded-xl border bg-surface-1">
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                disabled={w.suspended}
                onClick={() => switchWorkspace(w.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{w.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {w.suspended ? "Suspended" : ROLE_LABEL[w.role]}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="mt-4 w-full" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  return (
    <WorkspaceProvider
      loading={<FullScreenLoader />}
      noAccess={<NoAccess />}
      choose={(ws) => (
        <MfaGate>
          <ChooseBusiness workspaces={ws} />
        </MfaGate>
      )}
      suspended={(info) => <Suspended {...info} />}
      error={(m, retry) => (
        <div className="mx-auto max-w-md p-8">
          <ErrorState message={m} onRetry={retry} />
        </div>
      )}
    >
      <MfaGate>
        <AppShell>
          <Outlet />
        </AppShell>
      </MfaGate>
    </WorkspaceProvider>
  );
}
