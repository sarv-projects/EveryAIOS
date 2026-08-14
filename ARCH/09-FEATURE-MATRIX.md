# 09 — Capability → Feature → Module Matrix (the complete derivation)

> Every capability from the research corpus (docs 01–62, 255 repos) + the v2.0 matrix + the user's explicit requirements. **No scope cuts.** Status legend: 🟢 = exists (reuse from @personal-ai/core-*) · 🟡 = new (build) · 🔵 = new-in-Rust (everyaios-*) · ⚪ = later/optional. Module refs: sidecar = packages/coordinator + core-*; Rust = crates/everyaios-*; UI = ui/.

## A. Model & BYOK layer

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| A1 | Multi-provider BYOK | ProviderAdapter: anthropic/openai/responses/azure/bedrock/gemini/openrouter/deepseek/openai-compat/ollama/llamafile | sidecar (core-providers) + Rust vault | 🟢+🔵 | doc 19 |
| A2 | **Multi-key per provider** | Key rings: add N keys/provider, priority+weight, per-key model filter, budgets, health | Rust everyaios-vault | 🔵 **NEW (user req)** | ARCH/03 + doc 19 §7, doc 53 §2, doc 41 cc-switch |
| A3 | **Auto-failover rotation** | 429/401/5xx → cooldown → immediate next key; max-switches; all-fail backoff | Rust everyaios-vault | 🔵 **NEW (user req)** | ARCH/03 + doc 19 §7, doc 53 §2, doc 41 cc-switch |
| A4 | OAuth subscriptions | chatgpt-pro (PKCE) / copilot·qwen (device-code), encrypted tokens, same fallback semantics | Rust everyaios-vault + sidecar | 🔵 (⚠️ chatgpt-pro calls the unofficial `chatgpt.com/backend-api/codex/v1` — kept user-driven, Hermes/OpenCode pattern; ToS-risk documented, doc 57 §3) | 33 §7.4, 13 §5.5 |
| A5 | Local models | Ollama managed + llamafile single-binary + MLX (Rapid-MLX, Mac); agent-native class (doc 61): Muse Glimmer 30B/120K ctx + Nemotron 3.5 Lightning 30B MoE — retire 15–20K ctx warning for this class | Rust spawn + sidecar | 🟢+🔵 | 34 §2 + 33 §7.4 + 61 |
| A6 | Model catalog + hints | capabilities (tools/vision/ctx), router picks per task | sidecar core-providers | 🟢 | doc 19 + core-providers pi.dev catalog (15 prov / 280 models) |
| A7 | Asymmetric tiering | planner_model / subagent_models / depth=2 / concurrency=6 / writers=3 | sidecar (blueprint) | 🟡 | doc 16/05 |
| A8 | Local OpenAI-compatible server | expose engine on localhost for VS Code/Cursor reuse | Rust everyaios-mcp (additional endpoint) | 🟡 | v2.0 §P3 |
| A9 | Cache-aware costs | cache_read/cache_write/$ per call, key-affinity | sidecar + Rust audit | 🔵 | doc 05 + ARCH/05 |
| A10 | Image generation | text-to-image + image-to-image provider endpoint (GPT-Image-1 / DALL·E 3 / Flux / Stable Diffusion / any MCP image server); key-ring + failover (A2/A3); ref-handle results | sidecar core-providers + vault | ⚪ | doc 50 |

## B. Agent orchestration

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| B1 | Agent loop (pi-style) | streaming, length-guard (fail truncated tool calls), model-swap hook, cost ledger | sidecar core-engine | 🟡 (loop) | doc 05/16 |
| B2 | Spec-driven blueprints | .md → agent registry; continuous plan rewrite; dependency resolution; resume-after-reboot | sidecar (new loader) | 🟡 | v2.0 §P2, doc 03 |
| B3 | Sub-agents | role isolation, own context+workspace, DELEGATE_BLOCKED_TOOLS | sidecar | 🟢+🟡 | doc 16 |
| B4 | Inter-agent messaging | peer-review, cross-check, request sub-routines; no recursive spawn | sidecar | 🟡 | doc 03 |
| B5 | Grammar-enforced extraction | ```blocks → tool calls (weak models) | sidecar core-engine | 🟢 | v2.0 §P3 |
| B6 | Iteration budgets | per-agent turn caps; subagent caps (Hermes 500/50 pattern) | sidecar | 🟡 | doc 16 |
| B7 | Scheduled tasks | cron/interval/event/webhook; nudge sentinels (suggest_schedule) | sidecar core-automations + UI | 🟢+🟡 | 33 §7 |
| B8 | Crystallization | multi-step workflows → deterministic loops, 0 tokens | sidecar core-automations | 🟢 | v2.0 §P7 |

## C. Memory & context

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| C1 | 7 memory algorithms | polarized, compass, phantom thread, anticipation, spreading activation, KG+conflict, decay | sidecar core-memory | 🟢 | 07, v2.0 §3 |
| C2 | Multi-tier memory | sensory/working/episodic/semantic/procedural + Letta paging | sidecar | 🟢+🟡 | 07, 34 §2 |
| C3 | Multi-signal retrieval | FTS5+vec+graph+temporal fusion, budgets, snippets | sidecar (new fusion) | 🟡 | 07, 34 §2, 32 |
| C4 | Vectorless default | FTS5/BM25 retrieval without embeddings | sidecar core-files | 🟢 | 32, 34 |
| C5 | Embeddings (optional) | on-device bge-micro/gte-small, int8/vec0 | sidecar core-files | 🟢 | v2.0 §P4 |
| C6 | Knowledge graph store | LadybugDB embedded graph (Kuzu community fork — Kuzu abandoned Oct 2025; C++, ACID, Cypher, vector+FTS built-in), temporal edges | sidecar (new) | 🟡 | 07, 34 §2 |
| C7 | Memory injection | warm set 0ms TTFT, scope-leakage floors, budgets | sidecar + 05 | 🟢+🟡 | 07 |
| C8 | Sync/export/wipe | E2E-encrypted sync (opt-in), export, per-scope wipe | sidecar core-sync | 🟢 | v2.0 §P8 |
| C9 | **Taste profile** | auto-learned coding-preference profile (style/patterns/frameworks/naming) with confidence scores 0–1; stored as shareable markdown (`~/.everyaios/taste/` + per-repo `.everyaios-taste/`); injected as a stable-prefix symbolic prior at generation; learns from accept/reject/edit via correction-detector + audit (Command Code taste-1 pattern — proprietary, pattern only) | sidecar (core-memory + new taste store) | 🟡 **NEW** | doc 37 |
| C10 | **Pass-by-reference context** | files/datasets/tool results exposed as **live handles + bounded previews** (head/tail + type metadata); agent queries/slices them via sandboxed script-eval (E4) instead of serializing payloads into context (NOOA pattern — never serialize what you can reference) | sidecar + E4 script-eval | 🟡 **NEW** | doc 39 |
| C11 | Temporal knowledge graph | Graphiti-pattern bi-temporal entity/fact tracking with validity windows + contradiction resolution | memory-kg (new) | 🔵 New | doc 46 (Graphiti) |
| C12 | Full-stack memory on Postgres/SQLite | Cognee-pattern: KG + vectors + sessions + ontology on single DB with remember/recall/forget/improve API; **doc 61:** every asset also exports to `~/.everyaios/memory/**/*.md` (readable/git-versioned — OpenHuman validation, view surface not second store) | memory-store | 🔵 New | doc 46 (Cognee) + 61 |

## D. Office & files (user-critical)

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| D1 | **Word open+edit** | block-patch engine, byte-preserving w:t, headers/tables/sections | sidecar office/docx | 🟡 **NEW** | 28, 04 | **✅ P4.1 landed: `crates/everyaios-office` — `OoxmlArchive` (ZIP open, parts index, `save` with `raw_copy_file` verbatim untouched entries — byte-stability proven by raw compressed-payload comparison) + `docx/` block-patch engine (anchored block tree w/ addresses `p1`/`t1:r1c2:p1`/`hdr1:p1`/`sec1` over body+headers/footers, plain-text render, minimal `w:t` prefix/suffix patch via byte-surgery with entity/UTF-8-aware splits, safety fallbacks NoTextAnchor/StaleEdit/PatchAcrossMarker). 30 tests — 393 ws tests (363 + 30), clippy 0, fmt clean. LibreOffice headless oracle → P4.5.** |
| D2 | **Excel open+edit** | IronCalc recalc + calamine read + workbook DSL + deterministic planner + flash-fill/pivot | Rust sidecar + sidecar | 🟡 **NEW** | 28, 04 | **✅ P4.2 landed: `crates/everyaios-office/src/xlsx/` — `read.rs` (calamine 0.30 windowed reads), `recalc.rs` (ironcalc 0.8.3 truth engine — every computed number engine-made, 100% math integrity), `dsl.rs` (WorkbookCommandBatch + Excel-accurate formula-shift: `$` doesn't pin, deleted→`#REF!`, shrink, LOG10/string/sheet-prefix protection), `planner.rs` (regex NLP → DSL, zero-LLM; `NeedsLlm` fallback), `patch.rs` (surgical sheetN.xml/sharedStrings.xml + workbook rename, byte-stable); `src-tauri xlsx_open` (windowed) + `ui/pages/Spreadsheet.tsx` virtualized 100K+ row grid. 64 office tests (+34), 427 ws tests, clippy 0, fmt clean. Univer = H5 view (P4.7), IronCalc = the one calc truth engine (doc 58).** |
| D3 | **PPT open+edit** | surgical OOXML part editing (slides), add/remove slides, text/shape ops | sidecar office/pptx | 🟡 **NEW** | 04 | **✅ P4.3 landed: `crates/everyaios-office/src/pptx/` — `parts.rs` (content types + presentation rels + `<p:sldIdLst>` slide order), `text.rs` (addressable `<p:sp>` shapes → `<a:p>` → `<a:r>` → `<a:t>`; render + minimal `<a:t>` byte-surgery patch, bullets `<a:buChar>`/`<a:buAutoNum>` as read-only markers, multi-byte/entity-aware; NoTextAnchor/PatchAcrossMarker fallbacks), `mod.rs` `PptxEngine` (render/patch + `add_slide` clone part+rels+`[Content_Types].xml` registration + `remove_slide` deregistration; `zip::save_changes(modified, added, deleted)` so untouched parts stay verbatim). 80 office tests (+16), 443 ws tests, clippy 0, fmt clean.** |
| D4 | **PDF open+edit** | render (pdf.js), form-fill/annotate (pdf-lib), text-swap (lopdf), redact, re-author | sidecar + Rust bridge | 🟡 **NEW** | 04 |
| D5 | Universal read/ingest | markitdown-class extraction → RAG, chat overlay | sidecar core-files | 🟢 | v2.0 §P1 |
| D6 | Round-trip conformance | LibreOffice oracle in CI, byte-stability asserts | CI | 🟡 | 29, 04 §4.4 | **✅ P4.5 landed: `conformance.rs` — `parts_diff` (changed/added/removed zip parts, decompressed compare) + `LibreOfficeOracle` (`find_soffice` PATH+install-dirs, `check_opens` = `soffice --headless --convert-to pdf`, fails on repair/damaged warnings; gated `#[ignore]` live test).** |
| D7 | Rollback | snapshotBefore, atomic writes | sidecar office | 🟡 | 28 §2 | **✅ P4.5 landed: `atomic.rs` `write_atomic` (temp → fsync → rename + dir fsync) + `rollback.rs` `Snapshot` (capture/record_save/undo/dirty — snapshotBefore).** |
| D8 | Legacy formats | .doc/.xls/.ppt → convert-on-open, read-only | Rust + optional soffice | 🟡 | 04, 29 §3a | **✅ P4.6 landed: `legacy.rs` — `LegacyKind` (.doc/.xls/.ppt), `convert_to_modern` (headless soffice → .docx/.xlsx/.pptx), `LegacyOpen` read-only + edit-as-new. 94 office tests (+14), 457 ws tests, clippy 0, fmt clean.** |
| D9 | **Storage intelligence** | parallel work-stealing disk walker (crossbeam-deque, cycle/device-boundary-safe) + immutable arena snapshots (arc_swap, ~100ms cadence, zstd save/load) + squarified treemap + per-dir aggregation; Guard-2-ticketed cleanup | Rust everyaios-storage | 🔵 **NEW** | doc 49 |
| D10 | Duplicate detection by hash | 7-stage pipeline (size → xxHash3 prefix/suffix → BLAKE3), hardlink-aware, optional reflink (btrfs/xfs/apfs), group reports | Rust everyaios-storage | 🔵 **NEW** | doc 49 (fclones + eDirStat) |
| D11 | Large-file finder | top-N by size/age + filters + cleanup actions | Rust everyaios-storage | 🔵 **NEW** | doc 49 (WinDirStat feature list) |
| D12 | Storage health & analytics | drive-threshold monitoring (e.g., 90% full), agent-suggested cleanup plans (duplicates/large files/old caches) with Guard-2 approval, dashboard (free space, top files, duplicate counts, trends) | Rust everyaios-storage + UI | 🟡 | doc 52 §3 |

## E. Browser & computer use

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| E1 | CDP child browser | system Chrome/Edge + chrome-for-testing fallback; loopback-only discovery; version-tolerant client (P2.1 ✅) | Rust everyaios-cdp | 🔵 | 33, 34, 08 |
| E2 | 37-tool catalog (34 core + 3 file_ops) | tabs..run + bookmarks, tab_groups_manage, windows (8.2) — engine + 37-tool registry (P2.3 ✅; bookmarks/tab_groups gated: no CDP surface on stock Chrome) | Rust everyaios-browser (actions/read) + everyaios-mcp | 🔵 | 33 §6, 46, 55 |
| E3 | A11y snapshot/diff | refs [eN], interactive mode, URL-change short-circuit, iframe stitching (P2.2 ✅) | Rust everyaios-browser | 🔵 | 33 §5, 55, 08 |
| E4 | Script-eval (run) | rquickjs sandbox + browser SDK + InnerCallHook | Rust everyaios-script | 🔵 (P2.5 ✅: 64MB/512KB/30s/1K/2MB limits, SDK surface, InnerCallHook audit, ownership filtering — 14/14 tests) | 33 §6.3, 08 |
| E5 | Session replay | injected recorder → NDJSON → SQLite; scrubber UI; has_gap | Rust everyaios-audit + UI | 🔵 **NEW** | 33 §9, 08 | **✅ P2.10 landed: `everyaios-browser/src/replay.rs` injected recorder (CDP `Page.addScriptToEvaluateOnNewDocument`; click/input/keydown/scroll/mutation capture; `x-recording-*` header contract; failed flush → sticky gap) + `everyaios-audit/src/replay.rs` ingest (`ingest_ndjson`/`ingest_batch`, chrome doc-id validation, dedupe-stable receipts, sticky `has_gap`, SQLite index one-tx commit with file-rollback, `ReplayStore` NDJSON + screenshot JPEGs, 7-day `retention_sweep` + `wipe`) + `session_log.rs` durable event log (10 §4.2 types) + idempotency classes (safe/unsafe/same-key/confirm) + `recovery_plan`. 16 audit + 5 browser tests; scrubber/audit UI = P3.1 landed.** |
| E6 | Tab ownership | mine/user/other-agent; claims; group-per-agent | Rust everyaios-browser + audit | 🔵 (P2.6 ✅: TabRegistry + sync/claim/release/can_close + tab_claim audit events + close_agent_group — 11 tests) | 33, 08 |
| E7 | Login import/sessions | capture-in-browser sign-in (vault path 1); optional Chrome profile import (path 3) | Rust everyaios-browser | 🔵 | 33 §3.2, 08 §8.9 |
| E8 | Authenticated scraping | logged-in sessions → tiered scrape → RAG | Rust+sidecar | 🟡 | 01/06 |
| E9 | Computer-use (pixels) | GUI control (post-v1, gated; patterns: Atlas, Agent-S GUI grounding, trycua/cua sandboxed desktops, OSWorld harness — docs 48/52) | Rust (later) | ⚪ | v2.0 §P8, 09, 52 |
| E10 | **Lightweight engine tier** | Lightpanda (Zig, **default**, AGPL — ~16× less memory) + **Obscura (Rust, opt-in — 21K★, source-verified doc 55: own CDP server 14 domains + LP.getMarkdown, embedded MCP 32 tools, scrape workers, SSRF/file:// defaults, ~30MB RSS)** via CDP; tier 0 static→1 lightweight→2 full escalation; adapt = spawn `obscura serve` via ProcessSupervisor | Rust everyaios-cdp | 🔵 **NEW** | 08 §8.8, 55 | **✅ P2.4 landed: `everyaios-browser/src/tiers.rs` — `TieredEngine` (tier 0 `read_http`+`html2md` with SSRF/file://domain guards; tier 1 Lightpanda/Obscura `serve` spawn with `--block-private-networks`/`--disable-workers`/bounded connections; tier 2 Chrome `--disable-features=WebRTC`), E8 escalation loop. LIVE-verified: static→Lightpanda→Chrome against example.com; Obscura binary absent → clean BinaryNotFound → escalates. 355 ws tests (246 at P2.4 + 24 P2.5/P2.6 + 44 P2.7/P2.8 + 12 P2.9 + 18 P2.10 + 3 P3.1 + 8 P3.3), 5/5 live, clippy 0.** |
| E11 | **Session Vault** | multi-account per site, encrypted **full storage context** (cookies + localStorage + sessionStorage + IndexedDB, Chrome leveldb decode, persist/restore — doc 55) in SQLCipher, Trust-Ladder-gated access (agent never sees raw cookies), rotation, usage audit, expiry nudges | Rust everyaios-vault + everyaios-browser | 🔵 **NEW (user req)** | 08 §8.9, 55 | **✅ P2.7 landed: `everyaios-vault/src/session.rs` `SessionVault` (schema v5, capture/grant/inject/rotate/expiry/audit) + `everyaios-browser/src/session.rs` cookie glue (`get_cookies`/`set_cookies`, `seal_session`/`inject_session`, `inherit_cookies_from_chrome` + `group_cookies_by_site`) — 11 vault + 10 browser tests, agent-never-sees-cookies + inject-without-grant-denied + E13 LIVE-verified. localStorage/IndexedDB capture is the CDP `DOMStorage`/`IndexedDB` follow-on.** |
| E12 | **Challenge handler** | PoW captchas solved locally + LLM visual-grounding + human-in-loop pass-through (default) + optional BYO solver API (user key) | Rust everyaios-core + sidecar | 🔵+🟡 **NEW** | 08 §8.10 | **✅ P2.8 landed: `everyaios-core/src/challenge.rs` — PoW `solve_pow`/`verify_pow`, human-in-loop single-use registry (`surface`/`resolve_human`/`pending`), visual-grounding contract (`route_visual` + `grounding_request` + `parse_grounding_choice`), BYO solver HTTP (`solve_captcha`/`create_task`/`poll_task`, `UreqHttp` transport, key via A2/A3 keyring) + 23 tests. Turnstile (incl. hidden) is Cloudflare-managed → NOT locally solvable (honest route). The sidecar makes the actual LLM grounding call; the UI consumes `resolve_human`.** |
| E13 | Session inheritance | live-attach to user's own Chrome profile via CDP debug port (vault path 2, no re-login) | Rust everyaios-browser | 🔵 **NEW** | 08 §8.9 | **✅ P2.7 landed: `everyaios-browser/src/session.rs` `inherit_cookies_from_chrome(port)` — `probe_browser` (loopback-guarded) → `connect_to_browser` → `Storage.getCookies` (modern browser-target method; `Browser.getCookies` is gone in current Chrome) → `group_cookies_by_site`. LIVE-verified: cookie set on one connection is inherited via the discovered debug port.** |
| E14 | Behavioral realism | humanized input events (Bézier mouse curves, typing cadence), optional per-site | Rust everyaios-browser | 🔵 **NEW** | 08 §8.10 (CloakBrowser pattern) | **✅ P2.9 landed: `everyaios-browser/src/humanize.rs` — `BehaviorProfile` (Bézier `mouse_path` + per-key `typing_delays`, host allow-list, seeded RNG) wired into `BrowserActions::with_behavior`; off by default, per-site gated via `site_enabled(url)`; click/hover/drag take real `mouseMoved` paths (drag releases exactly), typing emits per-char `dispatchKeyEvent` with cadence. 12 tests: deterministic path, jittered endpoint, word pauses, host gating, plain-click has 0 moves, per-key sequence, exact drag target — 355 ws tests (246 + 24 + 44 + 12 + 18 + 3 + 8), clippy 0, fmt clean.** |

## F. Connector hub

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| F1 | Hub routing | native → Composio → Zapier → Nango → Auth Bridge; no double-connect | sidecar core-connectors | 🟢+🟡 | 13 |
| F2 | Native adapters | 27+ direct adapters | sidecar core-connectors | 🟢 | v2.0 §3 |
| F3 | Browser-session connectors | drive logged-in web apps via browser layer | Rust+sidecar | 🔵+🟡 | 13, 08 |
| F4 | Local Auth Bridge | project PKCE client, no secret, local token manager | Rust everyaios-vault | 🔵 | 13 §5.5 |
| F5 | Composio/Zapier/Nango | user-key, self-hosted/optional (never required) | sidecar | 🟢 (partial) | 12/13 |
| F6 | MCP client (consume) | connect external MCP servers, reconcile | sidecar | 🟢 (built client) | 10 |
| F7 | MCP server (serve) | our tools to Claude Code/Codex/Cursor/... via one endpoint | Rust everyaios-mcp | 🔵 | 33 §8, 34 §2 |
| F8 | Harness installer | plan-before-touch install into the **F12 harness set (9 CLIs — list lives in F12, single source of truth)**, ownership markers (doc 33 §8 harness-integrations pattern); **registry-fed discovery from the official ACP agent registry** (doc 57 §2 — CDN catalog + local cache + version pinning + curated allow-list) | Rust (new) | 🔵 | 33 §8, 45, 52, 56, 57 |
| F9 | Unified Tool Registry | one normalized ToolDefinition + permission classes; **adopts ACP tool-kind taxonomy** (read/edit/delete/move/search/execute/think/fetch/other, doc 45 §4.3) | sidecar core-tools | 🟢 | 10, 45 |
| F10 | WSL/POSIX bridge | `wsl.exe` runners, `\\wsl.localhost\` paths, loopback IPC, native script exec in Linux | Rust everyaios-core + sidecar | 🟡 | doc 03 §5, v2.0 §P5 |
| F11 | Port/network hooks | async loopback listeners, inbound/outbound monitor, webhook ingress — gated behind trust levels; **browser network containment** (doc 55/06 §6.15): WebRTC disable + worker fail-closed under allowlist, SSRF-defaults (loopback/RFC1918 blocked), `file://` blocked | Rust everyaios-core | 🔵 | doc 03 §5, 55 |
| F12 | Harness-driving | drive the user's existing agent CLIs (Codex/**Claude Code/Claude Agent via official ACP wrapper**/Cursor/Grok/OpenCode/**Aider**/Cline/Pi/**Copilot CLI** — doc 56/57) side-by-side on the same workspace — own context each, shared files + session state, Trust-Ladder-gated + audited (reverse of F8; OpenWebUI Computer pattern). **External interface = ACP (Agent Client Protocol)**: our app = Client, stdio JSON-RPC, permission requests → Guard-2 cards, tool calls/file ops → audit NDJSON, cancel → watchdog kills (doc 45). Compose as brain → core → surgeon (doc 52 §1); **ACP adapter reference: cowork-forge `acp/client.rs` + `agents/external_coding_agent.rs` (doc 56 C2)**; **discovery via official ACP agent registry (doc 57 §2)**; **auth-mode badge** (subscription-backed / API-key-backed / local) on every harness (doc 57 §3 — Claude OAuth works only inside the official wrapper/CLI) | sidecar + Rust everyaios-core | 🟡 **NEW** | doc 35 §C, 45, 52, 56, 57 |
| F13 | Messaging bridges | WhatsApp/Telegram/Signal/iMessage adapters to the same agent engine — 24×7 assistant on the user's own accounts, scheduled reminders + memory reuse (Secure OpenClaw pattern; DeerFlow 2.0 channels = 10-IM-adapter reference impl w/ run_policy + dedupe, doc 39 §B1) | sidecar | 🟡 **NEW** | doc 36 §B |
| F14 | Email connector | Gmail API via Auth Bridge OAuth (vault tokens) or IMAP/SMTP (imapflow / async-imap + lettre); read/search/send/reply/triage; browser-session last resort | sidecar + vault | 🟡 **NEW** | doc 50 (openonion/email-agent) |
| F15 | Calendar connector | Google Calendar API + ICS; event CRUD, availability, nudge integration (B7) | sidecar + vault | 🟡 **NEW** | doc 50 |

## G. Search & research

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| G1 | Free search cascade | searxng-first + public instances + circuit breaker + BM25 rerank; SQLite result cache (5-min TTL) + parallel top-N fetch cascade (searxng-mcp 4-tier pattern) | sidecar core-search | 🟢 | v2.0 §P7, 52 |
| G2 | Deep research | breadth×depth tree, learnings-up, gap-check, cited reports | sidecar | 🟢+🟡 | 07 |
| G3 | Multi-channel search | arXiv/GitHub/EDGAR/Reddit adapters | sidecar | 🟡 | 07 |
| G4 | Data-analysis REPL | sandboxed pandas/numpy for CSV/Excel/SQLite | sidecar + sandbox | 🟡 | 07 |
| G5 | Repo-wide engineering | scan/dep-map/test-loop/patch in workspace | sidecar + sandbox | 🟡 | v2.0 §P7 |
| G6 | Site/domain search | SeekStorm-class inverted index for local corpora | sidecar | 🟡 | 32/21 |
| G7 | Instant filename/content search | SQLite FTS5 filename index + notify-watcher incremental updates + optional OS-native hooks (Everything/MFT, mdfind, Baloo); Everything/UltraSearch UX, cross-platform | Rust everyaios-storage + sidecar | 🔵 **NEW** | doc 49 |
| G8 | Tiered search cascade & cache | cached instant tier (SQLite, 5-min TTL) → optional Rust metasearch (WebSurfx, ~20–40MB) → SearXNG → external fallback via circuit breaker; parallel fetch cascade (50-page baseline ≈ single-page time); BM25 rerank per tier; Algorithm #33 | sidecar core-search | 🟡 | doc 52 §4 |

## H. UI & product

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| H1 | Chat | streaming, token streamer, message branching, artifacts | UI | 🟢 (port) | v2.0 §P1 |
| H2 | Cockpit dashboard | live agent cards, Watch/Stop, recent sessions | UI | 🟡 | 33 §9.5 | **✅ P3.2 landed: `everyaios-audit/src/cockpit.rs` — `CockpitState`/`AgentCard`/`InterruptCard` (status/model/provider, token counters, capped action trail, `quiet_status()` single-sentence line, MCQ interrupt lifecycle, stop/undo; +8 tests) + Tauri `cockpit_cmds.rs` (`cockpit_snapshot`/`activity`/`tokens`/`upsert_agent` feed seams, `cockpit_quiet` → tray tooltip + window hide, `agent_undo` + `interrupt_respond` JSON-RPC over the unix control channel) + `ui/src/pages/Cockpit.tsx` flight deck (Running-now cards w/ LIVE chip + STOP/UNDO, slide-over panel w/ action cards + token totals, MCQ interrupt cards, quiet toggle, 2s poll). 393 ws tests (355 + 8 + 30 office), clippy 0, fmt clean.** |
| H3 | Audit + replay UI | searchable sessions, per-step screenshots, scrubber | UI | 🟡 | 33 §9.5 | **✅ P3.1 landed: `everyaios-audit` replay query layer (`search_sessions` substring filter, `timeline` = segment+events+screenshot steps, `screenshot_steps`/`screenshot_path`, `events_since` watch tail; +3 tests) + Tauri commands (`replay_sessions`/`replay_timeline`/`replay_screenshot` base64 data-URL/`watch_events`/`agent_stop` JSON-RPC over unix control channel) + `ui/src/pages/Audit.tsx` (scrubber bar, screenshot strip, searchable sessions, 2s watch poll, Stop button). 393 ws tests, clippy 0, fmt clean.** |
| H4 | Blueprint editor | live execution status on .md | UI | 🟡 | v2.0 §P2 |
| H5 | Office editors | docx/xlsx/pptx/pdf views + chat overlay | UI | 🟡 | 04 |
| H6 | Reader | PDF/EPUB/web/markdown universal reader | UI | 🟢 (port) | v2.0 §P1 |
| H7 | Math + code rendering | KaTeX, syntax highlight + run/compile | UI | 🟢 (port) | v2.0 §P1 |
| H8 | Permission cards | Guard-2 diff cards, trust ladder UI | Rust+UI | 🔵+🟡 | 06 |
| H9 | Token/cost analytics | per-key/per-session dashboard | UI+Rust | 🔵+🟡 | 05 §5.6 |
| H10 | Personality | SOUL.md, user-tunable, core rules inviolable | sidecar+UI | 🟡 | v2.0 §P1 |
| H11 | Tray daemon | watchers + automations headless | Rust | 🔵 | v2.0 §P7 |
| H12 | Telemetry | opt-in, enumerated fields, no content | Rust | 🔵 | 33 §11 |
| H13 | Local OpenAI-compatible server UI | expose + manage | Rust | 🟡 | A8 |
| H14 | Scheduled tasks UI | create from chat (nudge cards) + settings | UI | 🟡 | 33 §7, v2.0 |
| H15 | Voice input (VAD) | hands-free chat, speech-to-text; offline STT options (Vosk / sherpa-onnx / whisper.cpp) + optional wake word (openWakeWord) | UI | ⚪ | 33 §10, doc 50 |
| H16 | Magic-completion | inline context-aware completion (AnythingLLM Magic Tab, optional) | UI | ⚪ | 01 |
| H17 | Widget cards | inline render: weather, stock (yahoo-finance2), math/calc, lookups (Vane pattern) | UI | 🟡 **NEW** | doc 35 §B |
| H18 | Remote session handoff | LAN/Tailscale/tunnel view — resume a running desktop session from phone mid-run (opt-in; extends B2 resume + C8 sync) | Rust + sidecar | ⚪ | doc 35 §C |
| H19 | Progress steps panel | Unified timeline of all agent actions (shell+code+browser+office) with clickable entries, timestamps, expandable details | coordinator + UI | 🔵 New | doc 46 (Devin) |
| H20 | Workspace tabs (9-tab live view) | Shell/Code/Browser/Excel/Word/PPT/PDF tabs showing live agent work in real-time | UI + everyaios-browser + office-engine | 🔵 New | doc 46 (Devin) + ARCH/12 |
| H21 | Takeover/resume flow | Pause agent → user edits → resume with change description | UI + IPC + core | 🔵 New | doc 46 (Devin) |
| H22 | Automation builder (NL + templates) | Event-driven workflow creation with NL input and 10+ pre-built templates | UI + scheduler (B7) | 🔵 New | doc 46 (Devin) |
| H23 | Knowledge browser (trigger+macro) | Browse/edit knowledge items with trigger-based recall, macros, folders, repo-pinning | UI + memory (C6-C7) | 🔵 New | doc 46 (Devin) |
| H24 | MCP marketplace | Browse/install/manage MCP servers with status indicators | UI + connector hub (F7-F8) | 🔵 New | doc 46 (Devin) |
| H25 | Generative UI (AG-UI) | live agent-emitted components in chat (AG-UI wire protocol, ~16 event types, single channel); sandboxed iframe + strict CSP + process isolation (Anthropic Artifacts pattern); artifact cards static → live on demand | UI | 🔵 **NEW** | doc 50 |
| H26 | Clipboard tool | read/write/history system clipboard (arboard); guard-ticketed (read = read-only, write = mutation) | Rust everyaios-core + UI | ⚪ | doc 50 |
| H27 | Resumable streams | coordinator-held in-flight stream state; auto-reconnect + resume from last token/id (LibreChat pattern); no lost replies on drop/refresh/suspend | coordinator + UI | ⚪ | doc 50 |
| H28 | Voice output (TTS) | offline sherpa-onnx default (Apache-2.0, active; hosts Piper VITS voices — ⚠️ rhasspy/piper archived) + optional BYOK cloud TTS (OpenAI/ElevenLabs) | UI + sidecar | ⚪ | doc 50 |

## I. Forge & skills

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| I1 | Code synthesis loop | write→sandbox→test→iterate | sidecar + sandbox | 🟡 | v2.0 §P6 |
| I2 | Skill registry | ~/.everyaios/skills/, manifest + ownership markers, auto-inject into planner; **SKILL.md format alignment** (name/description/allowed-tools frontmatter + references/ — agent-browser `skill-data`, doc 55) so our skills work with the ecosystem | sidecar + Rust | 🟡 | v2.0 §P6, 33 §8, 55 |
| I3 | WASM fuel-metered sandbox | compute budget + epoch kill | Rust (later) | ⚪ | 09 |
| I4 | TDD loop | auto-generate tests, read stderr, rewrite | sidecar | 🟡 | v2.0 §P6 |
| I5 | ECC guardrails | plan-before-build, session scanning | sidecar | 🟡 | 09 |
| I6 | **Extension/plugin ABI** | versioned bundles (`abi_version`, cumulative host adapters — Zed WIT `since_v0_0_x` pattern); typed manifest: `contributes` + `capabilities` allow-lists with `*`/`**` arg wildcards (Zed `CapabilityGranter`); fail-closed per-extension trust flags (Hermes `allowed_*`); explicit agent-binding (Cherry Studio); lazy activation (VS Code); host facades `ctx.llm`/`ctx.files`/`ctx.approval()`; dogfood first-party plugins | sidecar + Rust everyaios-guard | 🟡 | 44 §5 |
| I7 | RepoMap (tree-sitter + PageRank) + **Warp semantic index (doc 56)** | Codebase context selection via tag extraction, graph building, personalized PageRank, binary-search budget fitting (**deterministic default — zero embeddings**); **optional semantic layer (Warp `full_source_code_embedding`: tree-sitter semantic chunker MAX_TRAVERSAL_DEPTH=200 + coalesce_fragments, merkle-tree content-hash incremental sync, search shaping w/ char-boundary-safe reads, `file_outline` — doc 56 W1/W2) gated behind C5** — one crate, two query paths (deterministic context selection vs semantic search/outline), not two indexes | everyaios-repomap (new crate) | 🔵 New | doc 46 (Aider), 56 |
| I8 | Edit strategy pattern (per-model) | Multiple edit formats (SEARCH/REPLACE, udiff, whole, patch) with fuzzy matching, selected per model | coordinator | 🔵 New | doc 46 (Aider) |
| I9 | Architect mode (two-pass) | Reasoning model → Editor model split for code changes (aider-reported 82.7% benchmark — doc 51); **composes with F12 surgical hierarchy — the surgeon tier may run the two-pass architect/editor; distinct from the oracle/review pass (TODO P11.5.10: heavyweight post-edit review) — planning then editing ≠ reviewing after** | coordinator + sub-agents (B3) | 🔵 New | doc 46 (Aider), 51, 52 |
| I10 | File watcher + AI comments | Watch source files for `// ai!` markers, extract context, auto-submit to agent | everyaios-core (notify) | 🔵 New | doc 46 (Aider) |

## J. Cross-cutting

| # | Capability | Feature | Module | Status | Source |
|---|---|---|---|---|---|
| J1 | Trust Ladder | 0–100 graduated permissions, 15 tests built | sidecar core-tools | 🟢 | 06 |
| J2 | Guard-1 regex interceptors | compiled blocklist, pre-exec scan | Rust everyaios-guard | 🔵 | 06, 03 §8 |
| J3 | Guard-2 diff cards | native click-to-approve, non-bypassable | Rust everyaios-guard | 🔵 | 06 |
| J4 | Path/scope hard-floors | canonicalization, symlink-safe boundaries | Rust everyaios-guard | 🔵 | 06 |
| J5 | Audit trail | append-only, token estimates, receipts, replay; durable event log + idempotency classes (doc 53 §4: safe-retry/unsafe/same-key/confirm-after-uncertain) | Rust everyaios-audit | 🔵 | 33 §9, 06, 53 |
| J6 | Prompt-injection defense | <user_document> wrapping, context scan, tool-result sanitization | sidecar+Rust | 🟡 | 25, 16 |
| J7 | ProcessSupervisor | spawn/restart/backoff/circuit-breaker | Rust everyaios-core | 🔵 | v2.0 §4.3 |
| J8 | Key vault | SQLCipher, CES executor, crash scrubbing | Rust everyaios-vault | 🔵 | 06 §6.8 |
| J9 | Config-as-files | everyaios.toml + agents/*.md + providers.toml | all | 🟡 | v2.0 §7.6 |
| J10 | Watchdog | connect/idle timeouts re-armed per byte | Rust+sidecar | 🔵+🟢 | 28 §3 |
| J11 | Hard $ budget per session | default $2.00/agent; core-providers live-pricing + sqlite counters; kill sidecar on exceed; "stopped: $X limit" UI; reasonix token discipline upstream brake | sidecar+Rust | 🟡 | 43 |
| J12 | Orphan-prevention on Rust death | Linux `prctl(PR_SET_PDEATHSIG, SIGTERM)` (code-verified); Windows Job Object `KILL_ON_JOB_CLOSE`; macOS posix_spawn process group; 5s parent-PID poll belt+suspenders | Rust everyaios-core | 🔵 | 43 |
| J13 | Sidecar heap safety | `--max-old-space-size=512`; self-restart at 80% heap; resume from last Hermes checkpoint (20snap/500MB); 30min rotation | Rust+sidecar | 🔵+🟢 | 43 |
| J14 | Distributed tracing | OpenTelemetry Rust↔Node shared trace_id; audit gains trace_id+span_id; agent-session observability refs: agentlens (local coding-agent traces), agentsight (eBPF) | Rust+sidecar | 🟡 | 43, 52 | **✅ P3.3 landed: `everyaios-core/src/tracing.rs` — `TraceContext` (root/child spans, opentelemetry 0.27 `TraceId`/`SpanId`/`TraceFlags`), W3C `traceparent` wire format (the header `@opentelemetry/sdk-node` reads) + `inject_headers`/`extract_headers` for the Rust→sidecar→provider→sandbox boundaries, `SpanRecord`/`SpanAttrs` (all doc-43 fields), `TraceReporter` (console + `<data_dir>/traces/traces.ndjson` NDJSON; not-sampled dropped; OTLP/Jaeger post-v1) + `AuditEvent`/`SessionEvent` `trace_id`+`span_id` columns (`write_traced`, serde-default legacy compat). 8 tests — 393 ws tests, clippy 0, fmt clean.** |
| J15 | Length-prefixed IPC framing | `[u32 LE][payload]`; bounded channels (cap 16) + backpressure; truncation → `ref:` handle | Rust everyaios-ipc | 🔵 | 43 |
| J16 | Process lifecycle hardening | UNIX socket over TCP (zero port collision); pre-spawn coordinator at boot (~60MB Bun binary — realistic; 25MB is hello-world-only, doc 43 §1.3); warm-pool 5min idle | Rust everyaios-core | 🔵 | 43 |
| J17 | **ACP harness bridge** | ACP client over stdio JSON-RPC (official Rust crate or `@agentclientprotocol/sdk`) for F12; `initialize` handshake (protocolVersion + optional-by-default capabilities); `session/request_permission` → Trust Ladder + Guard-2; `session/update` → audit NDJSON; `session/cancel` → watchdog/budget kills; v2-draft monitored; **generalized-client reference: Hermes issue #5257** (`copilot_acp_client.py` → generic `ACPClient` + `acp_agent_registry.py`); **A2A = secondary interface (doc 61):** ACP local CLIs, A2A v1.0 + Signed Agent Cards for remote discovery/identity | Rust + sidecar | 🟡+🔵 | 45, 57, 61 |
| J18 | Profile-gated hooks | Lifecycle hooks (PreToolUse/PostToolUse/Stop/SessionStart/SessionEnd) gated by minimal/standard/strict profiles | everyaios-guard | 🔵 New | doc 46 (ECC) |
| J19 | Merkle hash-chain audit | Cryptographic tamper-evident append-only log with hash chain verification | everyaios-audit | 🔵 New | doc 46 (OpenFang) |
| J20 | AgentShield config scanning | Scan everyaios.toml, blueprints, MCP configs, hooks for injection/secrets/permissions | everyaios-guard | 🔵 New | doc 46 (ECC) |
| J21 | Escalation rules & decision packages | permissions.toml policy layer (delete=always_ask, multi_file_edit=ask_if_gt_5, external_network=ask_if_new_domain, terminal_shell=ask_if_destructive), min_confidence_for_auto threshold, structured decision package (goal + diff + risk + paths) → Guard-2 cards; approvals/denials feed correction-detector + taste profile; ticket contract (doc 53 §3): ticket_id/agent_id/session_id/tool_id/operation/args-hash/paths/expiry/single-use/approval-source/risk/audit-seq | everyaios-guard + sidecar | 🟡 | doc 52 §2, 53 |

**Totals:** 138 feature rows · status buckets: 🟢 27 · 🟡 58 · 🔵 59 · ⚪ 9 (multi-status rows like `🟢+🔵` are counted in every bucket they carry). Added in the docs 49–51 gap pass: A10, D9–D11, F14–F15, G7, H25–H28 (+ H15 extended); doc 52 adds D12, G8, J21 (+ F12/G1/E9/J14 extended). The build plan (10) sequences these so every milestone ships working value.
