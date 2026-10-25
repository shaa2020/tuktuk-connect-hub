import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends a test phone alert to the signed-in user's own devices only. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workspaceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("is_member", { _ws: data.workspaceId });
    if (!ok) throw new Error("Not allowed.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPendingPushes } = await import("./push.server");
    const { data: row, error } = await supabaseAdmin.from("notifications").insert({
      workspace_id: data.workspaceId, user_id: context.userId, kind: "test",
      title: "Phone alerts are working ✅", body: "You'll get alerts like this for new WhatsApp, email and other messages.", link: "/notifications",
    }).select("id").single();
    if (error || !row) throw new Error("Could not create the test alert.");
    const r = await sendPendingPushes(supabaseAdmin as any, [row.id]);
    return { sent: r.sent };
  });
