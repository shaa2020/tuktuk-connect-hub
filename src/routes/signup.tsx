import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup } from "@/components/brand";
import { passwordProblems, PUBLIC_SIGNUP_ENABLED } from "@/lib/signup";

// Self-service registration. Email verification is required before a workspace can be created
// (enforced again in the create_workspace RPC). Disabled until the owner turns it on.
export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create an account" }, { name: "description", content: "Register your business." }] }),
  component: SignupPage,
});

const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!PUBLIC_SIGNUP_ENABLED) {
    return (
      <Shell>
        <Lock className="size-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-bold">Registration isn't open yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">Access is currently by invitation only. Ask your business admin for an invite link.</p>
        <Button asChild variant="outline" className="mt-6 w-full"><Link to="/auth">Back to sign in</Link></Button>
      </Shell>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const em = emailSchema.safeParse(email);
    if (!em.success) return setError(em.error.issues[0]?.message ?? "Invalid email");
    if (name.trim().length < 2) return setError("Enter your name.");
    const problems = passwordProblems(password);
    if (problems.length) return setError(`Password needs ${problems.join(", ")}.`);
    if (!accepted) return setError("Please accept the terms and privacy policy.");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: em.data,
      password,
      options: { data: { full_name: name.trim().slice(0, 120) }, emailRedirectTo: `${window.location.origin}/onboarding` },
    });
    setBusy(false);
    // Same message whether or not the address already exists (no account enumeration).
    if (error && !/already/i.test(error.message)) return setError(error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <Shell>
        <MailCheck className="size-10 text-teal" />
        <h1 className="mt-3 text-xl font-bold">Confirm your email</h1>
        <p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to {email}. Open it on this device to set up your business.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">Start free. No card needed.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 text-left" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="su-name">Your name</Label>
          <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-email">Work email</Label>
          <Input id="su-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="su-pw">Password</Label>
          <Input id="su-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby="su-pw-hint" />
          <p id="su-pw-hint" className="text-xs text-muted-foreground">10+ characters with upper and lower case, a number and a symbol.</p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>I agree to the terms of service and privacy policy.</span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">Already have an account? <Link to="/auth" className="font-medium text-primary hover:underline">Sign in</Link></p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-8 self-start"><BrandLockup /></div>
        {children}
      </div>
    </div>
  );
}
