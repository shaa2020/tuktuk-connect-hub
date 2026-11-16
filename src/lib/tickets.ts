// Browser-safe ticket rules shared by the ticket page, bookings screen and the auto-sender.
export type PayStatus = "unknown" | "pending" | "paid" | "partially_paid" | "refunded";
export type TicketAuto = "off" | "all" | "paid" | "unpaid";

export const TICKET_BASE_URL = "https://tickets.tuktuk24lisbon.com";

export function isPaid(p: PayStatus) {
  return p === "paid";
}

export function payLabel(p: PayStatus): { label: string; detail: string; paid: boolean } {
  if (p === "paid")
    return { label: "PAID", detail: "Fully paid — nothing to pay on the day.", paid: true };
  if (p === "partially_paid")
    return {
      label: "PARTLY PAID",
      detail: "The remaining balance is paid on the day of the tour.",
      paid: false,
    };
  if (p === "refunded")
    return { label: "REFUNDED", detail: "This booking was refunded.", paid: false };
  return { label: "NOT PAID", detail: "Payment is due on the day of the tour.", paid: false };
}

/** Only confirmed, not-refunded bookings get tickets; the auto mode then filters by payment. */
export function ticketEligible(mode: TicketAuto, b: { status: string; payment_status: PayStatus }) {
  if (mode === "off" || b.status !== "confirmed" || b.payment_status === "refunded") return false;
  if (mode === "paid") return isPaid(b.payment_status);
  if (mode === "unpaid") return !isPaid(b.payment_status);
  return true;
}

export function ticketMessage(
  b: {
    tour_name: string;
    tour_date: string | null;
    start_time: string | null;
    reference: string;
    payment_status: PayStatus;
    amount: number | null;
    currency: string;
    ticket_token: string;
  },
  businessName = "Tuk Tuk 24 Lisbon",
  baseUrl: string = TICKET_BASE_URL,
) {
  const pay = payLabel(b.payment_status);
  const when = [b.tour_date, b.start_time?.slice(0, 5)].filter(Boolean).join(" at ");
  const amt = !pay.paid && b.amount ? ` Amount: ${b.amount} ${b.currency}.` : "";
  return `Your ${businessName} ticket\n${b.tour_name}${when ? ` — ${when}` : ""}\nBooking ${b.reference}\nPayment: ${pay.label}. ${pay.detail}${amt}\n\n${baseUrl === TICKET_BASE_URL ? "Show this ticket to your driver" : "Show this ticket when you arrive"}: ${baseUrl.replace(/\/$/, "")}/ticket/${b.ticket_token}`;
}
