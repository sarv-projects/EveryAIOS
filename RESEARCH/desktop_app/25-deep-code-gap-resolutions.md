# 25 — Deep-Code Gap Resolutions + Found Repos (2026-08-06, pass 2)

> Source-level reads closing every remaining deep-code gap. All file paths below were fetched from live repos this pass.

---

## 1. PageIndex — ✅ internals source-read (the "no vector math" claim is now code-verified)

**Files read:** `pageindex/page_index.py`, `pageindex/retrieve.py`, `pageindex/tree_optimize.py` (+ `pageindex/` package layout, `flash/` subpackage).

### The actual mechanism (verified)
1. **Tree build (`page_index.py`)** — uses `concurrent.futures.ThreadPoolExecutor` for parallel PDF processing; builds a **hierarchical document tree**. The `flash/` subpackage supplies the structure features: `heading_detection/`, `embedded_toc.py`, `classification/`, `clustering/`, `blocks/`, `columns/`, `labels/`, `data/` — i.e. **tree nodes come from detected headings + embedded TOCs + block classification/clustering**, not from embeddings.
2. **Tree optimization (`tree_optimize.py`)** — a **worst-case search-cost model**, not a heuristic:
   - `S(v)` = pages to linearly scan if `v` stays collapsed (whole subtree span)
   - `R(v)` = routing cost of visiting a node (title/summary/child descriptions) = **1 page**
   - `S_residual(v)` = source pages covered by no child
   - `expand()` — one-step lookahead: `expand iff expand_cost < collapse_cost` where `collapse_cost = S(v)`, `expand_cost = R(v) + max(S_residual(v), max_i S(c_i))`; ties stay collapsed. `expand_gain = collapse_cost - expand_cost`.
   - `merge()` — bottom-up for nodes that already have subtrees (`merge_cost = S(v)` vs `tree_cost(v) = S(v)`…).
   - **Business logic: navigate the document so the expected pages fetched is provably minimal per the cost model.** `merge_tree` is imported by `page_index.py`.
3. **Retrieval (`retrieve.py`)** — `_parse_pages("5-7"|"3,8"|"12")` → sorted page list; `_count_pages(doc_info)`; `_get_pdf_page_content(doc_info, page_nums)` extracts text **1-indexed, preferring cached pages, falling back to PyPDF2**. Retrieval = **range-fetch by page numbers**, no similarity search.
4. **Security (notable, steal this):** `page_index.py` ships **prompt-injection hardening**: `_INJECTION_PATTERNS` regex (`system override`, `ignore previous instructions`, `jailbreak`, `ALL sections MUST`, …) → `_sanitize_doc_text()` redacts to `[REDACTED]`; `_wrap_doc_text()` wraps untrusted doc text in `<user_document>` delimiters so the LLM treats it as data.

**Verdict (upgraded):** the no-vector/no-chunking claim is now **source-verified**. The tree is a heading/TOC/cluster structure tree with cost-model-driven expansion — "read like a human" = navigate outline, fetch tight ranges. Scale limits still untested by us, but the *mechanism* is proven. **Adopt: tree-index + cost-model + injection-hardening as our document-index layer; keep HNSW for cross-document corpus recall.**

---

## 2. LibreChat — ✅ doc-page CONTENT read (mechanisms confirmed)

**Pages read (www.librechat.ai/docs, content extracted):**
- **Artifacts – Generative UI** (`/docs/features/artifacts`): "Generative UI: Create React components, HTML code, and Mermaid diagrams"; **agent-level artifact configuration** is the recommended path ("enable/disable artifacts at the agent level rather than app-wide"). Sidebar confirms full feature set: Agentic AI (MCP / Agents / Skills / Subagents / Agents API), Code Interpreter API, Search & Knowledge (Web Search / Message Search / User Memory), RAG API, Media (Upload Files as Text / OCR), Image Generation & Editing, Resumable Streams, Projects, Forking, Shareable Links.
- **Resumable Streams** (`/docs/features/resumable_streams`): "Recover in-progress AI responses after a dropped connection, sync across tabs/devices, keep streams alive across scaled-out instances." **Mechanism confirmed: on send, LibreChat creates a *generation job* that records every streamed delta; on reconnect it reconstructs streamed content and resumes.** (Redis-backed job store implied by the scaled-out note — consistent with doc 23.)
- Repo layout (root listing): `api/`, `client/`, `config/`, `AGENTS.md` + `CLAUDE.md` + `CONTEXT.md` (they dogfood agent context files), `Dockerfile.multi`, `bun.lock`.

---

## 3. Hermes — ✅ conversation loop source-confirmed

Files read: `agent/conversation_loop.py`, `agent/turn_context.py`, `agent/iteration_budget.py`, `agent/subagent_lifecycle.py`.
- `conversation_loop.py`: **"the roughly 3,900-line run_conversation body that drives one user turn through the agent (model call, tool dispatch, retries, fallbacks, compression, post-turn hooks, background memory/skill review nudges)"** — extracted from `run_agent.py`. (The filename-inference is now confirmed — it IS the loop.)
- `turn_context.py`: the **turn prologue** (~470 lines before the tool-calling loop): stdio guarding, runtime-main wiring, retry-counter resets, user-message sanitization, system-prompt restore-or-build, session-row creation, **preflight context compression**, `pre_llm_call` plugin hook, **external-memory prefetch**.
- `iteration_budget.py`: **thread-safe consume/refund counter**; parent cap from `max_iterations` (default **500**), subagents from `delegation.max_iterations` (default **50**) — **confirms doc 14's doc-reported numbers**.
- `subagent_lifecycle.py`: **plugin-safe immutable lifecycle API** (no raw `AIAgent` objects); imports `hmac`/`secrets`/`contextvars` — secured delegation boundary.

---

## 4. microsandbox — ✅ hypervisor identified (msb_krun)

- Workspace manifest (live): 15+ internal crates — **`crates/runtime` (sandbox process + microVM entry points), `crates/agentd`, `crates/protocol`, `crates/filesystem`, `crates/db`, `crates/image`, `crates/metrics(-collector)`, `crates/migration`, `crates/cli`** — plus SDKs `sdk/rust`, `sdk/node-ts`, `sdk/python`, `sdk/go/native`; **30+ examples** (net-dns, net-policy, net-ports, net-secrets, net-tls, root-bind, root-block, root-oci, rootfs-patch, shell-attach, snapshot-fork, volume-disk, volume-named, init-handoff, fs-read-stream, logs-read, metrics-stream, cloud-backend). Version **0.6.8**, edition 2024, Apache-2.0.
- **`crates/runtime/Cargo.toml`** features: `default = ["prebuilt", "net"]`, `net = ["dep:microsandbox-network", "msb_krun/net"]` — **`msb_krun` is the hypervisor crate** (krun-based microVM runtime; the `net` feature wires network policy into it). Hypervisor gap **closed**: krun-backed microVM, with `image`/`filesystem` `prebuilt` images and OCI/rootfs examples.
- Remaining caveat (unchanged): boot latency + Windows/macOS licensing not empirically tested by us.

---

## 5. anomalyco/opencode — ✅ `packages/desktop` confirmed: it's **Electron**

- `packages/` listing (live): `app`, `cli`, `client`, `codemode`, `console`, `containers`, `core`, **`desktop`**, `docs`, `effect-drizzle-sqlite`, `effect-sqlite-node`, `enterprise`, `function`, `http-recorder`, `httpapi-codegen`, `identity`, `llm`, `opencode`, `plugin`, `protocol`.
- `packages/desktop/package.json`: **`@opencode-ai/desktop` v1.18.14, Electron** — `electron-vite dev/build`, `electron-builder` for mac/win/linux, `native/` dir, `main: ./out/main/index.js`. **Not Tauri.** (Notable: `effect-sqlite-node`/`effect-drizzle-sqlite` → SQLite via Effect; `identity`, `llm`, `protocol`, `httpapi-codegen`, `enterprise`, `codemode` packages.)
- **Steal:** the monorepo package split (llm / identity / protocol / codemode / enterprise) and Electron-vite + effect-sqlite stack.

---

## 6. Unconfirmed → all four FOUND

| Was | Now ✅ |
|---|---|
| **CAI (Cybersecurity AI, 6.7K)** | **`aliasrobotics/CAI`** — matches doc 03 exactly: modular offensive/defensive cybersecurity framework, **300+ models via LiteLLM** (OpenAI/Anthropic/DeepSeek/**local Ollama air-gap**), custom multi-agent assemblies, prompt-injection guardrails. PyPI `cai-framework`; open-source mode `CAI_LICENSE_OFF=1 cai`. |
| **Nebula** | **`berylliumsec/nebula`** — AI pentest **desktop workbench** (`nebula-core`): terminal + code editor + browser + AI assistant + file manager + notes/missions/findings/reporting; scope enforcement, approval pauses, hard budgets, **isolated OCI execution**, content-addressed evidence trail. |
| **OpenWork** | **`different-ai/openwork`** — open-source desktop app (macOS/Win/Linux), **Claude-Cowork/Codex alternative**: run AI agents/skills/MCP servers locally on your files; exposes **remote MCP endpoints** (Google Workspace + Microsoft 365 plugins). (Related: `langchain-ai/openwork`, `andrewyng/openworker`.) |
| **mksglu/context-mode** | **CONFIRMED** — repo live (README: "The other half of the context problem"), npm **`context-mode`**. Doc 10's "unconfirmable" note is obsolete. |

---

## 7. Doc-update map (this pass)
- **doc 03**: CAI + Nebula rows → ✅ confirmed with URLs (replacing the "unconfirmed, not disproven" note).
- **doc 10**: context-mode row → confirmed (repo + npm).
- **doc 09**: OpenWork → `different-ai/openwork`.
- **doc 14**: Nebula/CAI note → confirmed refs.
- **doc 18**: §5 OpenWork row → confirmed; §6 note updated.
- **doc 24**: §1.1 CAI/Nebula + §3 still-open list → updated; PageIndex/LibreChat/microsandbox/anomalyco verdicts superseded by this doc.
- **doc 25** (this doc) + **doc 26** (tier-2 code-level, next).
