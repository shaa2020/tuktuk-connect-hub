// Pure builders for automatic guest WhatsApp messages (evening reminder + review request).

export const REMINDER_SEND_MINUTE = 19 * 60; // 19:00 Lisbon, the evening before
export const REVIEW_DELAY_MINUTES = 120; // 2 hours after the tour ends

const POINTS: { match: RegExp; name: string; q: string }[] = [
  {
    match: /fado|alfama|chafariz/i,
    name: "Fado Museum, Alfama",
    q: "Largo do Chafariz de Dentro 1, 1100-139 Lisboa",
  },
  {
    match: /hard ?rock|liberdade/i,
    name: "Hard Rock Cafe, Avenida da Liberdade",
    q: "Av. da Liberdade 2, 1250-144 Lisboa",
  },
  {
    match: /manteigaria|time ?out|24 de julho/i,
    name: "Manteigaria, Time Out Market",
    q: "Av. 24 de Julho 50, 1200-109 Lisboa",
  },
];

export function mapsLink(place: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(place)}`;
}

/** Known meeting point → its exact address pin; anything else (a hotel) → pin of the text itself. */
export function pickupPin(
  pickup: string | null | undefined,
): { label: string; url: string } | null {
  const p = (pickup ?? "").trim();
  if (!p) return null;
  const known = POINTS.find((x) => x.match.test(p));
  return known
    ? { label: known.name, url: mapsLink(known.q) }
    : { label: p, url: mapsLink(`${p}, Lisboa`) };
}

export type GuestTour = {
  guest_name: string | null;
  tour_name: string | null;
  tour_date: string | null;
  start_time: string | null;
  pickup_location: string | null;
  driver_name?: string | null;
  ticket_url?: string | null;
};

export function reminderMessage(t: GuestTour) {
  const first = (t.guest_name ?? "").trim().split(/\s+/)[0] || "there";
  const pin = pickupPin(t.pickup_location);
  const lines = [
    `Hello ${first}, this is Tuk Tuk 24 Lisbon. A quick reminder about your tour tomorrow:`,
    "",
    `Tour: ${t.tour_name || "Lisbon tuk tuk tour"}`,
    `Time: ${t.start_time ? t.start_time.slice(0, 5) : "as agreed with our team"}`,
    pin
      ? `Meeting point: ${pin.label}\nMap: ${pin.url}`
      : "Meeting point: please reply to tell us where you would like to be picked up.",
  ];
  if (t.driver_name) lines.push(`Your guide: ${t.driver_name}`);
  if (t.ticket_url) lines.push(`Your ticket: ${t.ticket_url}`);
  lines.push(
    "",
    "Please be there 5 minutes early. Reply here if anything changes. See you tomorrow!",
  );
  return lines.join("\n");
}

export function reviewMessage(
  guestName: string | null,
  tourName: string | null,
  googleUrl: string | null,
  tripUrl: string | null,
) {
  const first = (guestName ?? "").trim().split(/\s+/)[0] || "there";
  const lines = [
    `Hello ${first}, thank you for touring Lisbon with Tuk Tuk 24 today${tourName ? ` (${tourName})` : ""}! We hope you had a great time.`,
    "",
    "If you enjoyed it, a short review would mean a lot to our small team:",
  ];
  if (googleUrl) lines.push(`Google: ${googleUrl}`);
  if (tripUrl) lines.push(`TripAdvisor: ${tripUrl}`);
  lines.push("", "Obrigado and enjoy the rest of your stay!");
  return lines.join("\n");
}

/** Next calendar date (YYYY-MM-DD) after a Lisbon date. */
export function nextDate(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Minutes since Lisbon midnight when a tour on `today` ends, or null if unknown/not today. */
export function tourEndMinute(
  tourDate: string | null,
  start: string | null,
  duration: number | null,
  today: string,
) {
  if (tourDate !== today || !start || !/^\d{1,2}:\d{2}/.test(start)) return null;
  const [h, m] = start.split(":").map(Number);
  return h! * 60 + m! + (duration && duration > 0 ? duration : 120);
}

/** Is the review due now? Tours from earlier days are always due; today's are due 2h after they end. */
export function reviewDue(
  tourDate: string | null,
  start: string | null,
  duration: number | null,
  today: string,
  nowMinute: number,
) {
  if (!tourDate) return false;
  if (tourDate < today) return true;
  const end = tourEndMinute(tourDate, start, duration, today);
  return end !== null && nowMinute >= end + REVIEW_DELAY_MINUTES;
}
