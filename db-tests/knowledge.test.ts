import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, makeUser, makeWorkspace, sql } from "./helpers";

const ids: Record<string, string> = {};
const filler = (word: string, n: number) =>
  Array.from(
    { length: n },
    (_, i) => `Paragraph ${i} about ${word} and other general things to fill space.`,
  ).join("\n\n");

beforeAll(async () => {
  ids.admin = await makeUser("kbAdmin");
  ids.other = await makeUser("kbOther");
  ids.ws = await makeWorkspace("KB Biz", ids.admin, "internal");
  ids.small = await makeWorkspace("KB Small", ids.admin, "internal");
  await makeWorkspace("KB Other", ids.other, "internal");
  // Large knowledge base (> budget): two long documents.
  await sql`insert into knowledge_documents(workspace_id, title, category, content) values
    (${ids.ws}, 'Boat trips', 'general', ${filler("sailing", 400)}),
    (${ids.ws}, 'Prices', 'prices', ${filler("weather", 200) + "\n\nThe sunset cruise price is 45 euros per adult. Children under 6 travel free.\n\n" + filler("weather", 200)})`;
  await sql`insert into knowledge_documents(workspace_id, title, category, content) values
    (${ids.small}, 'Hours', 'faq', 'Open 9:00-18:00 daily.')`;
});
afterAll(async () => {
  await sql.end();
});

describe("knowledge documents", () => {
  it("accepts long documents and splits them into ~1,200 character chunks", async () => {
    const [d] =
      await sql`select id, char_length(content) n from knowledge_documents where title = 'Boat trips'`;
    expect(d.n).toBeGreaterThan(20000);
    const chunks =
      await sql`select char_length(content) n, seq from knowledge_chunks where document_id = ${d.id} order by seq`;
    expect(chunks.length).toBeGreaterThan(10);
    expect(Math.max(...chunks.map((c) => c.n))).toBeLessThanOrEqual(1500);
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i));
    // editing the content rebuilds its chunks
    await sql`update knowledge_documents set content = 'short now' where id = ${d.id}`;
    const after = await sql`select content from knowledge_chunks where document_id = ${d.id}`;
    expect(after.map((c) => c.content)).toEqual(["short now"]);
    await sql`update knowledge_documents set content = ${filler("sailing", 400)} where id = ${d.id}`;
  });

  it("returns the passage that matches the conversation from a large knowledge base", async () => {
    const rows = await asUser(
      ids.admin,
      (tx) =>
        tx`select * from knowledge_context(${ids.ws}, ${["sunset", "cruise", "price", "children"]}, 4000)`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].title).toBe("Prices");
    expect(rows[0].content).toContain("45 euros");
    expect(rows.every((r) => r.whole === false)).toBe(true);
    const total = rows.reduce((n, r) => n + r.content.length, 0);
    expect(total).toBeLessThanOrEqual(4000);
  });

  it("sends a small knowledge base whole", async () => {
    const rows = await asUser(
      ids.admin,
      (tx) => tx`select * from knowledge_context(${ids.small}, ${["anything"]}, 24000)`,
    );
    expect(rows).toEqual([
      { title: "Hours", category: "faq", content: "Open 9:00-18:00 daily.", whole: true },
    ]);
  });

  it("ignores unsafe terms and still answers", async () => {
    const rows = await asUser(
      ids.admin,
      (tx) =>
        tx`select * from knowledge_context(${ids.ws}, ${["a' | b", "x:*", "price", "", "(drop)"]}, 3000)`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("non-members get nothing; browsers can't write chunks", async () => {
    const rows = await asUser(
      ids.other,
      (tx) => tx`select * from knowledge_context(${ids.ws}, ${["price"]}, 4000)`,
    );
    expect(rows).toEqual([]);
    const [doc] =
      await sql`select id from knowledge_documents where workspace_id = ${ids.ws} limit 1`;
    await expect(
      asUser(
        ids.admin,
        (tx) =>
          tx`insert into knowledge_chunks(workspace_id, document_id, content) values (${ids.ws}, ${doc.id}, 'fake')`,
      ),
    ).rejects.toThrow();
  });
});
