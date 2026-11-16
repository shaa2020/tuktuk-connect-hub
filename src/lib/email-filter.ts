// Decides whether an incoming email is a real guest/business message (booking, inquiry, question)
// or automated noise (newsletters, promotions, notifications, receipts).

export type EmailMeta = {
  from: string;
  subject: string;
  body: string;
  headers: Record<string, string | undefined>; // lower-cased header names
  labels: string[];
};

const AUTOMATED_SENDER =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|noreply|notifications?|notify|alerts?|mailer(-daemon)?|newsletter|news|marketing|promo(tions)?|offers?|deals|info-?mail|updates?|digest|bounce|postmaster|automated|system|billing|receipts?|invoice|account|security|support-?noreply)@/i;
const AUTOMATED_DOMAIN =
  /@([a-z0-9-]+\.)*(mailchimp|sendgrid|mailgun|amazonses|hubspot|klaviyo|sendinblue|brevo|mcsv|facebookmail|linkedin|google|accounts\.google|youtube|twitter|x|tiktok|pinterest|quora|medium|substack)\.(com|net|io)$/i;
const NOISE_LABELS = [
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "SPAM",
];

const BUSINESS_WORDS = [
  "tour",
  "tuk",
  "tuktuk",
  "lisbon",
  "lisboa",
  "book",
  "booking",
  "reserv",
  "itinerar",
  "price",
  "prices",
  "cost",
  "quote",
  "how much",
  "available",
  "availability",
  "guest",
  "people",
  "persons",
  "pax",
  "adults",
  "kids",
  "children",
  "pickup",
  "pick up",
  "pick-up",
  "hotel",
  "meeting point",
  "private",
  "sunset",
  "alfama",
  "belém",
  "belem",
  "sintra",
  "miradouro",
  "cancel",
  "reschedul",
  "refund",
  "date",
  "tomorrow",
  "today",
  "hours",
  "hour",
  "driver",
  "group",
  "trip",
  "visit",
  "wedding",
  "proposal",
  "cruise",
  "passeio",
  "reserva",
  "preço",
  "visita",
  "réservation",
  "excursion",
  "reserva",
  "führung",
  "buchung",
  "prenotazione",
];

export function isAutomated(m: EmailMeta): boolean {
  const h = m.headers;
  if (m.labels.some((l) => NOISE_LABELS.includes(l))) return true;
  if (h["list-unsubscribe"] || h["list-id"]) return true;
  if (/bulk|list|junk/i.test(h["precedence"] ?? "")) return true;
  if (h["auto-submitted"] && !/^no$/i.test(h["auto-submitted"])) return true;
  if (
    h["x-auto-response-suppress"] ||
    h["feedback-id"] ||
    h["x-campaign"] ||
    h["x-mailchimp-campaign"]
  )
    return true;
  if (AUTOMATED_SENDER.test(m.from) || AUTOMATED_DOMAIN.test(m.from)) return true;
  return false;
}

export function looksLikeBusiness(m: EmailMeta): boolean {
  if (/^\s*(re|fwd?|aw|res)\s*:/i.test(m.subject)) return true; // replies to our own emails
  const text = `${m.subject}\n${m.body}`.toLowerCase();
  return BUSINESS_WORDS.some((w) => text.includes(w));
}

/** True when the email should appear in the team inbox. Known contacts always pass unless automated. */
export function shouldImportEmail(m: EmailMeta, knownContact = false): boolean {
  if (isAutomated(m)) return false;
  return knownContact || looksLikeBusiness(m);
}
