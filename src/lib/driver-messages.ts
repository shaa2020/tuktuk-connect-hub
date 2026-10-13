// Clean, emoji-free WhatsApp messages sent to drivers. Pure — shared by server and tests.
export type DriverTour = {
  reference: string; tour_name: string; tour_date: string | null; start_time: string | null;
  duration_minutes: number | null; guests: number | null; pickup_location: string | null;
  payment_status: string; amount: number | null; currency: string | null; notes?: string | null;
  guest_name?: string | null; guest_phone?: string | null; vehicle?: string | null; ticket_url?: string | null;
};

export function longDate(d: string | null) {
  if (!d) return "Date to be confirmed";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function paymentLine(t: Pick<DriverTour, "payment_status" | "amount" | "currency">) {
  const amt = t.amount != null ? `${Number(t.amount).toFixed(2)} ${t.currency ?? "EUR"}` : null;
  if (t.payment_status === "paid") return "Payment: PAID";
  if (t.payment_status === "refunded") return "Payment: REFUNDED";
  if (t.payment_status === "partially_paid") return `Payment: PARTLY PAID${amt ? ` (total ${amt}, check balance)` : ""}`;
  return `Payment: NOT PAID${amt ? ` (collect ${amt})` : ""}`;
}

const time = (t: DriverTour) => t.start_time ? t.start_time.slice(0, 5) : "Time to be confirmed";
const mapsUrl = (p: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p + ", Lisboa")}`;

export function assignmentMessage(driver: string, t: DriverTour) {
  return [
    "TukTuk24 Lisbon - Tour Assignment", "",
    `Hello ${driver}, you have been assigned a tour.`, "",
    `Booking: ${t.reference}`,
    `Tour: ${t.tour_name}`,
    `Date: ${longDate(t.tour_date)}`,
    `Departure: ${time(t)}${t.duration_minutes ? ` (${t.duration_minutes} minutes)` : ""}`,
    `Meeting point: ${t.pickup_location || "To be confirmed"}`,
    `Guests: ${t.guests ?? "To be confirmed"}${t.guest_name ? ` (lead guest: ${t.guest_name})` : ""}`,
    t.vehicle ? `Vehicle: ${t.vehicle}` : null,
    paymentLine(t),
    t.notes ? `Notes: ${t.notes}` : null, "",
    t.pickup_location ? `Navigation: ${mapsUrl(t.pickup_location)}` : null,
    t.guest_phone ? `Guest contact: ${t.guest_phone}` : null,
    t.ticket_url ? `Guest ticket: ${t.ticket_url}` : null,
  ].filter((l) => l !== null).join("\n").trim();
}

export function scheduleMessage(driver: string, date: string, tours: DriverTour[]) {
  const sorted = [...tours].sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  const blocks = sorted.map((t, i) => [
    `${i + 1}. ${time(t)}${t.duration_minutes ? ` (${t.duration_minutes} min)` : ""} - ${t.tour_name}`,
    `Booking: ${t.reference}`,
    `Meeting point: ${t.pickup_location || "To be confirmed"}`,
    `Guests: ${t.guests ?? "?"}${t.guest_name ? ` (${t.guest_name}${t.guest_phone ? `, ${t.guest_phone}` : ""})` : ""}`,
    t.vehicle ? `Vehicle: ${t.vehicle}` : null,
    paymentLine(t),
    t.notes ? `Notes: ${t.notes}` : null,
  ].filter(Boolean).join("\n"));
  return [
    "TukTuk24 Lisbon - Daily Schedule", "",
    `Driver: ${driver}`,
    `Date: ${longDate(date)}`,
    `Assigned tours: ${tours.length}`, "",
    blocks.join("\n\n"), "",
    "Please arrive at each meeting point 10 minutes before departure.",
  ].join("\n").trim();
}

export function removedMessage(driver: string, t: Pick<DriverTour, "reference" | "tour_name" | "tour_date" | "start_time">, reason: "cancelled" | "reassigned") {
  return [
    "TukTuk24 Lisbon - Schedule Notice", "",
    `Hello ${driver}, booking ${t.reference} (${t.tour_name}, ${longDate(t.tour_date)}${t.start_time ? ` at ${t.start_time.slice(0, 5)}` : ""}) has been ${reason === "cancelled" ? "cancelled" : "assigned to another driver"}.`,
    "It has been removed from your schedule.",
  ].join("\n");
}

/** Lisbon date (YYYY-MM-DD) and minutes since midnight. */
export function lisbonNow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export const SCHEDULE_SEND_MINUTE = 8 * 60 + 30;
