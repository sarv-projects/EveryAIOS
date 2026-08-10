# EveryAIOS — Master Implementation TODO

> **Generated:** 2026-08-07 (updated 2026-08-10) · **Spec:** v3.12 · **Architecture:** ARCH/00–12 + DIAGRAMS.md
> **Rule:** Mark `[DONE]` only after implementation + test pass. Leave `[NOT DONE]` until verified.
> **Scope:** Complete product — 138 capabilities, 33 algorithms, 13 build phases (P0–P12) + UI implementation (P11.5). Docs 49–51 gap pass added: D9–D11/G7 (storage intelligence), A10 (image gen), F14/F15 (email/calendar), H25–H28 (gen-UI/clipboard/resumable/TTS) + H15 ext (offline STT/wake word). Doc 52 adds: D12 (storage health), G8 (tiered search cascade), J21 (escalation rules), Aider in F12, Algorithm #33.
> **Source reuse:** `APP/packages/core-*` imported as workspace deps (not copied). Desktop-only additions go in `packages/coordinator/` or `crates/`.

<!-- VERIFICATION POLICY: Every completed task MUST be verified before marking [DONE].
     Verification means: code compiles, tests pass, behavior confirmed (manual or automated).
     If verification is not possible (e.g. no test runner, external dependency), document WHY
     in the task line and mark [DONE — unverified: reason]. Never mark [DONE] on faith alone. -->

---

## PHASE 0 — Workspace & Skeleton (~2 weeks)

### P0.1 Rust Workspace Setup
- [x] `[DONE]` Create `crates/` directory with Cargo workspace manifest
- [x] `[DONE]` Create `crates/everyaios-core/` — binary crate, boots headless, loads config
- [x] `[DONE]` Create `crates/everyaios-ipc/` — JSON-RPC stdio framing with length-prefix [u32 LE]
- [x] `[DONE]` Create `crates/everyaios-guard/` — stub (compiled RegexSet placeholder)
- [x] `[DONE]` Create `crates/everyaios-audit/` — stub (NDJSON append writer)
- [x] `[DONE]` Create `crates/everyaios-vault/` — SQLCipher init, open/create encrypted db
- [x] `[DONE]` Create `crates/everyaios-cdp/` — stub (CDP WebSocket client skeleton)
- [x] `[DONE]` Create `crates/everyaios-browser/` — stub (snapshot types)
- [x] `[DONE]` Create `crates/everyaios-script/` — stub (rquickjs placeholder)
- [x] `[DONE]` Create `crates/everyaios-mcp/` — stub (official MCP Rust SDK integration)
- [x] `[DONE]` Wire Cargo workspace: all crates compile, `cargo test` green
- [x] `[DONE]` CI: GitHub Actions cargo test + clippy + fmt check — **pushed to `sarv-projects/EveryAIOS`, all 3 platforms green ✅ (ubuntu 27s, macOS 18s, Windows 14m32s). OpenSSL installed via vcpkg for SQLCipher on Windows. Run: [#31308757031](https://github.com/sarv-projects/EveryAIOS/actions/runs/31308757031)**

### P0.2 Tauri Shell
- [x] `[DONE]` Init Tauri v2 app in `desktop_app/` root (`src-tauri/` — Cargo.toml, build.rs, tauri.conf.json, capabilities, lib.rs, main.rs)
- [x] `[DONE]` Configure `tauri.conf.json` — window 1200×800 (main, resizable, centered), bundler targets appimage/msi/dmg, identifier `com.everyaios.desktop`
- [x] `[DONE]` Wire everyaios-core as Tauri's Rust backend (Tauri commands: version, core_boot_report, scan_text, probe_vault — boot report, Guard-1 scan, vault probe)
- [x] `[DONE]` Verify `tauri dev` boots and shows empty webview window — **verified headless on Xvfb (never on the user's display)**: 1280×800 window mapped, webview page renders (985K white px + accent-blue boot card), process + WebKitWebProcess/NetworkProcess alive; tray icon present in X tree
- [x] `[DONE]` Add system tray with basic status icon (Show EveryAIOS / Quit menu, `icons/32x32.png`, generated via `scripts/gen-icons.py`)

### P0.3 TS Sidecar (Coordinator)
- [x] `[DONE]` Create `packages/coordinator/` — TS project with tsconfig (Bun target, strict, ESM; deps on all 10 `@personal-ai/core-*`)
- [x] `[DONE]` Configure pnpm workspace linking to `APP/packages/core-*` as deps — `pnpm-workspace.yaml` adds `../APP/packages/*`; verified all 10 core-* symlinked into coordinator; `allowBuilds` map (pnpm 11 syntax) builds better-sqlite3/onnxruntime-native; root `package.json` added for the workspace
- [x] `[DONE]` Implement hello-world IPC responder (stdin/stdout JSON-RPC) — `src/{frame,message,index}.ts` mirror `everyaios-ipc` exactly: `[u32 LE len][JSON]` framing + ACP-style `initialize` (protocolVersion=1, default-off capabilities) + echo/session/ping/shutdown; **11/11 bun tests green incl. real child-process E2E round-trip; tsc clean**
- [x] `[DONE]` Bun compile: `bun build --compile ./src/index.ts --outfile dist/coordinator` — **compiled in 4.6s, 3 modules bundled, output at `packages/coordinator/dist/coordinator`**
- [x] `[DONE]` Verify binary boots and responds to echo over stdio — **tested: framed `echo` request → `{'text': 'hello from binary', 'echoed': True}` response via compiled binary**
- [x] `[DONE]` Measure binary size (target: document actual vs ~60MB expected) — **actual: 91MB (Bun 1.3.14 runtime overhead; ELF x86-64 dynamically linked). Larger than 60MB estimate due to Bun runtime growth since v1.0. Acceptable for desktop; strip/compression can reduce for distribution.**
- [x] `[DONE]` Sidecar heap safety (J13): `--max-old-space-size=512`; self-restart at 80% heap used; forced rotation at 30min — **`src/heap.ts` implements `startHeapMonitor()`: 5s poll, 80% → `heap/warning` notification, 95% → `heap/critical` + exit(71), 30min → `heap/rotation` + exit(0). ProcessSupervisor sets `BUN_JSC_heapSize=536870912` at spawn. 17/17 bun tests pass.**

### P0.4 ProcessSupervisor (J7)
- [x] `[DONE]` Implement spawn logic in everyaios-core: launch coordinator binary as child — **`src/supervisor.rs`: `ProcessSupervisor::spawn()` uses `Command` with `Stdio::piped()`, sets `BUN_JSC_heapSize`, platform `pre_exec` for orphan prevention**
- [x] `[DONE]` Implement exponential backoff restart (1s→2s→4s→60s cap) — **`restart_with_backoff()`: delay = `min(2^restart_count, 60)` seconds**
- [x] `[DONE]` Implement circuit breaker (5 crashes/10min → OPEN state → surface error) — **`check_circuit_breaker()`: prunes entries >10min, trips at ≥5 crashes → `SupervisorState::CircuitOpen`**
- [x] `[DONE]` Implement watchdog (J10): connect/idle timeouts re-armed per byte of stream; hang detection → kill + restart — **`check_watchdog()` now wired into `wait_or_restart()` loop: 5s connect timeout (first byte → Starting→Running), 30s idle timeout, re-armed per byte by dedicated stdout/stderr reader threads (`pump()`); sidecar emits `session/ready` on boot + `session/heartbeat` every 10s (env-overridable via `EVERYAIOS_HEARTBEAT_MS`) so a healthy-but-idle process never false-kills; 10 watchdog unit tests + E2E heartbeat test green (core 19/19)**
- [x] `[DONE]` Implement orphan prevention (J12): prctl Linux, Job Object Windows, process group macOS — **Linux: `PR_SET_PDEATHSIG(SIGTERM)` via `pre_exec`; macOS: `setsid` via `pre_exec`; Windows: real Job Object `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` via `windows-sys` 0.61 — `orphan::windows::{create_job_object, assign_to_job}` (job created before spawn, fresh child assigned by PID; no unguarded window). Compiles clean for `x86_64-pc-windows-msvc` (validated with cargo check; `Win32_Security` feature required for `CreateJobObjectW`)**
- [x] `[DONE]` Implement parent-PID polling in sidecar (5s interval, self-exit if orphaned) — **`src/orphan.ts`: `startOrphanWatch()` polls `process.ppid` every 5s, exits if changed or ≤1**
- [x] `[DONE]` Test: kill everyaios-core → verify sidecar dies within 5s — **integration test PASS: coordinator exits in 0.5s when parent dies (stdin EOF triggers immediate exit via `reader.on('end')`; ppid polling is backup). 19/19 cargo tests pass (incl. 10 new watchdog unit tests).**

### P0.5 IPC Contract (J15)
- [x] `[DONE]` Implement length-prefixed framing in everyaios-ipc: `[u32 LE length][JSON payload]` — **`crates/everyaios-ipc/src/frame.rs` (`encode`/`decode`, `MAX_FRAME_LEN` 16MiB, EOF-safe partial-frame handling) + TS mirror `packages/coordinator/src/frame.ts` (incl. resync-on-error `FrameDecoder`); 11 ipc unit tests green, framing also exercised end-to-end by the E2E round-trip below**
- [x] `[DONE]` Prefer UNIX-domain socket transport over TCP (J16) — zero port collisions; pre-spawn coordinator at Tauri boot (hidden, ~200ms perceived cold start) — **`crates/everyaios-ipc/src/socket.rs`: `UnixFrameServer` (stale-socket rebind, framed `serve_connection`) + `request()` client + `socket_path(data_dir)`; `Config.resolved_socket_path()` (default `<data_dir>/coordinator.sock` — no TCP port ever); `src-tauri` `.setup()` now `pre_spawn_coordinator()` (finds `packages/coordinator/dist/coordinator` / `EVERYAIOS_COORDINATOR_BIN`, runs `ProcessSupervisor::wait_or_restart` on a thread) + `serve_unix_control_channel()` (framed JSON-RPC responder on the socket); 4 socket tests green incl. latency bench below**
- [x] `[DONE]` Implement bounded channel (capacity=16) with backpressure — **`crates/everyaios-ipc/src/channel.rs`: `BoundedChannel` wraps `mpsc::sync_channel(16)` — `send()` blocks when full (that block IS the backpressure), `try_send()` returns `Full`, atomic length counter, `sender()` clone for thread producers; 6 unit tests green (capacity respected, blocked sender unblocks after drain, recv blocks)**
- [x] `[DONE]` Implement truncation: oversized payload → `ref:` handle — **`crates/everyaios-ipc/src/handle.rs`: `HandleStore` (thread-safe, atomic ids) + `WirePayload::{Inline,Ref}` + `HandleRef::wire()/parse()` (`ref:handle:<id>`, C10 pass-by-reference); payloads >1MiB (`TRUNCATION_THRESHOLD`) become one-shot handles fetched via `refs/get`; 5 unit tests green**
- [x] `[DONE]` E2E test: sidecar echo round-trip with length-prefix framing — **`packages/coordinator/src/index.test.ts` “E2E — real child process over stdin/stdout”: spawns `bun run index.ts`, sends initialize + echo + ping composed in a single write (frames split across the write boundary), asserts `session/ready` notification + 3 length-prefixed responses; 17/17 bun tests green (incl. heartbeat E2E)**
- [x] `[DONE]` Benchmark: measure IPC latency (target <2ms per crossing) — **`socket.rs` bench `ipc_latency_below_2ms_per_crossing`: 2000 framed round trips through a real OS socketpair (kernel crossing + framing) — measured avg 35 µs/crossing, 57× under the 2ms budget; assert keeps CI honest**

### P0.6 Config System (J9)
- [x] `[DONE]` Define `everyaios.toml` schema (ports, dirs ~/.everyaios/, retention, vault path, browser binary) — **`crates/everyaios-core/src/config.rs`: `Config {data_dir, vault_path, retention_days, browser_binary}` + TOML round-trip + relative-path normalization; `ports` field intentionally deferred until the P0.5 transport (UNIX socket / MCP HTTP port) exists — no ports are live yet**
- [x] `[DONE]` Implement config loading in everyaios-core from `~/.everyaios/everyaios.toml` — **`Config::load()` / `Config::load_from()` with `EVERYAIOS_HOME` override; tests `default_config_points_into_everyaios_dir` + `missing_file_gets_created_with_defaults` green (13 core tests pass)**
- [x] `[DONE]` Create default config on first boot — **`load_from` writes `Config::default()` to disk when the file is absent (test asserts the file exists after load)**
- [x] `[DONE]` Define `providers.toml` schema (key pools per provider) — **`crates/everyaios-core/src/providers.rs`: `[[providers]] name/base_url + [[providers.keys]] id/value` (ARCH/03 §3.2); `ProvidersFile::load_from` creates the file empty on first boot; `KeyPool::select()` round-robin across the pool, `NoKeys` error on empty; 6 unit tests green**
- [x] `[DONE]` Define `agents/*.md` blueprint format (name, model, tools, permissions) — **`crates/everyaios-core/src/blueprint.rs`: TOML frontmatter (`---` fences) with `name/model/tools/permissions` + markdown body; `load_blueprint` / `load_all` (non-recursive, sorted, missing dir = empty); 6 unit tests green (parse, defaults, missing-fence error, body extraction)**

### P0.7 UI Shell
- [x] `[DONE]` Create `ui/` — React SPA (Vite + React 19) — **`ui/` standalone npm project: `package.json` (react 19, react-dom, react-router-dom 6, @tauri-apps/api 2, vite 6, TS strict) + `vite.config.ts` (fixed port 1420 strict, Tauri env prefix, dist output) + `src/` React app (main/App/Chat/Settings/lib); `npm run build` green (38 modules, 222KB JS / 70KB gzip); tsc strict clean; `tauri.conf.json` build now points at `../ui/dist` with `npm --prefix ui` dev/build commands**
- [x] `[DONE]` Basic routing: Chat, Settings placeholder — **`HashRouter` (file://-safe) with sidebar nav (NavLink active states); `src/pages/Chat.tsx` (message thread + composer, welcome bubble) + `src/pages/Settings.tsx` (core-bridge probe cards + Guard-1 scan demo); dark brand theme in `styles.css`**
- [x] `[DONE]` Wire Tauri IPC: send command from React → receive in Rust → respond — **`ui/src/lib/tauri.ts` (`inTauri()` + `invoke` via `@tauri-apps/api/core`); Chat sends → `version` command, Settings probes → `version` / `core_boot_report` / `probe_vault` / `scan_text` (Guard-1); graceful browser-preview fallback (local echo / demo data) when not in the Tauri webview**
- [x] `[DONE]` Verify hot-reload works with `tauri dev` — **vite dev server verified on `localhost:1420` (HTTP 200, Vite 6.4.3 ready in 359ms, React-refresh injected — HMR live); `beforeDevCommand`/`devUrl` wiring in `tauri.conf.json` matches; full window boot previously verified headless on Xvfb (P0.2 round)**

**P0 Exit Criterion:** `cargo test` green; sidecar E2E echo green; `everyaios-core --version` prints; config loaded; vault opens/creates SQLCipher db; Tauri window shows React shell.

---

## PHASE 1 — Chat + BYOK Key-Rings (~4 weeks)

### P1.1 Key-Ring Vault (A2/A3)
- [ ] `[NOT DONE]` Design SQLCipher schema for key pools (providers.toml → vault rows)
- [ ] `[NOT DONE]` Implement key CRUD in everyaios-vault (J8): add/update/delete/list keys per provider
- [ ] `[NOT DONE]` Implement key status model: primary/standby/backup/suspended
- [ ] `[NOT DONE]` Implement routing policies: priority, round-robin, least-used
- [ ] `[NOT DONE]` Implement model_filter per key (restrict key to certain models)
- [ ] `[NOT DONE]` Implement cooldown logic: 429 → cooldown_s × 2^failures, cap 5min
- [ ] `[NOT DONE]` Implement max_429_switches (default 3) per call
- [ ] `[NOT DONE]` Implement key affinity: (provider, model, session_id) → same key for cache
- [ ] `[NOT DONE]` Implement per-key budget tracking: tokens_day, cost_day, daily/monthly caps
- [ ] `[NOT DONE]` Implement health tracking: fail_count, success_count, last_used_at
- [ ] `[NOT DONE]` Test: simulate 429 → verify immediate failover to next key
- [ ] `[NOT DONE]` Test: all keys exhausted → surface aggregated error

### P1.2 Provider Adapter (A1)
- [ ] `[NOT DONE]` Wire core-providers from APP as sidecar dep
- [ ] `[NOT DONE]` Implement credential-broker request path (doc 53 §2): sidecar sends provider/model/body + opaque key handle; Rust broker (`everyaios-vault` broker module) executes the HTTP call — injects auth headers, zeroize scrub
- [ ] `[NOT DONE]` Verify raw key never enters sidecar memory at any point (assert in test)
- [ ] `[NOT DONE]` Implement CES-style sealed channel (sidecar sees key_id only)
- [ ] `[NOT DONE]` Test: provider round-trip through the broker — fail-closed on broker down, zeroize scrub verified, no key material in sidecar memory (doc 53 §2.4)
- [ ] `[NOT DONE]` Test: streaming chat round-trip with real BYOK key (Anthropic or OpenAI)

### P1.3 Cache-Aware Costs (A9)
- [ ] `[NOT DONE]` Implement cost ledger table: token_usage(ts, session, provider, model, key_id, in, out, cache_read, cache_write, cost)
- [ ] `[NOT DONE]` Parse usage from provider response (handle AI SDK v6 cached-input normalization)
- [ ] `[NOT DONE]` Implement per-session $ budget enforcement (J11): default $2.00, kill on exceed
- [ ] `[NOT DONE]` Surface "stopped: $X limit" to UI on budget kill

### P1.4 Streaming Chat Loop (B1 base)
- [ ] `[NOT DONE]` Wire core-engine ConversationEngine from APP into coordinator (B1/H1 base)
- [ ] `[NOT DONE]` Implement streaming over IPC: token deltas → everyaios-core → Tauri events → UI
- [ ] `[NOT DONE]` Implement 33ms batch flush (StreamSession pattern from APP)
- [ ] `[NOT DONE]` Implement TTFT (time-to-first-token) event
- [ ] `[NOT DONE]` Implement cancellation: abort signal propagation from UI → Rust → sidecar → provider
- [ ] `[NOT DONE]` Strip mobile-only hooks (creditAware, shouldContinueStreaming → budget-aware)

### P1.5 System Prompt Assembly
- [ ] `[NOT DONE]` Port 12-segment stable-prefix prompt from core-ai
- [ ] `[NOT DONE]` Implement CACHE_BOUNDARY marker (byte-stable prefix above, volatile below)
- [ ] `[NOT DONE]` Implement `<untrusted>` envelope for RAG/web content
- [ ] `[NOT DONE]` Implement `<user_document>` wrapping for injection defense (J6)
- [ ] `[NOT DONE]` Verify: prefix bytes are identical across turns (test cache stability)

### P1.6 Chat UI
- [ ] `[NOT DONE]` Implement chat message list with streaming token display
- [ ] `[NOT DONE]` Implement message branching (fork from any message)
- [ ] `[NOT DONE]` Implement token streamer display (tokens/sec, context %, active key)
- [ ] `[NOT DONE]` Implement KaTeX math rendering (H7)
- [ ] `[NOT DONE]` Implement syntax-highlighted code blocks with Copy button (H7)
- [ ] `[NOT DONE]` Implement persona selector (SOUL.md presets)

### P1.7 OAuth Subscriptions (A4) — behind flag
- [ ] `[NOT DONE]` Implement ChatGPT Pro PKCE flow (encrypted token → vault)
- [ ] `[NOT DONE]` Implement Copilot device-code flow
- [ ] `[NOT DONE]` Implement Qwen device-code flow
- [ ] `[NOT DONE]` Same failover semantics as BYOK keys

### P1.8 Local Models (A5)
- [ ] `[NOT DONE]` Implement Ollama detection + managed spawn from everyaios-core
- [ ] `[NOT DONE]` Implement llamafile single-binary launch
- [ ] `[NOT DONE]` Implement context-window warning UI (≤15-20K)
- [ ] `[NOT DONE]` Implement GBNF grammar constraint passthrough for local models (B5)
- [ ] `[NOT DONE]` Test: local model tool call with GBNF → verify valid JSON always

### P1.9 Model Catalog (A6)
- [ ] `[NOT DONE]` Implement model catalog: per-provider model registry with capability hints (tools, vision, context window)
- [ ] `[NOT DONE]` Router consumes catalog hints for task-to-model selection (feeds A7 asymmetric tiering)

**P1 Exit Criterion:** Two keys under one provider auto-failover under simulated 429; streaming chat round-trip with real BYOK key; ledger rows correct; $ budget kills session.

---


## PHASE 2 — Browser Layer (~6 weeks)

### P2.1 CDP Client (everyaios-cdp, E1)
- [ ] `[NOT DONE]` Implement WebSocket CDP client (tokio-tungstenite)
- [ ] `[NOT DONE]` Implement Chrome/Edge discovery: `--remote-debugging-port=0` → read DevToolsActivePort
- [ ] `[NOT DONE]` Implement loopback-only host restriction (security)
- [ ] `[NOT DONE]` Implement per-target sessions (multiple tabs)
- [ ] `[NOT DONE]` Implement chrome-for-testing download fallback (if no system browser)
- [ ] `[NOT DONE]` Implement protocol-version tolerant client (handle Chrome version skew)

### P2.2 A11y Snapshot Engine (everyaios-browser, E3)
- [ ] `[NOT DONE]` Reference: agent-browser `snapshot.rs` semantics (doc 55) — role taxonomy (interactive/content/structural), zero-width-char filtering, compact `@eN` refs
- [ ] `[NOT DONE]` Implement Accessibility domain CDP calls → indented tree render
- [ ] `[NOT DONE]` Implement stable ref minting `[ref=eN]` scoped to (document_id, url)
- [ ] `[NOT DONE]` Implement `interactive` mode (actionables + headings only, ~90% token cut)
- [ ] `[NOT DONE]` Implement `full` mode (complete tree, depth caps 1..=100)
- [ ] `[NOT DONE]` Implement iframe stitching (inline child frames)
- [ ] `[NOT DONE]` Implement line-diff between snapshots with `+n/-n` markers
- [ ] `[NOT DONE]` Implement URL-change short-circuit (navigation → return full new snapshot)

### P2.3 Input Dispatch & 34-Tool Catalog (E2)
- [ ] `[NOT DONE]` Implement `act` tool: click/type/fill/press/hover/select/scroll/drag/dialog
- [ ] `[NOT DONE]` Implement `act` returns post-settle diff (no follow-up snapshot needed)
- [ ] `[NOT DONE]` Implement `navigate` tool (goto URL, back, forward, reload)
- [ ] `[NOT DONE]` Implement `snapshot` tool (calls everyaios-browser)
- [ ] `[NOT DONE]` Implement `diff` tool (compare two snapshots)
- [ ] `[NOT DONE]` Implement `read` tool (page → clean markdown via DOM walker)
- [ ] `[NOT DONE]` Upgrade `read` (doc 55, agent-browser `read.rs`): markdown negotiation (`Accept: text/markdown`, `.md` retry), nearest-ancestor `llms.txt`/`llms-full.txt` walk, `--filter`/`--outline` modes, no-browser HTTP path
- [ ] `[NOT DONE]` Implement `find` semantic locators (ARIA role + name/label/placeholder) — **post-v1 candidate (doc 55; NOT in P2 scope)**
- [ ] `[NOT DONE]` Implement `grep` tool (line matches in page content)
- [ ] `[NOT DONE]` Implement `screenshot` tool (JPEG capture)
- [ ] `[NOT DONE]` Implement `pdf` tool (print to PDF)
- [ ] `[NOT DONE]` Implement `wait` tool (text/selector/ms)
- [ ] `[NOT DONE]` Implement `evaluate` tool (CDP Runtime.evaluate)
- [ ] `[NOT DONE]` Implement `tabs` / `tab_groups` / `windows` / `history` management tools
- [ ] `[NOT DONE]` Implement `download` / `upload` with temp-file routing
- [ ] `[NOT DONE]` Implement `run` tool (→ everyaios-script, see P2.5)
- [ ] `[NOT DONE]` Register all 34 tools in everyaios-mcp (17 core interaction incl. `run` + `enhanced_snapshot` + bookmarks×6 + tab-groups×5 + window×5 — catalog ARCH/08 §8.2: 17+6+5+5+1 = 34) with annotations (F9: readOnlyHint/openWorldHint, ACP tool-kind taxonomy); + `file_ops`×3 workspace extension (E2) → 37 total
- [ ] `[NOT DONE]` Implement MCP tool profiles (core/network/state/debug/tabs/react/mobile) + paginated tool discovery + typed args with `extraArgs` parity (agent-browser pattern, doc 55)
- [ ] `[NOT DONE]` Post-v1 tool candidates (doc 55; **NOT in P2 scope**): `a11y_audit` (embedded axe-core, offline WCAG), annotated screenshots (numbered labels ↔ `@eN` refs), batch JSON command mode
- [ ] `[NOT DONE]` Add bookmark tools (6): get_bookmarks, create_bookmark, remove_bookmark, update_bookmark, move_bookmark, search_bookmarks
- [ ] `[NOT DONE]` Add tab group management tools (5): list_tab_groups, group_tabs, update_tab_group, ungroup_tabs, close_tab_group
- [ ] `[NOT DONE]` Add window management tools (5): list_windows, create_window, create_hidden_window, close_window, activate_window
- [ ] `[NOT DONE]` Add enhanced_snapshot tool (accessibility snapshot with stable refs + paint-order filtering)
- [ ] `[NOT DONE]` Add file operation tools (3): save_pdf_enhanced, save_screenshot_enhanced, download_file

### P2.4 Tiered Engine Stack (E10)
- [ ] `[NOT DONE]` Implement tier-0 static extraction: reqwest + HTML→markdown parser
- [ ] `[NOT DONE]` Integrate Obscura (doc 55): spawn `obscura serve` binary (loopback default), connect CDP, verify ~30MB RSS; leverage embedded MCP (32 tools) + `LP.getMarkdown` where applicable
- [ ] `[NOT DONE]` Obscura security flags (doc 55 §2 / 06 §6.15): SSRF defaults (loopback/RFC1918 blocked, `--allow-private-network` opt-in), `file://` blocked by default, bounded `--max-connections`
- [ ] `[NOT DONE]` Browser network containment (doc 55 §1 / 06 §6.15): `--allowed-domains` → WebRTC (RTCPeerConnection) disable + worker fail-closed guards + content boundaries + max-output
- [ ] `[NOT DONE]` Integrate Lightpanda: Docker/binary spawn, CDP connection (opt-in, AGPL spawn-only); driver pattern reference: agent-browser `native/cdp/lightpanda.rs` (doc 55)
- [ ] `[NOT DONE]` Implement escalation logic (E8): tier 0→1→2 based on failure/JS-need/login-need (authenticated scrape → RAG)
- [ ] `[NOT DONE]` Test: scrape task runs on Obscura, escalates to Chrome only on JS-render need

### P2.5 Script-Eval Sandbox (everyaios-script, E4)
- [ ] `[NOT DONE]` Integrate rquickjs crate with async runtime
- [ ] `[NOT DONE]` Implement limits: 64MB heap, 512KB stack, 30s timeout, 1K log lines, 2MB return
- [ ] `[NOT DONE]` Implement `browser` SDK surface (pages, observe, input, nav, read, grep, etc.)
- [ ] `[NOT DONE]` Implement InnerCallHook: every primitive (a) authorized (b) recorded (c) page-creations claimed
- [ ] `[NOT DONE]` Implement ownership filtering: pages.list() returns mine/user/other-agent
- [ ] `[NOT DONE]` Test: run multi-step script → verify every primitive has an audit row

### P2.6 Tab Ownership (E6)
- [ ] `[NOT DONE]` Implement ownership model: mine / user / other-agent per tab
- [ ] `[NOT DONE]` Implement claims table (tab_claims in audit DB)
- [ ] `[NOT DONE]` Implement group-per-agent (agent session → tab group)
- [ ] `[NOT DONE]` Test: agent cannot close a user tab

### P2.7 Session Vault (E11/E7/E13)
- [ ] `[NOT DONE]` Design SQLCipher schema: per-site **full storage context** — cookie jars (host-keyed) + localStorage + sessionStorage + IndexedDB + auth headers; Chrome raw-storage decode (`0x00` = UTF-16-LE, `0x01` = ISO-8859-1 — Steel `leveldb` pattern, doc 55)
- [ ] `[NOT DONE]` Implement `persist`/`restore` flag per session (stateful workflows survive restarts — Steel pattern, doc 55)
- [ ] `[NOT DONE]` Implement multi-account per site (personal/work/test = separate Session records)
- [ ] `[NOT DONE]` Implement capture path 1 (E7): sign-in-in-browser → Page.getCookies → seal to vault
- [ ] `[NOT DONE]` Implement capture path 2 (E13): session inheritance (attach to user's Chrome profile via debug port)
- [ ] `[NOT DONE]` Implement Trust-Ladder-gated access (J1): agent never sees raw cookies
- [ ] `[NOT DONE]` Implement cookie injection: vault → browser context at request time, revoke at session end
- [ ] `[NOT DONE]` Implement rotation: 429/blocked/expired → next authorized account
- [ ] `[NOT DONE]` Implement expiry tracking + re-auth nudge card
- [ ] `[NOT DONE]` Implement usage audit: session_uses rows per account per site
- [ ] `[NOT DONE]` Test: round-trip (capture → grant → inject → revoke; agent never sees cookies)

### P2.8 Challenge Handler (E12)
- [ ] `[NOT DONE]` Implement PoW captcha solver (Altcha/Friendly Captcha/Turnstile hidden) in everyaios-core
- [ ] `[NOT DONE]` Implement human-in-loop pass-through: surface tab in visible webview, user solves
- [ ] `[NOT DONE]` Implement LLM visual-grounding: snapshot → act for simple visual challenges
- [ ] `[NOT DONE]` Implement optional BYO solver API hook (CapSolver/2Captcha, user's own key)
- [ ] `[NOT DONE]` Test: PoW challenge auto-solved locally

### P2.9 Behavioral Realism (E14)
- [ ] `[NOT DONE]` Implement Bézier mouse curves for click/hover dispatch
- [ ] `[NOT DONE]` Implement per-key typing cadence with natural variance
- [ ] `[NOT DONE]` Make per-site configurable (some sites need it, most don't)

### P2.10 Session Replay (E5)
- [ ] `[NOT DONE]` Implement injected recorder (CDP Page.addScriptToEvaluateOnNewDocument)
- [ ] `[NOT DONE]` Implement NDJSON batch streaming to everyaios-audit ingest (J5: append-only audit, receipts)
- [ ] `[NOT DONE]` Implement sticky `has_gap` flag on dropped/malformed lines
- [ ] `[NOT DONE]` Implement recording index (dedupe, one-tx commit)
- [ ] `[NOT DONE]` Implement storage: ~/.everyaios/replays/ NDJSON + screenshots/ JPEGs
- [ ] `[NOT DONE]` Implement 7-day retention default + configurable wipe
- [ ] `[NOT DONE]` Implement durable event log + idempotency classes (doc 53 §4): safe-retry / unsafe / same-key / confirm-after-uncertain over the append-only audit

**P2 Exit Criterion:** navigate→snapshot→act→diff E2E; ownership test passes; Obscura scrape + escalate; session-vault round-trip (agent never sees cookies); PoW auto-solved.

---


## PHASE 3 — Script-Eval + Replay + Cockpit (~4 weeks)

### P3.1 Replay & Audit UI (H3)
- [ ] `[NOT DONE]` Implement scrubber UI: timeline of actions per session
- [ ] `[NOT DONE]` Implement per-step screenshot display synced to timeline
- [ ] `[NOT DONE]` Implement searchable sessions list
- [ ] `[NOT DONE]` Implement Watch mode: live view of agent's current tab
- [ ] `[NOT DONE]` Implement Stop button: kills agent loop from cockpit

### P3.2 Cockpit / Ambient Flight Deck (H2)
- [ ] `[NOT DONE]` Implement quiet mode: single-sentence status in tray
- [ ] `[NOT DONE]` Implement slide-over panel: live action cards + token counters
- [ ] `[NOT DONE]` Implement STOP / UNDO buttons (single-click kill or revert last action)
- [ ] `[NOT DONE]` Implement MCQ interrupt cards (on circuit-break): display 4 options
- [ ] `[NOT DONE]` Implement agent cards: per-agent status, model, tokens used, elapsed

### P3.3 Distributed Tracing (J14)
- [ ] `[NOT DONE]` Integrate opentelemetry-rust in everyaios-core
- [ ] `[NOT DONE]` Propagate trace_id across Rust→sidecar→provider→sandbox boundaries
- [ ] `[NOT DONE]` Add trace_id + span_id columns to audit table
- [ ] `[NOT DONE]` Console + log-file export (Jaeger/OTLP post-v1)

**P3 Exit Criterion:** Run audited script; replay with has_gap; Watch/Stop works; cockpit shows live agent cards.

---

## PHASE 4 — Office Engine (~5 weeks)

### P4.1 Word Block-Patch Engine (D1)
- [ ] `[NOT DONE]` Implement ZIP open + parts index parser
- [ ] `[NOT DONE]` Implement block tree construction (anchored with docxIndex/addresses)
- [ ] `[NOT DONE]` Implement plain-text rendering from block tree (for LLM editing)
- [ ] `[NOT DONE]` Implement patch renderer: plain-text edits → minimal w:t prefix/suffix XML patches
- [ ] `[NOT DONE]` Implement ZIP rewrite: modified parts only, everything else byte-copied
- [ ] `[NOT DONE]` Implement headers/footers/tables/sections as separate blocks
- [ ] `[NOT DONE]` Test: round-trip (open → edit → save → LibreOffice reopen → assert byte-stable untouched parts)

### P4.2 Excel Engine (D2)
- [ ] `[NOT DONE]` Integrate calamine crate for fast xlsx reading
- [ ] `[NOT DONE]` Integrate IronCalc (v0.7.x) as recalc sidecar binary
- [ ] `[NOT DONE]` Implement workbook DSL (cell-address, formula-shift, sort-range, flash-fill, pivot)
- [ ] `[NOT DONE]` Implement deterministic planner: regex NLP → workbook DSL (zero-LLM common ops)
- [ ] `[NOT DONE]` Implement surgical part-patch: xl/worksheets/sheetN.xml, xl/sharedStrings.xml
- [ ] `[NOT DONE]` Implement 100% math integrity rule: numeric claims → IronCalc only, never LLM
- [ ] `[NOT DONE]` Implement planner fallback: when regex DSL can't parse → LLM-direct (audit flagged, permission-gated)
- [ ] `[NOT DONE]` Test: formula recalc golden cases (SUM, VLOOKUP, IF, COUNTIF, dynamic arrays)
- [ ] `[NOT DONE]` Implement virtualized 100K+ row table view in UI

### P4.3 PowerPoint Engine (D3)
- [ ] `[NOT DONE]` Implement surgical part-editing: ppt/slides/slideN.xml text runs, bullets, shapes
- [ ] `[NOT DONE]` Implement slide add/remove: clone part + rels + Content_Types registration
- [ ] `[NOT DONE]` Test: pptx add/remove slide round-trip

### P4.4 PDF Engine (D4)
- [ ] `[NOT DONE]` Implement pdf.js-class renderer in webview
- [ ] `[NOT DONE]` Implement form-fill + annotation via pdf-lib (AcroForms)
- [ ] `[NOT DONE]` Implement text-swap via lopdf Rust bridge (exact-match only)
- [ ] `[NOT DONE]` Implement redaction (fill glyph boxes + remove text streams)
- [ ] `[NOT DONE]` Implement re-author path (structural edits → generate new PDF)
- [ ] `[NOT DONE]` Test: pdf form-fill round-trip

### P4.5 Conformance & Rollback (D6/D7)
- [ ] `[NOT DONE]` Implement snapshotBefore: keep pre-edit ZIP for 1-click undo
- [ ] `[NOT DONE]` Implement atomic writes: write temp → fsync → rename
- [ ] `[NOT DONE]` Wire LibreOffice headless in CI: open edited file → assert no repair warnings
- [ ] `[NOT DONE]` Implement byte-stability assertions (zip-level diff of untouched parts)

### P4.6 Legacy Formats (D8)
- [ ] `[NOT DONE]` Implement .doc/.xls/.ppt → convert to modern format on open (headless soffice)
- [ ] `[NOT DONE]` Surface as read-only with "edit as new .docx" option

### P4.7 Office UI (H5)
- [ ] `[NOT DONE]` Implement docx viewer (styled paragraphs, tables, images from block tree)
- [ ] `[NOT DONE]` Implement xlsx viewer (virtualized grid, formula bar, cell selection)
- [ ] `[NOT DONE]` Implement pptx viewer (slides as styled divs, notes panel)
- [ ] `[NOT DONE]` Implement PDF viewer (pdf.js-based)
- [ ] `[NOT DONE]` Implement chat overlay on any open document (page-scoped questions)

### P4.8 Storage Intelligence (D9–D11, G7 — doc 49)
- [ ] `[NOT DONE]` Implement everyaios-storage crate: parallel work-stealing walker (crossbeam-deque + `ignore`, cycle/device-boundary safe)
- [ ] `[NOT DONE]` Implement immutable arena snapshots (u32-indexed FileNode, bytemuck, arc_swap @~100ms cadence) + zstd save/load
- [ ] `[NOT DONE]` Implement squarified treemap layout + per-dir aggregation (stable extension-hashing colors)
- [ ] `[NOT DONE]` Implement 7-stage duplicate detection (size → xxHash3 prefix/suffix → BLAKE3, hardlink-aware, optional reflink)
- [ ] `[NOT DONE]` Implement large-file finder (top-N by size/age + filters)
- [ ] `[NOT DONE]` Implement Guard-2-ticketed cleanup actions (recycle-bin-aware; never bypass dual-guard)
- [ ] `[NOT DONE]` Implement G7: SQLite FTS5 filename index + notify-debouncer incremental updates + optional OS-native hooks (Everything/mdfind/Baloo)
- [ ] `[NOT DONE]` Wire storage tools into agent registry (disk_scan, disk_duplicates, disk_large_files, disk_cleanup, filename_search); heavy scans respect J16 battery-awareness
- [ ] `[NOT DONE]` Implement D12 storage health & analytics: drive-threshold monitoring (90% full), agent-suggested cleanup plans (Guard-2 approved), dashboard (free space / top files / duplicates / trends)

**P4 Exit Criterion:** Round-trip byte-stable via LibreOffice oracle; IronCalc recalc golden cases; pptx add/remove; pdf form-fill; snapshotBefore rollback works; **scan fixture tree → treemap data + dedup report; zstd snapshot round-trip; FTS5 filename query <50ms** (P4.8).

---


## PHASE 5 — Memory Fusion + Token Economy (~5 weeks)

### P5.1 Multi-Signal Retrieval Fusion (C1/C3, Algorithm #18)
- [ ] `[NOT DONE]` Wire core-memory + core-files from APP into coordinator
- [ ] `[NOT DONE]` Implement intent classifier: memory vs fact vs event vs document
- [ ] `[NOT DONE]` Implement parallel signal execution (C4): FTS5/BM25 vectorless default + optional vector signal
- [ ] `[NOT DONE]` Implement optional embedding path (C5): on-device bge-micro/gte-small, int8/vec0 — only when user enables
- [ ] `[NOT DONE]` Implement weighted RRF score fusion (mem0-style single fused score)
- [ ] `[NOT DONE]` Implement cross-encoder hybrid rerank (Algorithm #19)
- [ ] `[NOT DONE]` Implement deduplication + smart snippets (windows around matches)
- [ ] `[NOT DONE]` Implement per-type budget caps (file 2K, page 1.5K, search 1K, memory 600, tool 1K)
- [ ] `[NOT DONE]` Benchmark: multi-hop + temporal queries vs plain BM25 (target: mem0-class gains)
- [ ] `[NOT DONE]` Implement RAG chunk-min-size merging (Algorithm #29): forward-only merge of under-sized chunks, markdown-aware boundaries (C3/D5)

### P5.2 LadybugDB Graph Backend (C6, Algorithm #30)
- [ ] `[NOT DONE]` Integrate LadybugDB C++ library (Python/Node bindings or Rust FFI)
- [ ] `[NOT DONE]` Implement schema: EntityNode, EpisodicNode, typed edges (supports/contradicts/derived-from)
- [ ] `[NOT DONE]` Implement temporal edge-versioning (graphiti pattern)
- [ ] `[NOT DONE]` Implement Spreading Activation over LadybugDB adjacency (Algorithm #6, retest)
- [ ] `[NOT DONE]` Implement graph query depth cap (d=2, top-k=15)
- [ ] `[NOT DONE]` Wire into multi-signal fusion (S3 signal)

### P5.3 Letta-Style Paging (C2, Algorithm #20)
- [ ] `[NOT DONE]` Implement 3 memory surfaces: core (≤600 tok) / archival / recall
- [ ] `[NOT DONE]` Implement agent memory tools: read/write/search/forget
- [ ] `[NOT DONE]` Implement context planner enforcement of paging budgets (C7: warm-set injection, scope-leakage floors, 0ms TTFT)
- [ ] `[NOT DONE]` Implement memory writes queued to turn boundaries (protect prefix cache)

### P5.4 Ghost Context Prevention (ARCH/07 §7.5.1)
- [ ] `[NOT DONE]` Integrate Rust `notify` crate for filesystem events
- [ ] `[NOT DONE]` Implement tombstone eviction on file delete: atomic FTS5 + vec + graph removal
- [ ] `[NOT DONE]` Implement re-path on file rename: update source_path (zero re-embedding)
- [ ] `[NOT DONE]` Test: rename file → verify retrieval returns new path, not old

### P5.5 ACT-R Activation + Spontaneous Recall (C10, Algorithm #32)
- [ ] `[NOT DONE]` Implement retention decay: half_life × log1p(strength)
- [ ] `[NOT DONE]` Implement importance floor: memories with importance ≥ 8 never auto-forgotten
- [ ] `[NOT DONE]` Implement associative recall: semantic + keyword + recency + graph in one query
- [ ] `[NOT DONE]` Implement typed relational edges in LadybugDB (supports/contradicts/derived-from)
- [ ] `[NOT DONE]` Implement spontaneous recall channel: pre-turn hook → derive queries → inject

### P5.6 Taste Profile (C9, Algorithm #31)
- [ ] `[NOT DONE]` Implement taste store: `~/.everyaios/taste/` (global) + per-repo `.everyaios-taste/`
- [ ] `[NOT DONE]` Implement learning hooks: detect accept/reject/edit via correction-detector + audit
- [ ] `[NOT DONE]` Implement confidence-scored rules (0–1 per preference)
- [ ] `[NOT DONE]` Implement stable-prefix injection (taste rules as symbolic prior at generation)
- [ ] `[NOT DONE]` Implement shareable markdown export

### P5.7 Compaction Pipeline (Algorithm #21)
- [ ] `[NOT DONE]` Implement snip stage: tool_result_snip_ratio=0.6 (stale → head/tail anchor)
- [ ] `[NOT DONE]` Implement soft compact: soft_compact_ratio=0.5 (notice-only)
- [ ] `[NOT DONE]` Implement summarize: BrowserOS callSummarizer (timeout + abort = fail-open)
- [ ] `[NOT DONE]` Implement findSafeSplitPoint (never split mid-turn)
- [ ] `[NOT DONE]` Implement slidingWindow (keep recent N tokens, summarize rest)
- [ ] `[NOT DONE]` Implement force compact: compact_force_ratio=0.9
- [ ] `[NOT DONE]` Implement Janus structural passes: dedup, regex collapse, AST prune
- [ ] `[NOT DONE]` Implement prefix_dirty flag: track cache-break events (key rotation, provider switch)
- [ ] `[NOT DONE]` Implement Hermes 3-layer tool-result persistence (preview+path, per-turn 200K, 0.15/0.30)
- [ ] `[NOT DONE]` Implement OpenCode PRUNE_PROTECT 40K tool-output erasure
- [ ] `[NOT DONE]` Test: compaction triggers at ratios without breaking loop
- [ ] `[NOT DONE]` Integrate Graphiti-pattern temporal KG — entities with validity windows, bi-temporal tracking
- [ ] `[NOT DONE]` Implement Cognee-pattern remember/recall/forget/improve API for memory operations
- [ ] `[NOT DONE]` Add RTK-style output compression — per-command parsers for shell tool results (60-90% reduction)
- [ ] `[NOT DONE]` Implement SeekStorm-pattern hybrid search (vector + BM25) as embedded Rust library

### P5.8 Pass-by-Reference Context (C10)
- [ ] `[NOT DONE]` Implement ref handles for files/datasets/tool results
- [ ] `[NOT DONE]` Implement bounded previews (head/tail + type metadata + row/byte counts)
- [ ] `[NOT DONE]` Agent queries via rquickjs script-eval instead of serializing payloads
- [ ] `[NOT DONE]` Test: 10MB file queried via ref-preview keeps context ≤2K tokens

### P5.9 Token/Cost Dashboard UI (H9)
- [ ] `[NOT DONE]` Implement per-key cost display (tokens/day, est. cost/day)
- [ ] `[NOT DONE]` Implement per-session cost breakdown
- [ ] `[NOT DONE]` Implement cache-hit rate display per provider
- [ ] `[NOT DONE]` Implement live token streamer in chat (tokens/sec, context %)

### P5.10 Retest Built Algorithms (🔁)
- [ ] `[NOT DONE]` Run all 17 built algorithm test suites in desktop sidecar runtime
- [ ] `[NOT DONE]` Fix any failures from webview IPC / sidecar process model differences
- [ ] `[NOT DONE]` Benchmark spreading-activation, phantom-thread, temporal-anticipation on desktop

**P5 Exit Criterion:** Retrieval benchmark beats BM25; pass-by-reference ≤2K tokens for 10MB file; compaction triggers correctly; $/token dashboard shows; 17 built algorithms pass on desktop.

---


## PHASE 6 — Orchestration + Connectors (~5 weeks)

### P6.1 Blueprint Engine (B2)
- [ ] `[NOT DONE]` Implement .md blueprint parser → AgentConfig[] registry
- [ ] `[NOT DONE]` Implement continuous plan rewrite (agents update their own status blocks)
- [ ] `[NOT DONE]` Implement dependency resolution between blueprint tasks
- [ ] `[NOT DONE]` Implement resume-after-reboot (session checkpointing at turn boundaries)
- [ ] `[NOT DONE]` Implement DAG state machine for multi-step workflows
- [ ] `[NOT DONE]` Implement checkpoint freeze on circuit-break (B6 MCQ pattern)

### P6.2 Sub-Agents (B3/B4)
- [ ] `[NOT DONE]` Implement fresh-context sub-agent spawn (own conversation, own workspace)
- [ ] `[NOT DONE]` Implement DELEGATE_BLOCKED_TOOLS (delegate/clarify/memory/send_message/cronjob)
- [ ] `[NOT DONE]` Implement parent sees only summary (not full child context)
- [ ] `[NOT DONE]` Implement inter-agent messaging: peer-review, cross-check, request sub-routines
- [ ] `[NOT DONE]` Implement no-recursive-spawn guard
- [ ] `[NOT DONE]` Implement batch parallel mode (multiple sub-agents concurrently)
- [ ] `[NOT DONE]` Test: two spec-driven agents with different models run a plan end-to-end

### P6.3 Iteration Budgets (B6)
- [ ] `[NOT DONE]` Implement parent max_iterations=500, subagent max=50
- [ ] `[NOT DONE]` Implement subagent_depth=2 (parent → child, no grandchildren)
- [ ] `[NOT DONE]` Implement subagent timeout: 900s custom / 1800s global
- [ ] `[NOT DONE]` Implement max_concurrent_subagents=3, max_total_per_run=6
- [ ] `[NOT DONE]` Implement execute_code refund (deterministic code shouldn't count)
- [ ] `[NOT DONE]` Implement loop detector: hash last N tool calls, 3x repeat → interrupt
- [ ] `[NOT DONE]` Implement MCQ interrupt card on circuit-break (UI integration with H2)

### P6.4 Scheduled Tasks (B7)
- [ ] `[NOT DONE]` Reference: cronflow workflow-engine design (doc 56 §3) — HITL pause-with-timeout as a first-class state-machine state, webhook triggers w/ schema validation, retry w/ backoff+jitter+clamp (⚠️ no LICENSE file → pattern-only) for the H22 automation builder
- [ ] `[NOT DONE]` Implement cron/interval/event/webhook triggers (F11: loopback listeners + webhook ingress)
- [ ] `[NOT DONE]` Implement nudge sentinels (detect repeating patterns → suggest schedule)
- [ ] `[NOT DONE]` Implement battery-aware scheduling (suppress on battery)
- [ ] `[NOT DONE]` Implement tray daemon headless execution (H11)
- [ ] `[NOT DONE]` Implement scheduled tasks UI: create from chat + settings (H14)
- [ ] `[NOT DONE]` Test: scheduled task fires headless

### P6.5 Crystallization (B8, Algorithm #5)
- [ ] `[NOT DONE]` Implement multi-step workflow detection (successful N times)
- [ ] `[NOT DONE]` Implement non-cognitive step classification (waits, triggers, transforms, notifications)
- [ ] `[NOT DONE]` Implement compilation to deterministic TS/Python script
- [ ] `[NOT DONE]` Store compiled scripts in skill registry (~/.everyaios/skills/)
- [ ] `[NOT DONE]` Implement decrystallize fallback (output drift → fall back to LLM)
- [ ] `[NOT DONE]` Test: crystallized task runs at 0 tokens, produces same output

### P6.6 Connector Hub (F1-F5)
- [ ] `[NOT DONE]` Wire core-connectors from APP as coordinator dep (F2: 27+ native adapters)
- [ ] `[NOT DONE]` Implement hub routing engine: native → Composio → Zapier → Nango → Auth Bridge
- [ ] `[NOT DONE]` Implement no-double-connect logic (if native adapter exists, skip Composio)
- [ ] `[NOT DONE]` Implement browser-session connectors (F3): drive Gmail/Notion/Linear via CDP + vault
- [ ] `[NOT DONE]` Implement Local Auth Bridge (F4): PKCE client, no secret, local token manager
- [ ] `[NOT DONE]` Implement Composio SDK attach (user-key, optional)
- [ ] `[NOT DONE]` Implement Zapier MCP attach (user-key, optional)
- [ ] `[NOT DONE]` Implement Nango self-hosted attach (optional)
- [ ] `[NOT DONE]` Implement usage metering per connector
- [ ] `[NOT DONE]` Test: Gmail-via-browser-session flow with dev credentials

### P6.7 MCP Client/Server (F6/F7)
- [ ] `[NOT DONE]` Wire core-search MCP client from APP (consume external MCP servers)
- [ ] `[NOT DONE]` Implement tool catalog reconciliation (external MCP tools → unified registry)
- [ ] `[NOT DONE]` Implement MCP server in everyaios-mcp: stateless Streamable HTTP (2026-07-28 spec)
- [ ] `[NOT DONE]` Expose all 34 browser tools + connector tools via MCP endpoint
- [ ] `[NOT DONE]` Test: external client (Claude Code) connects to our MCP endpoint, calls snapshot

### P6.8 Harness-Driving via ACP (F12/J17)
- [ ] `[NOT DONE]` Integrate official ACP Rust SDK (`agent-client-protocol` crate)
- [ ] `[NOT DONE]` Implement ACP client: `initialize` handshake (protocolVersion + capabilities)
- [ ] `[NOT DONE]` Implement `session/new` to spawn external agent CLIs as ACP agents
- [ ] `[NOT DONE]` Implement `session/request_permission` → Trust Ladder + Guard-2 cards
- [ ] `[NOT DONE]` Implement `session/update` → everyaios-audit NDJSON logging
- [ ] `[NOT DONE]` Implement `session/cancel` → watchdog/budget kill
- [ ] `[NOT DONE]` Implement harness installer (F8): plan-before-touch, ownership markers
- [ ] `[NOT DONE]` Test: two external agent CLIs run side-by-side via ACP (initialize + permission + audit)
- [ ] `[NOT DONE]` **Aider already in the F12 harness list** (added doc 52) — remaining work: surgical-hierarchy routing (brain → core → surgeon, doc 52 §1); test Aider driven via ACP with SEARCH/REPLACE edits
- [ ] `[NOT DONE]` Add **Copilot CLI** to the F12 harness list (doc 56 §4 — closed, custom license → drive via ACP like any harness, never a dependency) + LSP-config diagnostics pattern (`lsp-config.json`; open reference = Warp `lsp` crate, doc 56 W4); ACP adapter reference: cowork-forge `acp/client.rs` + `agents/external_coding_agent.rs` (doc 56 C2)

### P6.9 Messaging Bridges (F13)
- [ ] `[NOT DONE]` Design adapter interface: message-in → agent loop → reply-out
- [ ] `[NOT DONE]` Implement WhatsApp adapter (Secure OpenClaw pattern)
- [ ] `[NOT DONE]` Implement Telegram adapter
- [ ] `[NOT DONE]` Implement Signal adapter
- [ ] `[NOT DONE]` Implement iMessage adapter (macOS only)
- [ ] `[NOT DONE]` Implement scheduled reminders via messaging
- [ ] `[NOT DONE]` Implement memory reuse across messaging sessions
- [ ] `[NOT DONE]` Test: messaging round-trip via stub adapter

### P6.10 Asymmetric Tiering (A7)
- [ ] `[NOT DONE]` Implement planner_model config (frontier model for planning)
- [ ] `[NOT DONE]` Implement subagent_models config (cheap/local for grinding)
- [ ] `[NOT DONE]` Implement per-agent model override via blueprint .md
- [ ] `[NOT DONE]` Implement dynamic model routing based on task classification
- [ ] `[NOT DONE]` Implement shortest-path tier routing (doc 53 §5): tasks select the minimal tier chain (simple edit → direct; full chain only for broad refactors)

### P6.11 Email/Calendar Connectors (F14/F15 — doc 50)
- [ ] `[NOT DONE]` Implement Gmail connector via Auth Bridge OAuth (gmail.readonly/send/modify scopes; tokens in everyaios-vault, background refresh)
- [ ] `[NOT DONE]` Implement Google Calendar connector (event CRUD, availability, ICS import/export)
- [ ] `[NOT DONE]` Implement provider-agnostic IMAP/SMTP fallback (imapflow or async-imap + lettre; IMAP IDLE for inbox push)
- [ ] `[NOT DONE]` Implement email tools: read/search/send/reply/triage (guard-ticketed — send/reply are mutations)
- [ ] `[NOT DONE]` Implement calendar nudge integration with scheduled tasks (B7): suggest schedule from email context
- [ ] `[NOT DONE]` Browser-session Gmail/Outlook flow as last resort (extends the existing Gmail-via-browser test)

**P6 Exit Criterion:** Two spec-driven agents run a plan; scheduled task fires; harness entry managed; two external CLIs via ACP; messaging round-trip via stub; Gmail-via-browser flow works; email read→summarize→reply round-trip via stub (F14).

---


## PHASE 7 — Forge + Guardrails Hardening (~4 weeks)

### P7.1 Forge Runtime (I1/I4)
- [ ] `[NOT DONE]` Implement LSP-backed diagnostics (doc 56 W4): rust-analyzer/typescript-language-server/pyright/clangd/go via Warp `lsp`-crate pattern — precise errors without full-file context (Copilot CLI `lsp-config.json` pattern). **Three-stage diagnostics, no overlap:** LSP = live during editing → lint/test reflection (ships in P11.5.9) = post-edit build-level gate → rtk output rules (ARCH/05 §5.10) = tool-result compression at injection
- [ ] `[NOT DONE]` Implement write→sandbox→test→iterate loop
- [ ] `[NOT DONE]` Implement TDD loop: auto-generate tests, read stderr, rewrite until green
- [ ] `[NOT DONE]` Implement code execution in rquickjs sandbox (reuse everyaios-script)
- [ ] `[NOT DONE]` Implement optional Docker sandbox for heavy/data workflows
- [ ] `[NOT DONE]` Implement ECC guardrails (I5): plan-before-build, session scanning

### P7.2 Skill Registry (I2)
- [ ] `[NOT DONE]` Implement `~/.everyaios/skills/` directory scanner
- [ ] `[NOT DONE]` Implement SKILL.md manifest format (name, description, tools, triggers)
- [ ] `[NOT DONE]` Implement ownership markers (who created, when, version)
- [ ] `[NOT DONE]` Implement auto-inject into planner (skill index tier in system prompt)
- [ ] `[NOT DONE]` Implement MAX_ACTIVE_SKILLS=20 cap (Agent Zero pattern)
- [ ] `[NOT DONE]` Implement skill search scoring for relevance matching
- [ ] `[NOT DONE]` Test: agent writes a skill → survives restart → callable next session

### P7.3 Extension/Plugin ABI (I6)
- [ ] `[NOT DONE]` Define manifest.toml schema: abi_version, contributes, capabilities, trust_flags
- [ ] `[NOT DONE]` Implement schema validation at load (reject invalid manifests)
- [ ] `[NOT DONE]` Implement plugin registry: scan ~/.everyaios/plugins/ at boot
- [ ] `[NOT DONE]` Implement lazy activation: registered-but-not-loaded until first use
- [ ] `[NOT DONE]` Implement CapabilityGranter in everyaios-guard: manifest allow-list ∧ host grant
- [ ] `[NOT DONE]` Implement `*`/`**` argument wildcard matcher (port Zed's unit-tested pattern)
- [ ] `[NOT DONE]` Implement per-extension fail-closed trust flags (Hermes allowed_* pattern)
- [ ] `[NOT DONE]` Implement explicit agent-binding (capabilities bound to specific agents, never global)
- [ ] `[NOT DONE]` Implement host-owned facades: ctx.llm, ctx.files (capability-scoped), ctx.approval()
- [ ] `[NOT DONE]` Implement dogfood rule: first-party office/connector/search ship as plugins
- [ ] `[NOT DONE]` Test: manifest rejects bad bundles; capability blocks unlisted exec; lazy = registered-not-loaded

### P7.4 Guard-1 Hardening (J2)
- [ ] `[NOT DONE]` Compile full regex blocklist: rm -rf, mkfs, dd, drop database, format, fork bombs, key exfiltration, .git destruction, home wipes
- [ ] `[NOT DONE]` Implement pre-exec scan of every generated shell string, filesystem path, URL
- [ ] `[NOT DONE]` Implement URL floors: `file://` only inside granted roots; scheme guard
- [ ] `[NOT DONE]` Load cyber red-team corpus (doc 26) as adversarial test suite
- [ ] `[NOT DONE]` Test: 100% of red-team pattern list blocked
- [ ] `[NOT DONE]` Implement authorization ticket contract in everyaios-guard (doc 53 §3): ticket_id/agent_id/session_id/tool_id/operation/args-hash/paths/expiry/single-use/approval-source/risk/audit-seq

### P7.5 Guard-2 UX Polish (J3/H8)
- [ ] `[NOT DONE]` Implement native OS diff card rendering via Tauri IPC (not webview JS)
- [ ] `[NOT DONE]` Show: exact file paths, script lines, execution target, env vars, network destinations
- [ ] `[NOT DONE]` Implement approval/denial audit logging with receipt
- [ ] `[NOT DONE]` Implement web-action confirm dialogs (checkout, payment, sensitive ops)
- [ ] `[NOT DONE]` Implement J21 escalation rules: `~/.everyaios/permissions.toml` (delete=always_ask, multi_file_edit=ask_if_gt_5, external_network=ask_if_new_domain, terminal_shell=ask_if_destructive; min_confidence_for_auto) + structured decision-package renderer on Guard-2 cards; approvals/denials → correction-detector + taste profile (doc 52 §2)

### P7.6 Prompt-Injection Defense (J6)
- [ ] `[NOT DONE]` Implement context scan: every ingested file/webpage/memory block scanned for injection patterns
- [ ] `[NOT DONE]` Implement `<user_document>` delimiter wrapping for untrusted content
- [ ] `[NOT DONE]` Implement tool-result sanitization: outputs as text/JSON, never as instructions
- [ ] `[NOT DONE]` Implement escape hatches: estop (global stop, tray-accessible)
- [ ] `[NOT DONE]` Test: injected "ignore previous instructions" in a fetched webpage → does NOT execute

### P7.7 Path Floor Fuzz Testing (J4)
- [ ] `[NOT DONE]` Implement canonicalization (resolve symlinks, normalize paths)
- [ ] `[NOT DONE]` Implement symlink-safe boundary enforcement
- [ ] `[NOT DONE]` Implement `..` escape prevention
- [ ] `[NOT DONE]` Run path-floor fuzz test (thousands of adversarial paths) → 0 escapes
- [ ] `[NOT DONE]` Implement profile-gated hooks (minimal/standard/strict) — ECC pattern (doc 46)
- [ ] `[NOT DONE]` Upgrade everyaios-audit to Merkle hash-chain (OpenFang pattern) — tamper-evident log
- [ ] `[NOT DONE]` Implement AgentShield config scanning — scan everyaios.toml, blueprints, MCP configs for injection
- [ ] `[NOT DONE]` Add Ed25519 signed extension manifests (OpenFang pattern)
- [ ] `[NOT DONE]` Add loop guard — SHA256 circuit breaker to prevent infinite agent loops
- [ ] `[NOT DONE]` Add session repair (7-phase validation) for corrupt session recovery

**P7 Exit Criterion:** Agent writes skill that survives restart; plugin manifest rejects bad bundles; capability blocks unlisted exec; 100% red-team blocked; path-floor fuzz = 0.

---

## PHASE 8 — Product Polish + Release (~3 weeks)

### P8.1 Reader (H6)
- [ ] `[NOT DONE]` Port PDF/EPUB/web/markdown universal reader from APP (D5: markitdown-class extraction → RAG + chat overlay)
- [ ] `[NOT DONE]` Implement chat overlay on reader content

### P8.2 Widget Cards (H17)
- [ ] `[NOT DONE]` Implement weather widget (inline in chat)
- [ ] `[NOT DONE]` Implement stock/finance widget (yahoo-finance2 pattern)
- [ ] `[NOT DONE]` Implement math/calculator widget
- [ ] `[NOT DONE]` Implement generic lookup widget

### P8.3 Personality System (H10)
- [ ] `[NOT DONE]` Implement SOUL.md persona file loading
- [ ] `[NOT DONE]` Implement user-tunable personality (tone presets + custom override)
- [ ] `[NOT DONE]` Implement inviolable core rules (never overridden by persona)

### P8.4 Search & Research (G1-G6)
- [ ] `[NOT DONE]` Wire core-search cascade from APP (searxng-first + DDG + public instances)
- [ ] `[NOT DONE]` Implement deep research (G2): breadth×depth tree + learnings-up + gap-check
- [ ] `[NOT DONE]` Implement cited report generation with confidence metrics
- [ ] `[NOT DONE]` Implement multi-channel adapters (G3): arXiv, GitHub, EDGAR, Reddit
- [ ] `[NOT DONE]` Implement data-analysis REPL (G4): sandboxed pandas/numpy
- [ ] `[NOT DONE]` Implement repo-wide engineering (G5): workspace scan → dependency map → test-loop → patch
- [ ] `[NOT DONE]` Implement site/domain search (SeekStorm-class inverted index)
- [ ] `[NOT DONE]` Implement G8 tiered cascade: SQLite result cache (5-min TTL) → optional WebSurfx (Rust) → SearXNG → circuit-breaker fallback; Algorithm #33 routing (doc 52 §4)
- [ ] `[NOT DONE]` Implement parallel top-N fetch cascade (searxng-mcp 4-tier pattern: Firecrawl → Crawl4AI → raw → Wayback); test: 50-page baseline completes ≈ single-page time

### P8.5 Workspace UI
- [ ] `[NOT DONE]` Implement Blueprint editor with live execution status on .md (H4)
- [ ] `[NOT DONE]` Implement Settings page (providers, keys, models, trust levels)
- [ ] `[NOT DONE]` Implement local OpenAI-compatible server UI (H13): expose + manage

### P8.6 WSL/POSIX Bridge (F10)
- [ ] `[NOT DONE]` Implement wsl.exe runners
- [ ] `[NOT DONE]` Implement `\\wsl.localhost\` path translation
- [ ] `[NOT DONE]` Implement loopback IPC between Windows host and WSL
- [ ] `[NOT DONE]` Implement native Linux exec detection

### P8.7 Telemetry (H12)
- [ ] `[NOT DONE]` Implement opt-in telemetry: enumerated fields only, no content
- [ ] `[NOT DONE]` Verify: no requests without explicit opt-in (test cold boot)

### P8.8 Packaging & Distribution
- [ ] `[NOT DONE]` Build Windows installer (.msi via WiX or .exe via NSIS)
- [ ] `[NOT DONE]` Build macOS .dmg + .app (code sign + notarize)
- [ ] `[NOT DONE]` Build Linux .deb + .rpm + .AppImage
- [ ] `[NOT DONE]` Implement auto-updater (Tauri built-in)
- [ ] `[NOT DONE]` Verify idle RSS < 30MB (Tauri + tray, no sidecar)
- [ ] `[NOT DONE]` Verify warm RSS < 80MB (with sidecar, no browser)
- [ ] `[NOT DONE]` CI: build matrix for all 3 platforms

### P8.9 Sync / Export / Wipe (C8)
- [ ] `[NOT DONE]` E2E-encrypted memory/message sync (opt-in, LAN/Tailscale/own server)
- [ ] `[NOT DONE]` Export: messages/memory as markdown/JSON
- [ ] `[NOT DONE]` Per-scope wipe (chat, memory scope, connector data, all)

**P8 Exit Criterion:** Windows beta installs & runs; <30MB idle / <80MB warm; telemetry off-by-default; all UIs functional.

---

## PHASE 9+ — Post-v1 (later)

### P9.1 Computer-Use Pixels (E9)
- [ ] `[NOT DONE]` Implement GUI control via visual grounding (screenshot → click coordinates)
- [ ] `[NOT DONE]` Dual-guard gated (always requires explicit permission)

### P9.2 WASM Fuel-Metered Sandbox (I3)
- [ ] `[NOT DONE]` Implement wasmtime integration with fuel budgets + epoch interruption

### P9.3 Voice Input (H15)
- [ ] `[NOT DONE]` Implement VAD (Voice Activity Detection) + speech-to-text

### P9.4 Remote Session Handoff (H18)
- [ ] `[NOT DONE]` Implement LAN/Tailscale/tunnel view of running sessions
- [ ] `[NOT DONE]` Implement resume from phone mid-run (extends session checkpointing + E2E sync)

### P9.5 Local OpenAI-Compatible Server (A8)
- [ ] `[NOT DONE]` Expose engine on localhost as OpenAI-compatible API
- [ ] `[NOT DONE]` Allow VS Code/Cursor/other tools to use our engine

### P9.6 HTML→Video Reports
- [ ] `[NOT DONE]` Hyperframes integration for agent-generated video content

### P9.7 Magic Completion (H16)
- [ ] `[NOT DONE]` Implement inline context-aware completion (AnythingLLM pattern)
- [ ] `[NOT DONE]` Nango sync → RAG (self-hosted connector sync pipeline)
- [ ] `[NOT DONE]` AutomationBench eval harness (long-horizon desktop automation scoring)
- [ ] `[NOT DONE]` Community skills marketplace (signing + install flow)
- [ ] `[NOT DONE]` Self-hosted connector-hub server (doc 13 opt-in)

### P9.8 Voice Output TTS + Wake Word (H28, H15 ext — doc 50)
- [ ] `[NOT DONE]` Integrate offline TTS (**sherpa-onnx first** — Apache-2.0, active, hosts Piper/Matcha/Kokoro VITS voices; ⚠️ rhasspy/piper archived — piper-rs only as pinned alternative)
- [ ] `[NOT DONE]` Implement read-aloud toggle in chat (speaker button) + per-message TTS
- [ ] `[NOT DONE]` Add optional BYOK cloud TTS (OpenAI/ElevenLabs) via provider rails
- [ ] `[NOT DONE]` Add optional wake word (openWakeWord, Apache-2.0) for hands-free voice activation
- [ ] `[NOT DONE]` Offline STT option selection (Vosk / sherpa-onnx / whisper.cpp) for H15

### P9.9 Image Generation (A10 — doc 50)
- [ ] `[NOT DONE]` Implement image-gen provider endpoint (GPT-Image-1 / DALL·E 3 / Flux / Stable Diffusion / MCP image server) with key-ring + failover (A2/A3)
- [ ] `[NOT DONE]` Implement chat image tool (text-to-image + image editing; ref-handle results → artifact card)
- [ ] `[NOT DONE]` MCP image-server compatibility path (any MCP server via F6 client)

---

## CROSS-CUTTING (applies to all phases)

### Research Tasks (reference repos for implementation patterns)
- [ ] `[NOT DONE]` Study Hermes `iteration_budget.py` for B6 implementation
- [ ] `[NOT DONE]` Study Hermes `tool_result_storage.py` for 3-layer persistence (P5.7)
- [ ] `[NOT DONE]` Study Hermes `context_compressor.py` for compaction stages (P5.7)
- [ ] `[NOT DONE]` Study opencode `compaction.ts` for PRUNE_PROTECT pattern (P5.7)
- [ ] `[NOT DONE]` Study opencode `task.ts` for subagent spawner design (P6.2)
- [ ] `[NOT DONE]` Study DeerFlow `subagent_limit_middleware.py` for budget enforcement (P6.3)
- [ ] `[NOT DONE]` Study DeerFlow `task_tool.py` for poll-loop pattern (P6.3)
- [ ] `[NOT DONE]` Study BrowserOS `browseros-core` for a11y snapshot/diff (P2.2)
- [ ] `[NOT DONE]` Study BrowserOS `run` tool for rquickjs SDK surface (P2.5)
- [ ] `[NOT DONE]` Study BrowserOS harness-integrations for plan-before-touch (P6.8)
- [ ] `[NOT DONE]` Study GenOffice `text-patch.ts` for docx block-patch (P4.1)
- [ ] `[NOT DONE]` Study GenOffice deterministic-planner for xlsx DSL (P4.2)
- [ ] `[NOT DONE]` Study mem0 `main.py` 9-phase pipeline for memory extraction (P5.1)
- [ ] `[NOT DONE]` Study graphiti `graphiti.py` for temporal KG patterns (P5.2)
- [ ] `[NOT DONE]` Study NOOA `forgetting.py` for ACT-R activation (P5.5)
- [ ] `[NOT DONE]` Study Agent Zero `skills.py` for skill registry patterns (P7.2)
- [ ] `[NOT DONE]` Study Zed `capability_granter.rs` for wildcard matching (P7.3)
- [ ] `[NOT DONE]` Study cc-switch `provider.rs` for BYOK hub patterns (P1.1)
- [ ] `[NOT DONE]` Study Reasonix prefix-cache stability patterns (P5.7)
- [ ] `[NOT DONE]` Study rtk per-command output compression rules (P5.7 structural passes)
- [ ] `[NOT DONE]` Study eDirStat `traversal.rs`/`arena.rs` for work-stealing walker + arena snapshots (P4.8)
- [ ] `[NOT DONE]` Study fclones stage ordering (size → xxHash3 → BLAKE3) for dedup (P4.8)
- [ ] `[NOT DONE]` Study UltraSearch `searchd` FTS5/MFT pattern for G7 instant filename search (P4.8)
- [ ] `[NOT DONE]` Study AG-UI spec event types for the chat↔coordinator channel (P11.5.11)
- [ ] `[NOT DONE]` Study LibreChat resumable-streams implementation for H27 (P11.5.12)
- [ ] `[NOT DONE]` Study sherpa-onnx/piper Rust bindings for offline TTS (P9.8)
- [x] `[DONE]` Recheck aider claims vs primary sources — **doc 51** (edit formats ~9, providers 100+, "4.2×/71%" flagged third-party-unverified)
- [ ] `[NOT DONE]` Study WebSurfx (Rust metasearch, IO-uring) for the G8 fast tier (P8.4)
- [ ] `[NOT DONE]` Study searxng-mcp 4-tier fetch cascade for parallel page fetching (P8.4)
- [ ] `[NOT DONE]` Study Agent-S + trycua/cua for post-v1 computer-use patterns (P9.1/E9)
- [ ] `[NOT DONE]` Study agentlens/agentsight for agent-session observability (J14)

---

## PHASE 10 — End-to-End Testing & Quality Assurance

### P10.1 Integration Test Suites
- [ ] `[NOT DONE]` Write E2E test: full user journey — install → first boot → add BYOK key → chat → tool call → response
- [ ] `[NOT DONE]` Write E2E test: multi-turn session with memory persistence (close app → reopen → recall works)
- [ ] `[NOT DONE]` Write E2E test: browser automation pipeline (navigate → snapshot → act → diff → assert)
- [ ] `[NOT DONE]` Write E2E test: office pipeline (open docx → edit → save → reopen → verify byte-stability)
- [ ] `[NOT DONE]` Write E2E test: sub-agent workflow (planner → 2 sub-agents → merge results → final output)
- [ ] `[NOT DONE]` Write E2E test: crystallization (run workflow 3x → verify 4th run = 0 tokens)
- [ ] `[NOT DONE]` Write E2E test: connector hub (browser-session connector → Gmail read → respond)
- [ ] `[NOT DONE]` Write E2E test: ACP harness-driving (spawn Claude Code via ACP → permission → audit → stop)
- [ ] `[NOT DONE]` Write E2E test: scheduled task fires headless from tray daemon
- [ ] `[NOT DONE]` Write E2E test: messaging bridge stub (message in → agent loop → reply out)
- [ ] `[NOT DONE]` Write E2E test: extension loads lazily → executes tool → respects capability boundary
- [ ] `[NOT DONE]` Write E2E test: MCP server serves external client (Claude Code connects → calls snapshot tool)

### P10.2 Security & Adversarial Testing
- [ ] `[NOT DONE]` Run full cyber red-team corpus (doc 26: PentAGI/PyRIT/NeuroSploit patterns) against Guard-1
- [ ] `[NOT DONE]` Run prompt-injection test suite: 50+ adversarial payloads in web pages, PDFs, emails
- [ ] `[NOT DONE]` Run path-traversal fuzz: 10,000 adversarial paths against everyaios-guard → 0 escapes
- [ ] `[NOT DONE]` Run symlink attack suite: symlink chains, circular symlinks, TOCTOU races
- [ ] `[NOT DONE]` Verify Guard-2 non-bypassable: attempt to synthesize click from webview JS → must fail
- [ ] `[NOT DONE]` Test: revoked API key → verify immediate suspension + user alert + failover
- [ ] `[NOT DONE]` Test: sidecar crash mid-tool-call → verify no orphan processes + clean resume
- [ ] `[NOT DONE]` Test: kill everyaios-core process → verify all children die within 5s (orphan prevention)
- [ ] `[NOT DONE]` Test: inject malicious SKILL.md → verify AST audit blocks execution
- [ ] `[NOT DONE]` Test: plugin manifest with excessive capabilities → verify CapabilityGranter denies

### P10.3 Performance & Stress Testing
- [ ] `[NOT DONE]` Benchmark cold start: app launch → first usable interaction (target <2s)
- [ ] `[NOT DONE]` Benchmark idle RSS: Tauri + tray only (target <30MB)
- [ ] `[NOT DONE]` Benchmark warm RSS: with sidecar active, no browser (target <80MB)
- [ ] `[NOT DONE]` Benchmark IPC latency: round-trip JSON-RPC call (target <2ms)
- [ ] `[NOT DONE]` Benchmark browser snapshot: full page a11y tree capture (target <500ms)
- [ ] `[NOT DONE]` Benchmark memory retrieval: multi-signal fusion over 10K facts (target <100ms)
- [ ] `[NOT DONE]` Benchmark FTS5 search: query over 100K chunks (target <50ms)
- [ ] `[NOT DONE]` Benchmark compaction: force-compact 200K token context (target <3s, fail-open)
- [ ] `[NOT DONE]` Stress test: 50 concurrent tool calls in parallel sub-agents → verify no deadlock
- [ ] `[NOT DONE]` Stress test: 10 browser tabs owned by 3 agents simultaneously → ownership isolation holds
- [ ] `[NOT DONE]` Stress test: 100 scheduled tasks queued → fire sequentially without memory leak
- [ ] `[NOT DONE]` Stress test: sidecar running 30min continuous session → verify heap stays <512MB
- [ ] `[NOT DONE]` Battery drain test: 1hr active use on battery → measure watt-hours consumed
- [ ] `[NOT DONE]` Long-session stability: 4hr continuous usage → no memory leak, no state corruption

### P10.4 Cross-Platform Testing
- [ ] `[NOT DONE]` Test full flow on Windows 11 (x64) — installer, boot, chat, browser, office
- [ ] `[NOT DONE]` Test full flow on macOS Sequoia (ARM) — same suite
- [ ] `[NOT DONE]` Test full flow on Ubuntu 24.04 (x64) — same suite
- [ ] `[NOT DONE]` Test WSL bridge on Windows (Linux exec from Windows host)
- [ ] `[NOT DONE]` Test Tauri auto-updater on all 3 platforms
- [ ] `[NOT DONE]` Test SQLCipher vault migration across platform (copy vault.db between OS)
- [ ] `[NOT DONE]` Test Ollama integration on all 3 platforms (spawn, connect, chat)
- [ ] `[NOT DONE]` Test system Chrome/Edge detection + fallback on all 3 platforms

### P10.5 Regression & CI/CD
- [ ] `[NOT DONE]` Set up CI matrix: cargo test + vitest + Tauri build for Win/Mac/Linux
- [ ] `[NOT DONE]` Set up LibreOffice conformance oracle in CI (every office-engine commit triggers)
- [ ] `[NOT DONE]` Set up nightly E2E test run (full integration suite)
- [ ] `[NOT DONE]` Set up performance regression tracking (benchmark results in CI artifacts)
- [ ] `[NOT DONE]` Implement pre-commit hooks: clippy, fmt, eslint, type-check
- [ ] `[NOT DONE]` Implement release pipeline: tag → build → sign → upload to GitHub Releases

---

## PHASE 11 — UI/UX Design & Optimization

### P11.1 Design System & Visual Language
- [ ] `[NOT DONE]` Define color palette (dark/light modes, accent colors, semantic colors)
- [ ] `[NOT DONE]` Define typography scale (font families, sizes, weights, line heights)
- [ ] `[NOT DONE]` Define spacing system (4px grid, component padding/margin standards)
- [ ] `[NOT DONE]` Define component library: buttons, inputs, cards, modals, toasts, dropdowns
- [ ] `[NOT DONE]` Define animation system: transitions, micro-interactions, loading states
- [ ] `[NOT DONE]` Define iconography: consistent icon set (Lucide/Phosphor/custom)
- [ ] `[NOT DONE]` Create Figma/design file with all components + layouts

### P11.2 Core UX Flows (user journey mapping)
- [ ] `[NOT DONE]` Design onboarding flow: first launch → add first key → first chat → success moment
- [ ] `[NOT DONE]` Design empty states: no messages, no keys, no files, no memory
- [ ] `[NOT DONE]` Design error states: network down, key revoked, provider 5xx, budget exceeded
- [ ] `[NOT DONE]` Design loading states: first token wait (TTFT), compaction in progress, tool executing
- [ ] `[NOT DONE]` Design permission flow: Guard-2 card appearance, timing, positioning, dismiss
- [ ] `[NOT DONE]` Design multi-agent view: how user sees parallel sub-agents working
- [ ] `[NOT DONE]` Design blueprint editor UX: how .md files show live execution status
- [ ] `[NOT DONE]` Design office editor UX: how AI edits appear in document (track changes style?)
- [ ] `[NOT DONE]` Design cockpit/flight deck: quiet mode ↔ expanded panel transitions
- [ ] `[NOT DONE]` Design MCQ interrupt card: timing, urgency levels, default selection

### P11.3 Accessibility & Internationalization
- [ ] `[NOT DONE]` Implement WCAG 2.1 AA compliance (contrast, focus indicators, screen reader labels)
- [ ] `[NOT DONE]` Implement keyboard navigation for all primary flows (no mouse required)
- [ ] `[NOT DONE]` Implement high-contrast mode
- [ ] `[NOT DONE]` Implement reduced-motion mode (respect OS prefers-reduced-motion)
- [ ] `[NOT DONE]` Design for i18n: all user-facing strings in locale files
- [ ] `[NOT DONE]` Support RTL layouts (Arabic, Hebrew)
- [ ] `[NOT DONE]` Implement font scaling (respect OS text size preference)

### P11.4 Performance UX
- [ ] `[NOT DONE]` Implement skeleton loaders for all async content
- [ ] `[NOT DONE]` Implement optimistic UI updates (show action before server confirms)
- [ ] `[NOT DONE]` Implement virtual scrolling for large lists (message history, file lists, agent logs)
- [ ] `[NOT DONE]` Implement progressive image/document loading (thumbnails → full render)
- [ ] `[NOT DONE]` Implement debounced search inputs (avoid excess queries)
- [ ] `[NOT DONE]` Measure and optimize Largest Contentful Paint (target <1s)
- [ ] `[NOT DONE]` Measure and optimize Time to Interactive after cold start (target <2s)

### P11.6 User Research & Feedback Loops
- [ ] `[NOT DONE]` Design beta feedback mechanism (in-app bug report + feature request)
- [ ] `[NOT DONE]` Design NPS/satisfaction prompt (non-intrusive, after 7 days of use)
- [ ] `[NOT DONE]` Plan user testing sessions: 5 testers × 3 rounds (alpha, beta, RC)
- [ ] `[NOT DONE]` Define key UX metrics to track: task completion rate, time-to-value, error rate
- [ ] `[NOT DONE]` Implement session recording (opt-in) for UX analysis (not AI content, just clicks/navigation)

---

## PHASE 12 — Market Research & Go-to-Market

### P12.1 Competitive Analysis (Live)
- [ ] `[NOT DONE]` Install + test AnythingLLM desktop — document UX strengths/weaknesses vs ours
- [ ] `[NOT DONE]` Install + test Jan desktop — document UX strengths/weaknesses vs ours
- [ ] `[NOT DONE]` Test Cherry Studio — document multi-provider UX patterns
- [ ] `[NOT DONE]` Test OpenWorker (Andrew Ng) — document connector + approval UX
- [ ] `[NOT DONE]` Test Chatbox (Tauri) — document BYOK UX simplicity
- [ ] `[NOT DONE]` Analyze Claude Code / Codex CLI — document what power users love/hate
- [ ] `[NOT DONE]` Analyze Open WebUI — document what self-hosters value most
- [ ] `[NOT DONE]` Map feature gap matrix: us vs top 5 competitors (what we have that they don't)
- [ ] `[NOT DONE]` Identify our unique positioning hooks (crystallization, office engine, 7 memory algos)

### P12.2 Target Audience & Personas
- [ ] `[NOT DONE]` Define persona 1: Power developer (uses Claude Code/Codex daily, wants more control)
- [ ] `[NOT DONE]` Define persona 2: Knowledge worker (Excel/Word/PDF daily, wants AI automation)
- [ ] `[NOT DONE]` Define persona 3: Privacy-conscious researcher (local-first, no cloud, BYOK)
- [ ] `[NOT DONE]` Define persona 4: Automation builder (Zapier/n8n user wanting AI-native workflows)
- [ ] `[NOT DONE]` Map feature priorities per persona (which capabilities matter most to whom)
- [ ] `[NOT DONE]` Define value propositions per persona (one sentence each)

### P12.3 Positioning & Messaging
- [ ] `[NOT DONE]` Write product tagline (one sentence, <15 words)
- [ ] `[NOT DONE]` Write product description (one paragraph, <100 words)
- [ ] `[NOT DONE]` Write "Why EveryAIOS?" page (3–5 key differentiators with evidence)
- [ ] `[NOT DONE]` Write comparison pages: "EveryAIOS vs ChatGPT", "vs Claude Code", "vs AnythingLLM"
- [ ] `[NOT DONE]` Define naming: finalize product name (EveryAIOS? Other?)
- [ ] `[NOT DONE]` Design brand identity: logo, wordmark, color usage

### P12.4 Launch Strategy
- [ ] `[NOT DONE]` Plan open-source launch: GitHub repo, LICENSE (MIT/Apache-2.0), CONTRIBUTING.md
- [ ] `[NOT DONE]` Write README.md: hero description, screenshot, install instructions, feature list
- [ ] `[NOT DONE]` Plan Hacker News launch post (title, Show HN format, key hooks)
- [ ] `[NOT DONE]` Plan Reddit launch: r/LocalLLaMA, r/selfhosted, r/macapps, r/programming
- [ ] `[NOT DONE]` Plan Twitter/X launch thread (8–10 tweets showing different capabilities)
- [ ] `[NOT DONE]` Plan YouTube demo video (3–5 min, showing killer features in action)
- [ ] `[NOT DONE]` Plan Product Hunt launch (timing, hunter, first comment, assets)
- [ ] `[NOT DONE]` Identify early adopter communities: AI Discord servers, dev Slack groups, HN regulars
- [ ] `[NOT DONE]` Plan beta program: 50–100 early testers, feedback channel, weekly builds

### P12.5 Documentation & Community
- [ ] `[NOT DONE]` Write installation guide (Windows, macOS, Linux — with screenshots)
- [ ] `[NOT DONE]` Write "Getting Started" tutorial (first 5 minutes to value)
- [ ] `[NOT DONE]` Write provider setup guides (Anthropic, OpenAI, DeepSeek, Ollama)
- [ ] `[NOT DONE]` Write skill/plugin development guide (how to build extensions)
- [ ] `[NOT DONE]` Write ACP integration guide (how to connect external agents)
- [ ] `[NOT DONE]` Write architecture overview for contributors (simplified ARCH/01)
- [ ] `[NOT DONE]` Set up community: GitHub Discussions or Discord server
- [ ] `[NOT DONE]` Write CONTRIBUTING.md: code style, PR process, testing requirements
- [ ] `[NOT DONE]` Write SECURITY.md: vulnerability reporting, threat model summary
- [ ] `[NOT DONE]` Plan docs site (Docusaurus/VitePress, hosted on GitHub Pages)

### P12.6 Monetization Research (future, not v1)
- [ ] `[NOT DONE]` Research open-source monetization models: open-core, support, hosting, marketplace
- [ ] `[NOT DONE]` Evaluate skill/plugin marketplace potential (community-contributed, optional premium)
- [ ] `[NOT DONE]` Evaluate "EveryAIOS Pro" optional features: cloud sync, team sharing, priority support
- [ ] `[NOT DONE]` Research pricing benchmarks: comparable tools (Jan, Cherry Studio, Cursor Pro pricing)
- [ ] `[NOT DONE]` Define v1 = 100% free, v2+ = evaluate adding optional paid tier

---

## P11.5 — UI Implementation (from ARCH/12-UI-SPEC, ~4 wks parallel)

> Source: ARCH/12-UI-SPEC.md (derived from Devin Cloud UI + research doc 46)

### P11.5.1 Layout Shell
- [ ] [NOT DONE] Implement 3-column layout (sidebar + chat + workspace) with drag-resizable dividers
- [ ] [NOT DONE] Sidebar: navigation items (New Session, Automations, Guard, Connectors, Memory, Analytics)
- [ ] [NOT DONE] Sidebar: project/workspace selector dropdown
- [ ] [NOT DONE] Sidebar: recent sessions list with status badges (orange/yellow/green/red/grey/blue)
- [ ] [NOT DONE] Sidebar: child session indentation under parent
- [ ] [NOT DONE] Sidebar: collapse to icon-only mode (48px)

### P11.5.2 Chat Panel
- [ ] [NOT DONE] Chat message rendering (user/AI/system message types)
- [ ] [NOT DONE] Artifact cards: rendered file previews with code/copy/download buttons
- [ ] [NOT DONE] Progress steps: clickable timeline (✓ completed, ● running, ○ pending)
- [ ] [NOT DONE] MCQ interrupt: "Action required" with Approve/Edit/Reject/Options buttons
- [ ] [NOT DONE] Input bar: attach (+), text area, mode selector, microphone, send
- [ ] [NOT DONE] Chat modes: Normal / Plan / Research / Quick / Code
- [ ] [NOT DONE] Slash commands: /help, /mode, /model, /undo, /clear, /export
- [ ] [NOT DONE] Knowledge macros (!name) and blueprint @mentions

### P11.5.3 Workspace Panel (Tabbed)
- [ ] [NOT DONE] Tab bar with dynamic tabs, reorder, close, pin, expand-to-fullscreen
- [ ] [NOT DONE] Progress tab: unified timeline with timestamp, icons, expandable entries
- [ ] [NOT DONE] Shell tab: terminal view, command history panel, read-only/writable toggle
- [ ] [NOT DONE] Code tab: syntax editor, live diffs, line numbers, minimap, file tree
- [ ] [NOT DONE] Browser tab: live CDP view, interactive mode, address bar, "● Live" indicator
- [ ] [NOT DONE] Excel tab: spreadsheet grid, real-time cell editing, formula bar, charts, sheet tabs
- [ ] [NOT DONE] Word tab: WYSIWYG render, live cursor, typewriter effect, page/word count
- [ ] [NOT DONE] PPT tab: slide preview, element editing, slide strip navigator
- [ ] [NOT DONE] PDF tab: page rendering, form fields, annotations, zoom, page navigation

### P11.5.4 Takeover/Resume Flow
- [ ] [NOT DONE] Pause button → switches all panels to editable mode
- [ ] [NOT DONE] "● Live" / "⏸ Paused" indicator toggle
- [ ] [NOT DONE] Resume button → mandatory "describe changes" prompt → agent continues

### P11.5.5 Automation Builder
- [ ] [NOT DONE] Automations list with sparkline activity charts
- [ ] [NOT DONE] Automation editor: trigger/condition/action/budget/network-policy fields
- [ ] [NOT DONE] Template gallery (10+ pre-built automations)
- [ ] [NOT DONE] NL automation creation (describe in text → generates config)

### P11.5.6 Knowledge/Memory Browser
- [ ] [NOT DONE] Knowledge list with trigger, macro, scope per item
- [ ] [NOT DONE] Folder organization (nested, drag, bulk enable/disable)
- [ ] [NOT DONE] Auto-suggestions from AI (accept/dismiss/regenerate)
- [ ] [NOT DONE] Episodic/Semantic/KG section browsers

### P11.5.7 Guard Panel
- [ ] [NOT DONE] Trust level indicator (progress bar 0-100)
- [ ] [NOT DONE] Recent actions log with auto-approved/pending/blocked status
- [ ] [NOT DONE] Permission chips (workspace read/write, shell, browser, external)

### P11.5.8 Connector Hub Panel
- [ ] [NOT DONE] Connected services list with tool counts
- [ ] [NOT DONE] MCP servers list with status (running/not connected)
- [ ] [NOT DONE] Add/Install buttons for new connectors

### P11.5.9 Aider-Derived Features
- [ ] [NOT DONE] RepoMap: tree-sitter tag extraction + PageRank ranking + SQLite cache + budget fitting
- [ ] [NOT DONE] Warp semantic index (doc 56 W1, optional C5 embedding path): tree-sitter semantic chunker + merkle-tree content-hash incremental sync + search shaping + `file_outline` (open Rust DeepWiki pattern)
- [ ] [NOT DONE] Edit Strategy: SEARCH/REPLACE with fuzzy matching + whitespace flex + ellipsis
- [ ] [NOT DONE] Architect Mode: two-pass (reasoning model → editor model) agent pattern
- [ ] [NOT DONE] File Watcher: notify crate watching for `// ai!` markers → auto-submit
- [ ] [NOT DONE] Lint/Test Reflection: after every edit run lint → on error retry ×3
- [ ] [NOT DONE] MODEL_ALIASES: config map of short names to full provider/model paths

### P11.5.10 New Agent Patterns (doc 47)
- [ ] [NOT DONE] Implement Plan/Act dual-mode in agent loop (Cline pattern) — explicit plan phase before tool execution
- [ ] [NOT DONE] Implement Context Provider plugin system (@Codebase, @Docs, @URL injection points)
- [ ] [NOT DONE] Add ACP subscription linking — users bring existing Claude/ChatGPT subscriptions directly
- [ ] [NOT DONE] Add Custom Distribution support — branded EveryAIOS configs with pre-loaded providers/extensions
- [ ] [NOT DONE] Add Kanban view for parallel sub-agents with git worktree isolation per branch
- [ ] [NOT DONE] Implement Oracle/reviewer model pattern — secondary heavyweight model for quality review
- [ ] [NOT DONE] Implement Intent classification before tool dispatch — route prompts to specialized handlers (Agent vs Edit vs Ask vs Terminal) before the tool loop starts (Copilot Chat pattern); optional ML backend: Warp `input_classifier` ONNX (doc 56 W3) — same dispatch interface, prompt-based routing is the default
- [ ] [NOT DONE] Implement Autopilot nudge mechanism — when model stops prematurely, inject continuation prompt to prevent "stopped too early" (Copilot Chat pattern)
- [ ] [NOT DONE] Add ApplyPatch edit format (*** Add/Delete/Update File) — simpler than unified diff, proven at Copilot scale, fourth edit strategy option
- [ ] [NOT DONE] Implement Prompt TSX pattern — JSX-like declarative prompt composition with automatic context window budget management, type-safe and composable

### P11.5.11 Generative UI (H25 — AG-UI, doc 50)
- [ ] [NOT DONE] Adopt AG-UI wire protocol (tool calls + UI updates over one JSON channel, ~16 event types) on top of P0.5 framed IPC
- [ ] [NOT DONE] Sandboxed iframe renderer for agent-emitted components (strict CSP + process isolation, Anthropic Artifacts pattern)
- [ ] [NOT DONE] Component-descriptor renderer (JSON schema → local UI) to minimize token cost; raw HTML/Mermaid on request
- [ ] [NOT DONE] Upgrade artifact cards: static preview → "make live" opt-in with version selector
- [ ] [NOT DONE] Inline live render upgrades for Mermaid/graph/table outputs

### P11.5.12 Resumable Streams (H27 — doc 50)
- [ ] [NOT DONE] Coordinator holds in-flight stream state (Bun in-memory) with last-token/id tracking
- [ ] [NOT DONE] Reconnect UI: "🔄 Reconnecting…" chip + auto-resume from last token (LibreChat pattern)
- [ ] [NOT DONE] Idempotent retry wiring per ARCH/03 (retry idempotent calls); test: kill mid-stream → resume byte-continuous

---

## SUMMARY

| Phase | Tasks | Weeks |
|---|---|---|
| P0 Workspace & Skeleton | 46 | ~2 |
| P1 Chat + BYOK | 50 | ~4 |
| P2 Browser Layer | 73 | ~6 |
| P3 Replay + Cockpit | 14 | ~4 |
| P4 Office Engine | 45 | ~5 |
| P5 Memory + Token Economy | 60 | ~5 |
| P6 Orchestration + Connectors | 75 | ~5 |
| P7 Forge + Guardrails | 49 | ~4 |
| P8 Product Polish | 37 | ~3 |
| P9+ Post-v1 | 22 | later |
| **P10 Testing & QA** | **50** | **~4** |
| **P11 UI/UX Optimization** | **36** | **~3** |
| **P11.5 UI Implementation** | **64** | **~4 (parallel)** |
| **P12 Market Research & GTM** | **45** | **~4 (parallel)** |
| Research Tasks (cross-cutting) | 31 | parallel |
| **TOTAL** | **697** | **~45 weeks** |

> **Note:** P11 (UI/UX), P11.5 (UI Implementation), and P12 (Market Research) run **in parallel** with implementation phases, not sequentially. Actual calendar time depends on team size and parallelization.
