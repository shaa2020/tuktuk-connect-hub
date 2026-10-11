import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WorkspaceProvider } from "@/hooks/use-workspace";
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
          Your account isn't part of the Tuk Tuk 24 Lisbon team. Ask a Business Admin to send you an invitation link, then open it while signed in.
        </p>
        <Button variant="outline" className="mt-6" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  return (
    <WorkspaceProvider
      loading={<FullScreenLoader />}
      noAccess={<NoAccess />}
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
