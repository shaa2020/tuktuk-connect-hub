import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateRecoveryCodes, recoveryCodeStatus, redeemRecoveryCode } from "@/lib/mfa-recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/states";

/** Settings: create recovery codes (shown once). */
export function RecoveryCodesPanel() {
  const gen = useServerFn(generateRecoveryCodes);
  const statusFn = useServerFn(recoveryCodeStatus);
  const status = useQuery({ queryKey: ["mfa-recovery-status"], queryFn: () => statusFn() });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> Recovery codes</h2>
      <p className="text-xs text-muted-foreground">If you lose your phone, one of these codes lets you set up two-step sign-in again without waiting for an admin. Each code works once. {status.data ? `You have ${status.data.remaining} unused.` : ""}</p>
      {codes ? (
        <>
          <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <p className="text-xs font-medium text-destructive">Save these now — they won't be shown again.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(codes.join("\n")).then(() => toast.success("Copied"))}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCodes(null); status.refetch(); }}>Done</Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
          if (status.data?.remaining && !window.confirm("Creating new codes makes your old codes stop working. Continue?")) return;
          setBusy(true);
          try { setCodes((await gen()).codes); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
        }}>{status.data?.remaining ? "Create new codes" : "Create recovery codes"}</Button>
      )}
    </Panel>
  );
}

/** Sign-in screen: use a recovery code when the authenticator phone is lost. */
export function UseRecoveryCode() {
  const redeem = useServerFn(redeemRecoveryCode);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <Button variant="link" className="mt-2 w-full text-xs" onClick={() => setOpen(true)}>Lost your phone? Use a recovery code</Button>;
  return (
    <div className="mt-4 space-y-2 rounded-lg border p-3">
      <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" autoComplete="one-time-code" aria-label="Recovery code" />
      <Button className="w-full" disabled={busy || code.trim().length < 10} onClick={async () => {
        setBusy(true);
        try {
          await redeem({ data: { code } });
          toast.success("Code accepted. Sign in again and set up your new phone.");
          await supabase.auth.signOut();
          window.location.assign("/auth");
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>Use recovery code</Button>
      <p className="text-[11px] text-muted-foreground">No codes? Ask your Business Admin to reset your two-step sign-in.</p>
    </div>
  );
}
