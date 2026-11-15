import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.owner = await makeUser("gOwner");
  ids.admin2 = await makeUser("gAdmin2");
  ids.agent = await makeUser("gAgent");
  ids.ws = await makeWorkspace("Gdpr Biz", ids.owner, "free");
  await addMember(ids.ws, ids.admin2, "admin");
  await addMember(ids.ws, ids.agent, "agent");
});
afterAll(async () => { await sql.end(); });

describe("ownership transfer", () => {
  it("only the owner can transfer; the new owner is promoted to admin", async () => {
    await expect(asUser(ids.admin2, (tx) => tx`select transfer_workspace_ownership(${ids.ws}, ${ids.admin2})`)).rejects.toThrow(/Only the workspace owner/);
    const r = await asUser(ids.owner, async (tx) => {
      await tx`select transfer_workspace_ownership(${ids.ws}, ${ids.agent})`;
      await tx.unsafe("reset role");
      const [w] = await tx`select owner_id from workspaces where id = ${ids.ws}`;
      const [m] = await tx`select role from workspace_members where workspace_id = ${ids.ws} and user_id = ${ids.agent}`;
      return { owner: w.owner_id, role: m.role };
    });
    expect(r).toEqual({ owner: ids.agent, role: "admin" });
  });
});

describe("workspace deletion", () => {
  it("requires the owner and the exact name; scheduled 30 days out; cancellable", async () => {
    await expect(asUser(ids.admin2, (tx) => tx`select request_workspace_deletion(${ids.ws}, 'Gdpr Biz')`)).rejects.toThrow(/Only the workspace owner/);
    await expect(asUser(ids.owner, (tx) => tx`select request_workspace_deletion(${ids.ws}, 'wrong')`)).rejects.toThrow(/exactly/);
    const days = await asUser(ids.owner, async (tx) => {
      const [{ request_workspace_deletion: when }] = await tx`select request_workspace_deletion(${ids.ws}, 'Gdpr Biz')`;
      await tx`select cancel_workspace_deletion(${ids.ws})`;
      return Math.round((new Date(when).getTime() - Date.now()) / 86400_000);
    });
    expect(days).toBe(30);
  });
  it("the purge job deletes only workspaces past their grace period, logs them, and never the operator", async () => {
    const o = await makeUser("gPurge");
    const due = await makeWorkspace("Due Biz", o, "free");
    const later = await makeWorkspace("Later Biz", o, "free");
    const op = await makeWorkspace("Operator", o, "internal");
    await sql`insert into contacts(workspace_id, full_name) values (${due}, 'Customer')`;
    await sql`update workspaces set deletion_scheduled_for = now() - interval '1 minute' where id in (${due}, ${op})`;
    await sql`update workspaces set platform_connectors = true where id = ${op}`;
    await sql`update workspaces set deletion_scheduled_for = now() + interval '5 days' where id = ${later}`;
    const r = await asService(async (tx) => {
      const [{ purge_due_workspaces: n }] = await tx`select purge_due_workspaces()`;
      const left = await tx`select id from workspaces where id in (${due}, ${later}, ${op})`;
      const contacts = await tx`select count(*)::int n from contacts where workspace_id = ${due}`;
      const log = await tx`select name from workspace_deletion_log where workspace_id = ${due}`;
      return { n, left: left.map((x) => x.id).sort(), contacts: contacts[0].n, log: log[0]?.name };
    });
    expect(r.n).toBe(1);
    expect(r.left).toEqual([later, op].sort());
    expect(r.contacts).toBe(0);
    expect(r.log).toBe("Due Biz");
  });
});

describe("retention", () => {
  it("deletes messages older than the workspace's retention period only", async () => {
    const o = await makeUser("gRet");
    const ws = await makeWorkspace("Ret Biz", o, "internal");
    await sql`update workspaces set message_retention_days = 30 where id = ${ws}`;
    const [c] = await sql`insert into conversations(workspace_id) values (${ws}) returning id`;
    await sql`insert into messages(workspace_id, conversation_id, direction, body, created_at) values (${ws}, ${c.id}, 'inbound', 'old', now() - interval '40 days'), (${ws}, ${c.id}, 'inbound', 'new', now())`;
    const left = await asService(async (tx) => { await tx`select apply_message_retention()`; return (await tx`select body from messages where workspace_id = ${ws}`).map((m) => m.body); });
    expect(left).toEqual(["new"]);
  });
  it("browsers can't trigger purges", async () => {
    await expect(asUser(ids.owner, (tx) => tx`select purge_due_workspaces()`)).rejects.toThrow(/permission denied/);
  });
});
