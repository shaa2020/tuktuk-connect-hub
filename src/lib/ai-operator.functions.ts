import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admin/manager: run the AI Operator now (also clears a pause after credits are restored). */
export const runOperatorNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_ws_role", {
      _ws: data.workspaceId,
      _roles: ["admin", "manager"],
    });
    if (!ok)
      return { ok: false as const, error: "Only admins and managers can run the AI Operator." };
    const { runOperatorFor } = await import("./ai-operator.server");
    try {
      const r = await runOperatorFor(data.workspaceId, { force: true });
      return { ok: true as const, result: r as { handled?: number; skipped?: string } };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message.slice(0, 200) };
    }
  });
