import { describe, expect, it } from "vitest";
import { mapHeaders, parseCsv, toImportRows } from "./csv";

describe("csv import", () => {
  it("parses quotes, escaped quotes, newlines in cells, CRLF and BOM", () => {
    const rows = parseCsv('﻿Name,Notes\r\n"Silva, Ana","said ""hi""\nthen left"\r\nBen,\r\n');
    expect(rows).toEqual([
      ["Name", "Notes"],
      ["Silva, Ana", 'said "hi"\nthen left'],
      ["Ben", ""],
    ]);
  });
  it("detects semicolon-separated Excel exports", () => {
    expect(parseCsv("Nome;Email\nAna;a@x.pt")).toEqual([
      ["Nome", "Email"],
      ["Ana", "a@x.pt"],
    ]);
  });
  it("maps common headers in several languages", () => {
    expect(mapHeaders(["E-mail", "Telefone", "Nome", "País"])).toEqual({
      email: 0,
      phone: 1,
      full_name: 2,
      country: 3,
    });
  });
  it("builds rows from first/last name columns and drops empty lines", () => {
    const { rows } = toImportRows([
      ["First name", "Last name", "Mobile"],
      ["Ana", "Silva", "+351 9"],
      ["", "", ""],
    ]);
    expect(rows).toEqual([{ full_name: "Ana Silva", phone: "+351 9" }]);
  });
});
