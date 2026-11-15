import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("schedAdmin");
  ids.agent = await makeUser("schedAgent");
  ids.agent2 = await makeUser("schedAgent2");
  ids.outsider = await makeUser("schedOut");
  ids.ws = await makeWorkspace("Sched Biz", ids.admin, "internal");
  ids.other = await makeWorkspace("Other Biz", ids.outsider, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  await addMember(ids.ws, ids.agent2, "agent");
});
afterAll(async () => {
  await sql.end();
});

const shift = (tx: any, user: string, start: string, end: string) =>
  tx`insert into staff_shifts(workspace_id, user_id, starts_at, ends_at) values (${ids.ws}, ${user}, ${start}, ${end}) returning id`;

describe("shifts", () => {
  it("managers create shifts; the employee is notified; agents cannot create shifts", async () => {
    const n = await asUser(ids.admin, async (tx) => {
      await shift(tx, ids.agent, "2030-01-01T09:00Z", "2030-01-01T17:00Z");
      await tx.unsafe("reset role");
      return (
        await tx`select count(*)::int n from notifications where user_id = ${ids.agent} and kind = 'shift'`
      )[0].n;
    });
    expect(n).toBe(1);
    await expect(
      asUser(ids.agent, (tx) => shift(tx, ids.agent, "2030-01-02T09:00Z", "2030-01-02T17:00Z")),
    ).rejects.toThrow(/row-level security/);
  });
  it("blocks overlapping shifts for the same person", async () => {
    await expect(
      asUser(ids.admin, async (tx) => {
        await shift(tx, ids.agent, "2030-02-01T09:00Z", "2030-02-01T17:00Z");
        await shift(tx, ids.agent, "2030-02-01T16:00Z", "2030-02-01T20:00Z");
      }),
    ).rejects.toThrow(/already has a shift/);
  });
  it("cannot schedule someone from another business", async () => {
    await expect(
      asUser(ids.admin, (tx) => shift(tx, ids.outsider, "2030-03-01T09:00Z", "2030-03-01T10:00Z")),
    ).rejects.toThrow(/must be a member/);
  });
  it("other businesses can't see the schedule", async () => {
    const r = await asUser(
      ids.outsider,
      (tx) => tx`select count(*)::int n from staff_shifts where workspace_id = ${ids.ws}`,
    );
    expect(r[0].n).toBe(0);
  });
});

describe("time off", () => {
  it("employee requests, only managers decide, and the employee is notified", async () => {
    const out = await asUser(ids.agent, async (tx) => {
      const [r] =
        await tx`insert into time_off_requests(workspace_id, starts_on, ends_on, reason) values (${ids.ws}, '2030-05-01', '2030-05-03', 'Holiday') returning id`;
      const denied = await tx
        .savepoint((sp: any) => sp`select decide_time_off(${r.id}, true)`)
        .then(
          () => "ok",
          (e: Error) => e.message,
        );
      await tx`select set_config('request.jwt.claim.sub', ${ids.admin}, true)`;
      await tx`select decide_time_off(${r.id}, true)`;
      await tx.unsafe("reset role");
      const [row] = await tx`select status from time_off_requests where id = ${r.id}`;
      const [n] =
        await tx`select count(*)::int n from notifications where user_id = ${ids.agent} and kind = 'time_off'`;
      return { denied, status: row.status, notified: n.n };
    });
    expect(out.denied).toMatch(/Not allowed/);
    expect(out.status).toBe("approved");
    expect(out.notified).toBe(1);
  });
  it("employees cannot self-approve by inserting an approved request", async () => {
    await expect(
      asUser(
        ids.agent,
        (tx) =>
          tx`insert into time_off_requests(workspace_id, starts_on, ends_on, status) values (${ids.ws}, '2030-06-01', '2030-06-02', 'approved')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("colleagues can't see each other's requests", async () => {
    const n = await asUser(
      ids.agent2,
      (tx) => tx`select count(*)::int n from time_off_requests where workspace_id = ${ids.ws}`,
    );
    expect(n[0].n).toBe(0);
  });
});

describe("shift swaps", () => {
  it("employee proposes a swap of their own shift; manager approval moves it", async () => {
    const owner = await asUser(ids.admin, async (tx) => {
      const [s] = await shift(tx, ids.agent, "2030-07-01T09:00Z", "2030-07-01T12:00Z");
      await tx`select set_config('request.jwt.claim.sub', ${ids.agent}, true)`;
      const [sw] =
        await tx`insert into shift_swap_requests(workspace_id, shift_id, to_user) values (${ids.ws}, ${s.id}, ${ids.agent2}) returning id`;
      await tx`select set_config('request.jwt.claim.sub', ${ids.admin}, true)`;
      await tx`select decide_shift_swap(${sw.id}, true)`;
      return (await tx`select user_id from staff_shifts where id = ${s.id}`)[0].user_id;
    });
    expect(owner).toBe(ids.agent2);
  });
  it("cannot offer away someone else's shift", async () => {
    await expect(
      asUser(ids.admin, async (tx) => {
        const [s] = await shift(tx, ids.agent2, "2030-08-01T09:00Z", "2030-08-01T12:00Z");
        await tx`select set_config('request.jwt.claim.sub', ${ids.agent}, true)`;
        await tx`insert into shift_swap_requests(workspace_id, shift_id, to_user) values (${ids.ws}, ${s.id}, ${ids.agent})`;
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("attendance", () => {
  it("clock in/out uses server time, once at a time, and can't be written directly", async () => {
    const r = await asUser(ids.agent, async (tx) => {
      await tx`select clock_in(${ids.ws})`;
      const twice = await tx
        .savepoint((sp: any) => sp`select clock_in(${ids.ws})`)
        .then(
          () => "ok",
          (e: Error) => e.message,
        );
      await tx`select clock_out(${ids.ws})`;
      const rows =
        await tx`select clock_in, clock_out from staff_attendance where user_id = ${ids.agent}`;
      return { twice, rows: rows.length, closed: rows[0].clock_out !== null };
    });
    expect(r).toEqual({ twice: "You are already clocked in", rows: 1, closed: true });
    await expect(
      asUser(
        ids.agent,
        (tx) =>
          tx`insert into staff_attendance(workspace_id, user_id, clock_in) values (${ids.ws}, ${ids.agent}, '2020-01-01')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
