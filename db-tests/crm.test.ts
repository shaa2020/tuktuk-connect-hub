import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
beforeAll(async () => {
  ids.admin = await makeUser("crmAdmin");
  ids.agent = await makeUser("crmAgent");
  ids.other = await makeUser("crmOther");
  ids.ws = await makeWorkspace("CRM Biz", ids.admin, "internal");
  ids.ws2 = await makeWorkspace("CRM Other", ids.other, "internal");
  await addMember(ids.ws, ids.agent, "agent");
  await sql`insert into contacts(workspace_id, full_name, email, phone) values (${ids.ws}, 'Existing Ana', 'ana@example.test', '+351 912 345 678')`;
});
afterAll(async () => {
  await sql.end();
});

describe("contact import", () => {
  it("imports new contacts and skips duplicates by email/phone (incl. within the file)", async () => {
    const rows = [
      { full_name: "Ana Again", email: "ANA@example.test" },
      { full_name: "Phone Dup", phone: "00351912345678" },
      { full_name: "New Ben", email: "ben@example.test" },
      { full_name: "Ben Twice", email: "ben@example.test" },
      { full_name: "", email: "" },
    ];
    const r = await asUser(
      ids.admin,
      (tx) => tx`select import_contacts(${ids.ws}, ${sql.json(rows)}) r`,
    );
    expect(r[0].r).toEqual({ inserted: 1, skipped_duplicates: 3, invalid: 1 });
  });
  it("agents and other businesses cannot import", async () => {
    await expect(
      asUser(
        ids.agent,
        (tx) => tx`select import_contacts(${ids.ws}, ${sql.json([{ full_name: "x" }])})`,
      ),
    ).rejects.toThrow(/Only admins and managers/);
    await expect(
      asUser(
        ids.other,
        (tx) => tx`select import_contacts(${ids.ws}, ${sql.json([{ full_name: "x" }])})`,
      ),
    ).rejects.toThrow(/Only admins and managers/);
  });
});

describe("duplicate finder", () => {
  it("finds likely duplicates for admins only", async () => {
    await sql`insert into contacts(workspace_id, full_name, phone) values (${ids.ws}, 'Ana S', '912345678 '), (${ids.ws}, 'Carla Mendes', null), (${ids.ws}, 'carla mendes', null)`;
    const r = await asUser(
      ids.admin,
      (tx) => tx`select reason from find_duplicate_contacts(${ids.ws})`,
    );
    expect(r.map((x) => x.reason)).toContain("same name");
    await expect(
      asUser(ids.agent, (tx) => tx`select * from find_duplicate_contacts(${ids.ws})`),
    ).rejects.toThrow(/Not allowed/);
  });
});

describe("custom fields", () => {
  it("admins define fields; values are validated by type", async () => {
    await asUser(ids.admin, async (tx) => {
      await tx`insert into contact_field_definitions(workspace_id, key, label, type, options) values (${ids.ws}, 'vip_level', 'VIP level', 'select', ${["gold", "silver"]}), (${ids.ws}, 'visits', 'Visits', 'number', '{}')`;
      const [c] =
        await tx`insert into contacts(workspace_id, full_name, custom_fields) values (${ids.ws}, 'Field Test', ${sql.json({ vip_level: "gold", visits: 3 })}) returning custom_fields`;
      expect(c.custom_fields).toEqual({ vip_level: "gold", visits: 3 });
      await expect(
        tx.savepoint(
          (sp: any) =>
            sp`insert into contacts(workspace_id, full_name, custom_fields) values (${ids.ws}, 'Bad', ${sql.json({ vip_level: "platinum" })})`,
        ),
      ).rejects.toThrow(/listed options/);
      await expect(
        tx.savepoint(
          (sp: any) =>
            sp`insert into contacts(workspace_id, full_name, custom_fields) values (${ids.ws}, 'Bad', ${sql.json({ unknown: "x" })})`,
        ),
      ).rejects.toThrow(/Unknown custom field/);
    });
  });
  it("agents cannot define fields", async () => {
    await expect(
      asUser(
        ids.agent,
        (tx) =>
          tx`insert into contact_field_definitions(workspace_id, key, label) values (${ids.ws}, 'x1', 'X')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
