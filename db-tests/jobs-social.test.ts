import { afterAll, describe, expect, it } from "vitest";
import { asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

afterAll(async () => {
  await sql.end();
});

describe("background job fan-out", () => {
  it("queues one request per active workspace and skips suspended ones", async () => {
    const a = await makeUser("fanA");
    const w1 = await makeWorkspace("Fan 1", a);
    const w2 = await makeWorkspace("Fan 2", a);
    await sql`update workspaces set suspended_at = now() where id = ${w2}`;
    const r = await asService(async (tx) => {
      await tx.unsafe("reset role");
      const before = (await tx`select count(*)::int n from net.calls`)[0].n;
      await tx.unsafe("set local role service_role");
      const [{ n }] = await tx`select trigger_background_sync_fanout() n`;
      await tx.unsafe("reset role"); // inspect the recorded calls as the database owner
      const calls = await tx`select body from net.calls order by id desc limit ${n}`;
      return {
        n,
        added: (await tx`select count(*)::int n from net.calls`)[0].n - before,
        bodies: calls.map((c) => c.body.workspace),
      };
    });
    expect(r.added).toBe(r.n);
    expect(r.bodies).toContain(w1);
    expect(r.bodies).not.toContain(w2);
  });
  it("browsers cannot trigger the fan-out", async () => {
    const u = await makeUser("fanB");
    await expect(asUser(u, (tx) => tx`select trigger_background_sync_fanout()`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("social post status integrity", () => {
  it("members can save drafts and schedule, but cannot mark posts published", async () => {
    const a = await makeUser("soc");
    const ws = await makeWorkspace("Soc", a, "internal");
    await asUser(a, async (tx) => {
      const [p] =
        await tx`insert into social_posts(workspace_id, title, status, scheduled_at) values (${ws}, 'Hello', 'scheduled', now()) returning id`;
      await expect(
        tx`update social_posts set status = 'published' where id = ${p.id}`,
      ).rejects.toThrow(/Only drafts and scheduled/);
    });
    await expect(
      asUser(
        a,
        (tx) =>
          tx`insert into social_posts(workspace_id, title, status) values (${ws}, 'x', 'published')`,
      ),
    ).rejects.toThrow(/Only drafts and scheduled/);
    await expect(
      asUser(
        a,
        (tx) => tx`update social_posts set publish_results = '[]' where workspace_id = ${ws}`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("the worker (service role) can record results", async () => {
    const a = await makeUser("soc2");
    const ws = await makeWorkspace("Soc2", a, "internal");
    const status = await asService(async (tx) => {
      const [p] =
        await tx`insert into social_posts(workspace_id, title, status) values (${ws}, 'x', 'scheduled') returning id`;
      await tx`update social_posts set status = 'published', publish_results = '[{"ok":true}]' where id = ${p.id}`;
      return (await tx`select status from social_posts where id = ${p.id}`)[0].status;
    });
    expect(status).toBe("published");
  });
});
