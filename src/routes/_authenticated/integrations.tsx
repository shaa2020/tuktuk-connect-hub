import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { ToneBadge } from "@/components/kit";
import { CHANNEL_LABEL, type ChannelType } from "@/lib/domain";
import { ChannelIcon } from "./inbox";
import { useEffect, useState } from "react";
import { ConnectAccountButton } from "@/components/connect-account";
import { Button } from "@/components/ui/button";
import { MetaConnectForm } from "@/components/admin-connections";
import { MetaOneClick, MetaPicker } from "@/components/meta-one-click";
import { TemplatesPanel } from "@/components/wa-templates";
import { useServerFn } from "@tanstack/react-start";
import { connectEmailChannel, connectGmailAppPassword, connectTelegramBot, disconnectChannel, saveWebchat, renameConnection, syncEmailNow } from "@/lib/admin.functions";
import { Input } from "@/components/ui/input";
import { Globe, Plus, RefreshCw } from "lucide-react";
import { syncWebsiteKnowledge, websiteStatus } from "@/lib/website.functions";
import { embedSnippet } from "@/lib/webchat";
import { toast } from "sonner";

function EmailControls({ workspaceId, connected, onDone }: { workspaceId: string; connected: boolean; onDone: () => void }) {
  const connect = useServerFn(connectEmailChannel);
  const sync = useServerFn(syncEmailNow);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; imported?: number }>) => {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Failed");
      else toast.success(r.imported !== undefined ? `${r.imported} new email(s) imported` : "Done");
    } finally { setBusy(false); onDone(); }
  };
  return (
    <div className="mt-3 space-y-2">
      {!connected && <p className="rounded-lg bg-muted/70 px-3 py-2 text-xs text-muted-foreground">Connects the business Gmail (tuktuklisbon24@gmail.com). Customer emails appear in the Inbox and replies are sent from that address.</p>}
      <div className="flex flex-wrap gap-2">
        {!connected && <Button size="sm" disabled={busy} onClick={() => run(() => connect({ data: { workspaceId, connect: true } }) as any)}>Connect Gmail</Button>}
        {connected && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => sync({ data: { workspaceId } }) as any)}>Check for new emails</Button>}
        {connected && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => connect({ data: { workspaceId, connect: false } }) as any)}>Disconnect</Button>}
      </div>
    </div>
  );
}

function GmailAppForm({ workspaceId, connectionId, initialAddress, initialLabel, onDone }: { workspaceId: string; connectionId?: string; initialAddress?: string | null; initialLabel?: string | null; onDone: () => void }) {
  const connect = useServerFn(connectGmailAppPassword);
  const [address, setAddress] = useState(initialAddress ?? "");
  const [label, setLabel] = useState(initialLabel ?? "");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      try {
        const r = await connect({ data: { workspaceId, connectionId, address, appPassword: pass, label } });
        if (r.ok) { toast.success(`Connected — ${r.imported} email(s) imported`); setPass(""); onDone(); } else toast.error(r.error);
      } catch (err) { toast.error((err as Error).message.slice(0, 200)); } finally { setBusy(false); }
    }}>
      <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
        <li>In that Gmail, turn on 2-Step Verification (Google Account → Security).</li>
        <li>Open <a className="text-primary underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>, create one named "Tuk Tuk 24".</li>
        <li>Paste the 16-letter code below. It's stored encrypted and never shown again.</li>
      </ol>
      <Input type="email" required placeholder="other@gmail.com" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!connectionId} />
      <Input placeholder="Account name (e.g. Bookings Desk)" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input type="password" required autoComplete="new-password" placeholder="App password (16 letters)" value={pass} onChange={(e) => setPass(e.target.value)} />
      <Button size="sm" type="submit" disabled={busy}>{busy ? "Checking…" : "Connect this Gmail"}</Button>
    </form>
  );
}

const META = ["whatsapp", "instagram", "messenger"] as const;
const ORDER: ChannelType[] = ["whatsapp", "instagram", "messenger", "email", "telegram", "webchat"];

function WebsitePanel({ workspaceId, canSync }: { workspaceId: string; canSync: boolean }) {
  const status = useServerFn(websiteStatus);
  const sync = useServerFn(syncWebsiteKnowledge);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["website-status", workspaceId], queryFn: () => status({ data: { workspaceId } }) });
  const d = q.data;
  return (
    <Panel className="scroll-mt-20 p-4" id="ch-website">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><Globe className="size-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Website · tuktuk24lisbon.com</div>
          <div className="text-xs text-muted-foreground">
            {q.isLoading ? "Checking…" : d?.ok ? `${d.tourCount} live tours · ${d.lastSync ? `AI knowledge updated ${new Date(d.lastSync).toLocaleString()}` : "not yet copied to AI knowledge"}` : d?.error}
          </div>
        </div>
        <ToneBadge tone={d?.ok ? "success" : q.isLoading ? "muted" : "danger"}>{d?.ok ? "Connected" : q.isLoading ? "…" : "Error"}</ToneBadge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Quote prices come live from your website. Sync copies your tours, prices, policies and FAQs into the AI knowledge so suggested replies stay up to date.</p>
      {canSync && <Button size="sm" variant="outline" className="mt-2" disabled={busy || !d?.ok} onClick={async () => {
        setBusy(true);
        const r = await sync({ data: { workspaceId } });
        setBusy(false);
        if (r.ok) { toast.success(`Synced ${r.tours} tours and business info`); q.refetch(); } else toast.error(r.error);
      }}><RefreshCw className={busy ? "animate-spin" : ""} />Sync now</Button>}
    </Panel>
  );
}

function WebchatSetup({ workspaceId, row, onDone }: { workspaceId: string; row?: { account_id: string | null; status: string; config: unknown }; onDone: () => void }) {
  const save = useServerFn(saveWebchat);
  const cfg = (row?.config ?? {}) as { allowed_origins?: string[]; greeting?: string };
  const [origins, setOrigins] = useState((cfg.allowed_origins ?? []).join(", "));
  const [greeting, setGreeting] = useState(cfg.greeting ?? "Hi! How can we help?");
  const [busy, setBusy] = useState(false);
  const on = row?.status === "connected" && row.account_id;
  const snippet = on ? embedSnippet(window.location.origin, row!.account_id!) : "";
  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">Adds a chat bubble to your own website. Visitor messages arrive in the Inbox; your replies appear in the bubble within a few seconds.</p>
      <Input value={greeting} onChange={(e) => setGreeting(e.target.value)} maxLength={200} aria-label="Greeting message" placeholder="Greeting message" />
      <Input value={origins} onChange={(e) => setOrigins(e.target.value)} aria-label="Allowed websites" placeholder="Allowed websites (e.g. www.mysite.com) — empty = any" />
      <Button size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const r = await save({ data: { workspaceId, allowedOrigins: origins, greeting } }); if (!r.ok) return toast.error(r.error); toast.success(on ? "Chat settings saved" : "Website chat switched on"); onDone(); }
        finally { setBusy(false); }
      }}>{on ? "Save chat settings" : "Switch on website chat"}</Button>
      {on && (
        <div className="space-y-1">
          <div className="text-xs font-medium">Paste this before &lt;/body&gt; on your website:</div>
          <code className="block break-all rounded bg-muted p-2 text-[11px]">{snippet}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(snippet).then(() => toast.success("Copied"))}>Copy code</Button>
        </div>
      )}
    </div>
  );
}

function TelegramForm({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const connect = useServerFn(connectTelegramBot);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3 space-y-2 rounded-lg border p-3">
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>In Telegram, open <a className="text-primary underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> and send <b>/newbot</b>.</li>
        <li>Choose a name and username; BotFather replies with a token like <code>123456:ABC…</code>.</li>
        <li>Paste the token here. Customers message your bot; replies are sent from it.</li>
      </ol>
      <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bot token" autoComplete="off" aria-label="Telegram bot token" />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Account name (optional)" maxLength={60} aria-label="Account name" />
      <Button size="sm" disabled={busy || !token.trim()} onClick={async () => {
        setBusy(true);
        try {
          const r = await connect({ data: { workspaceId, token: token.trim(), label: label.trim() } });
          if (!r.ok) return toast.error(r.error);
          toast.success(`Connected ${r.name}`); setToken(""); onDone();
        } finally { setBusy(false); }
      }}>Connect bot</Button>
    </div>
  );
}

function IntegrationsPage() {
  const { workspaceId, role, platformConnectors } = useWorkspace();
  const { connect, meta_pick, meta_channel, meta_error } = Route.useSearch();
  const [open, setOpen] = useState<string | null>(connect ? (connect === "email" ? "new-gmail" : `new-${connect}`) : null);
  useEffect(() => {
    if (!connect) return;
    setOpen(connect === "email" ? "new-gmail" : `new-${connect}`);
    setTimeout(() => document.getElementById(`ch-${connect}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, [connect]);
  const rename = useServerFn(renameConnection);
  const disconnect = useServerFn(disconnectChannel);
  const q = useQuery({
    queryKey: ["channels-full", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("channel_connections").select("*").eq("workspace_id", workspaceId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const isAdmin = role === "admin";
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Connected accounts" description="Connect as many Gmail inboxes, WhatsApp numbers, Instagram accounts and Facebook Pages as you need. Status shown is the real connection state." actions={<ConnectAccountButton />} />
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState message={(q.error as Error).message} /> : (
        <div className="space-y-4">
          {isAdmin && <MetaPicker workspaceId={workspaceId} nonce={meta_pick} channel={meta_channel} error={meta_error} onDone={() => q.refetch()} />}
          {platformConnectors && <WebsitePanel workspaceId={workspaceId} canSync={role === "admin" || role === "manager"} />}
          {ORDER.map((ch) => {
            const rows = (q.data ?? []).filter((c) => c.channel === ch);
            const isMeta = (META as readonly string[]).includes(ch);
            return (
              <Panel key={ch} className="scroll-mt-20 p-4" id={`ch-${ch}`}>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted"><ChannelIcon channel={ch} className="size-5" /></div>
                  <div className="flex-1 text-sm font-semibold">{CHANNEL_LABEL[ch]}</div>
                  <span className="text-xs text-muted-foreground">{rows.filter((r) => r.status === "connected").length} connected</span>
                </div>
                <div className="divide-y">
                  {rows.map((c) => (
                    <div key={c.id} className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{c.account_label || c.display_name || "Not set up"}</div>
                          {c.account_label && c.display_name && <div className="truncate text-xs text-muted-foreground">{c.display_name}</div>}
                          {c.last_error && <div className="text-xs text-destructive">{c.last_error}</div>}
                        </div>
                        <ToneBadge tone={c.status === "connected" ? "success" : c.status === "error" ? "danger" : "muted"}>{c.status === "connected" ? "Connected" : c.status === "error" ? "Error" : "Not connected"}</ToneBadge>
                      </div>
                      {isAdmin && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isMeta && <Button size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.status === "connected" ? "Manage" : "Connect"}</Button>}
                          {c.status === "connected" && <Button size="sm" variant="ghost" onClick={async () => {
                            const label = window.prompt("Account name (e.g. Main Line, Alfama Desk)", c.account_label ?? "");
                            if (label === null) return;
                            const r = await rename({ data: { workspaceId, connectionId: c.id, label: label.slice(0, 60) } });
                            if (r.ok) { toast.success("Renamed"); q.refetch(); } else toast.error(r.error);
                          }}>Rename</Button>}
                        </div>
                      )}
                      {open === c.id && isMeta && <MetaConnectForm workspaceId={workspaceId} channel={ch as "whatsapp"} connectionId={c.id} initialLabel={c.account_label} initialAccountId={c.account_id} connected={c.status === "connected"} onDone={() => q.refetch()} />}
                      {ch === "email" && isAdmin && (c.config as any)?.mode === "imap" && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => setOpen(open === c.id ? null : c.id)}>{c.status === "connected" ? "Update password" : "Reconnect"}</Button>
                          {c.status === "connected" && <Button size="sm" variant="ghost" onClick={async () => { const r = await disconnect({ data: { workspaceId, connectionId: c.id } }); if (r.ok) { toast.success("Disconnected"); q.refetch(); } else toast.error(r.error); }}>Disconnect</Button>}
                        </div>
                      )}
                      {open === c.id && ch === "email" && <GmailAppForm workspaceId={workspaceId} connectionId={c.id} initialAddress={c.account_id} initialLabel={c.account_label} onDone={() => { q.refetch(); setOpen(null); }} />}
                      {ch === "email" && isAdmin && platformConnectors && (c.config as any)?.mode !== "imap" && <EmailControls workspaceId={workspaceId} connected={c.status === "connected"} onDone={() => q.refetch()} />}
                    </div>
                  ))}
                  {rows.length === 0 && ch === "email" && isAdmin && platformConnectors && <EmailControls workspaceId={workspaceId} connected={false} onDone={() => q.refetch()} />}
                </div>
                {ch === "whatsapp" && rows.some((r) => r.status === "connected" && (r.config as any)?.mode === "connector") && <TemplatesPanel workspaceId={workspaceId} isAdmin={isAdmin} />}
                {isAdmin && isMeta && (
                  <>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(open === `new-${ch}` ? null : `new-${ch}`)}><Plus />Add {rows.some((r) => r.status === "connected") ? "another" : "an"} account</Button>
                    {open === `new-${ch}` && (ch === "whatsapp" ? <MetaConnectForm workspaceId={workspaceId} channel="whatsapp" connected={false} onDone={() => { q.refetch(); setOpen(null); }} /> : <MetaOneClick workspaceId={workspaceId} channel={ch as "instagram"} onDone={() => { q.refetch(); setOpen(null); }} />)}
                  </>
                )}
                {ch === "webchat" && isAdmin && <WebchatSetup workspaceId={workspaceId} row={rows[0]} onDone={() => q.refetch()} />}
                {ch === "telegram" && isAdmin && (
                  <>
                    {rows.filter((r) => r.status === "connected").map((r) => (
                      <Button key={r.id} size="sm" variant="ghost" className="mt-2" onClick={async () => { const x = await disconnect({ data: { workspaceId, connectionId: r.id } }); if (x.ok) { toast.success("Bot disconnected"); q.refetch(); } else toast.error(x.error); }}>Disconnect {r.display_name}</Button>
                    ))}
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(open === "new-telegram" ? null : "new-telegram")}><Plus />{rows.some((r) => r.status === "connected") ? "Add another bot" : "Connect a Telegram bot"}</Button>
                    {open === "new-telegram" && <TelegramForm workspaceId={workspaceId} onDone={() => { q.refetch(); setOpen(null); }} />}
                  </>
                )}
                {ch === "email" && isAdmin && (
                  <>
                    <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(open === "new-gmail" ? null : "new-gmail")}><Plus />{platformConnectors || rows.length ? "Add another Gmail" : "Connect Gmail (app password)"}</Button>
                    {open === "new-gmail" && <GmailAppForm workspaceId={workspaceId} onDone={() => { q.refetch(); setOpen(null); }} />}
                  </>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

const CONNECT_KEYS = ["whatsapp", "instagram", "messenger", "email", "website", "telegram", "webchat"] as const;
export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: (s: Record<string, unknown>): { connect?: (typeof CONNECT_KEYS)[number]; meta_pick?: string; meta_channel?: "messenger" | "instagram"; meta_error?: string } => ({
    ...(CONNECT_KEYS.includes(s.connect as any) ? { connect: s.connect as (typeof CONNECT_KEYS)[number] } : {}),
    ...(typeof s.meta_pick === "string" && /^[0-9a-f-]{36}$/.test(s.meta_pick) ? { meta_pick: s.meta_pick } : {}),
    ...(s.meta_channel === "messenger" || s.meta_channel === "instagram" ? { meta_channel: s.meta_channel } : {}),
    ...(typeof s.meta_error === "string" ? { meta_error: s.meta_error.slice(0, 200) } : {}),
  }),
  head: () => ({ meta: [{ title: "Connected accounts — TeamInbox" }] }),
  component: IntegrationsPage,
});
