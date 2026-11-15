import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.owner = await makeUser("owner");
  ids.unverified = await makeUser("unverified", false);
});
afterAll(async () => {
  await sql.end();
});

describe("self-service workspace creation", () => {
  it("a verified user creates a workspace and becomes its owner and admin", async () => {
    const r = await asUser(ids.owner, async (tx) => {
      const [{ create_workspace: ws }] =
        await tx`select create_workspace('Hotel Sol', 'Europe/Lisbon', 'hotel', 'pt')`;
      const [w] =
        await tx`select name, plan, owner_id, platform_connectors, industry from workspaces where id = ${ws}`;
      const [m] =
        await tx`select role from workspace_members where workspace_id = ${ws} and user_id = ${ids.owner}`;
      return { w, m };
    });
    expect(r.w).toMatchObject({
      name: "Hotel Sol",
      plan: "free",
      owner_id: ids.owner,
      platform_connectors: false,
      industry: "hotel",
    });
    expect(r.m.role).toBe("admin");
  });
  it("unverified emails cannot create workspaces", async () => {
    await expect(
      asUser(ids.unverified, (tx) => tx`select create_workspace('Spam Co')`),
    ).rejects.toThrow(/verify your email/);
  });
  it("anonymous visitors cannot create workspaces", async () => {
    await expect(asUser(null, (tx) => tx`select create_workspace('Anon Co')`)).rejects.toThrow(
      /permission denied/,
    );
  });
  it("validates name and time zone", async () => {
    await expect(asUser(ids.owner, (tx) => tx`select create_workspace('x')`)).rejects.toThrow(
      /2–120/,
    );
    await expect(
      asUser(ids.owner, (tx) => tx`select create_workspace('Good Name', 'Mars/Olympus')`),
    ).rejects.toThrow(/time zone/);
  });
  it("caps owned workspaces at 3 per user", async () => {
    await expect(
      asUser(ids.owner, async (tx) => {
        for (let i = 0; i < 4; i++) await tx`select create_workspace(${"Biz " + i})`;
      }),
    ).rejects.toThrow(/maximum number of workspaces/);
  });
});

describe("plan limits are enforced in the database", () => {
  it("free plan: inviting beyond 2 members is refused", async () => {
    const admin = await makeUser("freeadmin");
    const ws = await makeWorkspace("Free Biz", admin, "free");
    await expect(
      asUser(admin, async (tx) => {
        await tx`insert into invitations(workspace_id, email, invited_by) values (${ws}, 'a@example.test', ${admin})`;
        await tx`insert into invitations(workspace_id, email, invited_by) values (${ws}, 'b@example.test', ${admin})`;
      }),
    ).rejects.toThrow(/PLAN_LIMIT:members/);
  });
  it("per-workspace override raises the limit", async () => {
    const admin = await makeUser("override");
    const ws = await makeWorkspace("Custom Biz", admin, "free");
    await sql`update workspaces set plan_limits = '{"members": 10}' where id = ${ws}`;
    const n = await asUser(admin, async (tx) => {
      for (const e of ["a", "b", "c"])
        await tx`insert into invitations(workspace_id, email, invited_by) values (${ws}, ${e + "@example.test"}, ${admin})`;
      return (await tx`select count(*)::int n from invitations where workspace_id = ${ws}`)[0].n;
    });
    expect(n).toBe(3);
  });
  it("free plan: a second connected channel account is refused (even for server code)", async () => {
    const admin = await makeUser("chan");
    const ws = await makeWorkspace("Chan Biz", admin, "free");
    await expect(
      asService(async (tx) => {
        await tx`insert into channel_connections(workspace_id, channel, status, account_id) values (${ws}, 'whatsapp', 'connected', '1')`;
        await tx`insert into channel_connections(workspace_id, channel, status, account_id) values (${ws}, 'whatsapp', 'connected', '2')`;
      }),
    ).rejects.toThrow(/PLAN_LIMIT:channel_accounts/);
  });
  it("metered usage (AI requests) stops exactly at the limit", async () => {
    const admin = await makeUser("ai");
    const ws = await makeWorkspace("AI Biz", admin, "free");
    await sql`update workspaces set plan_limits = '{"monthly_ai_requests": 2}' where id = ${ws}`;
    const results = await asService(async (tx) => {
      const out = [];
      for (let i = 0; i < 3; i++)
        out.push((await tx`select consume_usage(${ws}, 'monthly_ai_requests', 1) r`)[0].r.ok);
      return out;
    });
    expect(results).toEqual([true, true, false]);
  });
  it("browsers cannot call the usage meter directly", async () => {
    const admin = await makeUser("meter");
    const ws = await makeWorkspace("Meter Biz", admin, "free");
    await expect(
      asUser(admin, (tx) => tx`select consume_usage(${ws}, 'monthly_ai_requests', 1)`),
    ).rejects.toThrow(/permission denied/);
  });
  it("usage summary is visible to the workspace admin but not to other businesses", async () => {
    const admin = await makeUser("sum");
    const other = await makeUser("sumother");
    const ws = await makeWorkspace("Sum Biz", admin, "starter");
    await makeWorkspace("Other Biz", other, "free");
    const s = await asUser(admin, (tx) => tx`select workspace_usage_summary(${ws}) s`);
    expect(s[0].s.plan).toBe("starter");
    expect(s[0].s.usage.members).toEqual({ used: 1, limit: 5 });
    await expect(asUser(other, (tx) => tx`select workspace_usage_summary(${ws})`)).rejects.toThrow(
      /Not allowed/,
    );
  });
});

describe("platform administration", () => {
  it("only platform admins can change plans or list all businesses", async () => {
    const admin = await makeUser("pl");
    const ws = await makeWorkspace("Plan Biz", admin, "free");
    await expect(
      asUser(admin, (tx) => tx`select platform_set_workspace_plan(${ws}, 'enterprise')`),
    ).rejects.toThrow(/Platform admins only/);
    await expect(
      asUser(admin, (tx) => tx`select * from platform_workspace_overview()`),
    ).rejects.toThrow(/Platform admins only/);
    const pa = await makeUser("pa");
    await sql`insert into platform_admins(user_id) values (${pa})`;
    const plan = await asUser(pa, async (tx) => {
      await tx`select platform_set_workspace_plan(${ws}, 'business')`;
      const rows = await tx`select plan from platform_workspace_overview() where id = ${ws}`;
      return rows[0].plan;
    });
    expect(plan).toBe("business");
  });
  it("plans catalogue is public, subscriptions are private", async () => {
    const plans = await asUser(null, (tx) => tx`select key from plans where public order by sort`);
    expect(plans.map((p) => p.key)).toEqual([
      "free",
      "starter",
      "professional",
      "business",
      "enterprise",
    ]);
    await expect(asUser(null, (tx) => tx`select * from workspace_subscriptions`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
