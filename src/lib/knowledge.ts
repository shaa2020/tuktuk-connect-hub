// AI knowledge helpers (pure, tested): conversation → search terms, retrieved rows → prompt text,
// and text extraction for uploaded files (plain text, HTML, CSV, Word .docx). PDF extraction lives
// in knowledge-pdf.ts because it lazy-loads pdf.js in the browser.

export const MAX_DOC_CHARS = 200_000;
export const KNOWLEDGE_BUDGET = 24_000;

// Small multilingual stopword list (en/pt/es/fr/de) — words that carry no search meaning.
const STOP = new Set(
  (
    "the and for are but not you your with this that have from was were will can what when where which who how " +
    "about there their them they then than into just also any all our out get got does did had has its it's " +
    "hello hi hey please thanks thank yes okay ok would could should need want like know " +
    "que para com uma por mais como mas dos das nos nas pelo pela isso esta este estou olá obrigado obrigada " +
    "los las del una con por para pero más como esto esta hola gracias " +
    "les des une pour avec dans est pas que qui sur bonjour merci " +
    "der die das und ist nicht ein eine mit für auf den dem ich sie wir hallo danke"
  ).split(" "),
);

/** Distinct meaningful words from recent messages, most recent first, for full-text search. */
export function queryTerms(texts: string[], max = 24): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of [...texts].reverse()) {
    for (const m of t.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
      const w = m[0];
      const keep = /^\p{N}+$/u.test(w) ? w.length >= 2 : w.length >= 3;
      if (!keep || w.length > 40 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export type KnowledgeRow = { title: string; category: string; content: string; whole: boolean };

/** Prompt text: whole documents, or the retrieved passages grouped under their document title. */
export function formatKnowledge(rows: KnowledgeRow[], budget = KNOWLEDGE_BUDGET): string {
  const groups = new Map<string, { category: string; parts: string[]; whole: boolean }>();
  for (const r of rows) {
    const g = groups.get(r.title) ?? { category: r.category, parts: [], whole: r.whole };
    if (r.content.trim()) g.parts.push(r.content.trim());
    groups.set(r.title, g);
  }
  const out: string[] = [];
  let used = 0;
  for (const [title, g] of groups) {
    const head = `## ${title} (${g.category})${g.whole ? "" : " — relevant excerpts"}`;
    const body = g.parts.join(g.whole ? "\n\n" : "\n…\n");
    const block = `${head}\n${body}`;
    if (used + block.length > budget) {
      const room = budget - used - head.length - 2;
      if (room > 200) out.push(`${head}\n${body.slice(0, room)}…`);
      break;
    }
    out.push(block);
    used += block.length + 2;
  }
  return out.join("\n\n");
}

/** Normalise extracted text: unify newlines, trim trailing spaces, collapse 3+ blank lines. */
export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return cleanText(
    decodeEntities(
      html
        .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<\/t[dh]>/gi, "\t")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

/** Text of a Word document.xml: paragraphs → blank lines, tabs/breaks kept. */
export function docxXmlToText(xml: string): string {
  return cleanText(
    decodeEntities(
      xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n\n")
        .replace(/<\/w:tc>/g, "\t")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

/** Read one file from a .zip (used for .docx). Supports stored and deflate entries. */
export async function readZipEntry(buf: ArrayBuffer, name: string): Promise<string | null> {
  const v = new DataView(buf);
  // End of central directory: scan backwards for its signature.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count && p + 46 <= buf.byteLength; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) return null;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const entry = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extra + comment;
    if (entry !== name) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = new Uint8Array(buf, start, size);
    if (method === 0) return dec.decode(data);
    if (method !== 8) return null;
    const stream = new ReadableStream<BufferSource>({
      start(c) {
        c.enqueue(data);
        c.close();
      },
    }).pipeThrough(new DecompressionStream("deflate-raw"));
    return dec.decode(await new Response(stream).arrayBuffer());
  }
  return null;
}

export type ExtractKind = "text" | "html" | "docx" | "pdf";
export function extractKind(name: string, mime: string): ExtractKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "html" || ext === "htm" || mime === "text/html") return "html";
  if (["txt", "md", "markdown", "csv", "tsv", "json"].includes(ext) || mime.startsWith("text/"))
    return "text";
  return null;
}

/** Title from a file name: "price-list_2026.pdf" → "Price list 2026". */
export function titleFromFile(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 200) || "Document";
}
