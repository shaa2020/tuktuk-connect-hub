export type Outcome = "reply" | "handover" | "parse_fail";

/** Classify an AI Operator log row into a monitoring outcome (null = not tracked). */
export function outcomeOf(kind: string, summary: string): Outcome | null {
  if (kind === "parse_fail") return "parse_fail";
  if (kind === "error" && /not readable/i.test(summary)) return "parse_fail";
  if (kind === "handoff" && /could not understand/i.test(summary)) return "parse_fail";
  if (kind === "reply") return "reply";
  if (kind === "handoff") return "handover";
  return null;
}

/** Human reason shown next to each outcome. */
export function reasonOf(outcome: Outcome, summary: string): string {
  if (outcome === "parse_fail") return "The AI answer could not be read";
  if (outcome === "reply") return summary.replace(/^Replied to [^:]+:\s*/, "");
  const m = /^Handed [^:]+? to the team:?\s*(.*)$/.exec(summary);
  return (m?.[1] || summary).replace(/\.$/, "") || "Handed to the team";
}
