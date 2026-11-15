import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("aiAdmin");
  ids.agent = await makeUser("aiAgent");
  ids.other = await makeUser("aiOther");
  ids.ws = await makeWorkspace("AI Biz", ids.admin, "internal");
  await makeWorkspace("AI Other", ids.other, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  const [c] =
    await sql`insert into conversations(workspace_id, assigned_to) values (${ids.ws}, ${ids.admin}) returning id`;
  ids.conv = c.id;
  const [d] =
    await sql`insert into ai_reply_drafts(workspace_id, conversation_id, body) values (${ids.ws}, ${ids.conv}, 'Draft reply') returning id`;
  ids.draft = d.id;
});
afterAll(async () => {
  await sql.end();
});

describe("AI reply drafts", () => {
  it("are visible only to people who can see the conversation", async () => {
    const a = await asUser(ids.admin, (tx) => tx`select count(*)::int n from ai_reply_drafts`);
    const b = await asUser(ids.agent, (tx) => tx`select count(*)::int n from ai_reply_drafts`); // assigned to someone else
    const c = await asUser(ids.other, (tx) => tx`select count(*)::int n from ai_reply_drafts`);
    expect([a[0].n, b[0].n, c[0].n]).toEqual([1, 0, 0]);
  });
  it("can't be inserted by browsers and can only be decided by allowed users", async () => {
    await expect(
      asUser(
        ids.admin,
        (tx) =>
          tx`insert into ai_reply_drafts(workspace_id, conversation_id, body) values (${ids.ws}, ${ids.conv}, 'x')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(ids.other, (tx) => tx`select decide_ai_draft(${ids.draft}, 'discarded')`),
    ).rejects.toThrow(/Not allowed/);
    const st = await asUser(ids.admin, async (tx) => {
      await tx`select decide_ai_draft(${ids.draft}, 'discarded')`;
      return (await tx`select status from ai_reply_drafts where id = ${ids.draft}`)[0].status;
    });
    expect(st).toBe("discarded");
  });
  it("classification values are constrained", async () => {
    await expect(
      asService(
        (tx) => tx`update conversations set ai_sentiment = 'furious' where id = ${ids.conv}`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
