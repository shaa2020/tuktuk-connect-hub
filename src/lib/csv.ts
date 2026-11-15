// Pure CSV parsing + column mapping for contact import (tested). Handles quotes, escaped quotes,
// commas/semicolons, CRLF and a UTF-8 BOM (Excel exports).

export function parseCsv(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const firstLine = s.split(/\r?\n/, 1)[0] ?? "";
  const delim =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export type Field =
  | "full_name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "preferred_language"
  | "country"
  | "notes";
const ALIASES: Record<Field, RegExp> = {
  full_name: /^(full ?name|name|nome|nombre|contact|customer|cliente|guest)$/i,
  first_name: /^(first ?name|given ?name|primeiro nome|nombre de pila)$/i,
  last_name: /^(last ?name|surname|family ?name|apelido|apellido)$/i,
  email: /^(e-?mail|email address|correo)$/i,
  phone: /^(phone|mobile|telephone|tel|telefone|tel[eé]fono|whatsapp|cell)$/i,
  preferred_language: /^(language|lang|idioma|l[ií]ngua)$/i,
  country: /^(country|pa[ií]s|nationality)$/i,
  notes: /^(notes?|comments?|observa[cç][oõ]es|notas)$/i,
};

/** Guesses which column holds which field from the header row. */
export function mapHeaders(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  headers.forEach((h, i) => {
    const t = h.trim();
    for (const f of Object.keys(ALIASES) as Field[])
      if (out[f] === undefined && ALIASES[f].test(t)) {
        out[f] = i;
        break;
      }
  });
  return out;
}

export type ImportRow = {
  full_name: string;
  email?: string;
  phone?: string;
  preferred_language?: string;
  country?: string;
  notes?: string;
};

export function toImportRows(rows: string[][]): {
  rows: ImportRow[];
  mapping: Partial<Record<Field, number>>;
} {
  const [head, ...body] = rows;
  if (!head) return { rows: [], mapping: {} };
  const m = mapHeaders(head);
  const get = (r: string[], f: Field) => (m[f] !== undefined ? (r[m[f]!] ?? "").trim() : "");
  const out = body
    .map((r) => {
      const name =
        get(r, "full_name") ||
        [get(r, "first_name"), get(r, "last_name")].filter(Boolean).join(" ");
      const x: ImportRow = { full_name: name };
      for (const f of ["email", "phone", "preferred_language", "country", "notes"] as const) {
        const v = get(r, f);
        if (v) x[f] = v;
      }
      return x;
    })
    .filter((x) => x.full_name || x.email || x.phone);
  return { rows: out, mapping: m };
}
