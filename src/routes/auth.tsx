import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup } from "@/components/brand";
import { PUBLIC_SIGNUP_ENABLED } from "@/lib/signup";

const search = z.object({ redirect: z.string().optional(), mode: z.enum(["signin", "forgot"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — TeamInbox" },
      { name: "description", content: "Sign in to your team workspace." },
      { property: "og:title", content: "Sign in — TeamInbox" },
      { property: "og:description", content: "Your team workspace." },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(r?: string) {
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
}

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

function AuthPage() {
  const { redirect, mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const target = safeRedirect(redirect);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const em = emailSchema.safeParse(email);
    if (!em.success) return setError(em.error.issues[0]?.message ?? "Invalid input");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(em.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: em.data, password });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: target, replace: true });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg === "Invalid login credentials" ? "Email or password is incorrect." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-10 lg:flex">
        <BrandLockup light />
        <div>
          <h2 className="font-display text-3xl font-bold text-navy-foreground">Every guest conversation, one calm workspace.</h2>
          <p className="mt-3 max-w-md text-sm text-sidebar-foreground">
            Reply faster, keep leads moving and never lose track of a booking, from your phone or your desk.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground">Secure team access · two-step sign-in required</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><BrandLockup /></div>
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-10 text-teal" />
              <h1 className="mt-3 text-xl font-bold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                If an account exists for {email}, a password reset link is on its way.
              </p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => { setSent(false); setMode("signin"); }}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">{mode === "signin" ? "Sign in" : "Reset password"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "forgot" ? "We'll email you a secure link." : "Welcome back to your team workspace."}
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                {mode === "signin" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>
                        Forgot password?
                      </button>
                    </div>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  </div>
                )}
                {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "forgot" ? (
                  <button className="font-medium text-primary hover:underline" onClick={() => setMode("signin")}>Back to sign in</button>
                ) : PUBLIC_SIGNUP_ENABLED ? (
                  <>New here? <a href="/signup" className="font-medium text-primary hover:underline">Create a business account</a></>
                ) : (
                  "Access is by invitation only. Ask your admin for an invite link."
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
