// Server-only: classifies conversations with a new customer message (intent, sentiment, summary)
// when the business turned on auto-classification. Metered like every AI call (generate()).
import { CLASSIFY_SCHEMA, parseClassification } from "./classify";

export async function classifyDue(ws: string, limit = 10) {
  const { supabaseAdmin: sb } = (await import("@/integrations/supabase/client.server")) as any;
  const { data: ai } = await sb
    .from("ai_settings")
    .select("enabled, auto_classify, provider, model, base_url")
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!ai?.enabled || !ai.auto_classify) return { skipped: "off" };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: convs } = await sb
    .from("conversations")
    .select("id, ai_classified_message_id")
    .eq("workspace_id", ws)
    .eq("awaiting_reply", true)
    .eq("is_demo", false)
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(25);
  const { generate } = await import("./ai-provider.server");
  let n = 0;
  for (const c of convs ?? []) {
    if (n >= limit) break;
    const { data: msgs } = await sb
      .from("messages")
      .select("id, direction, body")
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: false })
      .limit(12);
    const lastIn = (msgs ?? []).find((m: any) => m.direction === "inbound");
    if (!lastIn || lastIn.id === c.ai_classified_message_id) continue;
    const transcript = [...(msgs ?? [])]
      .reverse()
      .map(
        (m: any) =>
          `${m.direction === "inbound" ? "Customer" : "Team"}: ${String(m.body).slice(0, 800)}`,
      )
      .join("\n");
    try {
      const raw = await generate(
        ws,
        { provider: ai.provider ?? "lovable", model: ai.model, base_url: ai.base_url },
        {
          instructions:
            "Classify this customer conversation. intent = what the customer mainly wants now; sentiment = the customer's mood in their latest messages; summary = one short English sentence for the team.",
          input: transcript,
          jsonSchema: CLASSIFY_SCHEMA,
        },
      );
      const r = parseClassification(raw);
      await sb
        .from("conversations")
        .update({
          ai_intent: r.intent,
          ai_sentiment: r.sentiment,
          ai_summary: r.summary || null,
          ai_classified_message_id: lastIn.id,
          ai_classified_at: new Date().toISOString(),
        })
        .eq("id", c.id);
      n++;
    } catch (e) {
      if (/limit|credits|402/i.test((e as Error).message)) break; // plan/AI limit: stop for this run
    }
  }
  return { classified: n };
}
