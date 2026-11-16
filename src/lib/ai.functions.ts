import { TT24_PLAYBOOK } from "./tt24-playbook";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// The TukTuk24 playbook is that business's own content, so it is only used for the operator's
// workspace. Every other business gets a neutral prompt built from its own name + knowledge base.
function baseFor(name: string, operator: boolean) {
  if (operator)
    return `You help the team of TukTuk24 (Tuk Tuk 24 Lisbon) draft replies to guests. A team member reviews every draft before sending.
${TT24_PLAYBOOK}
If a fact is missing from the business knowledge, write a placeholder like [confirm price] for the team to fill in.`;
  return `You help the team of ${name || "this business"} draft replies to customers. A team member reviews every draft before sending.
Be friendly, concise and accurate. Only state facts found in the business instructions or knowledge below.
If a fact is missing, write a placeholder like [confirm price] for the team to fill in.`;
}

async function loadContext(supabase: any, workspaceId: string, texts: string[]) {
  const { loadKnowledge } = await import("./knowledge.server");
  const [s, kbText, w] = await Promise.all([
    supabase
      .from("ai_settings")
      .select("instructions, enabled, provider, model, base_url")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    loadKnowledge(supabase, workspaceId, texts),
    supabase
      .from("workspaces")
      .select("name, platform_connectors")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);
  return {
    settings: {
      provider: (s.data?.provider ?? "lovable") as any,
      model: s.data?.model ?? null,
      base_url: s.data?.base_url ?? null,
    },
    enabled: s.data?.enabled ?? false,
    instructions: s.data?.instructions ?? "",
    kbText,
    name: (w.data?.name as string) ?? "",
    operator: w.data?.platform_connectors === true,
  };
}

function instructionsFor(ctx: {
  instructions: string;
  kbText: string;
  name: string;
  operator: boolean;
}) {
  return `${baseFor(ctx.name, ctx.operator)}\n\nBusiness instructions from the owner:\n${ctx.instructions || "(none)"}\n\nBusiness knowledge:\n${ctx.kbText || "(no knowledge documents yet)"}`;
}

export const aiAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        task: z.enum(["draft", "summarize", "translate"]),
        text: z.string().max(5000).optional(),
        language: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { AiError } = await import("./ai-gateway.server");
    const { generate } = await import("./ai-provider.server");
    const supabase = context.supabase;
    // RLS: returns nothing if the caller can't see this conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, workspace_id, channel, subject, contacts(full_name, preferred_language)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(30);
    // Search the knowledge base with the latest messages (newest first) plus the team's notes.
    const searchTexts = [
      ...((msgs ?? []) as { body: string | null }[])
        .slice(0, 8)
        .map((m) => m.body ?? "")
        .reverse(),
      data.text ?? "",
    ];
    const ctx = await loadContext(supabase, conv.workspace_id, searchTexts);
    if (!ctx.enabled)
      return {
        ok: false as const,
        error: "AI assistance is turned off. An admin can enable it on the AI Assistant page.",
      };
    const transcript = (msgs ?? [])
      .reverse()
      .map(
        (m: { direction: string; body: string }) =>
          `${m.direction === "inbound" ? "Guest" : "Team"}: ${m.body}`,
      )
      .join("\n");
    const guest = (
      conv as { contacts: { full_name: string; preferred_language: string | null } | null }
    ).contacts;
    let input = "";
    if (data.task === "draft") {
      input = `Write the next reply from the team to the guest${guest?.preferred_language ? ` in ${guest.preferred_language}` : " in the language the guest uses"}. Output only the reply text.\n\nConversation:\n${transcript || "(no messages yet)"}${data.text ? `\n\nTeam's notes for the reply: ${data.text}` : ""}`;
    } else if (data.task === "summarize") {
      input = `Summarise this conversation for a teammate in 3-5 short bullet points in English: what the guest wants, details they gave (date, group size, tour), and what's still open. Mark anything uncertain. Conversation:\n${transcript || "(no messages yet)"}`;
    } else if (!data.text?.trim()) {
      // Translate what the guest wrote for the team.
      const recent = (msgs ?? [])
        .filter((m: { direction: string }) => m.direction === "inbound")
        .slice(0, 5)
        .reverse()
        .map((m: { body: string }) => m.body)
        .join("\n---\n");
      if (!recent)
        return { ok: false as const, error: "There are no guest messages to translate yet." };
      input = `Translate these guest messages into ${data.language || "English"}. Keep "---" separators between messages. Output only the translation.\n\n${recent}`;
    } else {
      const target =
        data.language ||
        guest?.preferred_language ||
        "the language the guest writes in (detect it from the guest's messages below; if unclear, English)";
      input = `Translate the team's reply into ${target}. Keep the tone, names, prices and placeholders unchanged. Output only the translated reply.\n\nReply:\n${data.text}\n\nGuest's recent messages (for language detection only):\n${
        transcript
          .split("\n")
          .filter((l) => l.startsWith("Guest:"))
          .slice(-5)
          .join("\n") || "(none)"
      }`;
    }
    try {
      const instructions =
        data.task === "translate"
          ? `You are a professional translator for ${ctx.name || "a business"}. Translate accurately and naturally.`
          : instructionsFor(ctx);
      const text = await generate(conv.workspace_id, ctx.settings, { instructions, input });
      return { ok: true as const, text };
    } catch (e) {
      const msg = e instanceof AiError ? e.message : "AI request failed";
      console.error("aiAssist", e);
      return { ok: false as const, error: msg };
    }
  });

export const aiAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ workspaceId: z.string().uuid(), question: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { AiError } = await import("./ai-gateway.server");
    const { generate } = await import("./ai-provider.server");
    const { data: member } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (member !== true) return { ok: false as const, error: "Workspace not accessible." };
    const ctx = await loadContext(context.supabase, data.workspaceId, [data.question]);
    if (!ctx.enabled)
      return {
        ok: false as const,
        error: "AI assistance is turned off. An admin can enable it above.",
      };
    try {
      const text = await generate(data.workspaceId, ctx.settings, {
        instructions: instructionsFor(ctx),
        input: data.question,
      });
      return { ok: true as const, text };
    } catch (e) {
      return { ok: false as const, error: e instanceof AiError ? e.message : "AI request failed" };
    }
  });
