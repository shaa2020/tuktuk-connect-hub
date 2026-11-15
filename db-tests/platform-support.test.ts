import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("supAdmin");
  ids.pa = await makeUser("supPlatform");
  await sql`insert into platform_admins(user_id) values (${ids.pa})`;
  ids.ws = await makeWorkspace("Support Biz", ids.admin, "starter");
  await sql`update plans set monthly_price_cents = 2900 where key = 'starter'`;
  await sql`insert into workspace_subscriptions(workspace_id, provider, plan_key, status) values (${ids.ws}, 'stripe', 'starter', 'active')`;
});
afterAll(async () => {
  await sql.end();
});

describe("platform views", () => {
  it("revenue and health are platform-admin only", async () => {
    await expect(
      asUser(ids.admin, (tx) => tx`select * from platform_revenue_summary()`),
    ).rejects.toThrow(/Platform admins only/);
    await expect(asUser(ids.admin, (tx) => tx`select * from platform_health()`)).rejects.toThrow(
      /Platform admins only/,
    );
    const rev = await asUser(
      ids.pa,
      (tx) =>
        tx`select plan, active_subscriptions::int a, mrr_cents::int m from platform_revenue_summary() where plan = 'starter'`,
    );
    expect(rev[0]).toMatchObject({ a: 1 });
    expect(rev[0]!.m).toBeGreaterThanOrEqual(2900);
    const backlog = await asUser(ids.pa, (tx) => tx`select platform_job_backlog() b`);
    expect(backlog[0]!.b).toHaveProperty("whatsapp_stuck_1h");
  });
});

describe("support access", () => {
  it("platform admins see nothing without a grant", async () => {
    await expect(
      asUser(ids.pa, (tx) => tx`select support_workspace_snapshot(${ids.ws})`),
    ).rejects.toThrow(/No active support access/);
  });
  it("a business admin grants time-limited access; views are audited; revocation works", async () => {
    const r = await asUser(ids.admin, async (tx) => {
      const [{ grant_support_access: g }] =
        await tx`select grant_support_access(${ids.ws}, 2, 'Help with WhatsApp')`;
      await tx`select set_config('request.jwt.claim.sub', ${ids.pa}, true)`;
      const snap = (await tx`select support_workspace_snapshot(${ids.ws}) s`)[0].s;
      await tx`select set_config('request.jwt.claim.sub', ${ids.admin}, true)`;
      await tx`select revoke_support_access(${g})`;
      const audit = (
        await tx`select count(*)::int n from audit_logs where workspace_id = ${ids.ws} and action = 'support.view'`
      )[0].n;
      await tx`select set_config('request.jwt.claim.sub', ${ids.pa}, true)`;
      const after = await tx
        .savepoint((sp: any) => sp`select support_workspace_snapshot(${ids.ws})`)
        .then(
          () => "ok",
          (e: Error) => e.message,
        );
      return { keys: Object.keys(snap).sort(), audit, after };
    });
    expect(r.keys).toEqual([
      "automation_failures",
      "channels",
      "failed_messages",
      "members",
      "recent_conversations",
    ]);
    expect(r.audit).toBe(1);
    expect(r.after).toMatch(/No active support access/);
  });
  it("grants are capped at 72 hours and only admins can grant", async () => {
    await expect(
      asUser(ids.admin, (tx) => tx`select grant_support_access(${ids.ws}, 100, 'too long')`),
    ).rejects.toThrow(/between 1 and 72/);
    await expect(
      asUser(ids.pa, (tx) => tx`select grant_support_access(${ids.ws}, 1, 'self grant')`),
    ).rejects.toThrow(/Only a Business Admin/);
  });
  it("recovery code hashes are never readable by users", async () => {
    await expect(asUser(ids.admin, (tx) => tx`select * from mfa_recovery_codes`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
