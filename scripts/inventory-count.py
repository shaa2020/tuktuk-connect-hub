#!/usr/bin/env python3
"""Counts docs/product/feature-inventory.md rows by status so progress is never estimated by hand."""
import re, pathlib
s = pathlib.Path(__file__).resolve().parent.parent.joinpath("docs/product/feature-inventory.md").read_text()
body = s[s.index("## 1."):s.index("## Progress")]
rows = [l for l in body.splitlines() if l.startswith("| ") and not re.match(r"\| (Feature|Code)\b", l) and not re.match(r"\|\s*:?-{3,}", l)]
st = [l.split("|")[2] for l in rows]
ver = sum("✅" in x for x in st)
part = sum("✅" not in x and ("🟡" in x or "🟠" in x) for x in st)
print(f"{len(rows)} rows — {ver} ✅ verified, {part} 🟡/🟠 implemented or partial, {len(rows)-ver-part} ❌/⛔ missing or blocked")
