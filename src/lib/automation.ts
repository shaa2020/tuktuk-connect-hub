// Pure automation logic (tested): workflow schema, condition matching and message templates.
import { z } from "zod";

export const TRIGGERS = {
  conversation_created: "New conversation",
  message_received: "Customer sends a message",
  booking_confirmed: "Booking confirmed",
  booking_completed: "Booking completed",
  lead_created: "New lead",
} as const;
export type Trigger = keyof typeof TRIGGERS;

export const Action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), user_id: z.string().uuid() }),
  z.object({ type: z.literal("add_tag"), tag: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("set_priority"), priority: z.enum(["low", "normal", "high", "urgent"]) }),
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(200), due_hours: z.number().int().min(0).max(24 * 60).optional(), assign_to: z.string().uuid().optional() }),
  z.object({ type: z.literal("notify"), to: z.union([z.enum(["managers", "assignee"]), z.string().uuid()]), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("send_message"), text: z.string().trim().min(1).max(2000) }),
]);
export type Action = z.infer<typeof Action>;

export const Conditions = z.object({
  channel: z.string().max(20).optional(),
  keyword: z.string().trim().max(100).optional(),
  tour_contains: z.string().trim().max(100).optional(),
  source: z.string().trim().max(60).optional(),
}).strict();
export type Conditions = z.infer<typeof Conditions>;

export const Workflow = z.object({
  name: z.string().trim().min(1).max(100),
  trigger: z.enum(Object.keys(TRIGGERS) as [Trigger, ...Trigger[]]),
  conditions: Conditions,
  actions: z.array(Action).min(1).max(10),
  delay_minutes: z.number().int().min(0).max(43200),
});

export type Ctx = {
  channel?: string | null;
  text?: string | null;
  tour_name?: string | null;
  source?: string | null;
  contact_name?: string | null;
  booking_reference?: string | null;
  tour_date?: string | null;
  start_time?: string | null;
  business_name?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every set condition must match; unset conditions are ignored. Keywords: any of comma-separated words. */
export function matches(c: Conditions, ctx: Ctx): boolean {
  if (c.channel && c.channel !== "any" && c.channel !== ctx.channel) return false;
  if (c.keyword) {
    const words = c.keyword.split(",").map((w) => norm(w.trim())).filter(Boolean);
    const t = norm(ctx.text);
    if (words.length && !words.some((w) => t.includes(w))) return false;
  }
  if (c.tour_contains && !norm(ctx.tour_name).includes(norm(c.tour_contains))) return false;
  if (c.source && norm(ctx.source) !== norm(c.source)) return false;
  return true;
}

/** Replaces {{placeholders}}; unknown or empty values become an empty string (never "undefined"). */
export function render(text: string, ctx: Ctx): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = (ctx as Record<string, unknown>)[k];
    return v === null || v === undefined ? "" : String(v);
  }).replace(/[ \t]{2,}/g, " ").trim();
}

/** Retry schedule for a failed execution: 5, 10, 15 minutes; after 3 attempts it is final. */
export function nextRetry(attempts: number, now = Date.now()): string | null {
  return attempts >= 3 ? null : new Date(now + attempts * 5 * 60_000).toISOString();
}
