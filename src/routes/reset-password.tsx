import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup } from "@/components/brand";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — TeamInbox" },
      { name: "description", content: "Choose a new password for your team account." },
      { property: "og:title", content: "Set a new password — TeamInbox" },
      { property: "og:description", content: "Choose a new password for your team account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session && isRecovery) setReady(true);
      else if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Password must be at least 8 characters");
    if (pw !== pw2) return setError("Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="glass w-full max-w-sm rounded-3xl p-6 sm:p-8">
        <div className="mb-8">
          <BrandLockup />
        </div>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Open this page from the reset link in your email. If the link expired, request a new one
            from the sign-in page.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button className="w-full" size="lg" disabled={busy}>
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
