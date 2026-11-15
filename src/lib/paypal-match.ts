// Pure rules for matching PayPal transactions to bookings and deciding payment status.

export type PayTxn = {
  txn_id: string;
  amount: number;
  currency: string;
  status: string;
  payer_email: string | null;
  reference_text: string | null;
};
export type OpenBooking = {
  id: string;
  reference: string;
  amount: number | null;
  currency: string;
  email: string | null;
  status: string;
};

/** PayPal status codes: S = completed, P = pending, V = reversed/refunded, D = denied. */
export const isCompleted = (s: string) => s === "S";

/** Booking reference written in the invoice id / note / custom field wins. Otherwise payer email + exact amount, only if exactly one booking fits. */
export function matchTxn(
  t: PayTxn,
  bookings: OpenBooking[],
): { booking_id: string; kind: "reference" | "email_amount" } | null {
  const text = (t.reference_text ?? "").toUpperCase();
  if (text) {
    const byRef = bookings.filter(
      (b) =>
        b.reference &&
        new RegExp(
          `(^|[^A-Z0-9])${b.reference.toUpperCase().replace(/[^A-Z0-9-]/g, "")}([^A-Z0-9]|$)`,
        ).test(text),
    );
    if (byRef.length === 1) return { booking_id: byRef[0]!.id, kind: "reference" };
  }
  const email = t.payer_email?.trim().toLowerCase();
  if (!email || t.amount <= 0) return null;
  const fits = bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.email?.trim().toLowerCase() === email &&
      b.amount != null &&
      Math.abs(b.amount - t.amount) < 0.005 &&
      b.currency === t.currency,
  );
  return fits.length === 1 ? { booking_id: fits[0]!.id, kind: "email_amount" } : null;
}

/** Status from completed PayPal money only (refunds are negative). Null = no PayPal evidence, leave the booking alone. */
export function paymentStatusFrom(
  total: number | null,
  txns: { amount: number; status: string }[],
): "paid" | "partially_paid" | "refunded" | null {
  const done = txns.filter((t) => isCompleted(t.status));
  if (!done.length) return null;
  const received = done.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const net = done.reduce((s, t) => s + t.amount, 0);
  if (received > 0 && net <= 0.005) return "refunded";
  if (net <= 0) return null;
  if (total == null || total <= 0) return "partially_paid";
  return net + 0.005 >= total ? "paid" : "partially_paid";
}
