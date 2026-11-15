import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedWorkspaceId } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/kit";
import { BrandLockup } from "@/components/brand";
import { browserTimeZone, INDUSTRIES, LANGUAGES, timeZones, validateBusinessName } from "@/lib/signup";

// Step 1 of onboarding: create the business workspace. The database (create_workspace RPC)
// re-validates everything, requires a verified email and makes the caller owner + admin.
export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  head: () => ({ meta: [{ title: "Create your business" }, { name: "description", content: "Set up your business workspace." }] }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const zones = useMemo(() => timeZones(), []);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<string>("tour_operator");
  const [timezone, setTimezone] = useState(() => {
    const tz = browserTimeZone();
    return zones.includes(tz) ? tz : "Europe/Lisbon";
  });
  const [locale, setLocale] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validateBusinessName(name);
    if (problem) return setError(problem);
    setBusy(true);
    const { data, error } = await supabase.rpc("create_workspace", { _name: name.trim(), _timezone: timezone, _industry: industry, _locale: locale });
    if (error || !data) {
      setBusy(false);
      return setError(error?.message ?? "Could not create the workspace. Please try again.");
    }
    setSelectedWorkspaceId(data);
    // Full reload: the app re-reads memberships and opens the new business (MFA setup comes next).
    window.location.assign("/dashboard?welcome=1");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8"><BrandLockup /></div>
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Building2 className="size-5" /></span>
          <div>
            <h1 className="text-xl font-bold">Create your business workspace</h1>
            <p className="text-sm text-muted-foreground">Step 1 of 3 · You can change these later in Settings.</p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="organization" placeholder="e.g. Sunset Tours Porto" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-industry">Industry</Label>
            <NativeSelect id="biz-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full">
              {INDUSTRIES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="biz-tz">Time zone</Label>
              <NativeSelect id="biz-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full">
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-lang">Language</Label>
              <NativeSelect id="biz-lang" value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full">
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </NativeSelect>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Create workspace
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You start on the Free plan. Next: secure your account with two-step sign-in, then follow the setup checklist.
          </p>
        </form>
      </div>
    </div>
  );
}
