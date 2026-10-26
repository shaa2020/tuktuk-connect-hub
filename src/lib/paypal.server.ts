// Server-only PayPal client. Credentials live encrypted in workspace_secrets; never sent to the browser.
import { getSecret } from "./secrets.server";
import { matchTxn, paymentStatusFrom, type OpenBooking } from "./paypal-match";

const API = "https://api-m.paypal.com";
async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any; }

export async function paypalToken(clientId: string, secret: string): Promise<string> {
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const j = (await res.json().catch(() => null)) as any;
  if (!res.ok || !j?.access_token) throw new Error(res.status === 401 ? "PayPal rejected the Client ID or Secret. Use the Live keys, not Sandbox." : `PayPal sign-in failed (${res.status}).`);
  return j.access_token as string;
}

async function creds(ws: string) {
  const [id, secret] = await Promise.all([getSecret(ws, "paypal_client_id"), getSecret(ws, "paypal_secret")]);
  return id && secret ? { id, secret } : null;
}
export async function paypalConfigured(ws: string) { return !!(await creds(ws)); }

/** Pull transactions for the last `days` (max 31 per PayPal call), store them once, match to bookings. */
export async function syncPaypalFor(ws: string, days = 3) {
  const c = await creds(ws);
  if (!c) return { skipped: "not connected" };
  const token = await paypalToken(c.id, c.secret);
  const end = new Date(), start = new Date(end.getTime() - Math.min(days, 31) * 864e5);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const rows: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `${API}/v1/reporting/transactions?start_date=${fmt(start)}&end_date=${fmt(end)}&fields=transaction_info,payer_info&page_size=500&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = (await res.json().catch(() => null)) as any;
    if (res.status === 403) throw new Error("PayPal app needs the 'Transaction search' feature turned on.");
    if (!res.ok) throw new Error(`PayPal transactions failed (${res.status}).`);
    for (const d of j?.transaction_details ?? []) {
      const t = d.transaction_info ?? {}, p = d.payer_info ?? {};
      if (!t.transaction_id || !t.transaction_amount) continue;
      rows.push({
        workspace_id: ws, txn_id: t.transaction_id, occurred_at: t.transaction_initiation_date,
        amount: Number(t.transaction_amount.value), fee: Number(t.fee_amount?.value ?? 0), currency: t.transaction_amount.currency_code,
        status: t.transaction_status ?? "P", payer_email: p.email_address ?? null, payer_name: p.payer_name?.alternate_full_name ?? null,
        reference_text: [t.invoice_id, t.custom_field, t.transaction_note, t.transaction_subject].filter(Boolean).join(" | ").slice(0, 500) || null,
      });
    }
    if (page >= (j?.total_pages ?? 1)) break;
  }
  const sb = await db();
  if (rows.length) await sb.from("paypal_transactions").upsert(rows, { onConflict: "workspace_id,txn_id", ignoreDuplicates: false });
  return { fetched: rows.length, ...(await matchAll(ws)) };
}

async function matchAll(ws: string) {
  const sb = await db();
  const { data: open } = await sb.from("paypal_transactions").select("id, txn_id, amount, currency, status, payer_email, reference_text").eq("workspace_id", ws).is("booking_id", null).limit(500);
  if (!open?.length) return { matched: 0, updated: 0 };
  const { data: bks } = await sb.from("bookings").select("id, reference, amount, currency, status, contacts(email)").eq("workspace_id", ws).eq("is_demo", false).neq("status", "cancelled").limit(2000);
  const list: OpenBooking[] = (bks ?? []).map((b: any) => ({ id: b.id, reference: b.reference, amount: b.amount == null ? null : Number(b.amount), currency: b.currency, status: b.status, email: b.contacts?.email ?? null }));
  const touched = new Set<string>(); let matched = 0;
  for (const t of open) {
    const m = matchTxn({ ...t, amount: Number(t.amount) }, list);
    if (!m) continue;
    await sb.from("paypal_transactions").update({ booking_id: m.booking_id, match_kind: m.kind }).eq("id", t.id);
    touched.add(m.booking_id); matched++;
  }
  let updated = 0;
  for (const id of touched) {
    const { data: b } = await sb.from("bookings").select("amount, payment_status_source").eq("id", id).maybeSingle();
    if (!b || b.payment_status_source === "booking_system") continue; // the website owns its own payment status
    const { data: tx } = await sb.from("paypal_transactions").select("amount, status").eq("booking_id", id);
    const st = paymentStatusFrom(b.amount == null ? null : Number(b.amount), (tx ?? []).map((x: any) => ({ amount: Number(x.amount), status: x.status })));
    if (!st) continue;
    await sb.from("bookings").update({ payment_status: st, payment_status_source: "paypal" }).eq("id", id);
    updated++;
  }
  return { matched, updated };
}
