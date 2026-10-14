import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/kit";
import { MetaConnectForm } from "@/components/admin-connections";
import { connectMetaChoice, finishMetaConnect, listMetaChoices, metaAppStatus, saveMetaApp, startMetaConnect } from "@/lib/meta-oauth.functions";

type Ch = "messenger" | "instagram";
const NAME: Record<Ch, string> = { messenger: "Facebook Page", instagram: "Instagram account" };

function MetaSetup({ workspaceId, redirectUri, onReady }: { workspaceId: string; redirectUri: string; onReady: () => void }) {
  const save = useServerFn(saveMetaApp);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
      <div className="text-sm font-semibold">One-time setup (about 5 minutes)</div>
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Open <a className="text-primary underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → Create app → "Other" → "Business".</li>
        <li>Add the products "Facebook Login for Business", "Messenger" and "Instagram".</li>
        <li>In Facebook Login → Settings, paste this into "Valid OAuth Redirect URIs":</li>
      </ol>
      <div className="flex gap-2"><Input readOnly value={redirectUri} className="text-xs" /><Button size="icon" variant="outline" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(redirectUri); toast.success("Copied"); }}><Copy /></Button></div>
      <p className="text-xs text-muted-foreground">4. Copy the App ID and App Secret from App settings → Basic:</p>
      <Field label="App ID"><Input inputMode="numeric" value={appId} onChange={(e) => setAppId(e.target.value)} /></Field>
      <Field label="App Secret"><Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
      <Button disabled={busy || !appId || !secret} onClick={async () => {
        setBusy(true);
        try {
          const r = await save({ data: { workspaceId, appId, appSecret: secret } });
          if (!r.ok) return toast.error(r.error);
          toast.success(`Meta app "${r.name}" saved`);
          r.warnings.forEach((w) => toast.warning(w));
          setSecret(""); onReady();
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
      }}>{busy && <Loader2 className="animate-spin" />}Save & finish setup</Button>
      <p className="text-[11px] text-muted-foreground">Done once. Message delivery is set up automatically. Saved encrypted, never shown again. Until Meta approves your app, only people with a role on the app can connect.</p>
    </div>
  );
}

/** One-click connect for Messenger/Instagram, with the old manual form kept under "Advanced". */
export function MetaOneClick({ workspaceId, channel, onDone }: { workspaceId: string; channel: Ch; onDone: () => void }) {
  const statusFn = useServerFn(metaAppStatus);
  const start = useServerFn(startMetaConnect);
  const st = useQuery({ queryKey: ["meta-app", workspaceId], queryFn: () => statusFn({ data: { workspaceId } }) });
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  if (st.isLoading) return <div className="mt-3 text-xs text-muted-foreground">Checking…</div>;
  return (
    <div className="mt-3 space-y-3">
      {st.data?.ready ? (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
          <Button className="w-full" size="lg" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const r = await start({ data: { workspaceId, channel } });
              if (!r.ok) { toast.error(r.error); setBusy(false); return; }
              window.location.href = r.url; // opens the Facebook app on phones, web login otherwise
            } catch (e) { toast.error((e as Error).message); setBusy(false); }
          }}>{busy && <Loader2 className="animate-spin" />}Continue with Facebook</Button>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Tap Allow, choose your {NAME[channel]}, done. No passwords or codes.</p>
        </div>
      ) : st.data && <MetaSetup workspaceId={workspaceId} redirectUri={st.data.redirectUri} onReady={() => st.refetch()} />}
      <button className="text-xs text-muted-foreground underline" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide" : "Advanced:"} manual setup</button>
      {advanced && <MetaConnectForm workspaceId={workspaceId} channel={channel} connected={false} onDone={onDone} />}
    </div>
  );
}

/** Shown after returning from Facebook: pick which Page / Instagram account to connect. */
export function MetaPicker({ workspaceId, nonce, channel, error, onDone }: { workspaceId: string; nonce?: string; channel?: Ch; error?: string; onDone: () => void }) {
  const navigate = useNavigate();
  const list = useServerFn(listMetaChoices);
  const pick = useServerFn(connectMetaChoice);
  const finish = useServerFn(finishMetaConnect);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => { if (error) { toast.error(error); navigate({ to: "/integrations", search: {}, replace: true }); } }, [error, navigate]);
  const q = useQuery({ enabled: !!nonce, queryKey: ["meta-choices", nonce], queryFn: () => list({ data: { workspaceId, nonce: nonce! } }) });
  if (!nonce || !channel) return null;
  const close = async () => { await finish({ data: { workspaceId, nonce } }).catch(() => {}); navigate({ to: "/integrations", search: {}, replace: true }); onDone(); };
  const choices = (q.data?.ok ? q.data.choices : []).filter((c) => channel === "messenger" || c.igId);
  return (
    <div className="space-y-3 rounded-xl border-2 border-primary/40 bg-card p-4">
      <div className="text-sm font-semibold">Choose the {NAME[channel]} to connect</div>
      {q.isLoading && <div className="text-xs text-muted-foreground">Loading your accounts…</div>}
      {q.data && !q.data.ok && <div className="text-xs text-destructive">{q.data.error}</div>}
      {q.data?.ok && choices.length === 0 && <div className="text-xs text-muted-foreground">{channel === "instagram" ? "None of the shared Facebook Pages has an Instagram professional account linked." : "No Facebook Pages were shared."} Tap Connect again and select them.</div>}
      <div className="divide-y">
        {choices.map((c) => {
          const label = channel === "instagram" ? `@${c.igUsername ?? c.igId}` : c.pageName;
          const ok = done.includes(c.pageId);
          return (
            <div key={c.pageId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{label}</div>{channel === "instagram" && <div className="truncate text-xs text-muted-foreground">via {c.pageName}</div>}</div>
              <Button size="sm" variant={ok ? "outline" : "default"} disabled={ok || !!busy} onClick={async () => {
                setBusy(c.pageId);
                const r = await pick({ data: { workspaceId, nonce, channel, pageId: c.pageId } }).catch((e) => ({ ok: false as const, error: (e as Error).message }));
                setBusy(null);
                if (r.ok) { toast.success(`Connected ${r.name}`); setDone((d) => [...d, c.pageId]); onDone(); } else toast.error(r.error);
              }}>{busy === c.pageId && <Loader2 className="animate-spin" />}{ok ? "Connected" : "Connect"}</Button>
            </div>
          );
        })}
      </div>
      <Button variant="secondary" size="sm" onClick={close}>Done</Button>
    </div>
  );
}
