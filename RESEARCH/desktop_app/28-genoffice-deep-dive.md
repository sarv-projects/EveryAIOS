# 28 — GenOffice Deep-Dive (source-verified 2026-08-06)

> **Repo:** https://github.com/genspark-ai/genoffice (Apache-2.0, ~1.9K⭐) — AI-native office suite: **docs, sheets, slides, pdf** + shell. Five Electron apps sharing one engine layer; AI editing as first-class workflow. **THE reference for our document-editing pillars.**
> All file paths below fetched live this pass.

---

## 0. Monorepo layout (verified)
- **Apps** (`apps/`): `docs` `sheets` `slides` `pdf` `shell` (Electron, electron-vite).
- **Packages** (`packages/`): `agent-core` (loop+skills), `ai-provider` (BYOK+streaming), `ai-search` (Genspark search), `docx-engine` (block-patch), `pptx-engine` + `pptx-render`, `file-parse` (docx/pdf/pptx/xlsx), `project-store`, `electron-utils`, `i18n`, `ui`.
- Deps are minimal: `docx-engine` uses only **fast-xml-parser + jszip**.

---

## 1. The docx block-patch engine — `packages/docx-engine/src/`
Package description (from package.json): *"docx parsing (Block tree with docxIndex anchors), OOXML fragment generation, paragraph-patch save"*.

### `text-patch.ts` — the surgical patch (core business logic)
`patchParagraphTexts(entryXml, newText, opts)`:
- Splits the entry into **paragraph slices**; maps edited plain text (`\n`-joined `w:t`) back onto original XML.
- **Unchanged paragraphs keep their original bytes** → inline formatting, hyperlinks, images, fields all preserved for free.
- **Changed paragraphs get a minimal `w:t` replacement** — only the `w:t` *outside the common prefix/suffix* is rewritten; other run bytes untouched.
- **Safety fallback:** if paragraph count changed, or a changed paragraph has no `w:t` anchor → returns `null`, caller rebuilds the whole entry.
- `stripFirstParaLeadingSpace`: footnotes/endnotes start with a self-reference mark + space run; treated as an immutable prefix.

### `patch.ts` — the full-patch orchestrator
Imports the whole feature matrix: `generate` (paragraph XML, inline runs, split children, image wrap), `notes` (foot/endnote XML), `ink` (ink annotations anchored into paragraphs), `blank` (numbering), `section` (page numbering / section settings / section starts), `sources` (bibliography XML), `theme` (theme colors/fonts applied), `chart` (**buildChartPartXml + buildChartWorkbookXlsxBase64** — charts rebuilt as workbook parts), `watermark`, `protection` (doc protection), comments, headers/footers, `TOTAL_PAGES_MARK`. **One patcher handles everything; only dirty regions are touched.**

### `parse.ts` + `scan.ts`
Block-tree parse with **`docxIndex` anchors** — per the package description ("Block tree with docxIndex anchors"); the interpretation that anchors give stable addressing into the original OOXML is inference from that quote, not source-read.

**What to steal:** the entire docs-editing core is our document pillar: parse→Block tree→LLM edits plain text→paragraph-patch→minimal `w:t` write. Zero heavy deps. This is *the* pattern for "AI edits a docx without destroying it."

---

## 2. Agent core — `packages/agent-core/src/`

### `loop.ts` — the tool loop
- `AgentRunResult`: `text`, `cancelled`, `turnLimit` (maxTurns reached → partial answer from a no-tools finalizing turn), `truncated` (stop_reason max_tokens → incomplete text).
- `AgentLoopEvents`: `onText` (per delta), `onToolStart` (live "running" indicator), `onToolExecuted`, and a turn hook.
- **Rollback hook (steal):** `ToolExecutedEvent.snapshotBefore` — *"Snapshot captured just before this tool ran; present only on the first mutating tool of a run (hook for one-click rollback UIs)."* — deterministic undo for AI edits.

### `skill.ts` — skill-based agent (cleaner than ours)
```ts
interface AgentSkill {
  id: string
  systemPrompt: string          // skill's rules + tools
  tools: AgentToolDef[]
  buildContext?(): string       // fresh context per turn (e.g. document skeleton + selection)
  executeTool(call, signal?)    // abort-aware long tools
}
```
Docstring: *"AI Docs ships a docx skill; Excel / PPT skills plug in the same way."* — one loop, per-domain skills.

---

## 3. AI provider layer — `packages/ai-provider/src/`

### `providers.ts` — BYOK via a Genspark proxy
- **GENSPARK_LLM_BASE_URLS**: `https://www.genspark.ai/api/anthropic`, `…/api/llm_proxy/gemini/v1beta`, `…/api/llm_proxy/v1` — one key (`gsk` login), three protocols (Anthropic-compatible, Gemini v1beta, OpenAI-compatible).
- `X-Agent-Type: genoffice` attribution header (billing split out of the "Claw" bucket) — **only sent to the Genspark proxy, never to direct vendor APIs.**
- `AI_PROVIDERS` list: genspark models (`claude-opus-4-7/4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`, …) + presumably direct providers (BYOK keys per doc-19 patterns).

### `watchdog.ts` — stalled-connection guard (steal this)
- `AI_CONNECT_TIMEOUT_MS = 60_000` — connect timeout until response headers arrive.
- `AI_IDLE_TIMEOUT_MS = 180_000` (fetch truncated at `180_` — 180_000 is the only sensible completion for a "generous, minutes-scale" timeout) — idle timeout **re-armed on every received byte**.
- Rationale in code: a silently stalled connection (proxy/VPN/firewall drop without RST) leaves the request pending forever and the UI stuck busy; but a *generous* idle window is required because long-context gateways legitimately go silent for minutes (thinking/buffering between chunks) — "60s here killed real in-progress generations that were still billed."

### `stream.ts` + `chat.ts` + `http-error.ts`
Streaming + chat + typed HTTP errors; `index.ts` wires it.

---

## 4. The Rust xlsx sidecar — `apps/sheets/native/xlsx-engine/`
Cargo.toml (verified): **`xlsx-sidecar`**, edition 2024 — deps: **`calamine 0.36`** (xlsx parse), **`ironcalc 0.7`** (formula engine), `quick-xml` + `roxmltree` (XML), `zip` (deflate), `base64`, `serde_json`, `uuid`.
src/: `archive.rs` `convert.rs` `lib.rs` `main.rs` **`recalc.rs`** `shared_formulas.rs` `visuals.rs`.
→ **Pipeline (inferred from filenames `archive.rs`/`convert.rs`/`recalc.rs` + deps, not source-read end-to-end):** calamine reads → convert to engine model → IronCalc recalcs → write back. Formula recalculation is native Rust, not JS. (Upgrades doc 18's "calamine + IronCalc" claim to version-verified.)

---

## 5. Sheets domain + the **deterministic planner** — `apps/sheets/src/`
### `domain/` (verified): `in-memory-workbook.ts`, `workbook-dsl.ts`, `cell-address.ts`, **`formula-shift.ts`**, `sort-range.ts`, **`flash-fill.ts`**, `pivot-engine.ts` + `pivot-chart/filters/formula/grouping.ts`, `chart-visual.ts`.

### `formula-shift.ts` — Excel-accurate structural edits
Rewrites A1 refs after row/col insert/delete the way Excel does:
- refs into the shifted region **move**; **absolute `$` markers do NOT pin against inserts/deletes** (only matter for copy/fill);
- refs into a **deleted region → `#REF!`**;
- ranges **partially overlapping** a deleted region **shrink**;
- handles `Sheet1!B2` / `'My Sheet'!B2` prefixes (only when the prefix names the target sheet), skips quoted string literals, and **protects function names like `LOG10`** via boundary checks.

### `ai/deterministic-planner.ts` — ⭐ the Crystallization pattern in the wild
`planPrompt(prompt, {revision, sheetId})` → `WorkbookCommandBatch`:
- Regex-compiled **natural-language → DSL** for the common ops — no LLM needed:
  - `/^set\s+A1\s+to\s+(.+)$/` → `{op:'set_cell', address, value}` (+ `parseScalar`)
  - `/^formula\s+B1\s*=\s*(.+)$/` → `{op:'set_formula', formula:'=…'}`
  - `/^rename\s+sheet\s+to\s+(.+)$/` → rename op
- **`UnsupportedPromptError`** with a helpful message: *"Try 'set A1 to 42', 'formula B1 = SUM(A1:A10)', or 'rename sheet to Budget'."*
- **Transaction model:** `WorkbookCommandBatch { dslVersion, transactionId, baseRevision, summary, operations }` — **baseRevision = optimistic concurrency**; transactionId for undo.
- LLM is reserved for anything the deterministic planner can't compile — **zero-token for the common case**. This is literally doc 03's **Crystallization Engine** and the Reasonix/ClawRouter compaction philosophy, production-real.

---

## 6. Other packages (verified briefly)
- **`ai-search`**: `gsk.ts` + `genoffice-auth.ts` + `shared.ts` — Genspark search API for grounding.
- **`project-store`**: `store.ts` + `ipc.ts` — project persistence over Electron IPC.
- **`file-parse`**: `docx.ts` `pdf.ts` `pptx.ts` `xlsx.ts` + `parse.ts` — one unified parse entry for all formats.
- **`pptx-engine`/`pptx-render`**: ⚠️ names only this pass — internals not source-read (likely slide gen/rendering parallel to docx-engine).
- `apps/sheets/src/ai/privacy-policy.ts` — filename suggests privacy handling; content not read this pass.

---

## 7. What this means for our build (steal list)
1. **`docx-engine` block-patch** → our document editor core (parse→Block tree w/ docxIndex→plain-text edit→minimal w:t patch→byte-preserving save). Zero heavy deps. *(Round-trip conformance oracle = LibreOffice — doc 29.)*
2. **`text-patch.ts` common-prefix/suffix algorithm** → minimal-diff XML writes, unchanged content byte-identical.
3. **`loop.ts` snapshotBefore rollback** → one-click undo for every AI edit.
4. **`skill.ts` interface** → our skill system shape (systemPrompt + tools + buildContext + abort-aware executeTool).
5. **`watchdog.ts`** → connect + re-armed idle timeout for all our LLM streams (prevents stuck-UI on silent drops; generous idle for thinking models).
6. **`deterministic-planner.ts` + workbook-dsl (dslVersion/baseRevision/transactionId)** → zero-token deterministic command compilation + optimistic concurrency + undo — adopt as the shape of our Crystallization Engine.
7. **`xlsx-sidecar` (calamine + IronCalc)** → native Rust recalc for spreadsheets.
8. **`formula-shift.ts`** → Excel-exact formula rewriting on structural ops (insert/delete/`#REF!`/range-shrink/`LOG10` protection).
9. **Genspark proxy pattern** (`X-Agent-Type` attribution, one-key-many-protocols) → template for our BYOK gateway billing-split.
10. **Monorepo discipline** — 5 apps + 10 small packages, `electron-utils`/`i18n`/`ui` shared; one `file-parse` entry for all formats.

**Caveat:** GenOffice auth (gsk login) is Genspark's own BYOK — we keep our open BYOK (docs 19). App targets macOS/Windows Electron; our shell is Tauri (docs 20) — the *engines* (docx/pptx/xlsx/agent) are shell-agnostic TS/Rust and port directly. ⚠️ **Read scope:** core pillars (docx-engine, agent-core, ai-provider, xlsx-sidecar, deterministic-planner, formula-shift) were source-read; pptx-engine/pdf-app/project-store/ai-search internals were not.
