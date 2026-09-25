# 04 — Office Engine: Open + Edit Word / Excel / PPT / PDF

> **The user requirement, verbatim:** *"must have the capability to open excel, word, ppt, pdf, etc — all types of files, Microsoft files — edit."*
> Design rules: **surgical, byte-preserving** edits (never full re-serialize), **deterministic math** (never LLM-computed), **render-anywhere** UI. Patterns: GenOffice block-patch + Rust xlsx sidecar (doc 28), LibreOffice as conformance oracle (doc 29), OOXML parts-direct editing (web research, 2026), `everyaios-office` OOXML extractors + renderers (built).
> **Full-Stack Module:** Module 5 — Work-Native Primitives (Office, Browser, CUA) (`crates/everyaios-office`, IronCalc 0.8.3, OOXML patcher).
> **Ownership ([`CORE.md`](CORE.md) §4, §9):** the Office engine belongs to EveryAIOS, not to any agent — the shared plane belongs to the environment, the agent’s own plane belongs to whichever agent is bound. The built-in runtime reaches it through the shared façades exactly as an external agent does, and holds no private copy (it is unprivileged, `ADR/0003`). One Rust implementation behind both the native task-shaped façade and the MCP façade.
>
> **Projection/lease amendment (2026-09-24):** [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md)
> adds document identity/revision/digest, shared view leases, exclusive edit leases, and explicit apply
> outcomes around this one engine. The Office resource remains engine-owned; a Session projection only holds a
> typed reference. CUA remains prohibited from mutating Office files (§4.7).

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
- **Read/ingest:** the `everyaios-office` OOXML extractors + markitdown-class conversion for RAG. **v3.39 `DocumentAsset`:** every ingest records source_uri, converter + versions, source_hash, extracted_hash. Ingest ≠ mutate ≠ render.
- **Render:** webview rendering from the block tree (styled paragraphs, tables, images) — no external engine.
- **.doc (legacy binary):** read-only via conversion (headless soffice or textract) + "edit as new .docx" (documented limitation; edits always produce modern OOXML).

### Excel (.xlsx, .xlsm, .csv)
- **Engine:** **IronCalc** (Rust, 300+ functions, dynamic arrays, LET/LAMBDA, full recalc — the one pure-Rust calc engine, web-verified) as a **Rust library (ironcalc 0.8.3 — `crates/everyaios-office`, P4.2)**; **calamine 0.30** for fast read; surgical part-patch for writes (`xl/worksheets/sheetN.xml`, `xl/sharedStrings.xml`). ⚠️ **IronCalc is pre-1.0** (targeting 1.0 mid-2026): pin exact versions and keep the calamine-read + surgical-write path engine-agnostic so the calc engine stays swappable. ~~The sidecar-binary spawn wrapper is retained behind the same API~~ — **SUPERSEDED (2026-09-10):** shipped reality is the library link only (see §4.5); a sidecar-binary wrapper is a future option, not shipped.
- **Deterministic planner** (GenOffice doc 28 §5 — the star): regex NLP → **workbook DSL** (`workbook-dsl.ts`: cell-address, formula-shift, sort-range, flash-fill, pivot-engine, chart-visual) → **zero-LLM execution** for common ops (sort, fill, shift, sum/avg, pivot). Formulas are **recalculated by IronCalc**, never by the model. This is Crystallization in the spreadsheet domain (05).
- **Render:** virtualized 100K+ row tables (calamine-backed), formula bar, cell selection → chat overlay.
- **Engine-only computation rule (deterministic recalc):** any numeric claim goes through IronCalc (never LLM-invented); unsupported formulas are flagged + cached values preserved. The LLM only reads/writes values + formulas.

### PowerPoint (.pptx)
- **The gap:** no mature Rust editor; pptxgenjs is builder-only. → **Surgical OOXML part-editing** (our own, thin): patch `ppt/slides/slideN.xml` + `ppt/slides/_rels/*` for text runs, bullet text, shape text; add/remove slides by cloning a slide part + rels + `[Content_Types].xml` registration (the standard mechanical ops). Rendering via webview (shapes → styled divs; notes in a panel).
- **Read/ingest:** text + per-slide structure → markdown outline (for RAG + editing context).
- Scope guard: complex smart-art/video/full theme redesign = "open in PowerPoint/LibreOffice" suggestion; our edits stay text/shape/order-level (honest boundary, doc 29 contrast).

### PDF
- **Read/render:** pdf.js-class renderer in webview (built pattern in mobile renderers) + `everyaios-office` pdf-text extraction + OCR cascade (built).
- **Edit modes (by operation):**
  1. **Form fill + annotation** — **lopdf 0.36** (Rust, in `crates/everyaios-office` — AcroForms, walks `/AcroForm` `/Fields` recursively, sets `/V` on leaves) — the safe, high-fidelity path. Appearance-stream regeneration + free-text/highlight annotations = P4.7b D8-gap.
  2. **Text replacement** — **lopdf** `replace_text` (in-crate, exact-match `Tj` swaps; layout preserved because glyph positions are untouched; never reflow).
  3. **Re-author** — for structural edits, generate a new PDF from the extracted content (in-crate `author_pages`) rather than corrupting the source.
  4. **Redaction** — fill glyph boxes + remove text streams (lopdf `/Redact` annotations, in-crate), audit-logged (06).
- **Never:** pretend arbitrary body-text edits are safe. UI always offers the right mode (doc: "edit this PDF" → detect → form/annotate/redact/re-author choice).

## 4.3 Read + RAG integration

Everything opened becomes **ingestible in one click** → ingest pipeline (`everyaios-storage` chunk + index → `everyaios-memory`, 07) → the agent can answer "what did the Q3 report say?" and cite the exact page/paragraph (source-lineage, built). Chat-overlay on any open document (page-scoped questions, built mobile pattern).

## 4.4 Conformance & no-failure guarantees

- **Round-trip oracle:** LibreOffice headless in CI (doc 29 §5) — open our edited file, assert: (a) untouched regions byte-stable vs the pre-edit file (zip-level diff of untouched parts), (b) file opens without repair warnings, (c) content assertions pass. This runs on every save in dev/test.
- **Rollback:** `snapshotBefore` (GenOffice hook, doc 28 §2) — the pre-edit ZIP is kept for one-click undo + crash recovery; writes are atomic (write temp ZIP → fsync → rename).
- **Edge cases:** locked files, encrypted OOXML (password) → clear error + offer LibreOffice/office app; broken ZIPs → salvage extract + repair report; huge sheets (1M+ rows) → virtualized + async; .doc/.xls/.ppt legacy → convert-to-docx/xlsx/pptx on open (or read-only).
- **Deterministic planner failure modes:** planner has a schema + a fallback to LLM-direct (with audit flag) when the regex DSL can't parse the user's intent; the fallback is always permission-gated like any mutating tool.

### 4.4.1 Document identity, leases, and apply outcomes

A document is addressed by a typed `ResourceRef` containing canonical real path, file identity, revision, and
content digest. The digest/revision is re-read immediately before a patch and before commit; a mismatch is a
stale-generation refusal, never an implicit overwrite. A **view lease** is compatible for multiple Sessions;
an **edit lease** is exclusive for one Work/Run owner. A second writer receives a conflict or Work/Run wait and
must re-observe/rebase after the current holder releases.

Every save follows the existing snapshot → patch → verify → atomic commit path. Its externally visible outcome
is one of:

- `clean`: the requested change set was applied and verification passed;
- `partial`: a bounded subset committed, with the exact applied/unapplied change set and a rollback reference;
- `uncertain`: the process cannot prove whether the change committed, so it remains `uncertain` and requires
  reconciliation;
- `failed`: the change did not commit and the failure is proven.

`partial` is never rounded up to success, and `uncertain` is never mapped to success, failure, or cancellation.
Snapshots and receipts remain owned by the shared Office/Work/Audit path. The Session/UI projection shows the
resource reference, lease status, revision, outcome, and receipt without taking ownership. CUA clicking,
keyboard input, OCR, or vision remains prohibited for Office mutation; all mutation uses this one native engine
and its Guard-gated path. The same-resource, stale-generation, crash, and cross-Session cases are required
pending acceptance rows in [`ADR-0008`](ADR/0008-session-workbench-projection-and-resource-leases.md).

## 4.5 Module assignment

> **Shipped reality (P4):** the office engine is one Rust crate, `crates/everyaios-office` — no TS office modules, no IronCalc sidecar binary (IronCalc 0.8.3 is linked as a **library**). ARCH/09 D-rows + SPEC §6 track this location.

| Piece | Where | New/Exists |
|---|---|---|
| Block-patch engine (docx) | `crates/everyaios-office` (anchored block tree, byte-preserving ZIP part-patch) | New (port GenOffice concept; our own code) |
| Workbook DSL + planner | `crates/everyaios-office` (deterministic planner, zero-LLM for common ops) | New (GenOffice concept) |
| IronCalc calc engine | `crates/everyaios-office` — **ironcalc 0.8.3 as a Rust library** (300+ functions, dynamic arrays, LET/LAMBDA, full recalc); calamine for fast read | New (dependency) |
| PPTX part-editor | `crates/everyaios-office` (text runs / bullet text / add-remove slides via part clone + rels + Content_Types) | New (own, thin) |
| PDF suite | `crates/everyaios-office` — form-fill + redaction via **lopdf**; text-replace (exact-match, glyph-preserving); re-author via extracted-content regeneration | New |
| LibreOffice oracle | harness in `crates/everyaios-office` tests (headless soffice round-trip conformance) | New (dependency: LibreOffice, dev/test only) |
| Renderers | `ui/` (webview) | New (patterns from app-mobile renderers) |
| Extract/ingest | `everyaios-office` + `everyaios-storage` | Exists *(Rust; the former TS `core-files` package was consolidated into these two — Tier 2c)* |

## Repo-comparison additions (briefs 01–19)

> Delta group: *"ARCH/04-OFFICE-ENGINE.md"* (`REPO-COMPARE/DELTA-ANALYSIS.md` §3). Evidence paths are
> repo-relative under `/home/sarvesh/business_Dev/REPO-COMPARE/clone2/`. Dispositions are the briefs' tags;
> arrows into files not owned here carry `→ <file> §…` and are cross-domain deferred.

- **06-genoffice** · `add` — SOURCE: genoffice (pnpm monorepo) · evidence: `genoffice/apps/sheets/src/ai/edit-journal.ts` (`shiftCellArea`/`shiftFormulaText`), `plan-operations.ts` (`MAX_EXPANDED_CELL_OPS`-style gates), `op-executor.ts` (tri-state `partialApplied|undoDropped|clean`), `privacy-policy.ts` (column classes; cited by 06b, privacy-policy verified per brief 17) — LOGIC: edit-journal shift semantics keep AI ranges and formulas coherent after structural edits, cell-ops caps sit at the Guard ticket layer (never the UI), the tri-state apply result makes partial persistence auditable in outcome codes, and column-class egress policy (allow/redact/statistics-only/deny, columns default closed) governs sheet data before any connector sees it. → target §4.2 (Excel planner/journal) + §4.4 (audit outcome codes, ticket ceilings on the plan gate); egress half → SECURITY.md §5 + 15-CONNECT-STORE cross-domain deferred (17/SEC-19 primary SECURITY lane).
- **06b-12** · `improve` — SOURCE: genoffice · evidence: `genoffice/apps/sheets/src/ai/deterministic-planner.ts` + `plan-operations.ts` (regex plan compiler hard-fails unknown intent → `UnsupportedPromptError`) — LOGIC: ship the deterministic planner as a minimal closed DSL behind an explicit propose/run dispatcher where unknown intent fails closed to clarification instead of silently degrading. → target §4.2 (deterministic planner) + §4.4 (failure modes — tightens the current wording: LLM-direct remains only as an explicit, permission-gated propose fallback with audit flag; unknown intent ⇒ fail-closed clarify).

## 4.6 Surgical XML Invariants & Field-Balance GC (GenOffice Pattern)

> **Corrected 2026-09-25 against source.** The three mechanisms below name **TypeScript files**
> (`field-balance.ts`, `resource-cleanup.ts`) and a `quick-xml` streaming pipeline. **None of them exists,
> and the crate is Rust-only** — `crates/everyaios-office` has no `src/*.ts` file and §4.5's own
> "Shipped reality (P4)" note says the engine is one Rust crate. The real equivalents:
>
> - **Field-character balancing → specified — not implemented.** No `w:fldChar` balance check exists
>   anywhere in the crate (no `fldChar`, `field_balance`, or balance routine under
>   `crates/everyaios-office/src/`). The patcher edits an anchored block tree without
>   asserting that field start/separate/end markers stay balanced, so a patch *can* currently produce a
>   document Word would flag. Owning TODO row: `P69.G5`.
> - **Orphaned media GC → specified — not implemented.** There is no `word/media/` or `ppt/media/` sweep
>   and no `_rels/` reaper in the tree; removing an image/shape leaves its payload and rel behind. Owning
>   TODO row: `P69.G5`.
> - **`quick-xml` streaming → corrected to the real approach.** The office engine does **not** stream XML.
>   It parses each part with **`roxmltree`** (a DOM parser) and then patches by **byte range** into the
>   original part source (`roxmltree::Node::range()`), so untouched bytes are never re-serialized — see
>   `crates/everyaios-office/src/xml.rs:1-20` and the crate's deps (`roxmltree`; **no `quick-xml`**).
>   `quick-xml` appears in `Cargo.lock` only as a transitive dependency of unrelated crates. The
>   "single-pass, <15MB on a 500-page document" property is therefore **not an implemented guarantee**
>   (owning TODO row: `P69.G5`), though the byte-range discipline below is the real mechanism worth keeping.
> - What *is* implemented and does enforce round-trip validity is the conformance oracle, not these
>   invariants: `parts_diff` reports exactly which ZIP parts changed, and `LibreOfficeOracle` runs headless
>   `soffice` to prove the file reparses without repair warnings (`crates/everyaios-office/src/conformance.rs:1-8`).

To guarantee 100% round-trip document validity without triggering Microsoft Office repair warnings:
- **Field-Character Balancing (`field-balance.ts` — specified — not implemented, no such file):** When modifying paragraphs containing complex Word fields (`w:fldChar` markers for Page numbers, Table of Contents, or Hyperlinks), the surgical patcher verifies that field start, separate, and end markers remain balanced. Any patch that disrupts field tag balance is rejected prior to ZIP commit.
- **Orphaned Media Garbage Collection (`resource-cleanup.ts` — specified — not implemented, no such file):** When replacing or removing image/shape elements in DOCX/PPTX files, unreferenced media payloads in `word/media/` (or `ppt/media/`) and obsolete entries in `_rels/` are swept clean, preventing zip bloat.
- **Single-Pass XML Processing (specified — not implemented as written; the real mechanism is `roxmltree` DOM + byte-range patch, not `quick-xml` streaming):** XML parts are processed without re-serializing untouched bytes, keeping memory consumption bounded even on 500-page enterprise documents.

## 4.7 Direct Office API Bypass (Agent-S Pattern)

To ensure maximum speed, precision, and auditability:
- **Visual CUA Prohibition:** Computer Use Agents (mouse clicking, keyboard typing, OCR) are strictly forbidden from operating on Office files (Word, Excel, PowerPoint).
- **Mandatory In-Process Mutation:** All document and spreadsheet edits must route through the `everyaios-office` native API (IronCalc 0.8.3 for calculations, OOXML patcher for text/layout). This guarantees atomic diff generation, deterministic recalculation, and instant undo/rollback receipts without UI latency.

## 4.8 External Agent Execution Flow (HLD & LLD)

```
External Agent (MCP Client)
  │  calls tool: "office.calculate" { path: "Q3_Model.xlsx" }
  ▼
`ToolService::dispatch_facade` (`crates/everyaios-core/src/tools.rs`)
  │  Routes `.xlsx` path to `office.xlsx_edit` / `everyaios_office::xlsx::recalculate`
  ▼
IronCalc 0.8.3 Engine (`crates/everyaios-office/src/xlsx/`)
  │  1. Ingest workbook cells and formulas into DAG dependency graph
  │  2. Topologically sort and evaluate 300+ formula functions
  │  3. Flag unsupported formulas with NOT_RECALCULATED (never hallucinate)
  │  4. Surgically update `xl/worksheets/sheet1.xml` and `xl/calcChain.xml`
  ▼
Output formatting & Receipt
  │  Returns structured summary + cell values diff
  │  Appends immutable EffectReceipt to Merkle audit tree
```
