import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asService, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
// A date 10 days ahead, on a weekday with the default hours (Mon–Sat).
let day = "";
beforeAll(async () => {
  ids.admin = await makeUser("bpAdmin");
  ids.agent = await makeUser("bpAgent");
  ids.other = await makeUser("bpOther");
  ids.ws = await makeWorkspace("Sol Restaurant", ids.admin, "internal");
  ids.ws2 = await makeWorkspace("Other Biz", ids.other, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  await sql`update workspaces set public_slug = 'sol-restaurant', booking_page_enabled = true, timezone = 'Europe/Lisbon' where id = ${ids.ws}`;
  const [d] =
    await sql`select (current_date + 10 + case extract(dow from current_date + 10)::int when 0 then 1 else 0 end)::text d`;
  day = d.d;
  const [s] =
    await sql`insert into services(workspace_id, name, duration_minutes, slot_interval_minutes, capacity, capacity_unit, max_guests, price_cents, price_per, weekly_hours)
    values (${ids.ws}, 'Dinner', 90, 30, 10, 'guests', 8, 2500, 'person', '{"0":[["18:00","22:00"]],"1":[["18:00","22:00"]],"2":[["18:00","22:00"]],"3":[["18:00","22:00"]],"4":[["18:00","22:00"]],"5":[["18:00","22:00"]],"6":[["18:00","22:00"]]}') returning id`;
  ids.svc = s.id;
  const [r] =
    await sql`insert into services(workspace_id, name, booking_mode, capacity, capacity_unit, max_guests, price_cents, weekly_hours)
    values (${ids.ws}, 'Double room', 'day', 2, 'bookings', 2, 9000, '{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}') returning id`;
  ids.room = r.id;
});
afterAll(async () => {
  await sql.end();
});

const book = (
  tx: any,
  svc: string,
  time: string | null,
  guests: number,
  nights = 1,
  slug = "sol-restaurant",
) =>
  tx`select public_create_booking(${slug}, ${svc}, ${day}, ${time}, ${guests}, 'Ana Guest', 'ana@example.test', null, 'Window table', ${nights}) r`;

describe("services & availability", () => {
  it("lists slots inside opening hours with full capacity", async () => {
    const slots = await asUser(
      ids.admin,
      (tx) =>
        tx`select start_time::text t, remaining from service_availability(${ids.svc}, ${day}::date)`,
    );
    expect(slots.map((s) => s.t)).toEqual([
      "18:00:00",
      "18:30:00",
      "19:00:00",
      "19:30:00",
      "20:00:00",
      "20:30:00",
    ]);
    expect(slots.every((s) => s.remaining === 10)).toBe(true);
  });
  it("no slots in the past or beyond the booking window", async () => {
    const past = await asUser(
      ids.admin,
      (tx) => tx`select count(*)::int n from service_availability(${ids.svc}, current_date - 1)`,
    );
    const far = await asUser(
      ids.admin,
      (tx) => tx`select count(*)::int n from service_availability(${ids.svc}, current_date + 400)`,
    );
    expect([past[0].n, far[0].n]).toEqual([0, 0]);
  });
  it("only admins/managers manage services; other businesses can't see them", async () => {
    await expect(
      asUser(
        ids.agent,
        (tx) => tx`insert into services(workspace_id, name) values (${ids.ws}, 'x')`,
      ),
    ).rejects.toThrow(/row-level security/);
    const n = await asUser(
      ids.other,
      (tx) => tx`select count(*)::int n from services where workspace_id = ${ids.ws}`,
    );
    expect(n[0].n).toBe(0);
  });
});

describe("public booking", () => {
  it("page data exposes only public info and only when enabled", async () => {
    const page = await asService((tx) => tx`select public_booking_page('sol-restaurant') p`);
    expect(page[0].p.name).toBe("Sol Restaurant");
    expect(page[0].p.services.map((s: any) => s.name).sort()).toEqual(["Dinner", "Double room"]);
    expect(Object.keys(page[0].p.services[0])).not.toContain("capacity");
    const none = await asService((tx) => tx`select public_booking_page('does-not-exist') p`);
    expect(none[0].p).toBeNull();
  });
  it("creates a booking, prices it, notifies the team and reduces capacity; blocks overbooking", async () => {
    const r = await asService(async (tx) => {
      const a = (await book(tx, ids.svc, "19:00", 6))[0].r;
      const left = (
        await tx`select remaining from service_availability(${ids.svc}, ${day}::date) where start_time = '19:30'`
      )[0].remaining;
      const over = await tx
        .savepoint((sp: any) => book(sp, ids.svc, "19:00", 6))
        .then(
          () => "ok",
          (e: Error) => e.message,
        );
      const notes = (
        await tx`select count(*)::int n from notifications where workspace_id = ${ids.ws} and kind = 'booking'`
      )[0].n;
      const [bk] =
        await tx`select status, amount::int amount, source_system from bookings where reference = ${a.reference}`;
      return { a, left, over, notes, bk };
    });
    expect(r.a.status).toBe("tentative");
    expect(r.bk).toEqual({ status: "tentative", amount: 150, source_system: "booking_page" });
    expect(r.left).toBe(4); // 19:30 overlaps the 19:00 (90 min) booking
    expect(r.over).toMatch(/Only 4 place/);
    expect(r.notes).toBe(1);
  });
  it("day mode (rooms): counts bookings per night", async () => {
    const r = await asService(async (tx) => {
      await book(tx, ids.room, null, 2, 2);
      await book(tx, ids.room, null, 1, 1);
      return tx
        .savepoint((sp: any) => book(sp, ids.room, null, 1, 1))
        .then(
          () => "ok",
          (e: Error) => e.message,
        );
    });
    expect(r).toMatch(/Not available on/);
  });
  it("validates input and refuses disabled pages or other businesses' services", async () => {
    await expect(
      asService(
        (tx) =>
          tx`select public_create_booking('sol-restaurant', ${ids.svc}, ${day}::date, '19:00', 20, 'Ana', 'a@b.co', null, null, 1)`,
      ),
    ).rejects.toThrow(/between 1 and 8/);
    await expect(
      asService(
        (tx) =>
          tx`select public_create_booking('sol-restaurant', ${ids.svc}, ${day}::date, '19:00', 2, 'Ana', null, null, null, 1)`,
      ),
    ).rejects.toThrow(/email or phone/);
    await expect(
      asService(
        (tx) =>
          tx`select public_create_booking('sol-restaurant', ${ids.svc}, ${day}::date, '03:00', 2, 'Ana', 'a@b.co', null, null, 1)`,
      ),
    ).rejects.toThrow(/not available/);
    await sql`update workspaces set public_slug = 'other-biz', booking_page_enabled = true where id = ${ids.ws2}`;
    await expect(
      asService(
        (tx) =>
          tx`select public_create_booking('other-biz', ${ids.svc}, ${day}::date, '19:00', 2, 'Ana', 'a@b.co', null, null, 1)`,
      ),
    ).rejects.toThrow(/service is not available/);
  });
  it("browsers can't call the booking functions directly", async () => {
    await expect(
      asUser(null, (tx) => tx`select public_booking_page('sol-restaurant')`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        ids.admin,
        (tx) =>
          tx`select public_create_booking('sol-restaurant', ${ids.svc}, current_date, '19:00', 2, 'A', 'a@b.co', null, null, 1)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
