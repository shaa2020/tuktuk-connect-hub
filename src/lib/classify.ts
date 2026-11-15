// Pure: schema + normalisation for AI conversation classification (tested).
export const INTENTS = [
  "booking",
  "pricing",
  "availability",
  "support",
  "complaint",
  "cancellation",
  "other",
] as const;
export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Classification = {
  intent: (typeof INTENTS)[number];
  sentiment: (typeof SENTIMENTS)[number];
  summary: string;
};

export const CLASSIFY_SCHEMA = {
  name: "classification",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "sentiment", "summary"],
    properties: {
      intent: { type: "string", enum: [...INTENTS] },
      sentiment: { type: "string", enum: [...SENTIMENTS] },
      summary: { type: "string" },
    },
  },
};

/** Accepts the model's JSON (possibly wrapped in prose/code fences); anything unexpected becomes safe defaults. */
export function parseClassification(raw: string): Classification {
  let j: any = {};
  try {
    j = JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) {
      try {
        j = JSON.parse(m[0]);
      } catch {
        /* defaults */
      }
    }
  }
  const intent = (INTENTS as readonly string[]).includes(j?.intent) ? j.intent : "other";
  const sentiment = (SENTIMENTS as readonly string[]).includes(j?.sentiment)
    ? j.sentiment
    : "neutral";
  return {
    intent,
    sentiment,
    summary: String(j?.summary ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500),
  };
}

export const INTENT_LABEL: Record<Classification["intent"], string> = {
  booking: "Booking",
  pricing: "Pricing",
  availability: "Availability",
  support: "Support",
  complaint: "Complaint",
  cancellation: "Cancellation",
  other: "Other",
};
