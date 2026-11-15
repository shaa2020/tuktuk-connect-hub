import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { PageContainer } from "@/components/app-shell";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDateTime } from "@/components/kit";
import { paypalStatus, savePaypal, syncPaypalNow } from "@/lib/paypal.functions";

export const Route = createFileRoute("/_authenticated/finance")({
  head: () => ({
    meta: [
      { title: "Finance — TeamInbox" },
      { name: "description", content: "PayPal payments matched to tour bookings." },
      { property: "og:title", content: "Finance — TeamInbox" },
      { property: "og:description", content: "PayPal payments matched to tour bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

const eur = (n: number, c = "EUR") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c }).format(n);
const STATUS: Record<string, string> = { S: "Completed", P: "Pending", V: "Reversed", D: "Denied" };

function FinancePage() {
  const ws = useWorkspace();
  const allowed = ws.role === "admin" || ws.role === "manager";
  const qc = useQueryClient();
  const status = useServerFn(paypalStatus),
    sync = useServerFn(syncPaypalNow);
  const st = useQuery({
    queryKey: ["paypal-status", ws.workspaceId],
    enabled: allowed,
    queryFn: () => status({ data: { workspaceId: ws.workspaceId } }),
  });
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const tx = useQuery({
    queryKey: ["paypal-tx", ws.workspaceId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paypal_transactions")
        .select("*, bookings(reference, tour_name)")
        .eq("workspace_id", ws.workspaceId)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const owed = useQuery({
    queryKey: ["owed", ws.workspaceId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, reference, tour_name, tour_date, amount, currency, payment_status, contacts(full_name)",
        )
        .eq("workspace_id", ws.workspaceId)
        .eq("is_demo", false)
        .eq("status", "confirmed")
        .in("payment_status", ["unknown", "pending", "partially_paid"])
        .gte("tour_date", new Date().toISOString().slice(0, 10))
        .order("tour_date")
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [busy, setBusy] = useState(false);

  if (!allowed)
    return (
      <PageContainer>
        <EmptyState icon={<ShieldAlert />} title="Finance is for admins and managers" />
      </PageContainer>
    );

  const rows = tx.data ?? [];
  const done = rows.filter((r) => r.status === "S");
  const received = done
    .filter((r) => Number(r.amount) > 0)
    .reduce((s, r) => s + Number(r.amount), 0);
  const refunds = -done
    .filter((r) => Number(r.amount) < 0)
    .reduce((s, r) => s + Number(r.amount), 0);
  const fees = -done.reduce((s, r) => s + Number(r.fee), 0);
  const unmatched = done.filter((r) => !r.booking_id && Number(r.amount) > 0);

  const runSync = async () => {
    setBusy(true);
    const r = await sync({ data: { workspaceId: ws.workspaceId } });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const x = r as { fetched?: number; matched?: number };
    toast.success(`PayPal checked: ${x.fetched ?? 0} payments, ${x.matched ?? 0} newly matched.`);
    qc.invalidateQueries({ queryKey: ["paypal-tx"] });
    qc.invalidateQueries({ queryKey: ["owed"] });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Finance"
        description="Real PayPal money, matched to your bookings. Last 30 days."
        actions={
          st.data?.connected ? (
            <Button onClick={runSync} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} /> Check PayPal now
            </Button>
          ) : undefined
        }
      />
      {st.isLoading ? (
        <ListSkeleton />
      ) : !st.data?.connected ? (
        <ConnectPaypal
          admin={ws.role === "admin"}
          onDone={() => {
            qc.invalidateQueries();
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Received" value={eur(received)} />
            <Stat label="PayPal fees" value={eur(fees)} />
            <Stat label="Refunded" value={eur(refunds)} />
            <Stat label="Net" value={eur(received - fees - refunds)} />
          </div>
          {unmatched.length > 0 && (
            <p className="mt-3 rounded-lg bg-warning/15 p-3 text-sm font-medium">
              {unmatched.length} PayPal payment{unmatched.length > 1 ? "s" : ""} could not be linked
              to a booking. Ask guests to put their booking reference in the PayPal note.
            </p>
          )}
          <Panel className="mt-4">
            <h2 className="mb-2 font-display font-semibold">PayPal payments</h2>
            {tx.isLoading ? (
              <ListSkeleton />
            ) : tx.error ? (
              <ErrorState message="Couldn't load payments." onRetry={() => tx.refetch()} />
            ) : !rows.length ? (
              <p className="text-sm text-muted-foreground">
                No PayPal payments in the last 30 days. New payments can take up to 3 hours to
                appear.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.payer_name || r.payer_email || "PayPal"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {fmtDateTime(r.occurred_at)} · {STATUS[r.status] ?? r.status} ·{" "}
                        {r.bookings ? (
                          `${r.bookings.reference} ${r.bookings.tour_name}`
                        ) : (
                          <span className="font-semibold text-destructive">Not linked</span>
                        )}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 font-semibold ${Number(r.amount) < 0 ? "text-destructive" : ""}`}
                    >
                      {eur(Number(r.amount), r.currency)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
      <Panel className="mt-4">
        <h2 className="mb-2 font-display font-semibold">Upcoming tours not fully paid</h2>
        {owed.isLoading ? (
          <ListSkeleton />
        ) : !(owed.data ?? []).length ? (
          <p className="text-sm text-muted-foreground">All upcoming confirmed tours are paid.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(owed.data ?? []).map((b: any) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <Link to="/bookings" className="min-w-0">
                  <div className="truncate font-medium">
                    {b.reference} · {b.contacts?.full_name ?? "Guest"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {b.tour_date} · {b.tour_name} ·{" "}
                    {b.payment_status === "partially_paid" ? "Partly paid" : "Not paid"}
                  </div>
                </Link>
                <div className="shrink-0 font-semibold">
                  {b.amount != null ? eur(Number(b.amount), b.currency) : "No price"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Panel>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
    </Panel>
  );
}

function ConnectPaypal({ admin, onDone }: { admin: boolean; onDone: () => void }) {
  const ws = useWorkspace();
  const save = useServerFn(savePaypal);
  const [id, setId] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false);
  if (!admin)
    return (
      <Panel>
        <EmptyState
          icon={<Wallet />}
          title="PayPal isn't connected yet"
          description="Ask the Business Admin to connect PayPal here."
        />
      </Panel>
    );
  const go = async () => {
    setBusy(true);
    const r = await save({ data: { workspaceId: ws.workspaceId, clientId: id, secret } }).catch(
      (e) => ({ ok: false as const, error: (e as Error).message }),
    );
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      "warning" in r && r.warning
        ? `PayPal saved. ${r.warning}`
        : "PayPal connected. Payments imported.",
    );
    onDone();
  };
  return (
    <Panel>
      <h2 className="flex items-center gap-2 font-display font-semibold">
        <Wallet className="size-5" /> Connect PayPal
      </h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          On a computer, open{" "}
          <a
            className="font-medium text-primary underline"
            href="https://developer.paypal.com/dashboard/applications/live"
            target="_blank"
            rel="noreferrer"
          >
            developer.paypal.com → Apps &amp; Credentials
          </a>{" "}
          and log in with your business PayPal.
        </li>
        <li>
          Switch to <b>Live</b>, tap <b>Create App</b>, name it "TukTuk Hub".
        </li>
        <li>
          In the app's features, tick <b>Transaction search</b> and save.
        </li>
        <li>
          Copy the <b>Client ID</b> and <b>Secret</b> into the boxes below.
        </li>
      </ol>
      <div className="mt-3 grid gap-2">
        <Input
          placeholder="Client ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="off"
        />
        <Input
          placeholder="Secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
        />
        <Button onClick={go} disabled={busy || id.length < 20 || secret.length < 20}>
          {busy ? "Checking with PayPal…" : "Save & connect"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Keys are stored encrypted and never shown again. This app can only read payments; it cannot
        send money.
      </p>
    </Panel>
  );
}
