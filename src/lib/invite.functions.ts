import { createServerFn } from "@tanstack/react-start";

/**
 * Invite-only onboarding. Public signup is disabled, so the only way a new
 * person gets an account is by redeeming a valid invitation token here.
 * The token itself is the credential — this function is intentionally not
 * behind requireSupabaseAuth, but it only ever acts on a valid, unexpired,
 * unrevoked invitation and never returns secrets.
 */
export const redeemInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => {
    if (!d || typeof d.token !== "string" || d.token.length < 10 || d.token.length > 100) {
      throw new Error("Invalid invitation link");
    }
    return { token: d.token };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv } = await supabaseAdmin
      .from("invitations")
      .select("id, workspace_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv) throw new Error("Invitation not found");
    if (inv.revoked_at) throw new Error("This invitation was revoked");
    if (inv.accepted_at) throw new Error("This invitation was already used");
    if (new Date(inv.expires_at).getTime() < Date.now()) throw new Error("This invitation has expired");

    const email = inv.email.toLowerCase();

    // Try to create the account. If the email is already registered, the
    // invitee signs in instead and accepts via the authenticated RPC.
    // Must satisfy the password policy (lower, upper, digit, symbol); never shown to anyone.
    const password = `Aa1!${crypto.randomUUID()}${crypto.randomUUID().slice(0, 18).toUpperCase()}`; // 58 chars, under the 72 limit
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !created.user) {
      console.error("[invite] createUser failed:", createErr?.message, (createErr as any)?.status, (createErr as any)?.code);
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return { created: false as const, email };
      }
      throw new Error("Could not create the account. Please ask your admin to re-send the invitation.");
    }

    const userId = created.user.id;

    const { error: memberErr } = await supabaseAdmin.from("workspace_members").upsert(
      { workspace_id: inv.workspace_id, user_id: userId, role: inv.role, active: true },
      { onConflict: "workspace_id,user_id" },
    );
    if (memberErr) throw new Error("Could not add you to the workspace. Please contact your admin.");

    await supabaseAdmin.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);

    return { created: true as const, email };
  });
