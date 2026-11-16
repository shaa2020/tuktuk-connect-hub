import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("attAdmin");
  ids.agent = await makeUser("attAgent");
  ids.other = await makeUser("attOther");
  ids.ws = await makeWorkspace("Att Biz", ids.admin, "internal");
  ids.ws2 = await makeWorkspace("Att Other", ids.other, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  const [c] =
    await sql`insert into conversations(workspace_id, assigned_to) values (${ids.ws}, ${ids.admin}) returning id`;
  ids.conv = c.id;
  const [m] =
    await sql`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.ws}, ${ids.conv}, 'outbound', 'photo') returning id`;
  ids.msg = m.id;
});
afterAll(async () => {
  await sql.end();
});

const path = (ws: string, conv: string) => `${ws}/${conv}/abc-photo.jpg`;

describe("attachment access", () => {
  it("path check allows only people who can see the conversation, in its own workspace", async () => {
    const ok = await asUser(
      ids.admin,
      (tx) => tx`select attachment_path_allowed(${path(ids.ws, ids.conv)}) a`,
    );
    const agent = await asUser(
      ids.agent,
      (tx) => tx`select attachment_path_allowed(${path(ids.ws, ids.conv)}) a`,
    ); // assigned to someone else
    const other = await asUser(
      ids.other,
      (tx) => tx`select attachment_path_allowed(${path(ids.ws, ids.conv)}) a`,
    );
    const wrongWs = await asUser(
      ids.admin,
      (tx) => tx`select attachment_path_allowed(${path(ids.ws2, ids.conv)}) a`,
    );
    const junk = await asUser(
      ids.admin,
      (tx) => tx`select attachment_path_allowed('../../etc/passwd') a`,
    );
    expect([ok[0].a, agent[0].a, other[0].a, wrongWs[0].a, junk[0].a]).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });
  it("attachment rows must point into the message's own conversation folder", async () => {
    await asUser(
      ids.admin,
      (tx) =>
        tx`insert into message_attachments(workspace_id, message_id, storage_path, mime_type, kind) values (${ids.ws}, ${ids.msg}, ${path(ids.ws, ids.conv)}, 'image/jpeg', 'image')`,
    );
    await expect(
      asUser(
        ids.admin,
        (tx) =>
          tx`insert into message_attachments(workspace_id, message_id, storage_path) values (${ids.ws}, ${ids.msg}, ${path(ids.ws, "00000000-0000-0000-0000-000000000000")})`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(
        ids.other,
        (tx) =>
          tx`insert into message_attachments(workspace_id, message_id, storage_path) values (${ids.ws}, ${ids.msg}, ${path(ids.ws, ids.conv)})`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("other businesses can't read attachment rows", async () => {
    const r = await asUser(ids.other, (tx) => tx`select count(*)::int n from message_attachments`);
    expect(r[0].n).toBe(0);
  });
});
