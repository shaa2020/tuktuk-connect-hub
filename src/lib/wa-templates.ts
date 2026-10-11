// Client-safe helpers for WhatsApp message templates and the 24-hour reply window.

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when free-form replies are still allowed (guest wrote within the last 24 hours). */
export function windowOpen(lastInboundAt: string | null | undefined, now = Date.now()) {
  if (!lastInboundAt) return false;
  return now - new Date(lastInboundAt).getTime() < WINDOW_MS;
}

export type WaTemplate = { name: string; language: string; status: string; category: string; body: string; header?: string; footer?: string };

/** Number of positional {{n}} variables in a template body. */
export function countVars(body: string) {
  let max = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Fills {{1}}, {{2}}… with values for previewing / recording what was sent. */
export function fillTemplate(body: string, values: string[]) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`);
}

/** Ready-made Tuk Tuk 24 templates an admin can submit to Meta for approval. */
export const STARTER_TEMPLATES = [
  {
    name: "tour_inquiry_follow_up", category: "UTILITY",
    body: "Hello {{1}}, this is Tuk Tuk 24 Lisbon following up on your tuk tuk tour enquiry. Are you still interested in a tour, and is there anything we can help you with? Just reply to this message.",
    example: ["Anna"],
  },
  {
    name: "tour_booking_reminder", category: "UTILITY",
    body: "Hello {{1}}, this is a reminder of your Tuk Tuk 24 Lisbon tour on {{2}}. Your driver will meet you at {{3}}. Reply to this message if you have any questions or need to change anything.",
    example: ["Anna", "12 October at 10:00", "Praça do Comércio"],
  },
  {
    name: "booking_follow_up", category: "UTILITY",
    body: "Hello {{1}}, thank you for contacting Tuk Tuk 24 Lisbon. We have an update about your tour request. Please reply to this message so we can continue the conversation.",
    example: ["Anna"],
  },
  {
    name: "tour_review_request", category: "MARKETING",
    body: "Hello {{1}}, thank you for touring Lisbon with Tuk Tuk 24! We hope you enjoyed it. If you have a moment, we would really appreciate a short review: {{2}}",
    example: ["Anna", "https://g.page/r/example"],
  },
] as const;
