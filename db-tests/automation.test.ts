import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("autoAdmin");
  ids.mgr = await makeUser("autoMgr");
  ids.ws = await makeWorkspace("Auto Biz", ids.admin, "internal");
  await addMember(ids.ws, ids.mgr, "manager");
});
afterAll(async () => { await sql.end(); });

const wf = (tx: any, trigger: string, delay = 0) =>
  tx`insert into automation_workflows(workspace_id, name, trigger, actions, delay_minutes) values (${ids.ws}, ${"WF " + trigger}, ${trigger}, ${sql.json([{ type: "notify", to: "managers", text: "x" }])}, ${delay}) returning id`;

describe("automation workflows", () => {
  it("only admins create workflows; managers can read history", async () => {
    await expect(asUser(ids.mgr, (tx) => wf(tx, "lead_created"))).rejects.toThrow(/row-level security/);
  });
  it("business events enqueue one durable, idempotent job per workflow (with delay)", async () => {
    const r = await asUser(ids.admin, async (tx) => {
      await wf(tx, "booking_confirmed", 60);
      await wf(tx, "message_received");
      const [b] = await tx`insert into bookings(workspace_id, tour_name, status) values (${ids.ws}, 'T', 'confirmed') returning id`;
      await tx`update bookings set notes = 'edited' where id = ${b.id}`; // not a status change: no new event
      const [c] = await tx`insert into conversations(workspace_id, channel) values (${ids.ws}, 'manual') returning id`;
      await tx`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.ws}, ${c.id}, 'inbound', 'hello')`;
      await tx`insert into messages(workspace_id, conversation_id, direction, body) values (${ids.ws}, ${c.id}, 'outbound', 'reply')`;
      const ev = await tx`select trigger, status, run_at > now() + interval '59 minutes' as delayed from automation_events where workspace_id = ${ids.ws} order by trigger`;
      return ev;
    });
    expect(r.map((e) => e.trigger)).toEqual(["booking_confirmed", "message_received"]);
    expect(r[0]!.delayed).toBe(true);
    expect(r.every((e) => e.status === "pending")).toBe(true);
  });
  it("events over the plan's monthly allowance are recorded as skipped", async () => {
    const admin = await makeUser("autoFree");
    const ws = await makeWorkspace("Auto Free", admin, "free");
    await sql`update workspaces set plan_limits = '{"monthly_automation_runs": 1}' where id = ${ws}`;
    const statuses = await asUser(admin, async (tx) => {
      await tx`insert into automation_workflows(workspace_id, name, trigger, actions) values (${ws}, 'L', 'lead_created', ${sql.json([{ type: "notify", to: "managers", text: "x" }])})`;
      await tx`insert into leads(workspace_id, title) values (${ws}, 'a'), (${ws}, 'b')`;
      return (await tx`select status from automation_events where workspace_id = ${ws} order by created_at, status`).map((x) => x.status).sort();
    });
    expect(statuses).toEqual(["pending", "skipped"]);
  });
  it("browsers cannot write the queue", async () => {
    await expect(asUser(ids.admin, (tx) => tx`update automation_events set status = 'done'`)).rejects.toThrow(/permission denied/);
    await expect(asService((tx) => tx`select enqueue_automation(${ids.ws}, 'lead_created', 'lead', gen_random_uuid(), 'x')`)).rejects.toThrow(/permission denied/);
  });
});
