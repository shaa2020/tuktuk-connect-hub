import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends a file (already uploaded by this user into the conversation's folder) to the customer. */
export const sendAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversationId: z.string().uuid(),
        path: z.string().min(10).max(400),
        name: z.string().min(1).max(200),
        mime: z.string().min(3).max(120),
        size: z
          .number()
          .int()
          .positive()
          .max(15 * 1024 * 1024),
        caption: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // RLS: only returns the conversation if the caller may see it.
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) return { ok: false as const, error: "Conversation not found or not accessible." };
    const { attachmentProblem } = await import("./attachments");
    const problem = attachmentProblem({ name: data.name, size: data.size, type: data.mime });
    if (problem) return { ok: false as const, error: problem };
    const { sendAttachmentToConversation } = await import("./attachments.server");
    const r = await sendAttachmentToConversation(conv.id, data, context.userId);
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  });
