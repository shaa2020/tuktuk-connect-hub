// Shared by the AI assistant (RLS client) and the AI Operator (service role): the knowledge the
// model reads for one conversation. Small knowledge bases are sent whole; large ones are narrowed
// to the passages that match the conversation (knowledge_context RPC, migration 0035).
import { KNOWLEDGE_BUDGET, formatKnowledge, queryTerms, type KnowledgeRow } from "./knowledge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

export async function loadKnowledge(
  sb: Client,
  workspaceId: string,
  texts: string[],
): Promise<string> {
  const { data, error } = await sb.rpc("knowledge_context", {
    _ws: workspaceId,
    _terms: queryTerms(texts),
    _budget: KNOWLEDGE_BUDGET,
  });
  if (!error) return formatKnowledge((data ?? []) as KnowledgeRow[]);
  // Before migration 0035 is applied: previous behaviour (latest documents, truncated).
  const { data: docs } = await sb
    .from("knowledge_documents")
    .select("title, category, content")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(40);
  return formatKnowledge(
    ((docs ?? []) as { title: string; category: string; content: string | null }[]).map((d) => ({
      title: d.title,
      category: d.category,
      content: d.content ?? "",
      whole: true,
    })),
  );
}
