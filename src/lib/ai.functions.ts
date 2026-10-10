import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = `You help the team of Tuk Tuk 24 Lisbon, a tuk-tuk tour company in Lisbon, Portugal, communicate with guests.
Be warm, concise and professional. Never invent prices, availability, times, meeting points or policies:
only use facts from the business knowledge provided. If a fact is missing, write a placeholder like [confirm price] for the team to fill in.
Never claim a booking or payment is confirmed.`;

async function loadContext(supabase: any, workspaceId: string) {
  const [s, kb] = await Promise.all([
    supabase.from("ai_settings").select("instructions, enabled").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("knowledge_documents").select("title, category, content").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(40),
  ]);
  const kbText = (kb.data ?? [])
    .map((d: { title: string; category: string; content: string | null }) => `## ${d.title} (${d.category})\n${d.content ?? ""}`)
    .join("\n\n").slice(0, 30000);
  return { enabled: s.data?.enabled ?? false, instructions: s.data?.instructions ?? "", kbText };
}

function instructionsFor(ctx: { instructions: string; kbText: string }) {
  return `${BASE}\n\nBusiness instructions from the owner:\n${ctx.instructions || "(none)"}\n\nBusiness knowledge:\n${ctx.kbText || "(no knowledge documents yet)"}`;
}

const { generateText } = await import("./ai-gateway.server").catch(() => ({ generateText: null as never }));
void generateText;

export const aiAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    conversationId: z.string().uuid(),
    task: z.enum(["draft", "summarize", "translate"]),
    text: z.string().max(5000).optional(),
    language: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateText, AiError } = await import("./ai-gateway.server");
    const supabase = context.supabase;
    // RLS: returns nothing if the caller can't see this conversation
    const { data: conv } = await supabase.from("conversations")
      .select("id, workspace_id, channel, subject, contacts(full_name, preferred_language)")
      .eq("id", data.conversationId).maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    const ctx = await loadContext(supabase, conv.workspace_id);
    if (!ctx.enabled) return { ok: false as const, error: "AI assistance is turned off. An admin can enable it on the AI Assistant page." };
    const { data: msgs } = await supabase.from("messages").select("direction, body, created_at")
      .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(30);
    const transcript = (msgs ?? []).reverse().map((m: { direction: string; body: string }) => `${m.direction === "inbound" ? "Guest" : "Team"}: ${m.body}`).join("\n");
    const guest = (conv as { contacts: { full_name: string; preferred_language: string | null } | null }).contacts;
    let input = "";
    if (data.task === "draft") {
      input = `Write the next reply from the team to the guest${guest?.preferred_language ? ` in ${guest.preferred_language}` : " in the language the guest uses"}. Output only the reply text.\n\nConversation:\n${transcript || "(no messages yet)"}${data.text ? `\n\nTeam's notes for the reply: ${data.text}` : ""}`;
    } else if (data.task === "summarize") {
      input = `Summarise this conversation for a teammate in 3-5 short bullet points in English: what the guest wants, details they gave (date, group size, tour), and what's still open. Mark anything uncertain. Conversation:\n${transcript || "(no messages yet)"}`;
    } else {
      if (!data.text?.trim()) return { ok: false as const, error: "Nothing to translate." };
      input = `Translate the following text into ${data.language || guest?.preferred_language || "English"}. Keep the tone. Output only the translation.\n\n${data.text}`;
    }
    try {
      const text = await generateText({ instructions: instructionsFor(ctx), input });
      return { ok: true as const, text };
    } catch (e) {
      const msg = e instanceof AiError ? e.message : "AI request failed";
      console.error("aiAssist", e);
      return { ok: false as const, error: msg };
    }
  });

export const aiAsk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid(), question: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateText, AiError } = await import("./ai-gateway.server");
    const { data: ws } = await context.supabase.from("workspaces").select("id").eq("id", data.workspaceId).maybeSingle();
    if (!ws) return { ok: false as const, error: "Workspace not accessible." };
    const ctx = await loadContext(context.supabase, data.workspaceId);
    if (!ctx.enabled) return { ok: false as const, error: "AI assistance is turned off. An admin can enable it above." };
    try {
      const text = await generateText({ instructions: instructionsFor(ctx), input: data.question });
      return { ok: true as const, text };
    } catch (e) {
      return { ok: false as const, error: e instanceof AiError ? e.message : "AI request failed" };
    }
  });
