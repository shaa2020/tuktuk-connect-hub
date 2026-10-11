import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, KeyRound, ShieldCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect } from "@/components/kit";
import { connectMetaChannel, disconnectChannel, getCredentialStatus, removeAiKey, saveAiProvider } from "@/lib/admin.functions";

export function useCredentialHints(workspaceId: string) {
  const fn = useServerFn(getCredentialStatus);
  return useQuery({ queryKey: ["cred-hints", workspaceId], queryFn: () => fn({ data: { workspaceId } }) });
}

const PROVIDERS = [
  { v: "lovable", label: "Built-in AI (no key needed)", model: "" },
  { v: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { v: "anthropic", label: "Anthropic Claude", model: "claude-3-5-sonnet-latest" },
  { v: "gemini", label: "Google Gemini", model: "gemini-2.0-flash" },
  { v: "openrouter", label: "OpenRouter", model: "openai/gpt-4o-mini" },
  { v: "custom", label: "Other (OpenAI-compatible)", model: "" },
] as const;

type Current = { provider?: string | null; model?: string | null; base_url?: string | null } | null;

export function AiProviderPanel({ workspaceId, current, onSaved }: { workspaceId: string; current: Current; onSaved: () => void }) {
  const hints = useCredentialHints(workspaceId);
  const save = useServerFn(saveAiProvider);
  const remove = useServerFn(removeAiKey);
  const [provider, setProvider] = useState(current?.provider ?? "lovable");
  const [model, setModel] = useState(current?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(current?.base_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const keyHint = hints.data?.find((h) => h.kind === "ai_api_key")?.hint;
  const meta = PROVIDERS.find((p) => p.v === provider);

  async function submit() {
    setBusy(true);
    try {
      const r = await save({ data: { workspaceId, provider: provider as any, model, baseUrl, apiKey } });
      if (r.ok) { toast.success(provider === "lovable" ? "Using built-in AI" : "Connected — your model replied successfully"); setApiKey(""); hints.refetch(); onSaved(); }
      else toast.error(r.error);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Panel className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" />AI model</h2>
      <p className="text-xs text-muted-foreground">Use the built-in AI, or connect your own account. Your key is encrypted and can never be viewed again — only the last 4 characters are shown.</p>
      <Field label="Provider"><NativeSelect value={provider} onChange={(e) => { setProvider(e.target.value); const m = PROVIDERS.find((p) => p.v === e.target.value)?.model; if (m && !model) setModel(m); }}>
        {PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
      </NativeSelect></Field>
      {provider !== "lovable" && (<>
        <Field label="Model name"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={meta?.model || "model-name"} /></Field>
        {provider === "custom" && <Field label="Provider address (https)"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" /></Field>}
        <Field label={keyHint ? `API key (saved ${keyHint} — leave empty to keep)` : "API key"}>
          <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste key" />
        </Field>
      </>)}
      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" />}{provider === "lovable" ? "Use built-in AI" : "Test & save"}</Button>
        {keyHint && <Button variant="outline" onClick={async () => { await remove({ data: { workspaceId } }); toast.success("Key removed — back to built-in AI"); setProvider("lovable"); hints.refetch(); onSaved(); }}>Remove my key</Button>}
      </div>
      {current?.provider && current.provider !== "lovable" && <p className="flex items-center gap-1 text-xs text-success"><ShieldCheck className="size-3.5" />Active: {PROVIDERS.find((p) => p.v === current.provider)?.label} · {current.model}</p>}
    </Panel>
  );
}

const META_HELP: Record<string, { idLabel: string; tokenLabel: string; steps: string }> = {
  whatsapp: { idLabel: "Phone number ID", tokenLabel: "Permanent access token (System User)", steps: "Meta Business → WhatsApp → API setup. Subscribe the webhook to the “messages” field." },
  messenger: { idLabel: "Facebook Page ID", tokenLabel: "Page access token", steps: "Meta app → Messenger → add your Page. Subscribe to “messages” and “message_deliveries”." },
  instagram: { idLabel: "Instagram account ID", tokenLabel: "Page access token (with instagram_manage_messages)", steps: "Meta app → Instagram → link your Professional account. Subscribe to “messages”." },
};

export function MetaConnectForm({ workspaceId, channel, connected, onDone, connectionId, initialLabel, initialAccountId }: { workspaceId: string; channel: "whatsapp" | "messenger" | "instagram"; connected: boolean; onDone: () => void; connectionId?: string; initialLabel?: string | null; initialAccountId?: string | null }) {
  const hints = useCredentialHints(workspaceId);
  const connect = useServerFn(connectMetaChannel);
  const disconnect = useServerFn(disconnectChannel);
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [label, setLabel] = useState(initialLabel ?? "");
  const [token, setToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [busy, setBusy] = useState(false);
  const h = (k: string) => hints.data?.find((x) => x.kind === k)?.hint;
  const help = META_HELP[channel]!;
  const webhook = typeof window !== "undefined" ? `${window.location.origin}/api/public/webhooks/meta/${workspaceId}` : "";

  async function submit() {
    setBusy(true);
    try {
      const r = await connect({ data: { workspaceId, channel, connectionId, label, accountId, token, appSecret, verifyToken } });
      if (r.ok) { toast.success(`Connected: ${r.name}`); setToken(""); setAppSecret(""); setVerifyToken(""); hints.refetch(); onDone(); }
      else { toast.error(r.error); onDone(); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{help.steps}</p>
      <div className="space-y-1">
        <div className="text-xs font-semibold">Webhook address (paste into Meta)</div>
        <div className="flex gap-2"><Input readOnly value={webhook} className="text-xs" /><Button size="icon" variant="outline" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(webhook); toast.success("Copied"); }}><Copy /></Button></div>
      </div>
      <Field label="Account name (e.g. Main Line, Alfama Desk)"><Input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label={help.idLabel}><Input value={accountId} onChange={(e) => setAccountId(e.target.value)} inputMode="numeric" /></Field>
      <Field label={(connectionId && h(`${channel}_token:${connectionId}`)) ? `${help.tokenLabel} (saved ${h(`${channel}_token:${connectionId}`)})` : help.tokenLabel}><Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></Field>
      <Field label={h("meta_app_secret") ? `Meta app secret (saved ${h("meta_app_secret")})` : "Meta app secret"}><Input type="password" autoComplete="off" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} /></Field>
      <Field label={h("meta_verify_token") ? `Webhook verify token (saved ${h("meta_verify_token")})` : "Webhook verify token — make one up (12+ chars) and enter the same in Meta"}><Input type="password" autoComplete="off" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={submit} disabled={busy || !accountId.trim()}>{busy && <Loader2 className="animate-spin" />}Test & connect</Button>
        {connected && connectionId && <Button variant="outline" onClick={async () => { await disconnect({ data: { workspaceId, connectionId } }); toast.success("Disconnected"); hints.refetch(); onDone(); }}>Disconnect</Button>}
      </div>
      <p className="text-[11px] text-muted-foreground">Saved secrets are encrypted and never shown again. Leave a field empty to keep the saved value.</p>
    </div>
  );
}
