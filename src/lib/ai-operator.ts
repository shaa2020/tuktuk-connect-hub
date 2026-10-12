// Pure, browser-safe helpers for the AI Operator (tested in ai-operator.test.ts).

export type OperatorDecision = {
  action: "reply" | "handoff" | "none";
  reply: string;
  tags: string[];
  urgent: boolean;
  alert: string;
  booking: {
    date: string; time: string; guests: number; tour: string; pickup: string; name: string;
    children: string; dropoff: string; contact: string; language: string; special: string;
  } | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PARSE_FAIL_ALERT = "The AI could not understand this conversation.";

/** "12:30 PM", "9am", "14:00", "14h30" → "HH:MM" (24h); anything unreadable → "". */
export function normalizeTime(raw: string): string {
  const m = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(raw);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (ap) { if (h < 1 || h > 12) return ""; if (ap === "pm" && h !== 12) h += 12; if (ap === "am" && h === 12) h = 0; }
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Tours may start any time from 09:00 to 19:00 (team still confirms the slot). */
export function withinTourHours(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time) && time >= "09:00" && time <= "19:00";
}

/** Parse the model's JSON answer defensively; anything malformed becomes a safe hand-off. */
export function parseDecision(raw: string): OperatorDecision {
  const safe: OperatorDecision = { action: "handoff", reply: "", tags: [], urgent: false, alert: PARSE_FAIL_ALERT, booking: null };
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return safe;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return safe; }
  const action = ["reply", "handoff", "none"].includes(j?.action) ? j.action : "handoff";
  const reply = typeof j?.reply === "string" ? j.reply.trim().slice(0, 1500) : "";
  const tags = Array.isArray(j?.tags) ? j.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim().slice(0, 30)).slice(0, 4) : [];
  const b = j?.booking;
  const guests = Number(b?.guests);
  const s = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const booking = b && b.ready === true && DATE.test(String(b.date)) && Number.isInteger(guests) && guests >= 1 && guests <= 60
    ? { date: String(b.date), time: normalizeTime(String(b.time ?? "")), guests, tour: s(b.tour, 120), pickup: s(b.pickup, 200), name: s(b.name, 120),
        children: s(b.children, 120), dropoff: s(b.dropoff, 200), contact: s(b.contact, 120), language: s(b.language, 40), special: s(b.special, 300) }
    : null;
  return {
    action: action === "reply" && !reply ? "handoff" : action,
    reply,
    tags,
    urgent: j?.urgent === true,
    alert: typeof j?.alert === "string" ? j.alert.trim().slice(0, 300) : "",
    booking,
  };
}

/** The operator stops replying once it has sent `max` replies in one conversation. */
export function replyAllowed(repliesSoFar: number, max: number) {
  return repliesSoFar < max;
}

/**
 * Parse the model's answer, with a fallback: if the answer is not JSON at all but
 * contains readable text, send that text as the guest reply instead of a silent hand-off.
 */
export function decisionFromRaw(raw: string): OperatorDecision {
  const d = parseDecision(raw);
  const text = raw.trim();
  if (d.action === "handoff" && d.alert === PARSE_FAIL_ALERT && text && !text.includes("{")) {
    return { ...d, action: "reply", reply: text.slice(0, 1500), alert: "" };
  }
  return d;
}

/** Tuk-tuks needed: each vehicle carries up to 6 guests. */
export function vehiclesFor(guests: number) {
  return Math.max(1, Math.ceil(guests / 6));
}
