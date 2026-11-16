import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  docxXmlToText,
  extractKind,
  formatKnowledge,
  htmlToText,
  queryTerms,
  readZipEntry,
  titleFromFile,
} from "./knowledge";

/** Minimal zip writer for tests: one entry per file, deflate or stored. */
function makeZip(files: Record<string, string>, deflate = true): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameB = enc.encode(name);
    const raw = enc.encode(text);
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, deflate ? 8 : 0, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, nameB.length, true);
    locals.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, deflate ? 8 : 0, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, raw.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return out.buffer;
}

describe("queryTerms", () => {
  it("keeps meaningful words, newest message first, no duplicates or stopwords", () => {
    const t = queryTerms([
      "Hello, what are your opening hours?",
      "Do you have a price for 4 people? Preço 25",
    ]);
    expect(t.slice(0, 3)).toEqual(["price", "people", "preço"]);
    expect(t).toContain("25");
    expect(t).toContain("opening");
    expect(t).not.toContain("hello");
    expect(t).not.toContain("you");
    expect(new Set(t).size).toBe(t.length);
  });
  it("caps the number of terms and strips punctuation", () => {
    const many = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    expect(queryTerms([many], 10)).toHaveLength(10);
    expect(queryTerms(["it's 'quoted' & :weird*"])).toEqual(["quoted", "weird"]);
  });
});

describe("formatKnowledge", () => {
  it("prints whole docs and groups excerpts by title within the budget", () => {
    const txt = formatKnowledge([
      { title: "Prices", category: "pricing", content: "Tour €25", whole: false },
      { title: "Prices", category: "pricing", content: "Kids free", whole: false },
      { title: "FAQ", category: "general", content: "Open daily", whole: false },
    ]);
    expect(txt).toContain("## Prices (pricing) — relevant excerpts\nTour €25\n…\nKids free");
    expect(txt).toContain("## FAQ");
    const whole = formatKnowledge([{ title: "A", category: "g", content: "x", whole: true }]);
    expect(whole).toBe("## A (g)\nx");
    const cut = formatKnowledge(
      [{ title: "Big", category: "g", content: "y".repeat(5000), whole: true }],
      1000,
    );
    expect(cut.length).toBeLessThanOrEqual(1001);
  });
});

describe("file text extraction", () => {
  it("detects supported types", () => {
    expect(extractKind("menu.PDF", "")).toBe("pdf");
    expect(extractKind("a.docx", "")).toBe("docx");
    expect(extractKind("a.md", "")).toBe("text");
    expect(extractKind("page.html", "")).toBe("html");
    expect(extractKind("photo.jpg", "image/jpeg")).toBeNull();
    expect(extractKind("old.doc", "application/msword")).toBeNull();
  });
  it("turns HTML and Word XML into readable text", () => {
    expect(
      htmlToText(
        "<h1>Hours</h1><p>Mon&ndash;Fri &amp; Sat</p><script>x()</script><ul><li>9:00</li></ul>",
      ),
    ).toBe("Hours\n\nMon&ndash;Fri & Sat\n\n• 9:00");
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>Price</w:t></w:r><w:r><w:tab/><w:t>€25 &amp; up</w:t></w:r></w:p><w:p><w:r><w:t>Line2</w:t></w:r></w:p></w:body></w:document>";
    expect(docxXmlToText(xml)).toBe("Price\t€25 & up\n\nLine2");
  });
  it("reads entries from a zip (deflate and stored)", async () => {
    const xml = "<w:p><w:t>Hello docx</w:t></w:p>";
    for (const deflate of [true, false]) {
      const zip = makeZip({ "[Content_Types].xml": "<x/>", "word/document.xml": xml }, deflate);
      expect(await readZipEntry(zip, "word/document.xml")).toBe(xml);
      expect(await readZipEntry(zip, "missing.xml")).toBeNull();
    }
    expect(await readZipEntry(new ArrayBuffer(10), "x")).toBeNull();
  });
  it("makes titles from file names", () => {
    expect(titleFromFile("price-list_2026.pdf")).toBe("Price list 2026");
    expect(titleFromFile(".pdf")).toBe("Document");
  });
});
