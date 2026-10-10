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

const search = z.object({ redirect: z.string().optional(), mode: z.enum(["signin", "signup", "forgot"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — Tuk Tuk 24 Lisbon" },
      { name: "description", content: "Sign in to the Tuk Tuk 24 Lisbon team workspace." },
      { property: "og:title", content: "Sign in — Tuk Tuk 24 Lisbon" },
      { property: "og:description", content: "Team workspace for Tuk Tuk 24 Lisbon." },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(r?: string) {
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/dashboard";
}

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);
const pwSchema = z.string().min(8, "Password must be at least 8 characters").max(72);

function AuthPage() {
  const { redirect, mode: initialMode } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);
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
        setSent("reset");
        return;
      }
      const pw = pwSchema.safeParse(password);
      if (!pw.success) return setError(pw.error.issues[0]?.message ?? "Invalid input");
      if (mode === "signup") {
        if (!name.trim()) return setError("Please enter your name");
        const { data, error } = await supabase.auth.signUp({
          email: em.data,
          password: pw.data,
          options: {
            emailRedirectTo: `${window.location.origin}${target}`,
            data: { full_name: name.trim().slice(0, 120) },
          },
        });
        if (error) throw error;
        if (!data.session) setSent("confirm");
        else navigate({ to: target, replace: true });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: em.data, password: pw.data });
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
        <p className="text-xs text-sidebar-foreground">Tuk Tuk 24 Lisbon · Team access only</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><BrandLockup /></div>
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto size-10 text-teal" />
              <h1 className="mt-3 text-xl font-bold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {sent === "confirm"
                  ? `We sent a confirmation link to ${email}. Open it to activate your account.`
                  : `If an account exists for ${email}, a password reset link is on its way.`}
              </p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => { setSent(null); setMode("signin"); }}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">
                {mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset password"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Use the email address your invitation was sent to."
                  : mode === "forgot"
                    ? "We'll email you a secure link."
                    : "Welcome back to your team workspace."}
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
                  </div>
                )}
                {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" size="lg" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>New team member? <button className="font-medium text-primary hover:underline" onClick={() => setMode("signup")}>Create an account</button></>
                ) : (
                  <button className="font-medium text-primary hover:underline" onClick={() => setMode("signin")}>Back to sign in</button>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
