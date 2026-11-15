import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand";
import { redeemInvitation } from "@/lib/invite.functions";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join the team — TeamInbox" },
      { name: "description", content: "Accept your invitation to your team workspace." },
      { property: "og:title", content: "Join the team — TeamInbox" },
      { property: "og:description", content: "Accept your invitation to your team workspace." },
    ],
  }),
  component: InvitePage,
});

type State =
  | { kind: "checking" }
  | { kind: "existing"; email: string }
  | { kind: "created"; email: string }
  | { kind: "ready" }
  | { kind: "busy" }
  | { kind: "error"; message: string };

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<State>({ kind: "checking" });
  const here = `/invite/${token}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (data.user) {
        setState({ kind: "ready" });
        return;
      }
      // Signed out: redeem the invitation. New emails get an account created
      // server-side; existing users are asked to sign in.
      try {
        const res = await redeemInvitation({ data: { token } });
        if (cancelled) return;
        if (res.created) {
          // Send a set-password email so the invitee chooses their own password.
          await supabase.auth.resetPasswordForEmail(res.email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
          setState({ kind: "created", email: res.email });
        } else {
          setState({ kind: "existing", email: res.email });
        }
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setState({ kind: "busy" });
    const { error } = await supabase.rpc("accept_invitation", { _token: token });
    if (error) {
      setState({ kind: "error", message: error.message });
      return;
    }
    await qc.invalidateQueries();
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center"><BrandLockup /></div>
        <h1 className="text-2xl font-bold">You're invited</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join your team workspace.</p>
        <div className="mt-6 space-y-3">
          {state.kind === "checking" && <Loader2 className="mx-auto animate-spin text-primary" />}
          {state.kind === "existing" && (
            <>
              <p className="text-sm text-muted-foreground">
                An account already exists for <span className="font-medium text-foreground">{state.email}</span>. Sign in to accept your invitation.
              </p>
              <Button asChild className="w-full" size="lg">
                <Link to="/auth" search={{ redirect: here }}>Sign in to accept</Link>
              </Button>
            </>
          )}
          {state.kind === "created" && (
            <>
              <MailCheck className="mx-auto size-10 text-teal" />
              <p className="text-sm text-muted-foreground">
                Your account for <span className="font-medium text-foreground">{state.email}</span> is ready. We emailed you a link to set your password — after that, sign in and you're on the team.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth">Go to sign in</Link>
              </Button>
            </>
          )}
          {(state.kind === "ready" || state.kind === "busy") && (
            <Button className="w-full" size="lg" onClick={accept} disabled={state.kind === "busy"}>
              {state.kind === "busy" && <Loader2 className="animate-spin" />} Accept invitation
            </Button>
          )}
          {state.kind === "error" && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{state.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
