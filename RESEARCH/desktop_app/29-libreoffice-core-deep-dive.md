# 29 — LibreOffice Core Deep-Dive (verified 2026-08-06)

> **Repo:** https://github.com/LibreOffice/core (C++, 4,197⭐ live) — the reference implementation of office documents. 200+ top-level modules, ~8M LOC. **Role for us: format-fidelity ground truth + optional headless conversion backend — NOT something to bundle or copy.** Our primary engines stay GenOffice-style surgical (doc 28) + markitdown (parse) + our own.
> Verified this pass: repo meta, full module list, `libreofficekit/README.md`, `rust_uno/Cargo.toml`. ⚠️ Deep module listings (`oox/`, `formula/`, `sc/source/core/tool/`, `editeng/`, `sw/source/core/`) were **rate-limited by the GitHub API this pass** — those locations are from module names + known LO layout, marked per-item.

---

## 1. What it is
- Integrated office suite (Writer/Calc/Impress/Draw/Base/Math) by The Document Foundation. Copyleft (MPL 2.0 + LGPL mix).
- The **most complete open-source OOXML/ODF implementation** — the de-facto ground truth for format correctness in OSS.
- Heavy: multi-hundred-MB install, C++ build, seconds-level cold start. Not a lightweight-app component. (~8M LOC — widely reported figure, not verified this pass.)

## 2. Module map (top-level names verified; semantic mapping = standard LO layout, not re-listed this pass)
**Core apps:** `sw/` (Writer) · `sc/` (Calc) + `scaddins/` · `sd/` (Impress/Draw) · `chart2/` · `dbaccess/` + `connectivity/` (Base) · `starmath/` (Math).
**Shared engines:** `editeng/` (text editing engine, shared by Writer/Calc cells) · `svx/` (drawing/format objects) · `drawinglayer/` + `basegfx/` + `svgio/` (graphics) · `vcl/` + `toolkit/` + `cui/` (GUI toolkit) · `sfx2/` + `framework/` (app framework) · `sal/` + `tools/` + `comphelper/` + `o3tl/` (base libs) · `i18npool/` + `linguistic/` (locale/spell).
**Formats & filters:** `oox/` (OOXML import/export) · `xmloff/` (ODF/XML filters) · `filter/` · `writerperfect/` (foreign formats) · `lotuswordpro/` · `hwpfilter/` · `emfio/` (EMF/WMF) · `sot/` (OLE structured storage) · `package/` (zip/OOXML package) · `vbahelper/` + `oovbaapi/` (VBA shims).
**Automation API:** UNO across `offapi/` + `udkapi/` (IDL), `cppu/` + `cppuhelper/` (C++), `stoc/` + `binaryurp/` + `remotebridges/` (RPC), `pyuno/` (Python), `javaunohelper/`/`cli_ure/` (JVM/.NET), **`rust_uno/` (Rust FFI)**.
**Embedding/mobile:** **`libreofficekit/`** (LOK embedding API — powers Collabora Online) · `android/` · `ios/` · `l10ntools/`.
**Scripting:** `basic/` + `scripting/` + `vbahelper/`.

## 3. The three ways to use LibreOffice from a lightweight app (decision)

### 3a. Headless conversion (`soffice --headless --convert-to`) — the standard route
- `soffice --headless --convert-to docx,odt,pdf,xlsx …` via CLI, or driven by **unoconv** (Python, talks UNO over a socket) / **lloconv** (C++ example in the LOK README).
- Pros: zero code, best-in-OSS fidelity, batch-convert, also renders PDFs.
- Cons: cold-start seconds; a full LO install per user (100s of MB); two-way conversion of *edits* isn't the model (it's whole-file convert).
- **Our use:** optional "export/import fidelity fallback" and **round-trip test oracle** (see §5). Ship as an *optional* companion, never in-process.

### 3b. LibreOfficeKit (LOK) — embedding API (verified from in-tree README)
- *"LibreOfficeKit can be used for accessing LibreOffice functionality through C/C++, without any need to use UNO. For now it only offers document conversion (in addition to an experimental tiled rendering API)."*
- Integration: include `LibreOfficeKit.h[xx]`, call `lok_init`; example project `lloconv`.
- **Tiled Rendering:** `#define LOK_USE_UNSTABLE_API`; 32-bit BGRA bitmap buffers, top-down scanlines. This is the model behind Collabora Online (well-known, not re-verified this pass) — render a document to tiles, stream to a viewer.
- **Tiled Editing:** two-way channel with `lok::Document` — the client calls editing methods; used by Collabora for full editing UIs.
- **Our use:** if we ever need **pixel-perfect WYSIWYG rendering of docx/xlsx/pptx without shipping a browser engine for it** — LOK-as-a-background-renderer is the proven path (Collabora does exactly this over WebSocket). Overkill for v1; keep as the "fidelity renderer" option.

### 3c. rust_uno — Rust FFI bindings (verified from Cargo.toml)
- `rust_uno` 0.1.0, edition 2024, crate-type `cdylib`, *"Rust FFI binding for LibreOffice UNO API"* — lets a Rust host (our Tauri core!) call UNO objects.
- Status: early/bootstrapping (a `uno_bootstrap.cxx`, `build.rs`, `example/` crate). ⚠️ Treat as experimental — good to watch for a pure-Rust automation path, not production-ready yet.

## 4. Format engine (reference only — what it teaches us)
⚠️ **All sub-module locations in this section are standard LO layout (common knowledge), NOT re-listed this pass — the GitHub API was rate-limited for `oox/`, `formula/`, `sc/source/core/tool/`, `editeng/`, `sw/source/core/`.**
- **`oox/`** = OOXML import/export (drawingml, spreadsheetml, wordprocessingml). **`xmloff/`** = ODF/XML filters. **`filter/`** + `writerperfect/` handle legacy formats. `sc/` holds the Calc engine (formula compiler/interpreter under `sc/source/core/tool/` — the classic `interpr*.cxx` giant interpreter). `sw/` holds Writer core (`sw/source/core/` + `sw/source/filter/ww8/` for DOC/DOCX). `editeng/` is the shared text engine.
- **Known fidelity picture (well-documented in LO community, not re-verified this pass):** LO round-trips mainstream docx/xlsx/pptx well; known lossy corners = complex VML, some SmartArt, embedded macros/VBA fidelity, and **foreign/unknown OOXML parts can be dropped on re-serialize** — LO re-parses into its own model then re-writes, so it is **lossy for unknown content**.
- **This is the decisive contrast with GenOffice (doc 28):** GenOffice's `text-patch.ts` is *surgical* — it edits only dirty `w:t` runs and **preserves unknown bytes byte-for-byte**; LO is *model-based* — full parse→model→serialize. For an AI editor, surgical is better (we must not destroy what the model didn't understand). LO stays as the fidelity oracle.

## 5. ⭐ What to actually steal (as reference assets, not code)
1. **Round-trip test corpus + conformance suites** — LO ships extensive ODF/OOXML tests (`qadevOOo/`, `unotest/`). Steal the *testing methodology*: build our own round-trip fixtures (open→parse→edit→save→reopen) and assert byte-stability on untouched regions (GenOffice-style) — LO conformance is our external check.
2. **`formula/` + `sc` semantics** — when our sheets engine (doc 28 §5, IronCalc) hits formula edge cases (array formulas, 3D refs, date/time serial, function behavior), LO is the reference implementation to check semantics against — no need to copy code.
3. **LOK tiled-rendering design** — if a future version needs pixel-true doc rendering, copy the *architecture* (tile renderer, BGRA buffers, two-way edit channel), not the code.
4. **`rust_uno` trajectory** — watch it: a mature Rust UNO binding would give us a lightweight automation path into LO headless without Python.

## 6. Integration options matrix
| Option | Cost | Fidelity | Use in our app |
|---|---|---|---|
| `soffice --headless --convert-to` (CLI/unoconv/lloconv) | 100s MB install; seconds cold start | Best-in-OSS | **Optional** export/import fallback + batch convert + test oracle |
| **LibreOfficeKit** embed (tiled render/edit) | Link LO as a library | Best-in-OSS + pixel-true rendering | Collabora-style "fidelity renderer" — v2+ option |
| **rust_uno** | Experimental | — | Watch; future Rust automation path |
| **GenOffice block-patch** (doc 28) | ~zero deps, TS | Surgical, byte-preserving | **Primary** AI-editing engine |
| **markitdown** (doc 20/21) | Light | Parse-only | Primary text extraction |
| OnlyOffice document-server | Heavy server | Good | Alternative if server-based fidelity is ever wanted |

## 7. Verdict
**Add LibreOffice/core to the ledger as a REFERENCE repo (🟩 MAP depth — module map verified, code not source-read).** Do not bundle, do not copy code. Use it for: (1) round-trip conformance oracle in our tests, (2) formula/format semantic reference, (3) optional headless conversion companion, (4) watch LOK + rust_uno for v2 renderer/automation. The surgical AI-edit path stays GenOffice-style (doc 28) because it preserves unknown bytes — LO's model-based re-serialize would destroy content an AI editor doesn't understand.
