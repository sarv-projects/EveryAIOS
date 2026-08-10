# 04 — Office Engine: Open + Edit Word / Excel / PPT / PDF

> **The user requirement, verbatim:** *"must have the capability to open excel, word, ppt, pdf, etc — all types of files, Microsoft files — edit."*
> Design rules: **surgical, byte-preserving** edits (never full re-serialize), **deterministic math** (never LLM-computed), **render-anywhere** UI. Patterns: GenOffice block-patch + Rust xlsx sidecar (doc 28), LibreOffice as conformance oracle (doc 29), OOXML parts-direct editing (web research, 2026), core-files `ooxml-extractors` + renderers (built).

## 4.1 The core principle: OOXML = ZIP + XML parts

A `.docx/.xlsx/.pptx` is a ZIP of XML parts + media. **Byte-preserving editing = open the ZIP, patch only the targeted XML part(s), write those parts back, copy every other entry byte-for-byte.** This preserves macros, digital signatures' companion data, custom properties, unknown namespaces (`w14/w15`), embedded objects, and exact formatting of untouched regions. (Web research confirmed: full AST re-serializers like docx-rs/python-docx are lossy for unmodeled parts — LibreOffice is likewise lossy on unknown OOXML, doc 29 §4. GenOffice proved surgical wins.)

```
Edit pipeline (one code path for docx/xlsx/pptx):
open ZIP → parse structure (parts index, content types, rels)
       → read target part → BLOCK TREE (anchored, with docxIndex/addresses)
       → LLM edits PLAIN TEXT against the block tree (never raw XML)
       → deterministic patch renderer → minimal XML diff (GenOffice w:t pattern)
       → zip rewrite: modified parts only, everything else byte-copied
       → verify (reopen + conformance assertions) → snapshotBefore kept for rollback
```

## 4.2 Per-format map

### Word (.docx, and .doc via conversion fallback)
- **Edit:** block-patch engine (GenOffice doc 28 §1: `text-patch.ts` — minimal `w:t` prefix/suffix patches, `patch.ts` orchestrator, `parse/scan.ts` block tree). The LLM edits rendered plain text; the engine maps back to the minimal run patches. Headers/footers/tables/sections are separate blocks.
- **Read/ingest:** existing `core-files` OOXML extractors + markitdown-class conversion for RAG.
- **Render:** webview rendering from the block tree (styled paragraphs, tables, images) — no external engine.
- **.doc (legacy binary):** read-only via conversion (headless soffice or textract) + "edit as new .docx" (documented limitation; edits always produce modern OOXML).

### Excel (.xlsx, .xlsm, .csv)
- **Engine:** **IronCalc** (Rust, 300+ functions, dynamic arrays, LET/LAMBDA, full recalc — the one pure-Rust calc engine, web-verified) as a **sidecar binary**; **calamine** for fast read; surgical part-patch for writes (`xl/worksheets/sheetN.xml`, `xl/sharedStrings.xml`). ⚠️ **IronCalc is pre-1.0** (v0.7.x; targeting 1.0 mid-2026 — v3.10 verification): pin exact versions and keep the calamine-read + surgical-write path engine-agnostic so the calc engine stays swappable.
- **Deterministic planner** (GenOffice doc 28 §5 — the star): regex NLP → **workbook DSL** (`workbook-dsl.ts`: cell-address, formula-shift, sort-range, flash-fill, pivot-engine, chart-visual) → **zero-LLM execution** for common ops (sort, fill, shift, sum/avg, pivot). Formulas are **recalculated by IronCalc**, never by the model. This is Crystallization in the spreadsheet domain (05).
- **Render:** virtualized 100K+ row tables (calamine-backed), formula bar, cell selection → chat overlay.
- **100% math integrity rule:** any numeric claim goes through IronCalc; the LLM only reads/writes values + formulas.

### PowerPoint (.pptx)
- **The gap:** no mature Rust editor; pptxgenjs is builder-only. → **Surgical OOXML part-editing** (our own, thin): patch `ppt/slides/slideN.xml` + `ppt/slides/_rels/*` for text runs, bullet text, shape text; add/remove slides by cloning a slide part + rels + `[Content_Types].xml` registration (the standard mechanical ops). Rendering via webview (shapes → styled divs; notes in a panel).
- **Read/ingest:** text + per-slide structure → markdown outline (for RAG + editing context).
- Scope guard: complex smart-art/video/full theme redesign = "open in PowerPoint/LibreOffice" suggestion; our edits stay text/shape/order-level (honest boundary, doc 29 contrast).

### PDF
- **Read/render:** pdf.js-class renderer in webview (built pattern in mobile renderers) + `core-files` pdf-text extraction + OCR cascade (built).
- **Edit modes (by operation):**
  1. **Form fill + annotation** — **pdf-lib** (TS, industry-standard, AcroForms/XFA) — the safe, high-fidelity path.
  2. **Text replacement** — **lopdf** (`replace_text`) via a small Rust bridge, only for exact-match single-token swaps (layout is preserved because glyph positions are untouched; never reflow).
  3. **Re-author** — for structural edits, generate a new PDF from the extracted content (pdf-writer/pdf-lib) rather than corrupting the source.
  4. **Redaction** — fill glyph boxes + remove text streams (pdf-lib + lopdf combo), audit-logged (06).
- **Never:** pretend arbitrary body-text edits are safe. UI always offers the right mode (doc: "edit this PDF" → detect → form/annotate/redact/re-author choice).

## 4.3 Read + RAG integration

Everything opened becomes **ingestible in one click** → `core-files` pipeline (chunk → hybrid index → memory, 07) → the agent can answer "what did the Q3 report say?" and cite the exact page/paragraph (source-lineage, built). Chat-overlay on any open document (page-scoped questions, built mobile pattern).

## 4.4 Conformance & no-failure guarantees

- **Round-trip oracle:** LibreOffice headless in CI (doc 29 §5) — open our edited file, assert: (a) untouched regions byte-stable vs the pre-edit file (zip-level diff of untouched parts), (b) file opens without repair warnings, (c) content assertions pass. This runs on every save in dev/test.
- **Rollback:** `snapshotBefore` (GenOffice hook, doc 28 §2) — the pre-edit ZIP is kept for one-click undo + crash recovery; writes are atomic (write temp ZIP → fsync → rename).
- **Edge cases:** locked files, encrypted OOXML (password) → clear error + offer LibreOffice/office app; broken ZIPs → salvage extract + repair report; huge sheets (1M+ rows) → virtualized + async; .doc/.xls/.ppt legacy → convert-to-docx/xlsx/pptx on open (or read-only).
- **Deterministic planner failure modes:** planner has a schema + a fallback to LLM-direct (with audit flag) when the regex DSL can't parse the user's intent; the fallback is always permission-gated like any mutating tool.

## 4.5 Module assignment

| Piece | Where | New/Exists |
|---|---|---|
| Block-patch engine (docx) | `packages/coordinator/office/docx-engine/` | New (port GenOffice concept; our own code) |
| Workbook DSL + planner | `packages/coordinator/office/sheets/` | New (GenOffice concept) |
| IronCalc sidecar | Rust binary in `crates/everyaios-core` extras or standalone | New (dependency: IronCalc) |
| calamine reader | Rust (in the sidecar) | New (dependency) |
| PPTX part-editor | `packages/coordinator/office/pptx/` | New (own, thin) |
| pdf-lib + lopdf bridge | TS + small Rust bridge | New |
| Renderers | `ui/` (webview) | New (patterns from app-mobile renderers) |
| Extract/ingest | `@personal-ai/core-files` | Exists |
