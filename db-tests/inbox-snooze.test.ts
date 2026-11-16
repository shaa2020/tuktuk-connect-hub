import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("snzAdmin");
  ids.agent = await makeUser("snzAgent");
  ids.other = await makeUser("snzOther");
  ids.ws = await makeWorkspace("Snooze Biz", ids.admin, "internal");
  await makeWorkspace("Snooze Other", ids.other, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  const [c] =
    await sql`insert into conversations(workspace_id, assigned_to) values (${ids.ws}, ${ids.admin}) returning id`;
  ids.conv = c.id;
});
afterAll(async () => {
  await sql.end();
});

describe("inbox snooze", () => {
  it("members can snooze; a new customer message wakes the conversation", async () => {
    // asUser rolls back, so check the member's RLS update inside it, then snooze for real
    const updated = await asUser(
      ids.admin,
      (tx) =>
        tx`update conversations set snoozed_until = now() + interval '1 day' where id = ${ids.conv} returning id`,
    );
    expect(updated.length).toBe(1);
    await sql`update conversations set snoozed_until = now() + interval '1 day' where id = ${ids.conv}`;
    let [r] = await sql`select snoozed_until from conversations where id = ${ids.conv}`;
    expect(r.snoozed_until).not.toBeNull();
    // our own outbound reply keeps it snoozed
    await sql`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.ws}, ${ids.conv}, 'outbound', 'ok')`;
    [r] = await sql`select snoozed_until from conversations where id = ${ids.conv}`;
    expect(r.snoozed_until).not.toBeNull();
    await sql`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.ws}, ${ids.conv}, 'inbound', 'hello?')`;
    [r] = await sql`select snoozed_until from conversations where id = ${ids.conv}`;
    expect(r.snoozed_until).toBeNull();
  });

  it("presence topics are only open to people who can see the conversation", async () => {
    const q = (u: string, topic: string) =>
      asUser(u, (tx) => tx`select realtime_conv_allowed(${topic}) a`).then((x) => x[0].a);
    expect(await q(ids.admin, `conv:${ids.conv}`)).toBe(true);
    expect(await q(ids.agent, `conv:${ids.conv}`)).toBe(false); // assigned to someone else
    expect(await q(ids.other, `conv:${ids.conv}`)).toBe(false);
    expect(await q(ids.admin, "conv:not-a-uuid")).toBe(false);
    expect(await q(ids.admin, `ws-${ids.ws}`)).toBe(false);
  });
});
