// Browser-only: turn an uploaded file into plain text for the knowledge base. pdf.js is loaded on
// demand so it never enters the main bundle or the server build.
import {
  MAX_DOC_CHARS,
  cleanText,
  docxXmlToText,
  extractKind,
  htmlToText,
  readZipEntry,
} from "./knowledge";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const KNOWLEDGE_ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm";

export type Extracted =
  { ok: true; text: string; truncated: boolean } | { ok: false; error: string };

export async function extractFileText(file: File): Promise<Extracted> {
  const kind = extractKind(file.name, file.type);
  if (!kind)
    return {
      ok: false,
      error: "Unsupported file. Use PDF, Word (.docx), text, Markdown, CSV or HTML.",
    };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is larger than 15 MB." };
  let text = "";
  try {
    if (kind === "text") text = cleanText(await file.text());
    else if (kind === "html") text = htmlToText(await file.text());
    else if (kind === "docx") {
      const xml = await readZipEntry(await file.arrayBuffer(), "word/document.xml");
      if (xml === null) return { ok: false, error: "This doesn't look like a valid .docx file." };
      text = docxXmlToText(xml);
    } else text = cleanText(await pdfToText(await file.arrayBuffer()));
  } catch {
    return {
      ok: false,
      error: "Couldn't read this file. If it's password-protected, remove the password first.",
    };
  }
  if (!text)
    return {
      ok: false,
      error:
        kind === "pdf"
          ? "No text found — this looks like a scanned PDF (images only). Paste the text instead."
          : "The file is empty.",
    };
  return { ok: true, text: text.slice(0, MAX_DOC_CHARS), truncated: text.length > MAX_DOC_CHARS };
}

// Folded away at build time on the server (import.meta.env.SSR), so pdf.js never enters the worker.
const loadPdfJs = import.meta.env.SSR
  ? null
  : () => Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);

/** Scanned PDFs (images only) contain no text and return "". */
export async function pdfToText(buf: ArrayBuffer, maxPages = 300): Promise<string> {
  if (!loadPdfJs) throw new Error("PDF extraction runs in the browser only");
  const [pdfjs, worker] = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false })
    .promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = "";
      } else if (it.str && !line.endsWith(" ")) line += " ";
    }
    if (line.trim()) lines.push(line);
    pages.push(lines.join("\n"));
  }
  await doc.destroy();
  return pages.join("\n\n");
}
