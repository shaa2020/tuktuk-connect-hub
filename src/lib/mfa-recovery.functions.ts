import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** New set of 10 recovery codes (replaces old ones). Requires a fully verified (two-step) session. */
export const generateRecoveryCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((context.claims as any)?.aal !== "aal2")
      throw new Error("Verify your two-step code first.");
    const { generateCodes, hashCode } = await import("./mfa-recovery");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codes = generateCodes(10);
    await (supabaseAdmin as any).from("mfa_recovery_codes").delete().eq("user_id", context.userId);
    const rows = await Promise.all(
      codes.map(async (c) => ({
        user_id: context.userId,
        code_hash: await hashCode(context.userId, c),
      })),
    );
    const { error } = await (supabaseAdmin as any).from("mfa_recovery_codes").insert(rows);
    if (error) throw new Error("Could not save recovery codes.");
    return { codes };
  });

export const recoveryCodeStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await (supabaseAdmin as any)
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("used_at", null);
    return { remaining: count ?? 0 };
  });

/**
 * Lost phone: a valid, unused recovery code removes the user's authenticator so they can set up a
 * new one at next sign-in. Rate-limited (fails closed) and audited in each of the user's workspaces.
 */
export const redeemRecoveryCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().trim().min(10).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    if (!(await rateLimit(`mfa-recovery:${context.userId}`, 5, 900, { failClosed: true })))
      throw new Error("Too many attempts. Try again in 15 minutes.");
    const { hashCode } = await import("./mfa-recovery");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const h = await hashCode(context.userId, data.code);
    const { data: row } = await sb
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("code_hash", h)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (!row) throw new Error("That recovery code isn't valid or was already used.");
    const { data: list } = await sb.auth.admin.mfa.listFactors({ userId: context.userId });
    for (const f of list?.factors ?? [])
      await sb.auth.admin.mfa.deleteFactor({ userId: context.userId, id: f.id });
    const { data: mems } = await sb
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .eq("active", true);
    if (mems?.length)
      await sb.from("audit_logs").insert(
        mems.map((m: any) => ({
          workspace_id: m.workspace_id,
          actor_id: context.userId,
          action: "mfa_recovery_used",
          entity_type: "profiles",
          entity_id: context.userId,
          details: {},
        })),
      );
    await sb.auth.admin.signOut(context.userId).catch(() => {});
    return { ok: true as const };
  });
