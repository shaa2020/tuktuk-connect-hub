import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/brand";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join the team — Tuk Tuk 24 Lisbon" },
      { name: "description", content: "Accept your invitation to the Tuk Tuk 24 Lisbon workspace." },
      { property: "og:title", content: "Join the team — Tuk Tuk 24 Lisbon" },
      { property: "og:description", content: "Accept your invitation to the Tuk Tuk 24 Lisbon workspace." },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [state, setState] = useState<"checking" | "signedout" | "ready" | "busy" | "error">("checking");
  const [error, setError] = useState("");
  const here = `/invite/${token}`;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setState(data.user ? "ready" : "signedout"));
  }, []);

  async function accept() {
    setState("busy");
    const { error } = await supabase.rpc("accept_invitation", { _token: token });
    if (error) {
      setError(error.message);
      setState("error");
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
        <p className="mt-2 text-sm text-muted-foreground">Join the Tuk Tuk 24 Lisbon team workspace.</p>
        <div className="mt-6 space-y-3">
          {state === "checking" && <Loader2 className="mx-auto animate-spin text-primary" />}
          {state === "signedout" && (
            <>
              <Button asChild className="w-full" size="lg">
                <Link to="/auth" search={{ redirect: here, mode: "signup" }}>Create account to accept</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/auth" search={{ redirect: here }}>I already have an account</Link>
              </Button>
            </>
          )}
          {(state === "ready" || state === "busy") && (
            <Button className="w-full" size="lg" onClick={accept} disabled={state === "busy"}>
              {state === "busy" && <Loader2 className="animate-spin" />} Accept invitation
            </Button>
          )}
          {state === "error" && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
