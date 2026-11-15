import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

// Two independent businesses. Everything in A must be invisible and untouchable for B.
const ids: Record<string, string> = {};

beforeAll(async () => {
  ids.adminA = await makeUser("adminA");
  ids.agentA = await makeUser("agentA");
  ids.agentA2 = await makeUser("agentA2");
  ids.adminB = await makeUser("adminB");
  ids.outsider = await makeUser("outsider");
  ids.wsA = await makeWorkspace("Business A", ids.adminA, "internal");
  ids.wsB = await makeWorkspace("Business B", ids.adminB, "internal");
  await addMember(ids.wsA, ids.agentA, "agent");
  await addMember(ids.wsA, ids.agentA2, "agent");
  const [c] = await sql`insert into contacts(workspace_id, full_name, email) values (${ids.wsA}, 'Alice Guest', 'alice@example.test') returning id`;
  ids.contactA = c.id;
  const [l] = await sql`insert into leads(workspace_id, contact_id, title) values (${ids.wsA}, ${ids.contactA}, 'Lead A') returning id`;
  ids.leadA = l.id;
  const [b] = await sql`insert into bookings(workspace_id, contact_id, tour_name) values (${ids.wsA}, ${ids.contactA}, 'Tour A') returning id`;
  ids.bookingA = b.id;
  const [cv] = await sql`insert into conversations(workspace_id, contact_id, channel, assigned_to) values (${ids.wsA}, ${ids.contactA}, 'manual', ${ids.agentA2}) returning id`;
  ids.convA = cv.id;
  await sql`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.wsA}, ${ids.convA}, 'inbound', 'Private message A')`;
  await sql`insert into internal_notes(workspace_id, conversation_id, body, author_id) values (${ids.wsA}, ${ids.convA}, 'Note A', ${ids.adminA})`;
  await sql`insert into tasks(workspace_id, title) values (${ids.wsA}, 'Task A')`;
  const [t] = await sql`insert into tags(workspace_id, name) values (${ids.wsA}, 'vip') returning id`;
  ids.tagA = t.id;
  await sql`insert into paypal_transactions(workspace_id, txn_id, occurred_at, amount, currency, status) values (${ids.wsA}, 'TX1', now(), 50, 'EUR', 'S')`;
  await sql`insert into workspace_secrets(workspace_id, kind, ciphertext) values (${ids.wsA}, 'ai_api_key', 'xx.yy')`;
  const [cB] = await sql`insert into contacts(workspace_id, full_name) values (${ids.wsB}, 'Bob Guest') returning id`;
  ids.contactB = cB.id;
});

afterAll(async () => { await sql.end(); });

const TABLES = ["contacts", "leads", "bookings", "conversations", "messages", "internal_notes", "tasks", "tags", "paypal_transactions", "audit_logs", "workspace_members", "invitations"];

describe("cross-tenant reads", () => {
  it.each(TABLES)("admin of B sees no rows of A in %s", async (table) => {
    const rows = await asUser(ids.adminB, (tx) => tx.unsafe(`select count(*)::int n from public.${table} where workspace_id = $1`, [ids.wsA]));
    expect(rows[0].n).toBe(0);
  });
  it("admin of A does see its own data (sanity)", async () => {
    const rows = await asUser(ids.adminA, (tx) => tx`select count(*)::int n from messages where workspace_id = ${ids.wsA}`);
    expect(rows[0].n).toBe(1);
  });
  it("B cannot read A's workspace row", async () => {
    const rows = await asUser(ids.adminB, (tx) => tx`select id from workspaces where id = ${ids.wsA}`);
    expect(rows).toHaveLength(0);
  });
  it("anonymous visitors see nothing", async () => {
    await expect(asUser(null, (tx) => tx`select count(*) from contacts`)).rejects.toThrow(/permission denied/);
  });
  it("encrypted credentials are never readable by any signed-in user", async () => {
    await expect(asUser(ids.adminA, (tx) => tx`select * from workspace_secrets`)).rejects.toThrow(/permission denied/);
  });
});

describe("cross-tenant writes", () => {
  it("B cannot insert a contact into A", async () => {
    await expect(asUser(ids.adminB, (tx) => tx`insert into contacts(workspace_id, full_name) values (${ids.wsA}, 'x')`)).rejects.toThrow(/row-level security/);
  });
  it("B cannot update or delete A's rows (0 rows affected)", async () => {
    const up = await asUser(ids.adminB, (tx) => tx`update contacts set full_name = 'hacked' where id = ${ids.contactA} returning id`);
    expect(up).toHaveLength(0);
    const del = await asUser(ids.adminB, (tx) => tx`delete from bookings where id = ${ids.bookingA} returning id`);
    expect(del).toHaveLength(0);
  });
  it("B cannot link its rows to A's records (cross-workspace reference guard)", async () => {
    await expect(asUser(ids.adminB, (tx) => tx`insert into leads(workspace_id, contact_id, title) values (${ids.wsB}, ${ids.contactA}, 'steal')`)).rejects.toThrow(/Cross-workspace reference/);
    await expect(asUser(ids.adminB, (tx) => tx`insert into contact_tags(workspace_id, contact_id, tag_id) values (${ids.wsB}, ${ids.contactB}, ${ids.tagA})`)).rejects.toThrow(/Cross-workspace reference/);
  });
  it("server code (service role) is also blocked from cross-workspace links", async () => {
    await expect(asService((tx) => tx`insert into conversations(workspace_id, contact_id) values (${ids.wsB}, ${ids.contactA})`)).rejects.toThrow(/Cross-workspace reference/);
  });
  it("cannot assign a task to a person outside the workspace", async () => {
    await expect(asUser(ids.adminB, (tx) => tx`insert into tasks(workspace_id, title, assigned_to) values (${ids.wsB}, 't', ${ids.agentA})`)).rejects.toThrow(/must be a member/);
  });
  it("outsider cannot join a workspace by inserting a membership", async () => {
    await expect(asUser(ids.outsider, (tx) => tx`insert into workspace_members(workspace_id, user_id, role) values (${ids.wsA}, ${ids.outsider}, 'admin')`)).rejects.toThrow(/permission denied/);
  });
});

describe("roles inside a workspace", () => {
  it("agent only sees conversations assigned to them or unassigned", async () => {
    const rows = await asUser(ids.agentA, (tx) => tx`select id from conversations where id = ${ids.convA}`);
    expect(rows).toHaveLength(0);
  });
  it("agent cannot promote themselves", async () => {
    const r = await asUser(ids.agentA, (tx) => tx`update workspace_members set role = 'admin' where user_id = ${ids.agentA} returning id`);
    expect(r).toHaveLength(0);
  });
  it("the app cannot fake a delivered status", async () => {
    await expect(asUser(ids.adminA, (tx) => tx`insert into messages(workspace_id, conversation_id, direction, body, status) values (${ids.wsA}, ${ids.convA}, 'outbound', 'hi', 'delivered')`)).rejects.toThrow(/row-level security/);
  });
});

describe("workspace privileged fields", () => {
  it("a workspace admin cannot change their own plan or limits", async () => {
    await expect(asUser(ids.adminA, (tx) => tx`update workspaces set plan = 'enterprise' where id = ${ids.wsA}`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ids.adminA, (tx) => tx`update workspaces set plan_limits = '{"members":999}' where id = ${ids.wsA}`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ids.adminA, (tx) => tx`update workspaces set platform_connectors = true where id = ${ids.wsA}`)).rejects.toThrow(/permission denied/);
    await expect(asUser(ids.adminA, (tx) => tx`update workspaces set suspended_at = null where id = ${ids.wsA}`)).rejects.toThrow(/permission denied/);
  });
  it("a workspace admin can still rename their workspace", async () => {
    const r = await asUser(ids.adminA, (tx) => tx`update workspaces set name = 'Renamed' where id = ${ids.wsA} returning name`);
    expect(r[0].name).toBe("Renamed");
  });
});

describe("suspension (platform admin)", () => {
  it("ordinary users cannot suspend workspaces", async () => {
    await expect(asUser(ids.adminB, (tx) => tx`select platform_set_workspace_suspension(${ids.wsA}, true, 'nope')`)).rejects.toThrow(/Platform admins only/);
  });
  it("a suspended workspace is locked for its members, and the action is audited", async () => {
    const pa = await makeUser("platform");
    await sql`insert into platform_admins(user_id) values (${pa})`;
    const result = await asUser(pa, async (tx) => {
      await tx`select platform_set_workspace_suspension(${ids.wsA}, true, 'unpaid invoice')`;
      await tx`select set_config('request.jwt.claim.sub', ${ids.adminA}, true)`;
      const contacts = await tx`select count(*)::int n from contacts where workspace_id = ${ids.wsA}`;
      const ws = await tx`select suspended_reason from workspaces where id = ${ids.wsA}`;
      await tx.unsafe("reset role"); // inspect as the database owner
      const audit = await tx`select count(*)::int n from audit_logs where workspace_id = ${ids.wsA} and action = 'platform.suspend'`;
      return { contacts: contacts[0].n, reason: ws[0]?.suspended_reason, audit: audit[0].n };
    });
    expect(result.contacts).toBe(0);
    expect(result.reason).toBe("unpaid invoice");
    expect(result.audit).toBe(1);
  });
});
