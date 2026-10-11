// Pure, browser-safe helpers for the AI Operator (tested in ai-operator.test.ts).

export type OperatorDecision = {
  action: "reply" | "handoff" | "none";
  reply: string;
  tags: string[];
  urgent: boolean;
  alert: string;
  booking: { date: string; time: string; guests: number; tour: string; pickup: string; name: string } | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export const PARSE_FAIL_ALERT = "The AI could not understand this conversation.";

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
  const booking = b && b.ready === true && DATE.test(String(b.date)) && Number.isInteger(guests) && guests >= 1 && guests <= 60
    ? { date: String(b.date), time: TIME.test(String(b.time)) ? String(b.time) : "", guests, tour: String(b.tour ?? "").slice(0, 120), pickup: String(b.pickup ?? "").slice(0, 200), name: String(b.name ?? "").slice(0, 120) }
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
