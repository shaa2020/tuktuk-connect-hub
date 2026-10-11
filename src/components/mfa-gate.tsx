import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Factor = { id: string; friendly_name?: string; status: string };

async function loadMfaState() {
  const [{ data: aal, error: aalErr }, { data: factors, error: fErr }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aalErr) throw aalErr;
  if (fErr) throw fErr;
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified") as Factor[];
  return {
    needsVerify: aal?.nextLevel === "aal2" && aal?.currentLevel === "aal1",
    verified,
  };
}

export function useMfaState() {
  return useQuery({ queryKey: ["mfa-state"], queryFn: loadMfaState, staleTime: 30_000 });
}

function CodeForm({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: clean });
      if (vErr) throw vErr;
      toast.success("Two-step verification complete");
      onDone();
    } catch (err) {
      setError((err as Error).message?.includes("invalid") ? "That code didn't work. Check the time on your phone and try again." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="mfa-code">6-digit code</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center text-lg tracking-[0.4em]"
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Verify
      </Button>
    </form>
  );
}

export function MfaEnrollment({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"start" | "scan">("start");
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      // Remove abandoned (unverified) setups first so a refresh mid-setup never blocks enrollment.
      const { data: list } = await supabase.auth.mfa.listFactors();
      const stale = (list?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified");
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 16)}`,
      });
      if (error) throw error;
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setStep("scan");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    await qc.invalidateQueries({ queryKey: ["mfa-state"] });
    onDone?.();
  }

  if (step === "start" || !factor) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You'll need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <Button onClick={begin} disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Set up two-step sign-in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Open your authenticator app and tap <strong className="text-foreground">+</strong> to add an account.</li>
        <li>Scan this QR code with the app.</li>
        <li>Enter the 6-digit code it shows below.</li>
      </ol>
      <div className="flex justify-center rounded-xl border bg-card p-4">
        <img src={factor.qr} alt="QR code for your authenticator app" className="size-44" />
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Can't scan? Enter the code manually</summary>
        <p className="mt-1.5 select-all break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm text-foreground">{factor.secret}</p>
      </details>
      <CodeForm factorId={factor.id} onDone={done} />
    </div>
  );
}

function MfaScreen({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <ShieldCheck className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-center text-xl font-bold">{title}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function MfaGate({ children }: { children: ReactNode }) {
  const state = useMfaState();

  if (state.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.isError) return <>{children}</>; // fail open on lookup errors; RLS still protects data

  const { needsVerify, verified } = state.data;

  if (needsVerify && verified[0]) {
    return (
      <MfaScreen title="Enter your security code" description="Open your authenticator app and enter the 6-digit code for Tuk Tuk 24 Lisbon.">
        <CodeForm factorId={verified[0].id} onDone={() => state.refetch()} />
      </MfaScreen>
    );
  }

  if (verified.length === 0) {
    return (
      <MfaScreen title="Set up two-step sign-in" description="To keep guest data safe, every team account needs two-step sign-in. It takes about a minute.">
        <MfaEnrollment onDone={() => state.refetch()} />
      </MfaScreen>
    );
  }

  return <>{children}</>;
}

export function MfaSettingsPanel() {
  const state = useMfaState();
  const qc = useQueryClient();
  const verified = state.data?.verified ?? [];

  async function disable(factorId: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast.error(error.message);
    toast.success("Two-step sign-in turned off");
    qc.invalidateQueries({ queryKey: ["mfa-state"] });
  }

  if (state.isPending) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  if (verified.length === 0) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium text-warning"><Smartphone className="size-4" /> Not set up yet</p>
        <MfaEnrollment />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-medium text-teal"><ShieldCheck className="size-4" /> Two-step sign-in is on</p>
      <p className="text-sm text-muted-foreground">
        Your account is protected with an authenticator app. To switch phones, turn this off and set it up again on the new phone.
      </p>
      <Button variant="outline" className="text-destructive" onClick={() => disable(verified[0]!.id)}>
        Turn off two-step sign-in
      </Button>
    </div>
  );
}
