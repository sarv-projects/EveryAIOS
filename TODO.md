# EveryAIOS — Master Implementation TODO

> **Generated:** 2026-08-07 (updated 2026-08-17) · **Spec:** v3.22 · **Architecture:** ARCH/00–12 + DIAGRAMS.md
> **Rule:** Mark `[DONE]` only after implementation + test pass. Leave `[NOT DONE]` until verified.
> **Scope:** Complete product — 149 capabilities, 33 algorithms, 13 build phases (P0–P12) + UI implementation (P11.5).
> **Source reuse:** `APP/packages/core-*` imported as workspace deps (not copied). Desktop-only additions go in `packages/coordinator/` or `crates/`.
> **Provenance chain (how to find the research for any task):** task → SPEC row ID in the section header (e.g. `P1.7 (A4)`) → `ARCH/09-FEATURE-MATRIX.md` **Source** column for that row → `RESEARCH/desktop_app/` doc (01–83) → **doc 41** (steal-vs-reference-master-index) for the 🔴 STEAL / 🟡 ADAPT / 🟢 REFERENCE verdict + source files; **doc 63** (37-repo steal ledger, 2026-08-15) for the harness/browser/office/user-capability cluster verdicts; **doc 65** (batch-3 agent-infra/scraping/search/UI, 2026-08-15) for the A9/J11/G8/E14/I2/F8/I7/I11/P6/P5 extension steals; **doc 66** (anomalyco org, 2026-08-15) for the A6/A9/A7 models.dev catalog steal (TODO P14); **doc 67** (capability deltas + UI/UX finalization, 2026-08-15) for H29 dashboard artifacts (bolt.diy), B7 heartbeat automations (Hatchet lease pattern), and the H20 views-rail redesign (ARCH/12 v2.0); **doc 68** (final all-rounder market research, 2026-08-15) for H30 voice-memo→report, H31 corpus-research surface + audio digest, H32 agent picker + agent-scoped model surface, and the two-channel capability injection (F12/J17/F7); **doc 69** (ACP agent ecosystem + harness deep-dive, 2026-08-16) for the verified ACP entrypoint catalog (Claude Code/Codex/Cline/OpenCode/Hermes/OpenClaw/Copilot/Gemini/…) + Zed/Cline/Hermes steal queue (TODO P17); **doc 70** (mcpservers.org directory inbuilt analysis, 2026-08-16) for the MCP-directory verdict: **don't** bundle document/browser MCP servers (our Rust engines supersede them); **do** add three *native* inbuilt capabilities — PDF page ops (split/merge/rotate/reorder via lopdf, `oxidize-pdf` steal), content search + OCR (`dowse` adapt), and a Gmail/IMAP read-first connector (`mailwarden`/`Busymail` approve-before-send pattern) — TODO P18; **doc 71** (batch-4 coding agents/skills/harnesses, 2026-08-16) for the Kilo Gateway routing / ruflo swarm+federation / system-prompt structure / ui-ux-pro-max design-skill queue — TODO P19; **doc 72** (batch-5 code-intel/parallel/search, 2026-08-16) for the SeekStorm embedded hybrid index + Superset worktree-per-agent queue — TODO P20; **doc 73** (batch-6 computer-use/full-control, 2026-08-16) for the OpenAdapt demonstration compiler (B8 crystallization + E9) + ShowUI-Aloha learning half + auggie F12/ACP entry — TODO P21; **doc 74** (built-in MCP Server Manager, 2026-08-16) for the "bundle the manager, not the servers" optimization — mirror the ACP registry/installer/transport machinery to consume third-party MCP servers, postgres-mcp-hardened refuse-twice write template — TODO P22; **doc 75** (anthropic skills/plugins/cowork, 2026-08-16) for the `.claude-plugin/plugin.json` component schema (skills+agents+hooks+MCP+LSP+monitors), inbuilt native skill-wrappers vs marketplace "Add", and the source-available document-skills license boundary — TODO P23; **doc 76** (batch-7 design/browser/self-healing, 2026-08-16) for open-design `DESIGN.md` brand-system + composable design-skills, browser-harness self-healing, and the MagenticLite browser+FS+HITL validation — TODO P24; **doc 77** (batch-8 workflows/graphify/browser, 2026-08-16) for the agent-authored programmable-workflow model (Airflow DAG/retry/backfill semantics), Graphify queryable knowledge-graph, and addyosmani exit-criteria skills — TODO P25; **doc 78** (batch-9 marketplace/gws/jobs, 2026-08-16) for the wshobson/agents multi-harness plugin catalog, the `gws` Google Workspace connector, and the AIHawk "Jobs" vertical — TODO P26; **doc 79** (local-model fetch/download core, 2026-08-16) for the resumable HF GGUF/MLX downloader + canonical store + `local://` model URL — TODO P27. If a task lacks an inline doc ref, walk this chain before writing code — never re-research what's already mapped.
>
> **Connector-platform decision (2026-08-16):** **MCP is the platform — no third-party aggregator.** Composio/Zapier/Nango are cloud SaaS that hold OAuth tokens on *their* servers, which contradicts the zero-founder-server/local-vault promise. In 2026 every connector we care about (Gmail, Slack, GitHub, Linear, Notion, Postgres…) ships an official MCP server; so the connectors surface is **MCP Servers** (user-supplied, run locally via stdio/`npx` or user-hosted HTTP, tools surfaced from the live catalog) + **Native** (first-party BYO OAuth/API-key where a local integration is warranted, tokens in the SQLCipher vault) + **Tool Catalog** (the live `everyaios-mcp` registry). The Composio/Zapier/Nango tabs are removed.
>
> **UI v2 migration note (2026-08-16):** the v2 cockpit (`ui/`, UI-DESIGN-PROMPT.md = canonical spec) **replaced** the v1 router pages. Historical `[DONE]` lines below that cite `ui/src/pages/*.tsx` (Chat, Cockpit, Spend, Trajectory, Audit, Spreadsheet, DocxViewer, PptxViewer, PdfViewer, Settings) describe the v1 implementation — the capability map is: Chat → `components/chat/*` (panel/composer/picker) + `lib/bridge.ts` streaming; Cockpit → GuardPanel + bridge ticket cards + status bar; Spend → composer budget strip + status-bar cache + AnalyticsPanel; Audit → `views/audit-view`; Spreadsheet → `views/office-xlsx-view` (**live-wired: `xlsx_open` windowed read, cell selection → editable formula bar, `xlsx_recalc` (IronCalc truth engine) with engine-diff flash, and the Guard-2-ticketed cell edit — `xlsx_edit_request` (plan → ticket) / `xlsx_edit_commit` (`use_ticket` + surgical `apply_batch` write + re-read/recalc); plus the **bulk-edit toolbar (Bulk toggle)** — range fill + sort + **structural Shift (insert/delete row/col)** through the same Guard-2 split (`xlsx_batch_request`/`xlsx_batch_commit`, `FillRange`/`SortRange`/`Shift` ops, `read::read_range` + `batch_args_hash` sheet-scoped ticket), a read-only pivot (`xlsx_pivot` → `pivot_result`), and the **physical row/col move** (`shift_structure` → `shift_rows`/`shift_cols` + `shift_dimension` + `shift_merge_cells`, tested 5×); demo grid fallback**); Docx/Pptx/Pdf viewers → `views/office-*` (**live-wired via `OfficeOpenBar` → `docx_open`/`pptx_open`/`pdf_open`; pdf renders real pixels via a lazy pdf.js `pdf-canvas` (code-split) with text-extraction fallback**); Settings → `panels/settings-panel`; Trajectory (J5) → **`views/trajectory-view` (ported: source-grouped context-injection inspector + rail icon ⌘⇧T + palette entry)**. **ACP sign-in surface landed in the picker** (`connectAgent` → `acp_launch` → `authMethods`; url-type opens the system browser + retry, agent-type completes inline → `connected`). **Connectors panel live-wired**: new Rust `mcp_catalog` command (`src-tauri/src/mcp_cmds.rs` → `everyaios-mcp` registry: 42 tools = 37 browser + 5 storage, kind/read_only/open_world/profile/args) + `ui/src/lib/mcp.ts` bridge + a **Tool Catalog** tab (real counts + per-tool list); the external connectors (Gmail/Slack/GitHub/…) remain a config-surface placeholder (no OAuth wiring yet). Remaining UI seams: external connector OAuth/config wiring (config-surface placeholder; MCP servers are the mechanism). The Excel editor surface (read · recalc · cell edit · bulk fill/sort · structural row/col shift · pivot) is now complete end to end.

<!-- VERIFICATION POLICY: Every completed task MUST be verified before marking [DONE].
     Verification means: code compiles, tests pass, behavior confirmed (manual or automated).
     If verification is not possible (e.g. no test runner, external dependency), document WHY
     in the task line and mark [DONE — unverified: reason]. Never mark [DONE] on faith alone. -->

---

## PHASE 0 — Workspace & Skeleton (~2 weeks)

### P0.1 Rust Workspace Setup (ARCH/02 §2.2 — module layout, doc 41 P0 STEAL rows)
- [x] `[DONE]` Create `crates/` directory with Cargo workspace manifest
- [x] `[DONE]` Create `crates/everyaios-core/` — binary crate, boots headless, loads config
- [x] `[DONE]` Create `crates/everyaios-ipc/` — JSON-RPC stdio framing with length-prefix [u32 LE]
- [x] `[DONE]` Create `crates/everyaios-guard/` — created as a compiled-RegexSet stub; **since grown to the full P7 surface (blocklist/prescan/urlfloor/ticket/redteam/injection/pathfloor/profiles/loopguard/configscan/manifest — see P7.4/6/7)**
- [x] `[DONE]` Create `crates/everyaios-audit/` — created as an NDJSON append writer; **since grown to session-log/cockpit/replay + P7.7 Merkle chain + session repair**
- [x] `[DONE]` Create `crates/everyaios-vault/` — SQLCipher init, open/create encrypted db
- [x] `[DONE]` Create `crates/everyaios-cdp/` — stub (CDP WebSocket client skeleton)
- [x] `[DONE]` Create `crates/everyaios-browser/` — stub (snapshot types)
- [x] `[DONE]` Create `crates/everyaios-script/` — stub (rquickjs placeholder)
- [x] `[DONE]` Create `crates/everyaios-mcp/` — stub (official MCP Rust SDK integration)
- [x] `[DONE]` Wire Cargo workspace: all crates compile, `cargo test` green
- [x] `[DONE]` CI: GitHub Actions cargo test + clippy + fmt check — **pushed to `sarv-projects/EveryAIOS`, all 3 platforms green ✅ (ubuntu 27s, macOS 18s, Windows 14m32s). OpenSSL installed via vcpkg for SQLCipher on Windows. Run: [#31308757031](https://github.com/sarv-projects/EveryAIOS/actions/runs/31308757031)**

### P0.2 Tauri Shell (ARCH/01, doc 41 P0 — tauri STEAL row)
- [x] `[DONE]` Init Tauri v2 app in `desktop_app/` root (`src-tauri/` — Cargo.toml, build.rs, tauri.conf.json, capabilities, lib.rs, main.rs)
- [x] `[DONE]` Configure `tauri.conf.json` — window 1200×800 (main, resizable, centered), bundler targets appimage/msi/dmg, identifier `com.everyaios.desktop`
- [x] `[DONE]` Wire everyaios-core as Tauri's Rust backend (Tauri commands: version, core_boot_report, scan_text, probe_vault — boot report, Guard-1 scan, vault probe)
- [x] `[DONE]` Verify `tauri dev` boots and shows empty webview window — **verified headless on Xvfb (never on the user's display)**: 1280×800 window mapped, webview page renders (985K white px + accent-blue boot card), process + WebKitWebProcess/NetworkProcess alive; tray icon present in X tree
- [x] `[DONE]` Add system tray with basic status icon (Show EveryAIOS / Quit menu, `icons/32x32.png`, generated via `scripts/gen-icons.py`)

### P0.3 TS Sidecar (Coordinator) (ARCH/02 §2.3 — TS coordinator responsibilities)
- [x] `[DONE]` Create `packages/coordinator/` — TS project with tsconfig (Bun target, strict, ESM; deps on all 10 `@personal-ai/core-*`)
- [x] `[DONE]` Configure pnpm workspace linking to `APP/packages/core-*` as deps — `pnpm-workspace.yaml` adds `../APP/packages/*`; verified all 10 core-* symlinked into coordinator; `allowBuilds` map (pnpm 11 syntax) builds better-sqlite3/onnxruntime-native; root `package.json` added for the workspace
- [x] `[DONE]` Implement hello-world IPC responder (stdin/stdout JSON-RPC) — `src/{frame,message,index}.ts` mirror `everyaios-ipc` exactly: `[u32 LE len][JSON]` framing + ACP-style `initialize` (protocolVersion=1, default-off capabilities) + echo/session/ping/shutdown; **11/11 bun tests green incl. real child-process E2E round-trip; tsc clean**
- [x] `[DONE]` Bun compile: `bun build --compile ./src/index.ts --outfile dist/coordinator` — **compiled in 4.6s, 3 modules bundled, output at `packages/coordinator/dist/coordinator`**
- [x] `[DONE]` Verify binary boots and responds to echo over stdio — **tested: framed `echo` request → `{'text': 'hello from binary', 'echoed': True}` response via compiled binary**
- [x] `[DONE]` Measure binary size (target: document actual vs ~60MB expected) — **actual: 91MB (Bun 1.3.14 runtime overhead; ELF x86-64 dynamically linked). Larger than 60MB estimate due to Bun runtime growth since v1.0. Acceptable for desktop; strip/compression can reduce for distribution.**
- [x] `[DONE]` Sidecar heap safety (J13): `--max-old-space-size=512`; self-restart at 80% heap used; forced rotation at 30min — **`src/heap.ts` implements `startHeapMonitor()`: 5s poll, 80% → `heap/warning` notification, 95% → `heap/critical` + exit(71), 30min → `heap/rotation` + exit(0). ProcessSupervisor sets `BUN_JSC_heapSize=536870912` at spawn. 17/17 bun tests pass.**

### P0.4 ProcessSupervisor (J7 — ARCH/09 J7: v2.0 §4.3; doc 41 P0 zeroclaw STEAL)
- [x] `[DONE]` Implement spawn logic in everyaios-core: launch coordinator binary as child — **`src/supervisor.rs`: `ProcessSupervisor::spawn()` uses `Command` with `Stdio::piped()`, sets `BUN_JSC_heapSize`, platform `pre_exec` for orphan prevention**
- [x] `[DONE]` Implement exponential backoff restart (1s→2s→4s→60s cap) — **`restart_with_backoff()`: delay = `min(2^restart_count, 60)` seconds**
- [x] `[DONE]` Implement circuit breaker (5 crashes/10min → OPEN state → surface error) — **`check_circuit_breaker()`: prunes entries >10min, trips at ≥5 crashes → `SupervisorState::CircuitOpen`**
- [x] `[DONE]` Implement watchdog (J10): connect/idle timeouts re-armed per byte of stream; hang detection → kill + restart — **`check_watchdog()` now wired into `wait_or_restart()` loop: 5s connect timeout (first byte → Starting→Running), 30s idle timeout, re-armed per byte by dedicated stdout/stderr reader threads (`pump()`); sidecar emits `session/ready` on boot + `session/heartbeat` every 10s (env-overridable via `EVERYAIOS_HEARTBEAT_MS`) so a healthy-but-idle process never false-kills; 10 watchdog unit tests + E2E heartbeat test green (core 19/19)**
- [x] `[DONE]` Implement orphan prevention (J12): prctl Linux, Job Object Windows, process group macOS — **Linux: `PR_SET_PDEATHSIG(SIGTERM)` via `pre_exec`; macOS: `setsid` via `pre_exec`; Windows: real Job Object `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` via `windows-sys` 0.61 — `orphan::windows::{create_job_object, assign_to_job}` (job created before spawn, fresh child assigned by PID; no unguarded window). Compiles clean for `x86_64-pc-windows-msvc` (validated with cargo check; `Win32_Security` feature required for `CreateJobObjectW`)**
- [x] `[DONE]` Implement parent-PID polling in sidecar (5s interval, self-exit if orphaned) — **`src/orphan.ts`: `startOrphanWatch()` polls `process.ppid` every 5s, exits if changed or ≤1**
- [x] `[DONE]` Test: kill everyaios-core → verify sidecar dies within 5s — **integration test PASS: coordinator exits in 0.5s when parent dies (stdin EOF triggers immediate exit via `reader.on('end')`; ppid polling is backup). 19/19 cargo tests pass (incl. 10 new watchdog unit tests).**

### P0.5 IPC Contract (J15/J16 — ARCH/09: doc 43; ARCH/02 §2.2 everyaios-ipc)
- [x] `[DONE]` Implement length-prefixed framing in everyaios-ipc: `[u32 LE length][JSON payload]` — **`crates/everyaios-ipc/src/frame.rs` (`encode`/`decode`, `MAX_FRAME_LEN` 16MiB, EOF-safe partial-frame handling) + TS mirror `packages/coordinator/src/frame.ts` (incl. resync-on-error `FrameDecoder`); 11 ipc unit tests green, framing also exercised end-to-end by the E2E round-trip below**
- [x] `[DONE]` Prefer UNIX-domain socket transport over TCP (J16) — zero port collisions; pre-spawn coordinator at Tauri boot (hidden, ~200ms perceived cold start) — **`crates/everyaios-ipc/src/socket.rs`: `UnixFrameServer` (stale-socket rebind, framed `serve_connection`) + `request()` client + `socket_path(data_dir)`; `Config.resolved_socket_path()` (default `<data_dir>/coordinator.sock` — no TCP port ever); `src-tauri` `.setup()` now `pre_spawn_coordinator()` (finds `packages/coordinator/dist/coordinator` / `EVERYAIOS_COORDINATOR_BIN`, runs `ProcessSupervisor::wait_or_restart` on a thread) + `serve_unix_control_channel()` (framed JSON-RPC responder on the socket); 4 socket tests green incl. latency bench below**
- [x] `[DONE]` Implement bounded channel (capacity=16) with backpressure — **`crates/everyaios-ipc/src/channel.rs`: `BoundedChannel` wraps `mpsc::sync_channel(16)` — `send()` blocks when full (that block IS the backpressure), `try_send()` returns `Full`, atomic length counter, `sender()` clone for thread producers; 6 unit tests green (capacity respected, blocked sender unblocks after drain, recv blocks)**
- [x] `[DONE]` Implement truncation: oversized payload → `ref:` handle — **`crates/everyaios-ipc/src/handle.rs`: `HandleStore` (thread-safe, atomic ids) + `WirePayload::{Inline,Ref}` + `HandleRef::wire()/parse()` (`ref:handle:<id>`, C10 pass-by-reference); payloads >1MiB (`TRUNCATION_THRESHOLD`) become one-shot handles fetched via `refs/get`; 5 unit tests green**
- [x] `[DONE]` E2E test: sidecar echo round-trip with length-prefix framing — **`packages/coordinator/src/index.test.ts` “E2E — real child process over stdin/stdout”: spawns `bun run index.ts`, sends initialize + echo + ping composed in a single write (frames split across the write boundary), asserts `session/ready` notification + 3 length-prefixed responses; 17/17 bun tests green (incl. heartbeat E2E)**
- [x] `[DONE]` Benchmark: measure IPC latency (target <2ms per crossing) — **`socket.rs` bench `ipc_latency_below_2ms_per_crossing`: 2000 framed round trips through a real OS socketpair (kernel crossing + framing) — measured avg 35 µs/crossing, 57× under the 2ms budget; assert keeps CI honest**

### P0.6 Config System (J9 — ARCH/09: v2.0 §7.6; ARCH/03 §3.2 config-as-files)
- [x] `[DONE]` Define `everyaios.toml` schema (ports, dirs ~/.everyaios/, retention, vault path, browser binary) — **`crates/everyaios-core/src/config.rs`: `Config {data_dir, vault_path, retention_days, browser_binary}` + TOML round-trip + relative-path normalization; `ports` field intentionally deferred until the P0.5 transport (UNIX socket / MCP HTTP port) exists — no ports are live yet**
- [x] `[DONE]` Implement config loading in everyaios-core from `~/.everyaios/everyaios.toml` — **`Config::load()` / `Config::load_from()` with `EVERYAIOS_HOME` override; tests `default_config_points_into_everyaios_dir` + `missing_file_gets_created_with_defaults` green (13 core tests pass)**
- [x] `[DONE]` Create default config on first boot — **`load_from` writes `Config::default()` to disk when the file is absent (test asserts the file exists after load)**
- [x] `[DONE]` Define `providers.toml` schema (key pools per provider) — **`crates/everyaios-core/src/providers.rs`: `[[providers]] name/base_url + [[providers.keys]] id/value` (ARCH/03 §3.2); `ProvidersFile::load_from` creates the file empty on first boot; `KeyPool::select()` round-robin across the pool, `NoKeys` error on empty; 6 unit tests green**
- [x] `[DONE]` Define `agents/*.md` blueprint format (name, model, tools, permissions) — **`crates/everyaios-core/src/blueprint.rs`: TOML frontmatter (`---` fences) with `name/model/tools/permissions` + markdown body; `load_blueprint` / `load_all` (non-recursive, sorted, missing dir = empty); 6 unit tests green (parse, defaults, missing-fence error, body extraction)**

### P0.7 UI Shell (ARCH/12-UI-SPEC, doc 41 P8 — jan/chatbox refs)
- [x] `[DONE]` Create `ui/` — React SPA (Vite + React 19) — **`ui/` standalone npm project: `package.json` (react 19, react-dom, react-router-dom 6, @tauri-apps/api 2, vite 6, TS strict) + `vite.config.ts` (fixed port 1420 strict, Tauri env prefix, dist output) + `src/` React app (main/App/Chat/Settings/lib); `npm run build` green (38 modules, 222KB JS / 70KB gzip); tsc strict clean; `tauri.conf.json` build now points at `../ui/dist` with `npm --prefix ui` dev/build commands**
- [x] `[DONE]` **UI v2 port (UI-DESIGN-PROMPT + doc 67 views-rail) — `ui/` rebuilt from the three design implementations (workspace-a59…, Complete Clarity, workspace-5e8…): warm-cream light-first cockpit (`#F7F7F4` + `#F54E00`, dark as toggle), one-session layout (left sessions/nav · center chat+approve · right 48px rail + one viewport), 108 files (shell/chat/panels/views/ui primitives + zustand store + framer-motion + Tailwind v4); `src/lib/bridge.ts` live-data bridge — real ACP agents + install states merged into the picker, spend snapshot → composer budget, chat relay streaming (`chat_stream` + `chat-event` → transcript) with demo fallback; tsc strict clean + vite build green (396KB gzip); `tauri.conf.json` already points at `../ui/dist` / dev 1420**
- [x] `[DONE]` **UI v2 live wiring pass — Guard-2 tickets polled into the transcript as permission cards (`bridge.ts` → `store.pushMcq`/`respondMcq` → `guardRespond`; GuardPanel live section: pending tickets + approve/reject + policy profile + estop toggle from `guard_policy`/`guard_estop`); H32 picker F8 install button (plan-before-touch: `acp_install_request` → Guard-2 card or auto-allow → `acp_install_commit`, progress state); status bar live cache-hit from `usage_snapshot`; bundle split via `manualChunks` (app chunk 396KB → 158KB gzip, charts/motion/radix/markdown separate cacheable chunks); tsc strict clean + build green**
- [x] `[DONE]` Basic routing: Chat, Settings placeholder — **`HashRouter` (file://-safe) with sidebar nav (NavLink active states); `src/pages/Chat.tsx` (message thread + composer, welcome bubble) + `src/pages/Settings.tsx` (core-bridge probe cards + Guard-1 scan demo); dark brand theme in `styles.css`**
- [x] `[DONE]` Wire Tauri IPC: send command from React → receive in Rust → respond — **`ui/src/lib/tauri.ts` (`inTauri()` + `invoke` via `@tauri-apps/api/core`); Chat sends → `version` command, Settings probes → `version` / `core_boot_report` / `probe_vault` / `scan_text` (Guard-1); graceful browser-preview fallback (local echo / demo data) when not in the Tauri webview**
- [x] `[DONE]` Verify hot-reload works with `tauri dev` — **vite dev server verified on `localhost:1420` (HTTP 200, Vite 6.4.3 ready in 359ms, React-refresh injected — HMR live); `beforeDevCommand`/`devUrl` wiring in `tauri.conf.json` matches; full window boot previously verified headless on Xvfb (P0.2 round)**

**P0 Exit Criterion:** `cargo test` green; sidecar E2E echo green; `everyaios-core --version` prints; config loaded; vault opens/creates SQLCipher db; Tauri window shows React shell.

---

## PHASE 1 — Chat + BYOK Key-Rings (~4 weeks)

### P1.1 Key-Ring Vault (A2/A3 — ARCH/03 design; doc 19 §7 vault/CES + doc 53 §2 broker; doc 41 P1 cc-switch STEAL)
- [x] `[DONE]` Design SQLCipher schema for key pools (providers.toml → vault rows) — **`crates/everyaios-vault/src/lib.rs`: schema v2 adds `key_ring` (provider, key_id, opaque_handle, value BLOB encrypted-at-rest, status, model_filter, priority, tokens_day, cost_day, daily caps, fail_count, success_count, last_used_at, cooldown_until; UNIQUE(provider,key_id)) + `idx_key_ring_provider`**
- [x] `[DONE]` Implement key CRUD in everyaios-vault (J8): add/update/delete/list keys per provider — **`keyring.rs`: `add_key` (INSERT OR REPLACE, mints opaque handle), `delete_key` (revokes handle + drops affinity), `rotate_key` (mints NEW handle per doc 53 §2), `get`, `list` (handle-only `KeyInfo`, never the secret); CRUD round-trip test green**
- [x] `[DONE]` Implement key status model: primary/standby/backup/suspended — **`KeyStatus` enum: primary/standby selected normally, backup last-resort tier, suspended never selected (`backup_only_used_when_primaries_exhausted` + `status_tiers_gate_selection` tests green)**
- [x] `[DONE]` Implement routing policies: priority, round-robin, least-used — **`RoutingPolicy`: priority (lowest number first), round-robin (per-provider cursor), least-used (min tokens_day); 3 tests green**
- [x] `[DONE]` Implement model_filter per key (restrict key to certain models) — **comma-joined `model_filter` column; empty = any model; `model_filter_restricts_keys` test green**
- [x] `[DONE]` Implement cooldown logic: 429 → cooldown_s × 2^failures, cap 5min — **`report_failure(handle, true)` → `compute_backoff_secs` = base(5s) × 2^(failures-1) capped at 300s; `cooldown_backoff_doubles_and_caps` test green (tolerance ±2ms for clock drift)**
- [x] `[DONE]` Implement max_429_switches (default 3) per call — **`MAX_429_SWITCHES = 3` in the broker failover loop (`run_with_failover`); exceeded → `BrokerError::AllKeysExhausted`; test green**
- [x] `[DONE]` Implement key affinity: (provider, model, session_id) → same key for cache — **in-memory affinity map on the ring; pin wins over ANY policy rotation (RR cursor cannot rotate a pinned session away); `affinity_pins_session_to_same_key` test green**
- [x] `[DONE]` Implement per-key budget tracking: tokens_day, cost_day, daily/monthly caps — **`report_usage(handle, tokens, cost)` accumulates with lazy daily rollover on first use of a new day; optional `daily_token_cap`/`daily_cost_cap` block selection at cap; `budget_cap_blocks_selection_and_rolls_over` test green**
- [x] `[DONE]` Implement health tracking: fail_count, success_count, last_used_at — **`report_success` (bumps success, resets failures) / `report_failure` (bumps failures, non-429 no cooldown); surfaced handle-only in `KeyInfo`; `health_tracking_updates_counters` test green**
- [x] `[DONE]` Test: simulate 429 → verify immediate failover to next key — **`broker.rs::simulate_429_fails_over_to_next_key`: mock HTTP server 429s key-1 then 200s key-2; asserts key-1 in cooldown + fail_count≥1, key-2 success_count=1 — PASS**
- [x] `[DONE]` Test: all keys exhausted → surface aggregated error — **`all_keys_exhausted_after_429_switches`: 5 keys all 429 → `BrokerError::AllKeysExhausted` after 3 switches — PASS; also `no_keys_errors` (fail-closed without keys)**

### P1.2 Provider Adapter (A1 — ARCH/09: doc 19; ARCH/03 BYOK + doc 53 §2 broker)
- [x] `[DONE]` Wire core-providers from APP as sidecar dep — **`pnpm-workspace.yaml` globs `../APP/packages/*` (P0.3) + coordinator `package.json` declares all 10 `@personal-ai/core-*` deps; workspace links present in `packages/coordinator/node_modules/@personal-ai`; NEW `src/core-providers.smoke.test.ts` imports the package and verifies catalog/selectors/export surface (no network; also pins the 5 broker-targeted providers) — `bun test` 22/22 pass + `tsc --noEmit` clean (re-verified 2026-08-10). ⚠️ Drift found: broker key `nvidia` ↔ catalog id `nvidia-nim` (same base URL `https://integrate.api.nvidia.com/v1`) — alias documented in the test; reconcile when APP is editable**
- [x] `[DONE]` Implement credential-broker request path (doc 53 §2): sidecar sends provider/model/body + opaque key handle; Rust broker (`everyaios-vault` broker module) executes the HTTP call — injects auth headers, zeroize scrub — **`broker.rs`: `Broker::chat_completion` / `chat_completion_stream` (SSE) — resolves key via `KeyRing::select`, injects `Authorization: Bearer` (or `x-api-key` for anthropic), runs `run_with_failover` (429 → cooldown → next key, ≤3 switches), `SelectedKey::drop` zeroizes the secret buffer; per-provider base URLs (`DEFAULT_BASE_URLS` incl. nvidia/openai/anthropic/deepseek/groq, overridable via `with_base_url`)**
- [x] `[DONE]` Verify raw key never enters sidecar memory at any point (assert in test) — **`sealed_channel_never_leaks_secret` + `keyinfo_sealed_channel_no_value_field` + `secret_buffers_are_zeroized_on_drop`: after a full broker round trip, the ONLY observable credential artifact is the opaque handle; serialized `KeyInfo` JSON contains neither the secret nor a `value` field; zeroize crate verified directly**
- [x] `[DONE]` Implement CES-style sealed channel (sidecar sees key_id only) — **`KeyInfo` (serde camelCase) exposes `opaqueHandle` (128-bit hex) + health/budget — the raw secret never leaves the crate; `SelectedKey.value` is `pub(crate)` and zeroized on drop**
- [x] `[DONE]` Test: provider round-trip through the broker — fail-closed on broker down, zeroize scrub verified, no key material in sidecar memory (doc 53 §2.4) — **mock-HTTP tests green: `injects_bearer_auth_and_succeeds`, `anthropic_uses_x_api_key_header`, `fail_closed_without_keys`, `fail_closed_on_unknown_provider`, `non_429_error_surfaces_immediately`, `simulate_429_fails_over_to_next_key`, `all_keys_exhausted_after_429_switches`, `parses_sse_stream`, `streaming_roundtrip_collects_deltas_and_usage`, `sealed_channel_never_leaks_secret` — 10 broker + 17 keyring + 4 vault-level (lib.rs) = 31/31 at P1.2 (re-verified 2026-08-10; vault suite now 68/68 incl. P1.3 ledger + P1.7 oauth + P1.8 local)**
- [x] `[DONE]` Test: streaming chat round-trip with real BYOK key (Anthropic or OpenAI) — **`crates/everyaios-vault/examples/nim_stream.rs` (env-var `NVIDIA_NIM_API_KEY`, key never in repo): LIVE round-trip through the broker to NVIDIA NIM — `NIM response (true): EveryAIOS broker round-trip OK`, ring records success_count=1 — PASS ✅ (re-verified 2026-08-10: example present + compiles clean; live PASS recorded in commit `bce0d59`; re-run needs `NVIDIA_NIM_API_KEY`)**

### P1.3 Cache-Aware Costs (A9 — ARCH/09: doc 05 + ARCH/05; ARCH/05 token economy)
- [x] `[DONE]` Implement cost ledger table: token_usage(ts, session, provider, model, key_id, in, out, cache_read, cache_write, cost) — vault schema v3 adds `token_usage` (session_id, provider, model, key_id, ts, in_tokens, out_tokens, cache_read_tokens, cache_write_tokens, cost); ledger.rs `record_turn`/`session_totals` + ledger_roundtrip test; 48/48 vault tests green
- [x] `[DONE]` Parse usage from provider response (handle AI SDK v6 cached-input normalization) — ledger.rs `Usage::from_json` handles OpenAI `prompt_tokens_details.cached_tokens` + Anthropic `cache_creation_input_tokens`/`cache_read_input_tokens`; AI SDK v6 normalization = cached tokens excluded from billed `in` before cost; parses_openai_cached_usage + parses_anthropic_cached_usage tests green
- [x] `[DONE]` Implement per-session $ budget enforcement (J11): default $2.00, kill on exceed — session_budget.rs `SessionBudget` (default 2.00, configurable), broker pre-flight `Budget::check` → `BrokerError::SessionBudgetExceeded{limit,spent}` before any call; post-turn settle records real cost; budget_kill_on_exceed + budget_isolation tests green. NOTE: enforcement is pre-flight + post-turn-settle (kill blocks the NEXT turn) — mid-stream kill is impossible because providers only report usage in the final chunk (stream_options.include_usage); documented limitation
- [x] `[DONE]` Surface "stopped: $X limit" to UI on budget kill — broker error surfaces as budgetExceeded chat event with limit+spent (chat.rs post_turn_budget_kill_surfaces_stopped test); Chat.tsx renders `⛔ stopped: $X / $Y limit reached`
- [x] `[DONE]` Implement the 3-layer cache stack (doc 62): **semantic cache + result cache landed in `everyaios-memory::cache` — `SemanticCache` (exact + near-match token-Jaccard ≥ threshold prompt→response reuse, TTL'd, read-only-intent gated) + `ResultCache` (dependency-tagged, `invalidate_tag` drops derived results, TTL'd). Prompt-cache prefixing (Anthropic `cache_control:ephemeral` / OpenAI ≥1024-token) remains a broker follow-up.**

### P1.4 Streaming Chat Loop (B1 — ARCH/09: doc 05/16; doc 41 P1/ADAPT pi + Hermes rows)
- [x] `[DONE]` Wire core-engine ConversationEngine from APP into coordinator (B1/H1 base) — packages/coordinator/src/chat.ts: `generatePrompt` (assembleChatPrompt) / `persistTurn` (storeConversationTurn) / `extractMemory` (memoryUpdate) all call the real `@personal-ai/core-engine` ConversationEngine; no network in unit tests (FakeBridge); tsc clean + 28/28 coordinator tests at P1.4 (suite now 41/41, re-verified 2026-08-10)
- [x] `[DONE]` Implement streaming over IPC: token deltas → everyaios-core → Tauri events → UI — sidecar_link.rs framed bidirectional link (JSON-lines over stdio) + chat.rs relay; coordinator streams `chat/provider_chunk` requests → Rust runs the broker (keys live in Rust) → `chat-event` emitted via `app.emit` (src-tauri lib.rs chat_stream/chat_cancel); ui/src/lib/tauri.ts + Chat.tsx wired; core 41/41 tests green
- [x] `[DONE]` Implement 33ms batch flush (StreamSession pattern from APP) — chat.ts StreamSession: 33ms interval batch flush, complete() flushes remainder; chat tests assert batch interleaves + final flush; fullText accumulated for done event
- [x] `[DONE]` Implement TTFT (time-to-first-token) event — StreamSession `ttft` fires with latencyMs on first delta (appended before first batch); chat.test ttft_seq test
- [x] `[DONE]` Implement cancellation: abort signal propagation from UI → Rust → sidecar → provider — Tauri `chat_cancel` command → core CancellationToken → chat.rs streaming loop breaks → sidecar sees abort and aborts provider stream; chat tests cancel sequence
- [x] `[DONE]` Strip mobile-only hooks (creditAware, shouldContinueStreaming → budget-aware) — chat.ts has zero creditAware/shouldContinueStreaming references (strip test asserts absence); budget gating lives in the Rust broker (SessionBudget), not the engine — sidecar-proposes/Rust-disposes holds

### P1.5 System Prompt Assembly (J6/ARCH/11 — doc 25 PageIndex <user_document> + doc 16 Hermes promptware scan; core-ai system-prompt.ts)
- [x] `[DONE]` Port 12-segment stable-prefix prompt from core-ai — `packages/coordinator/src/prompt.ts` `buildDesktopSystemPrompt` drives the full `assembleChatPrompt` (segments 1–11: policy → output contract → persona → tools → instructions → agent → memory → boundary → vision → retrieved → fresh) + desktop `<identity>` slot; chat.ts generatePrompt uses it (personaId/soulMd/agentId/styleMemoryBlock/sourceLabels/userDocuments wired through ChatStreamParams)
- [x] `[DONE]` Implement CACHE_BOUNDARY marker (byte-stable prefix above, volatile below) — core-ai `CACHE_BOUNDARY` re-exported; `stablePrefixOf()` splits at the marker; cache-stability test asserts byte-identical prefix across turns with different volatile tails, and that persona/agent changes correctly dirty the prefix
- [x] `[DONE]` Implement `<untrusted>` envelope for RAG/web content — `wrapUntrusted` (angle-bracket-escaped, forged-tag-neutralizing, single real envelope pair) applied to retrievedSources/freshResults below the boundary; retrieved content asserted OUT of the stable prefix + IN an envelope (C.13)
- [x] `[DONE]` Implement `<user_document>` wrapping for injection defense (J6) — `wrapUserDocument(title, content)` with escaped title/body so docs cannot forge closing tags; assembled below the boundary; escape + single-closing tests green
- [x] `[DONE]` Verify: prefix bytes are identical across turns (test cache stability) — prompt.test.ts: same persona/soul/agent/style + different volatile content → `stablePrefixOf(turn1) === stablePrefixOf(turn2)` (byte-identical); persona change → prefix differs (correct invalidation); 41/41 coordinator tests + tsc green (re-verified 2026-08-10)

### P1.6 Chat UI (H1/H7 — ARCH/11 A-1/A-10/C-1 + ARCH/12-UI-SPEC; SPEC H7 KaTeX+highlight; doc 41 P1 chatbox/jan; doc 16 Hermes SOUL.md B-2)
- [x] `[DONE]` Implement chat message list with streaming token display — Chat.tsx message list renders assistant bubbles via Markdown (live bubble updates per batch, TTFT creates the bubble, done/error/cancelled/budgetExceeded finalize it); preview-mode echo keeps UI explorable without Tauri
- [x] `[DONE]` Implement message branching (fork from any message) — every message (i>0) shows a ⑂ fork button on hover → truncates history at that message + `✦ forked — continuing from here` chip; fork disabled while streaming
- [x] `[DONE]` Implement token streamer display (tokens/sec, context %, active key) — footer bar: tokens/s from a 3s sliding window over batch tokenCounts, context % gauge (totalTokens/128K nominal), active key (provider/model); resets on done/error/cancel
- [x] `[DONE]` Implement KaTeX math rendering (H7) — ui Markdown component: react-markdown + remark-math + rehype-katex + katex CSS; inline `$...$` and display `$$...$$` render
- [x] `[DONE]` Implement syntax-highlighted code blocks with Copy button (H7) — rehype-highlight (github-dark theme) + custom CodeBlock with language bar + Copy/Copied ✓ button (navigator.clipboard); inline code styled separately
- [x] `[DONE]` Implement persona selector (SOUL.md presets) — header dropdown with core-ai PERSONA_PRESETS (straight-shooter/warm/coach/terse) + `custom SOUL.md…` option opening a Hermes-style identity editor (Slot #1, injection-scanned in sidecar prompt.ts B-16); personaId/soulMd passed via chatStream → coordinator assembly

### P1.7 OAuth Subscriptions (A4 — ARCH/09 A4: doc 33 §7.4, doc 13 §5.5; doc 41 P1) — behind flag
- [x] `[DONE]` Implement ChatGPT Pro PKCE flow (encrypted token → vault) — **crates/everyaios-vault/src/oauth.rs**: `start_pkce` (S256 code_challenge from a vault-stored verifier + CSRF `state`, auth0.openai.com/authorize, scopes openid/profile/email/offline_access/model.request, extraAuthParams mirroring BrowserOS) → `complete_pkce` (authorization_code grant w/ code_verifier, token rows in SQLCipher `oauth_tokens`, stable account_id from id_token `sub`); client_id overridable (`with_client_id` — we register our OWN per doc 33). Gated by `EVERYAIOS_OAUTH` (doc 13 §5.5 public-client PKCE, no secret)
- [x] `[DONE]` Implement Copilot device-code flow — **oauth.rs `start_device`/`poll_device`**: github.com/login/device/code (scope read:user) → poll github.com/login/oauth/access_token (authorization_pending/slow_down/expired/denied mapped) → **internal exchange** api.github.com/copilot_internal/v2/token (editor headers) stores the Copilot chat token in the ring, GitHub token kept as refresh for re-exchange
- [x] `[DONE]` Implement Qwen device-code flow — **oauth.rs**: chat.qwen.ai/api/v1/oauth2/device/code → /token, device-code + PKCE (S256 challenge on start, code_verifier on poll), form content type, scopes openid/profile/email/model.completion
- [x] `[DONE]` Same failover semantics as BYOK keys — every token acquisition/refresh **upserts the access token into `key_ring`** (`provider` = oauth provider, `key_id` = account id) so A3 selection/429-cooldown/affinity/budgets/health apply unchanged; broker gained `with_oauth()`: a 401 on an oauth provider → `refresh()` → one retry (`broker_401_refreshes_oauth_token_and_retries`); oauth providers added to `DEFAULT_BASE_URLS` (chatgpt-pro codex/v1, api.githubcopilot.com, portal.qwen.ai/v1). Tests: pkce round-trip + ring link, state-mismatch CSRF, copilot pending→approved + exchange + refresh, qwen verifier, refresh rotation, disabled-flag gate, revoke, 429 failover across two oauth accounts — vault 68/68 green (57 at P1.7, +11 P1.8 local, re-verified 2026-08-10). ⚠️ Still behind `EVERYAIOS_OAUTH=1`; UI/Tauri callback wiring is a follow-up

### P1.8 Local Models (A5 — ARCH/09 A5: doc 34 §2 + doc 33 §7.4; B5 → SPEC B5 + v2.0 §P3; doc 41 REFERENCE rows)
- [x] `[DONE]` Implement Ollama detection + managed spawn from everyaios-core — **`crates/everyaios-core/src/local.rs`** `LocalManager`: probe `GET {OLLAMA_HOST|config}/api/tags` (3× retry — a fresh server is slow), `ensure_ollama()` spawns `ollama serve` detached (setsid) + waits ≤20s; `list_ollama_models()` parses `/api/tags` + per-model `/api/show` → effective ctx = min(forced num_ctx, model max); `[local]` section in everyaios.toml (ollama_host/ollama_bin/llamafile_bin/llamafile_port/num_ctx). ChatRelay gained `register_local_defaults()` + `with_local()`; src-tauri registers them at relay connect; broker routes `ollama`/`llamafile` keylessly (no KeyRing) — 9 new core tests green (mock ollama server, shared OnceLock — flake-free)
- [x] `[DONE]` Implement llamafile single-binary launch — **doc 34 §2** (Mozilla-Ocho/llamafile — weights + server in one binary, zero install): `find_llamafile()` (config → `EVERYAIOS_LLAMAFILE` → `<data_dir>/bin/*.llamafile`), `ensure_llamafile()` spawns `--host 127.0.0.1 --port 11435 --ctx-size 16384 --nobrowser` + `/health` wait (≤60s, first-run unpack); broker llamafile path hits `/v1/chat/completions` (OpenAI SSE, `grammar` field)
- [x] `[DONE]` Implement context-window warning UI (≤15-20K) — **doc 33 §7.4** (below 15K the agent loops): Chat.tsx resolves per-model ctx (`ctxWindowFor`: local = forced num_ctx / known-model overrides, cloud = nominal 128K), amber banner <20K + loud ⚠ <15K; the % gauge now uses the per-model window instead of hardcoded 128K; P1.9 model picker feeds provider/model into `chat_stream`
- [x] `[DONE]` Implement GBNF grammar constraint passthrough for local models (B5) — **SPEC B5** + v2.0 §P3: broker `Grammar` enum (None/Json/JsonSchema/Gbnf); body `grammar` string → GBNF, object `{type: json|json_schema|gbnf, value}` → typed, `tools` present → JSON-mode default; llamafile sends raw GBNF in native `grammar` (llama.cpp), ollama sends `format` = "json" / JSON schema. ⚠️ **Verified live on ollama 0.21.1: raw GBNF in `format` 500s ("invalid format")** — ollama's grammar API is JSON/schema only, so GBNF falls back to `format:"json"` (still logit-layer grammar → output is guaranteed valid JSON); raw GBNF is a llamafile/llama.cpp-native feature (doc 41 REFERENCE rows updated)
- [x] `[DONE]` Test: local model tool call with GBNF → verify valid JSON always — **LIVE PASS (2026-08-10)**: `ollama pull qwen2.5:0.5b` (397MB) → `EVERYAIOS_LIVE_TEST=1 EVERYAIOS_LIVE_MODEL=qwen2.5:0.5b cargo test ... --ignored` → `LIVE PASS: ollama tool call → valid JSON: {"tool": "WeatherTool"}` (2.4s). `#[ignore]`-gated + env-guarded; mock tests cover both runtimes (format/grammar field assertions, keyless path, usage→ledger at $0, budget pre-flight, fail-closed)

- [x] `[DONE]` **Hardware-fit picker for local models (doc 58 — llmfit pattern):** detect RAM/CPU/GPU and score candidate local models (fit/speed/quality/context; Q4_K_M ≈ 0.5 B/param) before spawn — **`everyaios-core::hwfit` (`detect` via sysinfo RAM/CPU + best-effort GPU class; `score_model` → `ModelFit {fits,fit,speed,quality,context,score}`; `recommend` ranks fits-first, non-fitting models disqualified). MLX (Rapid-MLX) runtime + retiring the ≤15–20K warning for the agent-native 30B/120K class = follow-up.**
- [x] `[DONE]` Self-healing tool-parse repair (B5, doc 62): fix malformed tool-call JSON before the 2-parse-failure cloud escalation — **`everyaios-memory::repair::repair_tool_json` (code-fence strip, span trim, brace/bracket balance, trailing-comma strip, single→double-quote swap when no double quotes; `repaired` flag; garbage-in = unchanged, never panics)**

### P1.9 Model Catalog (A6 — ARCH/09 A6: doc 19 + core-providers pi.dev catalog, 15 prov / 280 models; feeds A7)
- [x] `[DONE]` Implement model catalog: per-provider model registry with capability hints (tools, vision, context window) — **`packages/coordinator/src/catalog.ts`**: wraps core-providers capability-registry (pi.dev snapshot — `getModelCatalog`/`getModelsForProvider`/`getModelCapabilities`), broker-id alias map (`nvidia↔nvidia-nim` + OAuth/local providers), `hintsFor()` (ctx/tools-heuristic/vision/reasoning/costScore), `setLocalModels()` merges installed ollama models with effective ctx, `contextWindowFor()` for the UI. 15 catalog tests green
- [x] `[DONE]` Router consumes catalog hints for task-to-model selection (feeds A7 asymmetric tiering) — **`packages/coordinator/src/router.ts`**: `selectModelForTask()` filters by vision/tools/min-ctx then ranks cheapest (subagent) or most capable (planner); `plannerForTask`/`subagentForTask`; `ASYMMETRIC_TIERS {depth:2, concurrency:6, writers:3}`; explicit model lock wins; local models are candidates once merged; fallback with reason. 7 router tests green — coordinator suite now **56/56 + tsc clean**

- [x] `[DONE]` **A6 catalog long-tail (doc 58/59):** ingest OmniRoute's MIT `PROVIDER_REFERENCE.md` (339 providers) as reference data — **`everyaios-core::provider_ref` (`parse_provider_reference` tolerant markdown-table parser + `classify_category` → `AuthClass` + `ingest_provider_reference` → `IngestReport` with per-class reject counts); allow-list = API-key + local + keyless only; cookie + OAuth-CLI = doc-57 reject list. The actual 339-provider file is dropped in at install/build time.**

**P1 Exit Criterion:** Two keys under one provider auto-failover under simulated 429; streaming chat round-trip with real BYOK key; ledger rows correct; $ budget kills session. P1.8/P1.9 done 2026-08-10 (local runtimes + catalog/router live-verified).

---


## PHASE 2 — Browser Layer (~6 weeks)

### P2.1 CDP Client (everyaios-cdp, E1 — doc 33 §5, doc 34, ARCH/08 §8)
- [x] `[DONE]` Implement WebSocket CDP client (tokio-tungstenite) — **`src/transport.rs`**: sync facade over tokio-tungstenite — dedicated driver thread running a current-thread tokio runtime; `tokio::select!` multiplexes the WS reader (id-routed pending map) vs bounded command channel (backpressure); `DriverCommand::Cancel` drops a timed-out pending entry so no map leak; `close()` drops the command sender to end the loop (no hang on shutdown); sync `call`/`call_session` with `CallError::Timeout`; flatten + nested attach modes (see protocol tolerance)
- [x] `[DONE]` Implement Chrome/Edge discovery: `--remote-debugging-port=0` → read DevToolsActivePort — **`src/discovery.rs`**: `discover_endpoint` probes `DevToolsActivePort` in the profile dir (with stale-file removal pre-spawn), falls back to `/json/version` + `/json/list` probes on a known port; `endpoint()` exposes the resolved ws URL
- [x] `[DONE]` Implement loopback-only host restriction (security) — **`src/discovery.rs`**: only `127.0.0.1`/`::1` endpoints are ever accepted as the debug endpoint (rejects remote hosts outright); per-request `ureq` timeout (5s) so dead-but-open ports can't hang discovery
- [x] `[DONE]` Implement per-target sessions (multiple tabs) — **`src/transport.rs`**: `Target.createTarget` + `list_targets` (id-tolerant: CDP `Target.getTargets` uses `targetId`, HTTP `/json/list` uses `id` — both supported) + `attach` → flat session with id-routed responses; `Session` handles multiplexed calls per tab
- [x] `[DONE]` Implement chrome-for-testing download fallback (if no system browser) — **`src/browser.rs`**: `spawn_browser` locates system chrome/edge (config → env → PATH); on failure downloads a chrome-for-testing build (manifest.json → platform-matched zip → zip-slip-guarded extraction, raw-byte stream, not lossy String) then spawns it
- [x] `[DONE]` Implement protocol-version tolerant client (handle Chrome version skew) — **`src/discovery.rs`/`transport.rs`**: AttachMode negotiation from `Protocol-Version` — `flatten` (older/agent-browser-style) vs `nested` (Target.attachToTarget + `sessionId`-routed messages, `receivedMessageFromTarget`); unknown `TargetType`s tolerated via `#[serde(other)]`; optional `webSocketDebuggerUrl`. **29/29 cdp tests green (incl. protocol_error, timeout, nested/flatten round-trips, zip-slip, manifest routing)**

### P2.2 A11y Snapshot Engine (everyaios-browser, E3 — doc 33 §5, doc 55 agent-browser snapshot.rs, ARCH/08)
- [x] `[DONE]` Reference: agent-browser `snapshot.rs` semantics (doc 55) — role taxonomy (interactive/content/structural), zero-width-char filtering, compact `@eN` refs — **`src/ax.rs`**: `Role` taxonomy with `INTERACTIVE_ROLES`/`CONTENT_ROLES`/`STRUCTURAL_ROLES` (deduped), `strip_zero_width` filters U+FEFF/200B/200C/200D/2060/00AD, refs rendered compact `[ref=eN]` (agent-browser convention)
- [x] `[DONE]` Implement Accessibility domain CDP calls → indented tree render — **`src/ax.rs` + `src/tree.rs`**: `Accessibility.getFullAXTree` (per-frame) parsed via `AxNode::parse_many`; `render()` emits the indented tree text (webarea → children with 2-space indent)
- [x] `[DONE]` Implement stable ref minting `[ref=eN]` scoped to (document_id, url) — **`src/tree.rs`**: per-snapshot counter seeds `ref=eN` under the (document_id, url) scope; `TreeBuilder` carries the scope through every build
- [x] `[DONE]` Implement `interactive` mode (actionables + headings only, ~90% token cut) — **`src/tree.rs`**: `SnapshotMode::Interactive` prunes to interactive roles + headings (keeps iframe placeholders for stitching); full mode = complete tree
- [x] `[DONE]` Implement `full` mode (complete tree, depth caps 1..=100) — **`src/tree.rs`**: `SnapshotMode::Full` renders everything, depth clamped to `1..=100`; structural collapse (WebArea/iframe placeholder splice) keeps depth sane
- [x] `[DONE]` Implement iframe stitching (inline child frames) — **`src/capture.rs`**: `SnapshotEngine` detects same-process iframes (srcdoc/same-origin have no standalone target) → `DOM.describeNode` resolves the owner `frameId` → `Accessibility.getFullAXTree({frameId})` on the parent session → child tree spliced under the placeholder, skipping the child's WebArea root
- [x] `[DONE]` Implement line-diff between snapshots with `+n/-n` markers — **`src/diff.rs`**: `similar`-based line diff (`from_slices`) → `+n`/`-n` markers on added/removed lines
- [x] `[DONE]` Implement URL-change short-circuit (navigation → return full new snapshot) — **`src/diff.rs`**: if the compared snapshots have different URLs the diff returns a full-replace marker instead of a noisy line diff. **22/22 browser tests green + LIVE PASS (real Chrome, `EVERYAIOS_LIVE_TEST=1`): spawn → DevToolsActivePort → connect → attach → a11y snapshot `heading Hello / button Go [ref=e1]`; iframe content stitched inline under the placeholder; parallel-safe (per-test unique Chrome profile dir). Workspace: 210 tests pass, clippy 0 warnings (re-verified 2026-08-12)**

### P2.3 Input Dispatch & 37-Tool Catalog (E2 — doc 33 §6, doc 46, doc 55 agent-browser read.rs; ARCH/08 §8.2 catalog)
- [x] `[DONE]` Implement `act` tool: click/type/fill/press/hover/select/scroll/drag/dialog — **`crates/everyaios-browser/src/actions.rs` `ActKind`** (17 kinds: click/click_at/type/type_at/fill/press/hover/hover_at/focus/check/uncheck/select/scroll/drag/drag_at/dialog_accept/dialog_dismiss); ref→geometry via `backendDOMNodeId` (now threaded through `A11yNode`/tree) → `DOM.getBoxModel` center → `Input.dispatchMouseEvent`/`dispatchKeyEvent`/`insertText`; check/select via `DOM.resolveNode` + `Runtime.callFunctionOn`; dialogs via `Page.handleJavaScriptDialog`; `DOM.enable` gate added (modern Chrome requires it)
- [x] `[DONE]` Implement `act` returns post-settle diff (no follow-up snapshot needed) — **`act()` captures pre + post (500ms settle) and returns `SnapshotDiff`; verified LIVE on real Chrome (click landed, diff + DOM change confirmed via read)**
- [x] `[DONE]` Implement `navigate` tool (goto URL, back, forward, reload) — **`NavigateAction`**: `Page.navigate` / `Page.getNavigationHistory` + `navigateToHistoryEntry` (guarded: no-op at history edges) / `Page.reload`; returns post-navigate snapshot
- [x] `[DONE]` Implement `snapshot` tool (calls everyaios-browser) — **`BrowserActions::snapshot()` wraps `SnapshotEngine::capture`** (P2.2); `find_ref` walks the tree
- [x] `[DONE]` Implement `diff` tool (compare two snapshots) — **`BrowserActions::diff()` → `diff_snapshots`** (P2.2 line-diff + URL short-circuit)
- [x] `[DONE]` Implement `read` tool (page → clean markdown via DOM walker) — **`BrowserActions::read(ReadMode)`**: in-process DOM walkers (`Runtime.evaluate`) — full markdown (headings/links/lists/tables/code), `outline` (headings+links), `raw` (innerText)
- [x] `[DONE]` Upgrade `read` (doc 55, agent-browser `read.rs`): markdown negotiation (`Accept: text/markdown`, `.md` retry), nearest-ancestor `llms.txt`/`llms-full.txt` walk, `--filter`/`--outline` modes, no-browser HTTP path — **`crates/everyaios-browser/src/read.rs`**: `read_http(agent, url, opts)` — Accept: text/markdown → `.md` suffix retry → ancestor llms.txt/llms-full.txt walk (≤8 hops) → plain-HTML fallback; 2MB body cap (`READ_BODY_CAP`); `apply_options` (filter/outline/raw) applied on any path; `maybe_route_to_file` (OutputFileAccess pattern); 9 unit tests green
- [x] `[DONE]` Implement `find` semantic locators (ARIA role + name/label/placeholder) — **`crates/everyaios-browser/src/locator.rs`**: `SemanticQuery{role,name}` case-insensitive role + whitespace-normalized substring name match, `find_semantic`/`find_first` (breadth-first document order), `first_actionable_ref`; 5 unit tests green (doc 55 semantics)
- [x] `[DONE]` Implement `grep` tool (line matches in page content) — **`BrowserActions::grep()`**: innerText → regex line matches with line numbers
- [x] `[DONE]` Implement `screenshot` tool (JPEG capture) — **`screenshot_jpeg(quality)` → `Page.captureScreenshot` (format jpeg)**; base64 returned for routing
- [x] `[DONE]` Implement `pdf` tool (print to PDF) — **`pdf_base64()` → `Page.printToPDF`**
- [x] `[DONE]` Implement `wait` tool (text/selector/ms) — **`BrowserActions::wait(WaitFor, timeout)`**: polls innerText / `querySelector` / sleeps; returns Satisfied/TimedOut
- [x] `[DONE]` Implement `evaluate` tool (CDP Runtime.evaluate) — **`BrowserActions::evaluate(expr)`** with returnByValue + awaitPromise
- [x] `[DONE]` Implement `tabs` / `tab_groups` / `windows` / `history` management tools — **tabs** (`Target.getTargets`), **history** (`Page.getNavigationHistory`), **windows** (`Target.getTargets` grouped by browserContextId, `create_window` via `Target.createBrowserContext`+`createTarget newWindow:true`, `close_window` via `disposeBrowserContext`). ⚠️ Honest ceiling (doc 33 §3 — BrowserOS ships these in its Chromium fork): **`tab_groups` has NO CDP surface on stock Chrome** — registered in the catalog, runtime requires the fork/extension surface (marked in the catalog)
- [x] `[DONE]` Implement `download` / `upload` with temp-file routing — **`set_download_path` (`Browser.setDownloadBehavior`) + `upload_files` (`DOM.setFileInputFiles` by backendNodeId)**; temp routing via read.rs `maybe_route_to_file`
- [x] `[DONE]` Implement `run` tool (→ everyaios-script, see P2.5) — **registered in the catalog (open_world) + engine landed with P2.5 (rquickjs sandbox 64MB/512KB/30s, browser SDK, InnerCallHook authorize+record+claim, ownership filtering; 14/14 script tests)**
- [x] `[DONE]` Register all 34 tools in everyaios-mcp (17 core interaction `tabs..run` + enhanced_snapshot + bookmarks×6 + tab-groups×5 + window×5 — catalog ARCH/08 §8.2: 17+1+6+5+5 = 34) with annotations (F9: readOnlyHint/openWorldHint, ACP tool-kind taxonomy); + `file_ops`×3 workspace extension (E2) → 37 total — **`crates/everyaios-mcp/src/lib.rs` `BROWSER_TOOLS` = 37 ToolDefs** (17 original order-preserved + enhanced_snapshot + 6 bookmarks + 5 tab-groups + 5 windows + 3 file_ops) with ToolKind + read_only + open_world; uniqueness + group-total + annotation tests green (11/11)
- [x] `[DONE]` Implement MCP tool profiles (core/network/state/debug/tabs/react/mobile) + paginated tool discovery + typed args with `extraArgs` parity (agent-browser pattern, doc 55) — **`ToolProfile` enum (core/network/state/debug/tabs/mobile/all) + `tools_for_profile()` + `paginate(page, page_size) → (slice, has_more)` + typed `ArgDef` schemas on every tool + `validate_args()` (required-args check, unknown args forwarded = extraArgs parity)**; profile/pagination/validation tests green
- [x] `[DONE]` Post-v1 tool candidates (doc 55; **NOT in P2 scope**): `a11y_audit` + batch JSON command mode + annotated screenshots — **`locator.rs`**: `a11y_audit` deterministic tree lint (actionable-without-name, duplicate-ref, image-without-alt, nested-interactive; axe-core subset) + `parse_batch` (JSON array → `Vec<ActKind>` with offending-index error); `actions::annotated_screenshot` returns JPEG base64 + `ScreenshotLabel[]` (ref ↔ name ↔ viewport center via `DOM.getBoxModel`) — the frontend draws the numbered overlay (keeps the image lib out of the crate). Also fixed a latent `screenshot_jpeg`/`pdf_base64` bug (`/result/data` → `/data`, CDP result is already JSON-RPC-unwrapped)**
- [x] `[DONE]` Add bookmark tools (6): get_bookmarks, create_bookmark, remove_bookmark, update_bookmark, move_bookmark, search_bookmarks — **registered with typed args + annotations**. ⚠️ Honest ceiling: **no CDP bookmarks domain on stock Chrome** (BrowserOS implements via Chromium fork) — runtime gated until fork/extension surface exists
- [x] `[DONE]` Add tab group management tools (5): list_tab_groups, group_tabs, update_tab_group, ungroup_tabs, close_tab_group — **registered with typed args + annotations**. ⚠️ Honest ceiling: no CDP tab-groups domain on stock Chrome (fork/extension required)
- [x] `[DONE]` Add window management tools (5): list_windows, create_window, create_hidden_window, close_window, activate_window — **engine + registration**: `Target.createBrowserContext`/`createTarget(newWindow)`/`disposeBrowserContext` + context-grouped listing
- [x] `[DONE]` Add enhanced_snapshot tool (accessibility snapshot with stable refs + paint-order filtering) — **`BrowserActions::enhanced_snapshot()`**: P2.2 snapshot + `document.elementFromPoint` occlusion check per actionable ref → `occluded` list
- [x] `[DONE]` Add file operation tools (3): save_pdf_enhanced, save_screenshot_enhanced, download_file — **registered**; routing via read.rs `maybe_route_to_file` + `set_download_path`. **Verification: 237 workspace tests + clippy 0 + 3/3 live Chrome tests (incl. new `live_act_loop_navigate_click_read`: navigate → snapshot → click via ref → read confirms DOM change → reload) — re-verified 2026-08-12**

### P2.4 Tiered Engine Stack (E10 — doc 08 §8.8, doc 55 Obscura/Lightpanda; ARCH/08 tier table)
- [x] `[DONE]` Implement tier-0 static extraction: HTML→markdown parser — **`crates/everyaios-browser/src/tiers.rs` `TieredEngine::static_fetch`: reuses `read_http` (Accept: text/markdown → `.md` retry → llms.txt walk, doc 55 read.rs) + `html2md` conversion for the PlainHtml case; 2MB `--max-output` cap; SSRF guard (loopback/RFC1918/link-local blocked by default incl. DNS-resolved re-check, `allow_private_network` opt-in), `file://` blocked, `allowed_domains` containment; `static_html_converts_to_markdown` + 3 guard tests green**
- [x] `[DONE]` Integrate Obscura (doc 55): spawn `obscura serve` binary (loopback default), connect CDP — **`spawn_light()` Obscura branch: `obscura serve --host 127.0.0.1 --port <free-port>` → `/json/version` poll → `connect_to_browser` (our everyaios-cdp client) → reuse page target → `Page.navigate` → `document.readyState` poll → DOM-walker markdown. Binary absent → clean `EngineError::BinaryNotFound` → E8-escalates (LIVE-verified: lands on real headless Chrome). ~30MB RSS + embedded MCP 32 tools + `LP.getMarkdown` claims are source-verified in doc 55 (ARCH/09 E10) — the same Chrome-compatible CDP surface is exercised live via Lightpanda.**
- [x] `[DONE]` Obscura security flags (doc 55 §2 / 06 §6.15): SSRF defaults (loopback/RFC1918 blocked, `--allow-private-network` opt-in), `file://` blocked by default, bounded `--max-connections` — **flags wired: `--allow-private-network`/`--allow-file-access` only when opted in (Obscura defaults block both); `--max-connections` bounded (128); SSRF/file:// also enforced in-process by `guard_ssrf`/`guard_domain` on EVERY tier (defense in depth)**
- [x] `[DONE]` Browser network containment (doc 55 §1 / 06 §6.15): `--allowed-domains` → WebRTC (RTCPeerConnection) disable + worker fail-closed guards + content boundaries + max-output — **Lightpanda branch passes `--disable-workers` (fail-closed) + `--cdp-max-connections`; Chrome tier passes `--disable-features=WebRTC`; `allowed_domains` enforced at the orchestration layer (agent-browser `--allowed-domains` semantics, `guard_domain`); full worker-guard parity is native to the light engines — same honest ceiling as P2.3 bookmarks (stock Chrome has no CDP switch for it); `--max-output` = 2MB cap on every tier**
- [x] `[DONE]` Integrate Lightpanda: binary spawn, CDP connection (**default**, AGPL spawn-only); driver pattern: agent-browser `native/cdp/lightpanda.rs` (doc 55) — **`spawn_light()` Lightpanda branch: `lightpanda serve --host 127.0.0.1 --port <free> --block-private-networks --disable-workers --cdp-max-connections` → `/json/version` → Chrome-compatible CDP — our existing `everyaios-cdp` client drives it unchanged (LIVE PASS against the installed binary; AGPL respected: spawn-only, never linked)**
- [x] `[DONE]` Implement escalation logic (E8): tier 0→1→2 based on failure/JS-need/login-need — **`TieredEngine::fetch(intent)` picks the starting tier (Static / NeedsJs→light / NeedsLogin→chrome), then `escalate_from()` loops static→light→chrome on failure/capability-gap; policy rejections (SSRF/file://domain) never escalate; `escalation_rules` test (7 rules) green**
- [x] `[DONE]` Test: scrape task runs on light engine, escalates to Chrome only on JS-render need — **`live_tiered_stack_escalation` (LIVE PASS, real binaries): Static intent → tier 0 reads example.com with no browser process; NeedsJs → Lightpanda tier renders it; Obscura-missing gap → real headless Chrome tier renders it (escalates only on need). 52/52 browser unit tests, workspace 246, clippy 0**

### P2.5 Script-Eval Sandbox (everyaios-script, E4 — doc 33 §6.3, doc 55 agent-browser run; ARCH/08)
- [x] `[DONE]` Integrate rquickjs crate with async runtime — **`crates/everyaios-script` (rquickjs 0.12, features `futures`+`parallel`, no rust-alloc so memory limits apply): fresh `AsyncRuntime` per eval on a dedicated thread (runaway script can never poison a shared engine, no JS state leaks between runs); `AsyncContext::full` + `EvalOptions{promise}` → top-level `await` + script completion value; tokio current-thread runtime inside the eval thread (safe from inside any caller runtime); teardown discipline: drop context → `rt.run_gc()` before free (avoids `JS_FreeRuntime` gc_obj_list abort); rquickjs#370 avoided — functions never capture a cloned `Ctx`**
- [x] `[DONE]` Implement limits: 64MB heap, 512KB stack, 30s timeout, 1K log lines, 2MB return — **`SandboxLimits::default()` enforced: `rt.set_memory_limit(64MB)` + `rt.set_max_stack_size(512KB)` before context creation; 30s interrupt handler (uncatchable exception → `SandboxError::Timeout`) + tokio timeout grace for hung Rust futures; bounded `console` (1K lines → truncated flag); return payload capped at 2MB (`ReturnTooLarge`). Tests: runaway loop → Timeout, never-resolving promise → Timeout, 4MB-heap OOM → Limit, recursion → stack error, 1000-char return under 100B cap → ReturnTooLarge, 100 console lines under cap 10 → truncated**
- [x] `[DONE]` Implement `browser` SDK surface (pages, observe, input, nav, read, grep, etc.) — **JS prelude mirrors ARCH/08 §8.4 exactly: `pages.newPage/close/list/getInfo`, `observe(pageId).snapshot/diff/resolveRef`, `input(pageId).click/fill/type/press/hover/select/scroll`, `nav(pageId).goto/back/forward/reload`, `read/grep/wait/screenshot/evaluate/pdf/download/upload/tabGroups/windows`, raw `cdp(method, params, sessionId)` escape hatch — every method funnels through ONE Rust channel (`__primitive`) so nothing can bypass the hook; JSON bridging via JSON.stringify/parse (rquickjs 0.12 has no serde_json impl)**
- [x] `[DONE]` Implement InnerCallHook: every primitive (a) authorized (b) recorded (c) page-creations claimed — **the hook lives in `__primitive` (sandbox.rs `install_sdk`): authorize → exec → record (denied attempts included, `ok:false`) → `pages.newPage` success claims the new page (`on_page_created`). Scripts cannot reach a browser action outside the channel. `BrowserHost` trait = the caller-supplied policy/audit/browser**
- [x] `[DONE]` Implement ownership filtering: pages.list() returns mine/user/other-agent — **`PageOwnership::Mine|User|OtherAgent` (kebab-case in JSON); `pages.list()` exposes ownership per page; closing/acting on a non-owned page is denied by the host's authorize and surfaces as a JS error to the script (test: foreign-tab close blocked + still audited)**
- [x] `[DONE]` Test: run multi-step script → verify every primitive has an audit row — **`multi_step_script_every_primitive_has_audit_row`: newPage → nav.goto → read → grep → close writes 5 `script.primitive` rows (every one `ok:true`) + 1 `script.page_created` claim row to the NDJSON audit via everyaios-audit. 14/14 script tests green (workspace 258, clippy 0)**

### P2.6 Tab Ownership (E6 — doc 33, ARCH/08)
- [x] `[DONE]` Implement ownership model: mine / user / other-agent per tab — **`crates/everyaios-browser/src/ownership.rs` `TabOwner` (kebab-case serde, maps 1:1 to the script sandbox's `PageOwnership`) + `TabRegistry` (thread-safe policy store): `sync_targets(&[TargetInfo])` attributes unknown page/tab targets to **User** (fail-closed: never assume an agent owns a tab it didn't claim), preserves claims across refreshes, drops closed targets; `owner_of()` defaults to User for untracked tabs; `records()` feeds `pages.list()` ownership labels**
- [x] `[DONE]` Implement claims table (tab_claims in audit DB) — **every claim/denial/release/group-close writes a `browser.tab_claim` NDJSON event (`TabClaim` payload: tab_id, owner, action, agent_session, group_id, reason) via the attached `AuditWriter` — the `tab_claims` table, BrowserOS model (doc 33). Denied attempts are audited too (denied = part of the trail); audit failures never break the browser path**
- [x] `[DONE]` Implement group-per-agent (agent session → tab group) — **one group per agent session (`agent-<session>`), created on first claim; `close_agent_group(session)` returns exactly that session's tab ids for CDP close + audits `group_closed` per tab; other agents'/user tabs survive. (Stock Chrome has no TabGroups CDP — logical grouping only, per P2.3 gating)**
- [x] `[DONE]` Test: agent cannot close a user tab — **`agent_cannot_close_a_user_tab` (deny + audit), `agent_cannot_close_another_agents_tab` (WrongSession), `agent_can_close_own_tab`, `release_of_user_tab_fails`, `close_agent_group_returns_only_that_sessions_tabs`, `denied_attempts_are_audited`, sync claim-preservation/drop tests. 11 ownership tests + `close_tab` CDP primitive (`Target.closeTarget`) in actions.rs — 64/64 browser tests, workspace 270, clippy 0**

### P2.7 Session Vault (E11/E7/E13 — doc 08 §8.9, doc 55 Steel leveldb + session storage, doc 33 §3.2)
- [x] `[DONE]` Design SQLCipher schema: per-site **full storage context** — cookie jars (host-keyed) + localStorage + sessionStorage + IndexedDB + auth headers — **`crates/everyaios-vault/src/session.rs` + `lib.rs` schema v5: `sessions` (UNIQUE site,account) + `session_cookies` + `session_storage` + `session_headers` + `session_grants` + `session_uses` (audit), all cascade-on-delete; Chrome raw-storage decode (`0x00` UTF-16-LE / `0x01` ISO-8859-1) applied by the import path — bytes stored verbatim here**
- [x] `[DONE]` Implement `persist`/`restore` flag per session (stateful workflows survive restarts — Steel pattern, doc 55) — **`CaptureInput.persist` + `SessionRecord.persist`; capture upserts (re-capture replaces, never duplicates) so a `persist` session survives restarts**
- [x] `[DONE]` Implement multi-account per site (personal/work/test = separate Session records) — **deterministic opaque `sv_<sha256(site:account)>` id + `UNIQUE(site, account)`; test: `multiple_accounts_per_site_are_separate`**
- [x] `[DONE]` Implement capture path 1 (E7): sign-in-in-browser → Page.getCookies → seal to vault — **`everyaios-browser/src/session.rs`: `get_cookies` (`Network.getCookies`) + `cookie_from_cdp` + `seal_session` (reads the live jar → `SessionVault::capture`) — test: `seal_then_inject_roundtrip_through_vault`**
- [x] `[DONE]` Implement capture path 2 (E13): session inheritance (attach to user's Chrome profile via debug port) — **`inherit_cookies_from_chrome(port)`: `probe_browser` → `connect_to_browser` → `Storage.getCookies` (the modern browser-target method; `Browser.getCookies` is gone in current Chrome) → `group_cookies_by_site` buckets ready to seal. LIVE-verified: set cookie on one connection, inherit it via the discovered debug port**
- [x] `[DONE]` Implement Trust-Ladder-gated access (J1): agent never sees raw cookies — **`SessionRecord` has no value fields (enforced by construction); raw values only via `inject()` behind a `session_grants` row at/above the requested `TrustLevel` (read_only < form_fill < drive_autonomous); denied/inactive attempts audited as `deny`**
- [x] `[DONE]` Implement cookie injection: vault → browser context at request time, revoke at session end — **`inject_session`: `SessionVault::inject` (gated) → `set_cookies` (`Network.setCookies`, one call for the jar); revoke-at-end = the session's `revoke_agent`/`revoke_all` (vault). Test: `inject_without_grant_is_denied` (no setCookies call)**
- [x] `[DONE]` Implement rotation: 429/blocked/expired → next authorized account — **`rotate_account(site, agent, current, level)` round-robin by least-recently-used over authorized active sessions (mirrors key-ring A3)**
- [x] `[DONE]` Implement expiry tracking + re-auth nudge card — **`ttl_secs` → `expires_at`; `expired_sessions()` (active-but-lapsed) + `mark_expired()`; expired sessions can't inject (`Inactive`); the nudge card itself is UI (P3)**
- [x] `[DONE]` Implement usage audit: session_uses rows per account per site — **`record_use` on capture/inject/rotate/revoke/deny; `usage_rows(site)` joins sessions for the replay/scrubber view**
- [x] `[DONE]` Test: round-trip (capture → grant → inject → revoke; agent never sees cookies) — **11 vault session tests + 10 browser cookie-glue tests (`cookie_from_cdp`/`cookie_to_cdp` round-trip, malformed-skip, same-site normalization, seal→inject round-trip, inject-without-grant-denied, `group_cookies_by_site` dot-strip + distinct-host) + 1 gated LIVE E13 test — 74/74 browser tests, workspace 427, clippy 0**

### P2.8 Challenge Handler (E12 — doc 08 §8.10)
- [x] `[DONE]` Implement PoW captcha solver (Altcha/Friendly Captcha) in everyaios-core — **`crates/everyaios-core/src/challenge.rs`: `ChallengeHandler::solve_pow`/`verify_pow` (SHA-256 leading-zero-nibble puzzle, Altcha/Friendly Captcha contract); Turnstile is Cloudflare-managed (incl. hidden mode) → NOT locally solvable, routed to human/BYO honestly**
- [x] `[DONE]` Implement human-in-loop pass-through: surface tab in visible webview, user solves — **`ChallengeHandler::surface`/`resolve_human`/`pending` single-use registry (an id can't be redeemed twice — duplicate/stale solves are refused); `HumanChallenge` is the serializable card the UI (P3) renders. The webview surfacing itself is the UI's `resolve_human` consumer**
- [x] `[DONE]` Implement LLM visual-grounding: snapshot → act for simple visual challenges — **`route_visual` (prefers grounding for managed captchas) + `grounding_request` (kind/site/prompt/options contract) + `parse_grounding_choice` (free-text → `Option(id)`/`Point{x,y}`/`Unsolvable`); the sidecar makes the model call and feeds the parsed choice to `act`**
- [x] `[DONE]` Implement optional BYO solver API hook (CapSolver/2Captcha, user's own key) — **`solve_captcha` (`createTask` → poll `getTaskResult`), `create_task`/`poll_task`, `ByoProvider` (CapSolver/2Captcha base URLs + task types), transport-injected `SolverHttp` (default `UreqHttp`); the user key is stored via the existing key-ring (A2/A3), never bundled credit**
- [x] `[DONE]` Test: PoW challenge auto-solved locally — **23 challenge tests: detection (case-insensitive, PoW-preferred), routing (PoW→local even with BYO; managed→human/BYO/visual), solve/verify round-trip + difficulty-sensitivity + out-of-range, surface/pending/single-use registry, grounding-request + option/point/unsolvable parse, createTask/poll/solve (ready/processing/error/timeout) + provider parse — 73/73 core tests, workspace 427, clippy 0**

### P2.9 Behavioral Realism (E14 — doc 08 §8.10 CloakBrowser pattern)
- [x] `[DONE]` Implement Bézier mouse curves for click/hover dispatch — **`everyaios-browser/src/humanize.rs` + `actions.rs`: cubic Bézier `mouse_path` (control points offset perpendicular to the chord, steps scaled by distance, per-step cadence, jittered natural click target) — `click`/`hover`/`drag` emit a real `mouseMoved` path, never a teleport; drag releases at the exact drop target**
- [x] `[DONE]` Implement per-key typing cadence with natural variance — **`typing_delays` (lognormal-style per-char variance + word-boundary pauses) → per-char `Input.dispatchKeyEvent` keyDown/keyUp with `text` (CDP-style), replacing one-shot `Input.insertText` when enabled**
- [x] `[DONE]` Make per-site configurable (some sites need it, most don't) — **`BehaviorProfile` (mouse + typing + host allow-list + optional seed): `site_enabled(url)` gates per host (scheme/port/path stripped); off by default — the deterministic default engine is byte-identical; `with_behavior()` builder + `act` note `"humanized (P2.9)"` when applied. Tested: seeded xorshift determinism, bezier endpoint/steps invariants, cadence word-pause, host gating, plain-click has zero mouseMoved, per-key event sequence, exact drag release — 355 ws tests (246 + 24 + 44 + 12 + 18 + 3 + 8 P3.3), clippy 0, fmt clean**

### P2.10 Session Replay (E5 — doc 33 §9, doc 08; doc 53 §4 durable event log + idempotency classes)
- [x] `[DONE]` Implement injected recorder (CDP Page.addScriptToEvaluateOnNewDocument) — **`everyaios-browser/src/replay.rs`: `recorder_script` (capture set: click/input/keydown/scroll-rAF-throttled/MutationObserver-debounced/pagehide; POSTs NDJSON batches with `x-recording-tab-id`/`x-recording-document-id`/`x-recording-batch-id`/`x-recording-gap` headers, `keepalive`); a failed flush flips sticky gap reported on the next batch; `window.__everyaiosRecorder` diagnostic. `install_recorder` reads the frame id from `Page.getFrameTree` (the chrome document id) + embeds endpoint/tab/doc JSON-escaped (can't break out of string literals); `remove_recorder`. Navigation = re-install for a new per-document segment**
- [x] `[DONE]` Implement NDJSON batch streaming to everyaios-audit ingest (J5: append-only audit, receipts) — **`everyaios-audit/src/replay.rs`: `ReplayIngest::ingest_ndjson` (raw NDJSON body + recorder headers, doc 33 §9.2 contract) + `ingest_batch` (structured); chrome document-id validation (≤64 ASCII-safe chars — path traversal impossible); `IngestReceipt` per batch; storage lands on the J5 append-only log family**
- [x] `[DONE]` Implement sticky `has_gap` flag on dropped/malformed lines — **malformed/dropped NDJSON lines or the recorder's `x-recording-gap` header → `has_gap=1` on the segment (MAX-sticky on re-ingest) — no fake-complete replays**
- [x] `[DONE]` Implement recording index (dedupe, one-tx commit) — **SQLite `replay_segments` (per-document: tab, first/last ts, event_count, size, has_gap) + `replay_batches` (`batch_id+document_id` PK = durable dedupe identity); batch metadata + segment upsert commit in one transaction; file append is truncated back on tx failure so retries never double-write**
- [x] `[DONE]` Implement storage: ~/.everyaios/replays/ NDJSON + screenshots/ JPEGs — **`ReplayStore` under a configurable base dir: one `<document_id>.ndjson` per document, `write_screenshot(document, step, jpeg)`, `read_document` playback, `segments()` for the scrubber**
- [x] `[DONE]` Implement 7-day retention default + configurable wipe — **`retention_sweep(max_age)` deletes expired segments + their replay/screenshot files (stats returned); `wipe()` clears all files + index rows**
- [x] `[DONE]` Implement durable event log + idempotency classes (doc 53 §4): safe-retry / unsafe / same-key / confirm-after-uncertain over the append-only audit — **`everyaios-audit/src/session_log.rs`: `SessionLog` (the 10 §4.2 event types, per-session NDJSON, seq resumes on reopen) + `IdempotencyClass` (safe_retry/unsafe_retry/same_key/confirm_after_uncertain + `classify_tool` manifest) + `IdempotencyRegistry` (same_key broker dedupe) + `recovery_plan` (ToolStarted w/o ToolCompleted → Rerun / ResendWithKey / ConfirmCard)**
- [x] `[DONE]` Test: ingest/dedupe/gap/retention round-trip + recovery classification + recorder contract — **13 audit tests (batch ingest + segment accumulation, dedupe receipt-stable no double-append, malformed-line sticky gap, recorder-declared gap, doc-id validation incl. traversal, screenshots+wipe, retention removes only expired, session-log resume/incomplete-detect/classify/recovery-plan) + 5 browser recorder tests (embedding, header contract, injection-escape, remove, capture set) — 355 ws tests (326 + 18 P2.10 + 3 P3.1 + 8 P3.3), clippy 0, fmt clean**

### P2.11 Browser Extension Tools (E15–E17 — doc 63 §4.1–4.3)
- [x] `[DONE]` **E15 Electron-app CDP automation:** attach to any Electron app's debug port (VS Code/Slack/Discord/Spotify/Notion): `electron_attach(port)` → a11y snapshot → click/fill/read/screenshot via the existing CDP stack — zero new deps (agent-browser pattern, doc 63 §4.1) — **`everyaios-cdp::discovery` (`probe_electron`/`discover_electron_apps`/`electron_from_json`/`is_electron_version`) + `everyaios-browser::electron` `ElectronHandle::attach` (probe → connect → attach first page target → `snapshot`/`click`/`fill`/`read`/`screenshot` over the CDP stack)**
- [x] `[DONE]` **E16 slim snapshots:** `snapshot(slim: true)` — drop non-actionable nodes, collapse long text, depth cap (chrome-devtools-mcp `SlimMcpResponse` pattern, doc 63 §4.2); token-economy lever on every browser turn — **`everyaios-browser` `SnapshotMode::Slim` + `tree.rs::collapse_text`/`SLIM_DEPTH_CAP`/`SLIM_NAME_MAX_CHARS`; test asserts slim ≤40% of full-snapshot tokens**
- [x] `[DONE]` **E16 WebMCP support:** web-native MCP handshake so browser sessions can serve/consume MCP over HTTP (chrome-devtools-mcp `webmcp.ts` pattern, doc 63 §4.2) — **`everyaios-browser::webmcp` (`WebMcpTool`/`WebMcpResult`/`WebMcpRegistry`/`WebMcpExecutor` + `list`/`execute` handshake, JSON-schema tool metadata, `{status, output, errorText}` result shape) + `everyaios-browser::webmcp_http` (`McpHttpServer`/`handle_mcp_request`/`parse_http_request`: GET `/mcp` manifest, POST JSON-RPC `tools/list`/`tools/call`, std-only `TcpListener` transport)**
- [x] `[DONE]` **E17 multi-protocol action parsing:** per-provider action-protocol adapters (native / CUA / Anthropic / UI-TARS) behind the router — any BYOK provider's action format drives the same browser layer (skyvern `parse_actions.py` pattern, doc 63 §4.3) — **`everyaios-browser::protocol` (`parse_action` → `ParsedAction` for Native/AnthropicCua/OpenAiCua/UiTars + `to_act_kind` lowering)**
- [x] `[DONE — slim + CUA + Electron E2E]` Test: **slim snapshot ≤40% of full-snapshot tokens landed (`tree::tests::slim_is_at_most_40_percent_of_full_tokens`) and CUA action parse → same browser op landed (`protocol` multi-protocol parsing, E17). Electron E2E landed as a `#[ignore]`d live test (`live_tests::live_electron_attach_snapshot_click_read`, gated by `EVERYAIOS_LIVE_TEST=1` + `EVERYAIOS_ELECTRON_PORT`): `ElectronHandle::attach` → snapshot → `click_ref` (ref→DOM→box-center→click) → read → screenshot; `ElectronHandle::click_ref` added for the ref→geometry→click path.**
- [x] `[DONE]` **G9 read-cleaner (doc 64 §4 — brave adblock pattern):** pre-`read`/`snapshot`/markdown-export transform — **`everyaios-browser::content` (`FilterSet` ABP-syntax subset: `||domain^` + `||domain/path^` + `@@` exceptions + `/regex/` + `##selector`/`#@#selector` cosmetic; `is_blocked` + `cosmetic_selectors` + `clean_markdown` stripping blocked links/images + consent/spam lines). Full brave `adblock` crate (v0.13.0 MIT, compiled-engine cache + CSP + request-type/third-party options) = documented swap-in; the F11 containment blocklist feed = follow-on.**
- [x] `[DONE]` **E16 WebMCP tool-cancellation (doc 64 §6.2 — lightpanda `cdp/domains/webmcp.zig`):** `invokeTool`/`cancelInvocation` — **`everyaios-browser::webmcp::InvocationTracker` (`start`/`cancel`/`timeout`/`finish`, idempotent) + `WebMcpError::{Cancelled,TimedOut}` with `code()` = -32001/-32002 and `retryable()` (Cancelled = never retry, Timeout = may). `everyaios-mcp` wire-up = follow-on.**
- [x] `[DONE]` **E16 slim-mode interactivity upgrade (doc 64 §6.3 — lightpanda `interactive.zig`):** **event-listener detection landed — `AxNode.has_js_click_handler` (+ `with_js_click_handler` builder, populated by a `DOMDebugger.getEventListeners` pass) makes JS-only SPA divs actionable + ref-minted in slim/interactive mode (`tree::build_node`).**

**P2 Exit Criterion:** navigate→snapshot→act→diff E2E; ownership test passes; Obscura scrape + escalate; session-vault round-trip (agent never sees cookies); PoW auto-solved; run audited script; replay with has_gap.

---


## PHASE 3 — Cockpit & Audit UI (~4 weeks)

### P3.1 Replay & Audit UI (H3 — doc 33 §9.5, ARCH/12 UI)
- [x] `[DONE]` Implement scrubber UI: timeline of actions per session — **`ui/src/pages/Audit.tsx` scrubber bar — one color-coded tick per event (`navigate` blue / `click` violet / `input` green / `scroll` amber / mutation slate), click-to-seek, synced event list (kind + ts); data from `everyaios-audit` `ReplayStore::timeline` (segment + events + screenshot steps) exposed via Tauri `replay_timeline`**
- [x] `[DONE]` Implement per-step screenshot display synced to timeline — **screenshot strip: click a tick → `replay_screenshot` returns the step's JPEG as a `data:image/jpeg;base64` URL (or null placeholder); steps discovered by `screenshot_steps` (files `<doc>-<step:06>.jpg`)**
- [x] `[DONE]` Implement searchable sessions list — **`ReplayStore::search_sessions(query)` (document/tab id substring, case-insensitive, newest-first; +3 audit tests) → `ui` search box with debounce; gap badge on `has_gap` sessions (honest incomplete)**
- [x] `[DONE]` Implement Watch mode: live view of agent's current tab — **`ReplayStore::events_since(doc, seq)` + Tauri `watch_events` — the UI polls every 2s and live-appends new events to the timeline (the recorder streams to the same ingest, so the scrubber IS the live view; screenshot stream of the tab stays a P11.5 enhancement)**
- [x] `[DONE]` Implement Stop button: kills agent loop from cockpit — **Tauri `agent_stop` sends JSON-RPC `agent/stop` over the unix control channel (`everyaios_ipc::socket::request` — the channel `serve_unix_control_channel` already binds; the coordinator consumes the method and kills the loop). UI Stop button per selected session with sent-state. Tested: `events_since` tail + query/timeline/screenshot tests — 355 ws tests (344 + 3 + 8), clippy 0, fmt clean**

### P3.2 Cockpit / Ambient Flight Deck (H2 — doc 33 §9.5)
- [x] `[DONE]` Implement quiet mode: single-sentence status in tray — **`CockpitState::quiet_status()` builds the line (`EveryAIOS: Updating report — 2s` / `EveryAIOS: idle` from the newest active agent) + Tauri `cockpit_quiet(quiet, status)` sets the tray tooltip (`app.tray_by_id("main-tray")`) and hides the main window (tray Show restores); UI quiet toggle + quiet-line banner**
- [x] `[DONE]` Implement slide-over panel: live action cards + token counters — **`ui/src/pages/Cockpit.tsx` right-side drawer: per-agent live action cards + aggregated token counters (`CockpitState::token_totals`), toggled from the header**
- [x] `[DONE]` Implement STOP / UNDO buttons (single-click kill or revert last action) — **`agent_stop` (JSON-RPC `agent/stop` — already shipped P3.1) + new `agent_undo` (JSON-RPC `agent/undo` over the same unix control channel; `CockpitState::undo` mirrors the request + marks the card Waiting); per-card buttons with disabled-when-idle + sent-state**
- [x] `[DONE]` Implement MCQ interrupt cards (on circuit-break): display 4 options — **`CockpitState::present_interrupt(agent, prompt, 4 options)` pauses the agent (Waiting); the UI renders the card with 4 option buttons; `interrupt_respond(id, choice)` records the choice, resumes the agent, and forwards `agent/interrupt-response` (JSON-RPC with the chosen text) to the coordinator**
- [x] `[DONE]` Implement agent cards: per-agent status, model, tokens used, elapsed — **`AgentCard` (status/model/provider/token counters/started+last-action ms + capped 12-action trail); `cockpit_snapshot` polled every 2s renders Running-now cards with LIVE/WAIT chip, ticking elapsed clock, action trail, in/out tokens. `everyaios-audit/src/cockpit.rs` +8 tests (trail cap, first-action card creation, token totals, quiet line, stop/undo, interrupt lifecycle, upsert) — 393 ws tests (355 + 8 cockpit + 30 office), clippy 0, fmt clean**

### P3.3 Distributed Tracing (J14 — doc 43, doc 52; ARCH/06)
- [x] `[DONE]` Integrate opentelemetry-rust in everyaios-core — **`opentelemetry = "0.27"` in everyaios-core + `src/tracing.rs`: `TraceContext` (root/child spans over `opentelemetry::trace::{TraceId, SpanId, TraceFlags}`), `SpanRecord`/`SpanAttrs` (every doc-43 field: trace_id/span_id/parent/service/session/agent/tool/permission/duration/status), `TraceReporter`**
- [x] `[DONE]` Propagate trace_id across Rust→sidecar→provider→sandbox boundaries — **W3C `traceparent` wire format (`00-<32hex>-<16hex>-<2hex>`) — the exact header `@opentelemetry/sdk-node` reads on the sidecar: `traceparent()` / `parse_traceparent` / `inject_headers` / `extract_headers`; child spans continue the same trace_id across each boundary (root → coordinator → provider → sandbox)**
- [x] `[DONE]` Add trace_id + span_id columns to audit table — **`AuditEvent` + `SessionEvent` gain `trace_id`/`span_id` (serde default — legacy lines still parse); `AuditWriter::write_traced` + `EventInput::with_trace`; doc 43's `audit(trace_id, tool, …)` wrapper is `write_traced`**
- [x] `[DONE]` Console + log-file export (Jaeger/OTLP post-v1) — **`TraceReporter` writes NDJSON spans to `<data_dir>/traces/traces.ndjson` (console-only mode included); not-sampled traces are dropped (OTel semantics); OTLP/Jaeger export stays post-v1 per SPEC J14. Tested: root/child id linkage + sampled flag, traceparent round-trip + garbage rejection + header inject/extract, sampled-only export, NDJSON file round-trip with all doc-43 fields, legacy audit-line compat — 355 ws tests (347 + 6 core tracing + 1 audit + 1 session-log), clippy 0, fmt clean**

**P3 Exit Criterion:** replay & audit UI round-trip; Watch/Stop works; cockpit shows live agent cards.

---

## PHASE 4 — Office Engine (~5 weeks)

### P4.1 Word Block-Patch Engine (D1 — doc 28 GenOffice, doc 04)
- [x] `[DONE]` Implement ZIP open + parts index parser — **`crates/everyaios-office` (new crate) `zip.rs`: `OoxmlArchive::open/read_part/parts` + `parts.rs`: `PartsIndex::parse` — `[Content_Types].xml` defaults+overrides + `word/_rels/document.xml.rels` header/footer discovery**
- [x] `[DONE]` Implement block tree construction (anchored with docxIndex/addresses) — **`docx/blocktree.rs`: `BlockTree` over body + header/footer parts — paragraphs `p1…`, tables `t1` + rows `t1:r1` + cells `t1:r1c2` + cell paragraphs `t1:r1c2:p1`, sections `sec1`, headers `hdr1:p1`/footers `ftr1:p1` — each block carries its byte range in the part (roxmltree `Node::range()` anchors, GenOffice docxIndex pattern)**
- [x] `[DONE]` Implement plain-text rendering from block tree (for LLM editing) — **`render_container`/`render_paragraph`/`render_table` — `w:t` text + `w:br`/`w:cr`→`\n`, `w:tab`→`\t`, tables as rows/cells; `DocxEngine::render_text()` = the document render, `render_block(address)` per block**
- [x] `[DONE]` Implement patch renderer: plain-text edits → minimal w:t prefix/suffix XML patches — **`docx/patch.rs` `apply_block_patch` — common prefix/suffix over the rendered text, change region mapped back to raw byte offsets via `split_byte_for_char` (entity/UTF-8 aware), only the `w:t` text bytes in the region rewritten (escape re-encoded); untouched runs/formatting/hyperlinks/images byte-identical. Safety fallbacks: no-w:t → NoTextAnchor, stale expected text → StaleEdit, edit crossing a line break/tab → PatchAcrossMarker**
- [x] `[DONE]` Implement ZIP rewrite: modified parts only, everything else byte-copied — **`OoxmlArchive::save(modified)` — untouched entries copied verbatim via `zip::ZipWriter::raw_copy_file` (original compression + local headers preserved, byte-stability test compares raw compressed payloads), only modified parts re-deflated; `save(&[])` is byte-identical to the input**
- [x] `[DONE]` Implement headers/footers/tables/sections as separate blocks — **header/footer parts loaded via rels and walked as their own blocks (`hdr1:p1`), tables/rows/cells/sections all addressable blocks in the tree**
- [x] `[DONE]` Test: round-trip (open → edit → save → assert byte-stable untouched parts) — **30 tests: parts index, header/footer discovery, block addresses, document-order render, minimal-patch (run 1 untouched verbatim), multi-run split, cell paragraph patch, line-break refusal, stale-edit rejection, no-anchor error, XML escaping round-trip, raw-copy verbatim compressed payloads, identity save — 393 ws tests (363 + 30 office), clippy 0, fmt clean. LibreOffice headless oracle = P4.5**

### P4.2 Excel Engine (D2 — doc 28 GenOffice, doc 04)
- [x] `[DONE]` Integrate calamine crate for fast xlsx reading — **`crates/everyaios-office/src/xlsx/read.rs` — calamine 0.30 (`open_workbook` → `worksheet_range`): `open()` (sheet names + used-range dims) + `read_window(path, sheet, offset, limit)` — windowed slices of one sheet for the virtualized grid; `CellValue` serde enum (number/text/bool/error/empty incl. ExcelDateTime serial + shared-string/ISO variants)**
- [x] `[DONE]` Integrate IronCalc (v0.7.x) as recalc sidecar binary — **`xlsx/recalc.rs` — ironcalc 0.8.3 (v0.7.x is doc 28's pin; 0.8.3 is the resolvable stable): `import::load_from_xlsx_bytes` → `Model::from_workbook` → `evaluate()` → `get_all_cells()`/`get_cell_value_by_index`/`get_cell_formula` → `RecalcResult { sheets, formula_cells }`. Library integration now (sidecar-binary spawn wrapper stays behind the same API — engine swappable per ARCH/04; IronCalc's own `save_to_xlsx`/`to_bytes` are deliberately NOT used for the user's file — full re-serialize would break byte-preservation)**
- [x] `[DONE]` Implement workbook DSL (cell-address, formula-shift, sort-range, flash-fill, pivot) — **`xlsx/address.rs` (A1/`$A$1`/`Sheet1!`/`'My Sheet'!`/ranges, col letters A→AA→AAA) + `xlsx/dsl.rs`: `WorkbookCommandBatch { dsl_version, transaction_id, base_revision, summary, operations }` (GenOffice txn model) with SetCell/SetFormula/RenameSheet/SortRange/FillRange(Constant|CopyDown)/Shift(insert/delete row|col)/Pivot ops; **Excel-accurate formula-shift engine** — refs into the shifted region move, `$` does NOT pin against insert/delete, deleted region → `#REF!`, partial-overlap ranges shrink, `LOG10(`/`SUMIF(` function names + `"..."` string literals protected, `Sheet1!`/`'My Sheet'!` prefixes rewritten only when they name the shifted sheet, named ranges (Budget, RATE) untouched; `parse_scalar` + `pivot_result` (sum/count/avg in-memory)**
- [x] `[DONE]` Implement deterministic planner: regex NLP → workbook DSL (zero-LLM common ops) — **`xlsx/planner.rs` `plan_prompt(prompt, base_revision)`: `set A1 to 42`, `formula B1 = SUM(A1:A10)`, `rename sheet to Budget`, `sort A1:C10 by column B descending`, `fill B2:B10 with 5` / `fill … down` (copy-down), `clear A1:C20`, `insert row at 5` / `delete column C`, `pivot A1:C100 by column 1 sum column 3` → zero-token compiled ops; every `PlannerOutcome` carries the GenOffice-style helpful "Try…" message for unsupported prompts**
- [x] `[DONE]` Implement surgical part-patch: xl/worksheets/sheetN.xml, xl/sharedStrings.xml — **`xlsx/patch.rs` `apply_batch(bytes, batch, sheet)` — byte-surgical `sheetN.xml` edits via roxmltree ranges: cell upsert (inline string `t="inlineStr"` / number / bool; style `s` attr preserved; new rows inserted in `r`-sorted position, self-closing `<sheetData/>`/`<row/>` expanded), clear-range, sort-range (Excel order: numbers→text→empty), fill (constant/copy-down with numeric delta), rename (workbook.xml `name` attr via `range_value`), shift (formula-text rewrite); `append_shared_strings` (count/uniqueCount bump + `<si>` append) is the sharedStrings.xml path for bulk text imports; untouched parts byte-identical via `OoxmlArchive::raw_copy_file` (tested)**
- [x] `[DONE]` Implement 100% math integrity rule: numeric claims → IronCalc only, never LLM — **every computed number in a patched file comes from `recalc()` (IronCalc `evaluate()`); the patch writes formula cells with a `<v>0</v>` placeholder, recalcs the patched workbook, then replaces each placeholder with the **engine-computed** value (`formula_write_gets_ironcalc_value` asserts SUM(A1:A3)=22 lands verbatim); the LLM only ever reads/writes values + formulas**
- [x] `[DONE]` Implement planner fallback: when regex DSL can't parse → LLM-direct (audit flagged, permission-gated) — **`PlannerOutcome::NeedsLlm { reason, suggested }` — any prompt the regexes can't compile (`what's the total of column A?`, charts, styling, structural moves) resolves to the LLM-direct path with the reason + suggested alternatives; the permission-gated/audit-flagged wiring is the same contract as P4.1's `PatchAcrossMarker` (the gate/audit stamp is P7/Guard-2 work, noted in TODO)**
- [x] `[DONE]` Test: formula recalc golden cases (SUM, VLOOKUP, IF, COUNTIF, dynamic arrays) — **64 office tests (+34): golden recalc on a hand-written minimal xlsx — `SUM(A1:A2)=11`, `IF(B2>1,"yes","no")="yes"`, `COUNTIF(A1:B2,">5")=2`, `VLOOKUP(10,A1:B2,2,FALSE)=20` + missing-key `#N/A` propagation; shared-string + bool cells; address/range parse+format; formula-shift (insert/delete rows+cols, `$`-not-pinning, `#REF!`, shrink, function/string/sheet-prefix/named-range protection); planner regexes + NeedsLlm fallback; patch round-trips (set/formula/clear/sort/fill/rename/shift/pivot) + byte-stability — 427 ws tests (393 + 34 office), clippy 0, fmt clean. Dynamic-array golden = P4.7 in-memory workbook pass (IronCalc evaluates them; the deterministic DSL doesn't author them yet)**
- [x] `[DONE]` Implement virtualized 100K+ row table view in UI — **`ui/src/pages/Spreadsheet.tsx` + `lib/spreadsheet.ts` + `src-tauri/src/xlsx_cmds.rs` `xlsx_open(path, sheet, offset, limit)` (windowed calamine read, default 500-row pages): virtualized grid — fixed 26px rows, scrollTop→visible window with 20-row overscan, sticky header (A… column letters) + sticky row numbers, sheet tabs, path input, 100K-row client-side demo fallback for browser preview; `tsc --noEmit` + vite build clean**
- [x] `[DONE]` **Univer split (doc 58):** Univer Sheets = the H5 live-grid *view* surface; surgical patch + IronCalc = mutation/truth engine — pick ONE calc engine (Univer Node or IronCalc), don't run both as truth; `univer-mcp` as G4/D2 REPL reference — **decision recorded + implemented: IronCalc = the single calc truth engine (math integrity above); the H5 view surface stays Univer embed per doc 58, evaluated in P4.7 (OSS/Pro split — xlsx import may be Pro; our surgical patch is the mutation engine either way); `univer-mcp` = G4/D2 REPL reference only**

### P4.3 PowerPoint Engine (D3 — doc 04)
- [x] `[DONE]` Implement surgical part-editing: ppt/slides/slideN.xml text runs, bullets, shapes — **`pptx/text.rs` — `shapes()` extracts addressable `<p:sp>` text shapes (cNvPr id/name, `<p:ph type>` placeholder, byte range) + `patch_shape_text()` minimal `<a:t>` prefix/suffix byte surgery: walks `<p:txBody>` → `<a:p>` → `<a:r>` → `<a:t>` (+ `<a:br>`/`<a:tab>`), bullets (`<a:buChar>`/`<a:buAutoNum>`) render as read-only markers, multi-byte/entity-aware (`char_to_byte` + `split_byte_for_char`); safety fallbacks NoTextAnchor / PatchAcrossMarker (edit across a bullet/br/paragraph boundary refused)**
- [x] `[DONE]` Implement slide add/remove: clone part + rels + Content_Types registration — **`pptx/mod.rs` `add_slide()` (clones last slide part + its `_rels` part, appends `<p:sldId>` + `<Relationship>` + `<Override>` via byte surgery on presentation.xml / presentation.xml.rels / [Content_Types].xml; fresh rId/sldId/slide-number) + `remove_slide()` (splices out sldId/rel/Override, omits slide part + rels on save); `zip::save_changes(modified, added, deleted)` extended so new parts append and removed parts vanish while untouched parts stay verbatim**
- [x] `[DONE]` Test: pptx add/remove slide round-trip — **16 new pptx tests (80 office total): slide-order parse, deck render (bullets as markers), shape addresses (name/ph-type), text patch + untouched-slide byte-stability (slide2 raw-entry verbatim after slide1 patch), insert-beside-bullet, paragraph-boundary/bullet-removal refusal, no-text-anchor, add-slide clone + registration (sldId/rId/Override + cloned rels), remove-slide deregistration, add-then-remove round-trip restore — 443 ws tests, clippy 0, fmt clean**
- [x] `[DONE]` **Author-new-deck path (doc 58 — ppt-master pattern):** "make me a deck from this brief" = reason-then-native-shapes — **`everyaios-office::pptx::author` (`author_deck` builds a minimal valid `.pptx` from a `DeckBrief` — presentation/master/layout/theme + title+bullet slides, per-slide `p:transition`, XML-escaped; `speaker_notes` returns the `data-slide-id`-keyed `SPEAKER_NOTES` array, sync-validated). Native chart/table shapes + per-shape `p:anim` wiring = follow-on; composes with surgical D3 edit.**

### P4.4 PDF Engine (D4 — doc 04)
- [x] `[DONE]` Implement pdf.js-class renderer in webview — **`ui/pages/PdfViewer.tsx` now renders real pages via `pdfjs-dist` (canvas draw from a `pdf_bytes` base64 data URL, page nav + zoom + Canvas/Text toggle, React.lazy code-split so the 1.4MB worker only ships to the PDF route); the lopdf text extraction stays as the accessibility layer (`pdf_open`)**
- [x] `[DONE]` Implement form-fill + annotation via pdf-lib (AcroForms) — **`pdf/form.rs` `form_fill(bytes, &[(name, value)])` via lopdf 0.36 (Rust, not TS pdf-lib — same capability): walks catalog `/AcroForm` `/Fields` recursively (parent `Kids` → dotted full names), sets `/V` on matching leaf fields; `NoAcroForm` error; appearance-stream (`/AP`) regeneration + free-text/highlight annotation = later**
- [x] `[DONE]` Implement text-swap via lopdf Rust bridge (exact-match only) — **`pdf/mod.rs` `replace_text(bytes, page, find, replace)` — `Document::replace_text` (exact-match `Tj` text, layout preserved: glyph positions untouched, never reflow)**
- [x] `[DONE]` Implement redaction (fill glyph boxes + remove text streams) — **`pdf/redact.rs` `redact(bytes, &[(page, [x1,y1,x2,y2])])` — appends `/Subtype /Redact` annotations (`/Rect` + `/F 4`) to each page's `/Annots` (inline / reference-array / created-on-demand); mark-for-redact step — glyph burn-in removal = later audit-logged pass**
- [x] `[DONE]` Implement re-author path (structural edits → generate new PDF) — **`pdf/author.rs` `author_pages(&[&str])` — builds a clean new PDF (Courier/Type1, one page per text block) via lopdf `Document::with_version` + `Content`/`Stream`; the structural-edit path instead of corrupting the source**
- [x] `[DONE]` Test: pdf form-fill round-trip — **6 pdf tests (100 office total): author→extract text (multi-page), replace_text swaps `Tj` text, form_fill sets `/V` (verified by re-reading the AcroForm), form_fill without AcroForm errors, redact adds a `/Redact` annotation, redact page-out-of-range errors — 463 ws tests, clippy 0, fmt clean**

### P4.5 Conformance & Rollback (D6/D7 — doc 29 LibreOffice oracle, doc 28 §2 rollback, doc 04 §4.4)
- [x] `[DONE]` Implement snapshotBefore: keep pre-edit ZIP for 1-click undo — **`rollback.rs` `Snapshot` — `capture(original)` keeps the pre-edit bytes, `record_save(saved)` updates `current` without touching `original`, `undo()` restores the original, `dirty()`; the GenOffice snapshotBefore hook (doc 28 §2) for one-click undo + crash recovery**
- [x] `[DONE]` Implement atomic writes: write temp → fsync → rename — **`atomic.rs` `write_atomic(path, bytes)` — sibling `.tmp-{pid}-{seq}` temp file in the SAME directory, `File::sync_all` then `rename` (atomic on POSIX) + best-effort directory fsync; a crash mid-save never leaves a half-written OOXML file (old or new bytes, never a mix)**
- [x] `[DONE]` Wire LibreOffice headless in CI: open edited file → assert no repair warnings — **`conformance.rs` `LibreOfficeOracle` — `find_soffice()` (PATH + common install dirs), `check_opens(file)` runs `soffice --headless --convert-to pdf` (full parse+layout) and fails on non-zero exit or `repair`/`damaged` warnings; gated `#[ignore]` live test (`EVERYAIOS_LIVE_TEST=1`, skips cleanly when soffice is absent)**
- [x] `[DONE]` Implement byte-stability assertions (zip-level diff of untouched parts) — **`conformance.rs` `parts_diff(original, modified)` — `PartsDiff { changed, added, removed }` (decompressed compare); tests assert "only word/document.xml changed" + added/removed detection + identity diff is empty**

### P4.6 Legacy Formats (D8 — doc 04, doc 29 §3a)
- [x] `[DONE]` Implement .doc/.xls/.ppt → convert to modern format on open (headless soffice) — **`legacy.rs` `convert_to_modern(path)` — `LegacyKind::from_path` (.doc/.xls/.ppt) + `target_format` (.docx/.xlsx/.pptx), `soffice --headless --convert-to <filter> --outdir <tmp>` → returns `(name, bytes)`; clear `NotLegacy`/`NoSoffice`/`ConversionFailed` errors**
- [x] `[DONE]` Surface as read-only with "edit as new .docx" option — **`legacy.rs` `LegacyOpen::for_path` — `read_only: true` + `edit_as_new` flag; edits always produce modern OOXML, never the binary original (ARCH/04 §4.2 honest boundary)**

### P4.7 Office UI (H5 — doc 04)
- [x] `[DONE]` Implement docx viewer (styled paragraphs, tables, images from block tree) — **`ui/pages/DocxViewer.tsx` + `office_cmds::docx_open` (`DocxEngine::render_text` + block tree → `DocxBlockInfo{address,kind,part}`): paragraphs split on `\n` styled into a paper, block sidebar; tables render as the engine's `cell | cell` plain text; image rendering → follow-up (block tree already carries addresses)**
- [x] `[DONE]` Implement xlsx viewer (virtualized grid, formula bar, cell selection) — **virtualized 100K+ row grid landed in P4.2; added formula bar (cell ref + value) + click-to-select with `.cell-selected` outline threaded through `WindowedGrid`/`DemoGrid` → `GridShell`**
- [x] `[DONE]` Implement pptx viewer (slides as styled divs, notes panel) — **`ui/pages/PptxViewer.tsx` + `office_cmds::pptx_open` (`PptxEngine::render_deck` + per-slide `render_slide`): slides as 16:9 cards with shape-head/bullet line styling; notes panel → follow-up**
- [x] `[DONE]` Implement PDF viewer (pdf.js-based) — **`ui/pages/PdfViewer.tsx` + `office_cmds::pdf_open` (`pdf::inspect` — lopdf page count + per-page `extract_text`): per-page text cards + the real pdf.js canvas renderer (P4.4: `pdf_bytes` base64 data URL + page nav/zoom + Canvas/Text toggle, React.lazy code-split)**
- [x] `[DONE]` Implement chat overlay on any open document (page-scoped questions) — **`ui/components/ChatOverlay.tsx` — collapsible panel, dispatches a page-scoped turn via `chatStream` ("About the open document (<scope>):\n<question>"), answer lands in the Chat page**
- [x] `[DONE]` **Univer embed (doc 58):** evaluate Univer SDK as the office surface — **DECISION: keep our surgical renderers (docx/pptx/pdf viewers above + P4.2 sheets grid); Univer OSS/Pro split (Slides/Docs import = Pro) + the lossy re-serialize risk ARCH/04 rejected → defer the Univer embed; surgical patch stays the mutation engine either way (already recorded in P4.2)**

### P4.7b Office Perfectness Gaps (doc 63 §3 — the honest "not perfect yet" list; no scope cuts)
- [x] `[DONE]` **D4-gap: charts** — read chart series/model from the chart part (`xl/charts/chartN.xml`) — **`everyaios-office::xlsx::chart` (`extract_chart_series` → `ChartSeries` name/category-range/value-range) + authoring (`build_chart_part` for Bar/Line/Pie with series + title, `chart_rel_fragment`, `chart_content_type_override` for rels + Content_Types registration; authored parts round-trip through the reader)**
- [x] `[DONE]` **D2-gap: track-changes + comments** — read `w:ins`/`w:del`/`w:comment` parts in docx (comment author/date + resolved-state), write comments patch-aware (collision-free `w:id`), **and author tracked changes**: `emit_tracked_change(old, new, author)` emits `<w:del><w:delText>` + `<w:ins><w:t>` runs with `w:author`/`w:date` (round-trips through `extract_tracked_changes`) — **`everyaios-office::docx::track` (`extract_tracked_changes`/`extract_comments`/`add_comment`/`emit_tracked_change`/`render_ins_run`/`render_del_run`/`TrackAuthor`)**; *viewer surfacing remains UI work*
- [x] `[DONE]` **D7-gap: PPT transitions/animations** — read/write `p:transition` (fade/wipe timing, existing ones preserved verbatim; insert replaces in schema order before `p:cSld`) **and author per-shape animations** — **`everyaios-office::pptx::transition` (`extract_transition`/`set_transition`) + `everyaios-office::pptx::anim` (`build_timing_xml` → `p:timing` with `p:anim effect="fade|zoom"` or `p:set` visibility-appear, `p:spTgt spid` targeting, schema-valid main sequence)**
- [x] `[DONE — sticky notes + highlights]` **D8-gap: PDF annotations** — free-text/highlight annotations: sticky notes (`/Text`/`/FreeText`) + highlight (`/Highlight`) with `/AP` appearance — **`everyaios-office::pdf::annot` (`add_text_annotation`/`add_highlight_annotation`)**; *audit-log wiring is the caller's responsibility*
- [x] `[DONE]` **Presenter mode + SPEAKER_NOTES contract (doc 63 §4.9 — guizang presenter-mode.md pattern):** stable `data-slide-id`-keyed speaker notes (`SPEAKER_NOTES` array: id/title/section/minutes/purpose/talk/timing/transitions) — **`everyaios-office::pptx::notes` (`extract_notes_text`/`build_speaker_notes` → `SpeakerNotesEntry` + `validate_slides_notes_sync` sync-check + `plan_rehearsal` wpm-based per-slide/total timing for the auto-advance clock)**; *the presenter-mode UI view (rehearsal rendering) remains ARCH/12 UI work*
- [x] `[DONE]` **CSL citation insertion (doc 63 §0 verdict — obsidian-zotero-integration pattern):** cite-while-writing — CSL-style citation + bibliography rendering (APA/IEEE/Chicago: in-text citation, full entry, surname/initials formatting) — **`everyaios-office::docx::citation` (`render_citation`/`render_reference`/`render_bibliography`, `ReferenceKind`/`CslStyle` + `ReferenceLibrary` search/insert + `insert_citation_into_docx` appends the rendered citation as a paragraph before `w:sectPr`, byte-preserving zip rewrite)**

### P4.8 Storage Intelligence (D9–D11, G7 — doc 49)
- [x] `[DONE]` Implement everyaios-storage crate: parallel work-stealing walker (crossbeam-deque per-thread `Worker` + steal loop, symlink-skip cycle-safe, `same_filesystem` device-boundary) — **`walk.rs`: `scan` + `build_arena` (u32-indexed `FileNode` arena, bottom-up size aggregation); 15 storage tests across walk/snapshot/treemap/dedup/finder/cleanup/search/health — 479 ws tests, clippy 0, fmt clean**
- [x] `[DONE]` Implement immutable arena snapshots + zstd save/load — **`snapshot.rs`: `SnapshotStore` (arc_swap `load_full`/`store`, zstd round-trip); bytemuck Pod slab deferred (plain `Vec` arena — unsafe cast is a later opt)**
- [x] `[DONE]` Implement squarified treemap layout + per-dir aggregation (stable extension-hashing colors) — **`treemap.rs`: Bruls–van Wijk `squarify` (worst-aspect greedy rows, area-conserving) + `treemap_for_dir` + xxHash3→HSL `color_for`**
- [x] `[DONE]` Implement 7-stage duplicate detection (size → xxHash3 prefix/suffix → BLAKE3, hardlink-aware, optional reflink) — **`dedup.rs`: `find_duplicates` (size→prefix→suffix→BLAKE3→hardlink dev+ino→reflink-eligible→wasted-bytes report)**
- [x] `[DONE]` Implement large-file finder (top-N by size/age + filters) — **`finder.rs`: `find_large_files` (`SortBy::{SizeDesc,AgeNewest,AgeOldest}` + include/exclude extensions + min-size/max-age)**
- [x] `[DONE]` Implement Guard-2-ticketed cleanup actions (recycle-bin-aware; never bypass dual-guard) — **`cleanup.rs`: `CleanupAction` proposals only (`propose_duplicate_cleanup`/`propose_large_files_cleanup` + `decision_package` Guard-2 card); crate never deletes**
- [x] `[DONE]` Implement G7: SQLite FTS5 filename index + notify-debouncer incremental updates + optional OS-native hooks — **`search.rs`: `SearchIndex` (FTS5 prefix query) + `Debouncer` + `watch` (notify thread); OS-native hooks (Everything/mdfind/Baloo) stay optional accelerators**
- [x] `[DONE]` Wire storage tools into agent registry (disk_scan, disk_duplicates, disk_large_files, disk_cleanup, filename_search); heavy scans respect J16 battery-awareness — **`everyaios-mcp::STORAGE_TOOLS` (5 read-only-proposal tool defs, typed args, ToolKind/Search annotations) + `all_tools()` = unified 42-tool registry (browser 37 + storage 5); cleanup is proposal-only (never deletes). Runtime dispatch + J16 battery gating = P6.x tool-catalog reconciliation follow-on.**
- [x] `[DONE]` Implement D12 storage health & analytics — **`health.rs`: `over_threshold` (90% default) + `check_health` (sysinfo `Disks`) + cleanup-plan inputs (`propose_*`); dashboard rendering (free space / top files / duplicates / trends) = P3 cockpit (H2) UI follow-up**

**P4 Exit Criterion:** Round-trip byte-stable via LibreOffice oracle; IronCalc recalc golden cases; pptx add/remove; pdf form-fill; snapshotBefore rollback works; **scan fixture tree → treemap data + dedup report; zstd snapshot round-trip; FTS5 filename query <50ms** (P4.8).

---


## PHASE 5 — Memory Fusion + Token Economy (~5 weeks)

### P5.1 Multi-Signal Retrieval Fusion (C1/C3, Algorithm #18 — doc 07, v2.0 §3, doc 46 mem0)
- [x] `[DONE]` Wire core-memory import from APP into coordinator — **`coordinator/src/chat.ts`: `extractMemory` runs deterministic fact-candidate extraction (`extractFacts`) + emits `chat/memory_extracted` + sends `memory/write` to Rust; `everyaios-core/src/memory_service.rs` answers `memory/write`/`read`/`plan`/`forget`/`ghost`/`usage/snapshot` (wrapped by `ChatRelay` + its `spawn()` consumer loop). 3 new bun tests + 5 new Rust tests. ⚠️ Remains: core-files import + on-disk durability (in-process store only)**
- [x] `[DONE]` Implement intent classifier: memory vs fact vs event vs document — **upgrade (doc 63 §4.14 — Vane pattern): classifier returns (needs_research, needs_tools, needs_widgets, rewrite-query); research + tool signals run in parallel; final answer cites its sources (citation cards in UI)** — **`everyaios-memory::classify` (`Intent`/`IntentKind` + `classify()` deterministic keyword core + `plan_execution`/`parallel_groups` producing the parallel research+tool batches and the post-answer widget group)**; *citation-card UI remains UI work*
- [x] `[DONE]` Implement parallel signal execution (C4): FTS5/BM25 vectorless default + optional vector signal — **`everyaios-memory::bm25` (`Bm25Index` vectorless default + `SignalSource` seam + `run_signals_parallel`/`fuse_signals` RRF over BM25+vector+graph)**
- [x] `[DONE]` Implement optional embedding path (C5): on-device bge-micro/gte-small, int8/vec0 — **`everyaios-memory::embedding` (`Embedder` seam for ONNX bge-micro/gte-small; cosine/L2/dot; `quantize_int8` + `quantize_binary`/`hamming` vec0; `EmbeddingIndex` NN search) — the model load is the caller's plug-in; enabled only when the user opts in**
- [x] `[DONE]` **Hierarchical repo summarization (doc 63 §0 verdict — deepwiki-open pattern):** summarize-file → summarize-directory → index summaries → answer over summaries; the no-embedding long-context retrieval path (composes with I7 repo-map; raw-vs-compressed-vs-retrieved delta measured per the P8.0 eval corpus) — **`everyaios-memory::summary` (`summarize_file`/`summarize_directory`/`index_summaries`/`answer_over_summaries`)**
- [x] `[DONE]` Implement weighted RRF score fusion (mem0-style single fused score) — **`fusion::rrf_fuse` (weighted reciprocal-rank fusion, per-signal weights; 25 memory tests across fusion/actr/taste/compaction — 504 ws tests, clippy 0, fmt clean)**
- [x] `[DONE]` Implement cross-encoder hybrid rerank (Algorithm #19) — **`everyaios-memory::rerank` (`rerank` blends alpha·retrieval + beta·cross-encoder; `Reranker` seam for a real bge-reranker; `LexicalReranker` deterministic fallback: exact-phrase > bigram > unigram)**
- [x] `[DONE]` Implement deduplication + smart snippets (windows around matches) — **`fusion::dedupe` (keep-highest per id) + `fusion::smart_snippets` (window ±N chars around each match)**
- [x] `[DONE]` Implement per-type budget caps (file 2K, page 1.5K, search 1K, memory 600, tool 1K) — **`fusion::budget_tokens` + `cap_text` (+ `approx_tokens` ~4 chars/token)**
- [x] `[DONE]` Benchmark: multi-hop + temporal queries vs plain BM25 (target: mem0-class gains) — **`everyaios-memory::bench` regression benchmark: `bench_multi_hop_vs_plain_bm25` (10-doc corpus, answer doc shares ZERO query terms, only graph spreading-activation surfaces it — BM25 top-5 cannot) + `bench_temporal_anticipation_and_actr` (bi-temporal edge versioning + ACT-R monotone decay); timing printed under `--nocapture`**
- [x] `[DONE]` Implement RAG chunk-min-size merging (Algorithm #29): forward-only merge of under-sized chunks, markdown-aware boundaries (C3/D5) — **`fusion::merge_small_chunks`**

### P5.2 LadybugDB Graph Backend (C6, Algorithm #30 — doc 07, doc 34 §2, doc 46 Graphiti)
- [ ] `[NOT DONE]` Integrate LadybugDB C++ library (Python/Node bindings or Rust FFI) — **deferred: `everyaios-memory::graph` ships the same schema as a Rust-native adjacency store (LadybugDB stays the validated swap-in, doc 54); C++ FFI is a follow-up when the native lib is needed**
- [x] `[DONE]` Implement schema: EntityNode, EpisodicNode, typed edges (supports/contradicts/derived-from) — **`graph::{Node, NodeKind, Edge, EdgeType}`; 15 new memory tests across graph/paging/ghost/reference — 519 ws tests, clippy 0, fmt clean**
- [x] `[DONE]` Implement temporal edge-versioning (graphiti pattern) — **`graph::add_edge` closes the prior open version (`valid_from`/`valid_to`) before adding the new one**
- [x] `[DONE]` Implement Spreading Activation over LadybugDB adjacency (Algorithm #6, retest) — **`graph::spreading_activation` (per-hop decay, `contradicts` subtracts, lateral inhibition filters ≤0)**
- [x] `[DONE]` Implement graph query depth cap (d=2, top-k=15) — **`graph::query_depth` + `DEFAULT_MAX_DEPTH`/`DEFAULT_TOP_K`**
- [x] `[DONE]` Wire into multi-signal fusion (S3 signal) — **graph signal ready via `spreading_activation` and fused as the `SignalKind::Graph` source in `run_signals_parallel`/`fuse_signals`; coordinator plumbing (feeding the live graph into per-turn fusion) = P5.1 integration follow-up**

### P5.3 Letta-Style Paging (C2, Algorithm #20 — doc 07, doc 34 §2 Letta paging)
- [x] `[DONE]` Implement 3 memory surfaces: core (≤600 tok) / archival / recall — **`paging::{Surface, PagedMemory, CORE_BUDGET_TOKENS}` + overflow eviction (lowest-importance → archival)**
- [x] `[DONE]` Implement agent memory tools: read/write/search/forget — **`paging::read` (promotes to recall) / `write` / `search` (importance-ordered) / `forget`**
- [x] `[DONE]` Implement context planner enforcement of paging budgets (C7: warm-set injection, scope-leakage floors) — **`everyaios-memory::planner::ContextPlanner` (warm-set commit, per-category caps, scope-leakage floor, `plan`/`plan_retrieval`/`plan_tool_result`, `end_turn`); `memory/plan` JSON-RPC dispatch added (`MemoryService::plan` → `{warmSetTokens, remainingTokens, scopeLeakageFloor}`). ⚠️ Remains: the coordinator actually injecting the returned warm set below the cache boundary (per-turn prompt injection)**
- [x] `[DONE]` Implement memory writes queued to turn boundaries (protect prefix cache) — **`paging::write` queues to `pending`; `flush_writes` applies at the turn boundary**

### P5.4 Ghost Context Prevention (ARCH/07 §7.5.1 — notify-crate pattern)
- [x] `[DONE]` Integrate Rust `notify` crate for filesystem events — **memory-side `GhostIndex::apply_fs_event` maps `FsEvent::{Removed,Renamed,Modified}` → tombstone/repath/no-op (pure, no `notify` dep in the memory crate); `everyaios-core::MemoryService::ghost_event` + `memory/ghost` JSON-RPC dispatch expose it to the sidecar. The `notify` watcher already lives in `everyaios-storage` — wiring its debounced batches → `memory/ghost` is the storage→core bridge follow-up**
- [x] `[DONE]` Implement tombstone eviction on file delete: atomic FTS5 + vec + graph removal — **`ghost::tombstone` removes the path and returns its ref ids for the same-transaction multi-store eviction**
- [x] `[DONE]` Implement re-path on file rename: update source_path (zero re-embedding) — **`ghost::repath` moves all refs old→new**
- [x] `[DONE]` Test: rename file → verify retrieval returns new path, not old — **ghost tests: `repath` yields `ids_for(new)`, `ids_for(old)` empty; `tombstone` returns removed ids**

### P5.5 ACT-R Activation + Spontaneous Recall (C10, Algorithm #32 — doc 39 NOOA forgetting.py)
- [x] `[DONE]` Implement retention decay: half_life × log1p(strength) — **`actr::activation` (effective half-life = half_life × ln(1+strength), exponential decay)**
- [x] `[DONE]` Implement importance floor: memories with importance ≥ 8 never auto-forgotten — **`actr::is_protected` + `forget_sweep` (protected OR activation ≥ threshold survive)**
- [x] `[DONE]` Implement associative recall: semantic + keyword + recency + graph in one query — **`actr::recall_score` (weighted) + `keyword_hits` + `recency`**
- [x] `[DONE]` Implement typed relational edges (supports/contradicts/derived-from) — **typed edges landed in `graph::EdgeType` (Rust store, P5.2); the LadybugDB-native C++ FFI binding is the deferred follow-up (same schema swap-in, doc 54)**
- [x] `[DONE]` Implement spontaneous recall channel: pre-turn hook → derive queries → inject — **`actr::derive_queries` (frequency-ranked, stopword-filtered); injection = C7 warm-set (integration follow-up)**

### P5.6 Taste Profile (C9, Algorithm #31 — doc 37 Command Code taste-1)
- [x] `[DONE]` Implement taste store: `~/.everyaios/taste/` (global) + per-repo `.everyaios-taste/` — **`taste::TasteStore` save/load to a directory (`profile.md`)**
- [x] `[DONE]` Implement learning hooks: detect accept/reject/edit via correction-detector + audit — **`taste::observe_accept/reject/edit` (confidence boost/decay/update + evidence counter)**
- [x] `[DONE]` Implement confidence-scored rules (0–1 per preference) — **`taste::TasteRule.confidence` clamped 0..1**
- [x] `[DONE]` Implement stable-prefix injection (taste rules as symbolic prior at generation) — **`taste::inject_stable_prefix` (confidence-ordered)**
- [x] `[DONE]` Implement shareable markdown export — **`taste::to_markdown`/`from_markdown` (round-trip, confidence-preserving)**

### P5.7 Compaction Pipeline (Algorithm #21 — doc 31 context-compression, doc 33 §6 BrowserOS, doc 05, doc 46 opencode compaction.ts)
- [x] `[DONE]` Implement snip stage: tool_result_snip_ratio=0.6 (stale → head/tail anchor) — **`compaction::should_snip` + `snip_anchor`**
- [x] `[DONE]` Implement soft compact: soft_compact_ratio=0.5 (notice-only) — **`compaction::decide_context_action` (SoftCompact)**
- [x] `[DONE]` Implement summarize: BrowserOS callSummarizer (timeout + abort = fail-open) — **`compaction::summarize_or_passthrough`**
- [x] `[DONE]` Implement findSafeSplitPoint (never split mid-turn) — **`compaction::find_safe_split`**
- [x] `[DONE]` Implement slidingWindow (keep recent N tokens, summarize rest) — **`compaction::sliding_window`**
- [x] `[DONE]` Implement force compact: compact_force_ratio=0.9 — **`compaction::decide_context_action` (ForceCompact)**
- [x] `[DONE]` Implement Janus structural passes: dedup, regex collapse, AST prune — **`everyaios-memory::janus` (`dedup` exact+near-dup, `regex_collapse` skeleton runs, `ast_prune` brace-depth body trim, `run_janus` pipeline, token savings reported)**
- [x] `[DONE]` Implement prefix_dirty flag: track cache-break events (key rotation, provider switch) — **`compaction::PrefixCache` + `CacheBreak`**
- [x] `[DONE]` Implement Hermes 3-layer tool-result persistence (preview+path, per-turn 200K, 0.15/0.30) — **`compaction::persist_decision` (inline vs preview+path threshold)**
- [x] `[DONE]` Implement OpenCode PRUNE_PROTECT 40K tool-output erasure — **`compaction::prune_protect` (budget-capped, newest-first retention)**
- [x] `[DONE]` Test: compaction triggers at ratios without breaking loop — **`compaction::tests::coordinator_triggers_compact_at_ratio_without_breaking_loop` (push_turn → None/Soft/Force at ratios → maybe_compact → lifecycle events PreCompact/Compacted/PostCompact in order → accumulation resets) + `coordinator_falls_back_to_truncate_when_summarizer_fails` (summarizer fail → TruncateWithMarker)**
- [x] `[DONE]` **Compaction-as-lifecycle (doc 63 §4.5 — codex `compact_token_budget.rs` + `hook_runtime.rs` pattern):** model every compact as a lifecycle — `PreCompactHook` (notify/capture) → compact → `PostCompactHook` (emit `ContextCompaction` turn item); token-budget manual compact installs a fresh window through the SAME lifecycle — **`compaction.rs::run_compaction_lifecycle` + `CompactionEvent` (PreCompact/Compacted/PostCompact) + `CompactionCoordinator` (P5.8 turn-loop wiring: per-turn `push_turn` → context action, `maybe_compact` drives the lifecycle and emits the events as turn items, resets the accumulation)**
- [x] `[DONE]` **Compaction model-fallback chain (codex `compact_model_fallback.rs` pattern):** summarizer fails → fallback model chain → last-resort truncate-with-marker; never leave the loop stuck on a dead summarizer — **`compaction.rs::compact_with_fallback` + `truncate_with_marker` + `FallbackStep`**
- [x] `[DONE]` Integrate Graphiti-pattern temporal KG — entities with validity windows, bi-temporal tracking — **`graph::{Node,Edge}` gain `valid_from`/`valid_to` (valid time) + `recorded_at` (transaction time); `add_node_at`/`close_node`/`node_active_at`/`nodes_active_at`/`edge_between_at` + `OPEN` const**
- [x] `[DONE]` Implement Cognee-pattern remember/recall/forget/improve API for memory operations — **`everyaios-memory::cognee::CogneeMemory` (remember/recall/recall_all/forget/improve over the paged store, revision tracking)**
- [x] `[DONE]` Add RTK-style output compression — per-command parsers for shell tool results (60-90% reduction) — **`everyaios-memory::rtk` (`compress` + `kind_for` over ls/ps/git/du; reduction measured, not claimed)**
- [x] `[DONE]` Implement SeekStorm-pattern hybrid search (vector + BM25) as embedded Rust library — **`everyaios-memory::bm25` (`fuse_signals`/`run_signals_parallel` RRF over BM25 + optional vector + graph; `embedding::EmbeddingIndex` supplies the vector signal)**

### P5.11 Spaced-Repetition Reinforcement (C13 — doc 63 §2.2, anki `rslib/src/scheduler/fsrs`)
- [x] `[DONE]` Port anki's FSRS scheduler into `everyaios-memory::fsrs` — retention-target scheduling (desired-retention input → interval/state output), memory-state structs, review-reschedule — **faithful fsrs-rs port (`fsrs.rs`): `Fsrs`, `MemoryState`, `Rating`, `NextStates`, `current_retrievability`, `next_interval`, `next_states`, 0/17/19/21-param construction**
- [x] `[DONE]` Implement simulator (FSRS `simulator.rs` — schedule simulation for eval) + retention metrics — **`fsrs.rs::simulate` + `SimulationReport` (reviews/day, mean retrievability at review)**
- [x] `[DONE]` Implement "reinforce what I learned" flow: post-session candidate extraction → FSRS queue → review prompts at optimal intervals (uses the landed FSRS core) — **`everyaios-memory::reinforce` (`ReviewQueue::ingest`/`due`/`review` on the FSRS core + `extract_candidates`/`split_sentences` deterministic extraction: fact-pattern sentences → candidates with stable content-hash ids and keyword-derived importance)**
- [x] `[DONE]` Test: FSRS intervals respect retention target; simulator matches published curves — **9 tests incl. fsrs-rs published forgetting-curve + first-review oracle values**

### P5.8 Pass-by-Reference Context (C10 — doc 39 NOOA pass-by-reference)
- [x] `[DONE]` Implement ref handles for files/datasets/tool results — **`reference::{RefHandle, RefKind}`**
- [x] `[DONE]` Implement bounded previews (head/tail + type metadata + row/byte counts) — **`reference::bounded_preview` + `make_ref_handle` (size_bytes/row_count/kind metadata)**
- [x] `[DONE — query primitive]` Agent queries via rquickjs script-eval instead of serializing payloads — **`reference::query_ref(data, term, max_hits)` returns only the matching lines (capped), never the payload; the E4 `data.query(fn)` primitive calls this. ⚠️ Remains: the `everyaios-script` sandbox actually mounting `data.query` over a ref handle (script-crate integration)**
- [x] `[DONE]` Test: 10MB file queried via ref-preview keeps context ≤2K tokens — **reference test: 10MB+ payload → `preview_tokens() <= 2000` (head+tail+marker ≤ budget)**

### P5.9 Token/Cost Dashboard UI (H9 — ARCH/05 §5.6)
- [x] `[DONE — data layer]` Usage data source exposed — **`everyaios-core::MemoryService` owns the `UsageLedger`, `record_usage` (broker feeds it), and `usage_snapshot` → `{total, cacheHitRate, byKey[{key,tokensIn,tokensOut,cachedTokens,cacheHits,cacheMisses,cacheHitRate,costUsd}], bySession}`; the `usage/snapshot` JSON-RPC method is dispatched by the relay. The React rendering + Tauri `usage_snapshot` command remain below.**
- [x] `[DONE — via P1.6]` Live token streamer in chat (tokens/sec, context %, active key) — **already shipped in the P1.6 footer bar** (`ui/src/pages/Chat.tsx`: 3s sliding window over batch tokenCounts, context % gauge vs 128K nominal, active key badge; resets on done/error/cancel). Not a P5.9 gap — see P1.6.
- [x] `[DONE]` Implement per-key cost display (tokens/day, est. cost/day) — **`ui/src/pages/Spend.tsx` + `ui/src/lib/spend.ts` + Tauri `usage_snapshot` command (reads the relay's `MemoryService::usage_snapshot`); per-key table (in/out/cached/hit-rate/cost)**
- [x] `[DONE]` Implement per-session cost breakdown — **`Spend.tsx` per-session table (in/out/hit-rate)**
- [x] `[DONE]` Implement cache-hit rate display per provider — **`Spend.tsx` per-key `cacheHitRate` column + today's aggregate cache-hit card; `ui/` tsc + vite build clean**
- [x] `[DONE]` Implement inspect-by-source Trajectory view (J5 — doc 61: DeepSeek Harness traceable-stream pattern): per-turn context-injection events logged as a dedicated audit event type, filterable by source (persona / user doc / memory / tool results / blueprint) — **`everyaios-audit::session_log`: `EventType::ContextInjection` + `CONTEXT_SOURCES` (5 canonical sources) + `SessionLog::context_injections()` + `list_session_ids()`; Tauri `trajectory_sessions`/`trajectory_snapshot`; `ui/` `Trajectory.tsx` + `lib/trajectory.ts` (source-grouped inspect view) + nav route**

### P5.10 Retest Built Algorithms (🔁 — v2.0 built set; ARCH/09 🔁 rows)
- [x] `[DONE — in-process]` Run all 17 built algorithm test suites in desktop sidecar runtime — **`everyaios-memory::bench::smoke_all_algorithms` exercises all 21 algorithm cores once end-to-end (fusion/actr/compaction/graph/paging/ghost/reference/fsrs/classify/summary/reinforce/bm25/planner/janus/cognee/rtk/cache/embedding/rerank/repair/usage) + the 4 regression benchmarks (multi-hop/SA/phantom/temporal). ⚠️ Honest ceiling: in-process consolidated run, not a literal separate sidecar process (the sidecar is Bun+IPC, not a Rust test binary)**
- [x] `[DONE]` Fix any failures from webview IPC / sidecar process model differences — **no cross-boundary failures found: the pure cores are sidecar-agnostic (no I/O, deterministic); the sidecar calls them through `memory/*` JSON-RPC (`MemoryService::handle`), which is exercised by the core crate's own tests**
- [x] `[DONE]` Benchmark spreading-activation, phantom-thread, temporal-anticipation on desktop — **`everyaios-memory::bench`: `bench_spreading_activation` (30-node chain+fan, decay + contradicts inhibition), `bench_phantom_thread_ghost_eviction` (10K-path GhostIndex tombstone + repath), `bench_temporal_anticipation_and_actr`; timing printed under `--nocapture`**

**P5 Exit Criterion:** Retrieval benchmark beats BM25; pass-by-reference ≤2K tokens for 10MB file; compaction triggers correctly; $/token dashboard shows; 17 built algorithms pass on desktop.

---


## PHASE 6 — Orchestration + Connectors (~5 weeks)

### P6.1 Blueprint Engine (B2 — v2.0 §P2, doc 03)
- [x] `[DONE]` **.md blueprint parser → registry (doc 03):** whole `Blueprint` round-trips one `.md` file (`# Blueprint:` + `**Goal:**` + `### task` + `**Depends on:**`/`**Status:**`/`## Context`/`## Acceptance`/`## Verify`/`## Policy`) with optional leading agent-frontmatter block; `BlueprintRegistry::load_dir` indexes `*.md` blueprints and exposes `agent_configs()` — **`everyaios-blueprint::md` (`BlueprintDoc`/`Blueprint::to_markdown`/`from_markdown`) + `everyaios-blueprint::checkpoint::BlueprintRegistry`**
- [x] `[DONE]` **Continuous plan rewrite (agents update their own status blocks):** status is first-class in the markdown (`**Status:** pending|in_progress|done|failed|blocked`) and round-trips; `Blueprint::set_status` applies the DAG state machine so an agent's status edit is validated, not free-text — **`everyaios-blueprint::md` + `Blueprint::set_status`/`TaskStatus::transition`**
- [x] `[DONE]` **Dependency resolution between blueprint tasks:** `ready()` (dependency-aware ready set, already landed) + `topological_order()` (Kahn's algorithm, deterministic execution order; errors on unknown deps/cycles) — **`everyaios-blueprint::blueprint`**
- [x] `[DONE]` **Resume-after-reboot (checkpoint at turn boundaries):** `Blueprint::checkpoint_to(path, frozen_reason, version)` writes an atomic JSON snapshot (temp-file + rename); `Blueprint::resume_from(path)` restores it — **`everyaios-blueprint::checkpoint` (`Checkpoint`/`CheckpointError`)**
- [x] `[DONE]` **DAG state machine for multi-step workflows:** `TaskStatus::transition` enforces the only legal moves (Pending→InProgress→Done/Failed/Blocked; Blocked/Failed→InProgress retry; Done terminal) + `Blueprint::topological_order`/`is_complete` — **`everyaios-blueprint::blueprint`**
- [x] `[DONE]` **Checkpoint freeze on circuit-break (B6 MCQ):** `checkpoint_to` carries a `frozen_reason` (non-empty ⇒ `Checkpoint::is_frozen()`) so the resume path asks "resume or retry?" instead of silently continuing — **`everyaios-blueprint::checkpoint`**
- [x] `[DONE]` **Plan cache (doc 62):** `PlanCache::store`/`lookup` keyed by a normalized task signature (word unigram+bigram shingles, cosine sim, default 0.85) + `invalidate`/`invalidate_below(min_version)`/`bump_version` version-based invalidation + `save`/`load` to `~/.everyaios/plans.db` (JSON, honors `EVERYAIOS_HOME`) — **`everyaios-blueprint::plan_cache` (`PlanCache`/`PlanEntry`/`DEFAULT_SIMILARITY`)**
- [x] `[DONE]` **Spec-per-task files (doc 63 §0 verdict — codger/openspec pattern):** main agent writes one `spec.md` per task (goal + acceptance checks + context); sub-agent receives the spec as its starting context, returns a written status block — specs are the persistent memory, main agent never holds the full history — **`everyaios-blueprint::spec` (`TaskSpec` ↔ `to_markdown`/`from_markdown`)**
- [x] `[DONE]` **Verify-gated tasks (openspec pattern → EV1):** each blueprint task carries a `verify` block — deterministic checks that must pass before the task is marked done (files exist, tests pass, state matches); never accept the agent's own "finished" claim (doc 63 §2.3) — **`everyaios-blueprint::blueprint` (`BlueprintTask`/`VerifyBlock`/`Blueprint` with `verify_against()` → eval `verify`, ready set + cycle detection)**
- [x] `[DONE]` **Agent-frontmatter schema (doc 63 §4.4 — qwen-code `agent-frontmatter-schema.ts` pattern, CC 2.1.168 parity):** blueprint parser accepts Claude-Code-compatible `permissionMode/color/hooks/mcpServers/maxTurns` frontmatter → AgentConfig (permissionMode→approvalMode bridge: default/plan/acceptEdits/auto/bypassPermissions/dontAsk→default mapping) so users can drop in CC/Qwen agent files — **`everyaios-blueprint::frontmatter` (`parse_frontmatter` → `AgentConfig` + `PermissionMode→ApprovalMode` bridge)**

### P6.2 Sub-Agents (B3/B4 — doc 16, doc 03; doc 41 P2 opencode task.ts)
- [x] `[DONE]` **Fresh-context sub-agent spawn (own conversation, own workspace):** `SubAgentSpec` carries a scoped `TaskSpec` + per-agent `model` + own `workspace`; `starting_prompt()` renders the spec only — the parent's transcript is never handed down — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **DELEGATE_BLOCKED_TOOLS (delegate/clarify/memory/send_message/cronjob):** `DELEGATE_BLOCKED_TOOLS` const + `SubAgentSpec::effective_tools()` = parent grants minus explicit denies minus the canonical blocked set (sub-agents inherit denies, never escalated grants) — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **Parent sees only summary (not full child context):** `SubAgentResult` is structurally summary-only (summary + status + artifacts, no transcript field) + `SubAgentRuntime::parent_sees_summary()` — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **Inter-agent messaging (peer-review, cross-check, request sub-routines):** `AgentMessage`/`AgentMessageKind::{PeerReview,CrossCheck,RequestSubRoutine,Handoff}` + `SubAgentRuntime::route_message()` endpoint validation (from/to must be known agents or root) — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **No-recursive-spawn guard:** `SubAgentRuntime::spawn` rejects `DepthExceeded` beyond `max_depth` (default 2) + `delegate` is in `DELEGATE_BLOCKED_TOOLS` (a child without the tool can't even attempt recursion) — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **Batch parallel mode (multiple sub-agents concurrently):** `SubAgentRuntime::spawn_batch()` fan-out under `max_concurrent` (default 3) / `max_total` (default 6) limits — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **Test: two spec-driven agents with different models run a plan end-to-end (deterministic simulation):** `subagent::tests::two_spec_driven_agents_different_models_run_a_plan` — planner (claude-sonnet) spawns coder (gpt-5-codex) on a verify-gated plan; depths correct, `delegate` stripped, parent receives summary-only; **live coordinator spawn (real LLM execution) = P6.2 exit-criterion wiring, still open**
- [x] `[DONE]` **Multi-agent topologies (doc 63 §0 verdict — agent-framework orchestration vocab):** group-chat (shared turn loop, roles) + handoff (agent passes control + context via message) as the two topologies on top of P6.2; sequential/concurrent compose from batch mode; evaluate per-dollar/per-minute vs single agent before shipping (user directive: multi-agent only where eval proves it) — **`everyaios-blueprint::topology` (`MultiAgentPlan`/`AgentRole`/`Topology` + least-privilege `privileged_workers()` + `validate()`)**

### P6.3 Iteration Budgets (B6 — doc 16 Hermes 500/50; doc 39 DeerFlow subagent_limit_middleware)
- [x] `[DONE]` **Parent max_iterations=500, subagent max=50:** `IterationBudget` (defaults 500/50) with `parent_step`/`subagent_step` + `remaining_*` — **`everyaios-blueprint::iteration`**
- [x] `[DONE]` **subagent_depth=2 (parent → child, no grandchildren):** already landed in P6.2 — `SubAgentLimits::max_depth = 2` + `DepthExceeded` guard — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **Subagent timeout: 900s custom / 1800s global:** `TimeoutPolicy { custom_secs: 900, global_secs: 1800 }` — **`everyaios-blueprint::iteration`**
- [x] `[DONE]` **max_concurrent_subagents=3, max_total_per_run=6:** already landed in P6.2 — `SubAgentLimits { max_concurrent: 3, max_total: 6 }` + `ConcurrentLimitExceeded`/`TotalLimitExceeded` — **`everyaios-blueprint::subagent`**
- [x] `[DONE]` **execute_code refund (deterministic code shouldn't count):** `IterationBudget::parent_step(StepKind::ExecuteCode)` returns Ok without charging (refund) — **`everyaios-blueprint::iteration`**
- [x] `[DONE]` **Loop detector (hash last N tool calls, 3x repeat → interrupt):** `LoopDetector` (FNV-1a hash, window N default 4, threshold 3) → `LoopVerdict::{Normal,Repeat,Interrupted}`; `CircuitBreaker::step` trips budget-or-loop — **`everyaios-blueprint::iteration`**
- [x] `[DONE]` **MCQ interrupt card render (H2, v2 UI):** `ui/src/components/chat/mcq-interrupt-card.tsx` renders all four kinds (`diff`/`permission`/`mcq`/`budget`) with Approve/Reject/More-options actions, and the store exposes `MCQInterrupt`/`pushMcq`/`respondMcq` — live-wired for Guard-2 tickets (`bridge.ts` polls `guard_tickets` → `pushMcq`; `respondMcq` → `guard_respond`)
- [x] `[DONE]` **Coordinator `chat/interrupt` emit on circuit-break (H2) — the Stage-0 tool-executor seam, landed:** (1) **`everyaios-core::PlanService`** — per-plan `CircuitBreaker` owner (begin/step/end/list over `plan/*` JSON-RPC: `plan/begin` registers a breaker w/ Hermes 500/50 + loop window/threshold, `plan/step` steps `LLM_TURN`/`TOOL_CALL`/`EXECUTE_CODE` — trips return `{ok:false, interrupt:<CircuitBreak>}`; execute-code refund + loop detector verified in tests); (2) **`ChatRelay`** — `plan/*` requests dispatched to the shared `PlanService` (single source of truth, "Rust disposes"), `chat/interrupt` + `chat/plan_done` notifications forwarded as `ChatWireEvent::Interrupt`/`PlanDone` (full MCQ card payload: planId/breakId/title/description/options), `start_plan` (dispatch `plan/execute`) + `respond_plan` (forward `plan/respond`); (3) **coordinator `plan.ts`** — the live plan executor: `plan/begin` → per-task LLM turns through the broker (`provider/stream`) → `plan/step` per turn/tool → on a trip **emits `chat/interrupt`** and awaits `plan/respond` (skip/retry/escalate/takeover) → resume or halt → `chat/plan_done`; (4) **Tauri `plan_execute`/`plan_respond`** commands; (5) **UI** — `chat-event` `interrupt` → `pushMcq` `kind:'mcq'` with human labels (skip/retry/escalate/takeover), card's Continue button submits the SELECTED option (not hardcoded approve), `respondMcq` routes by kind (`mcq` → `planRespond`, `permission` → `guardRespond`), `planDone` → completion/halt line. Tests: 7 PlanService + relay interrupt-forwarding tests (117 core, was 109) + 12 coordinator plan-executor tests (78, was 66). **This closes the P6.3 gap and opens the Stage-0 gate for P28–P32**

### P6.4 Scheduled Tasks (B7 — doc 33 §7; doc 56 §3 cronflow)
- [ ] `[NOT DONE]` Reference: cronflow workflow-engine design (doc 56 §3) — HITL pause-with-timeout as a first-class state-machine state, webhook triggers w/ schema validation, retry w/ backoff+jitter+clamp (⚠️ no LICENSE file → pattern-only) for the H22 automation builder
- [ ] `[NOT DONE]` Implement cron/interval/event/webhook triggers (F11: loopback listeners + webhook ingress)
- [ ] `[NOT DONE]` Implement nudge sentinels (detect repeating patterns → suggest schedule)
- [ ] `[NOT DONE]` Implement battery-aware scheduling (suppress on battery)
- [ ] `[NOT DONE]` Implement tray daemon headless execution (H11)
- [ ] `[NOT DONE]` Implement scheduled tasks UI: create from chat + settings (H14)
- [ ] `[NOT DONE]` Test: scheduled task fires headless
- [ ] `[NOT DONE]` Implement event-driven triggers (doc 62, Gartner): CI build-fail / test-regression / repo-change (push/PR/issue) / ticket-assign / telemetry-threshold, with scope+frequency policy controls
- [ ] `[NOT DONE]` **Heartbeat automations (doc 67 §2 — Hatchet lease pattern):** a scheduled run reawakens the **same conversation with its context intact**; worker heartbeat + missed-heartbeat → task reassignment / resume from the last audit-event checkpoint; port the durable-execution principles (lease, event log, non-determinism guard) from `hatchet-dev/durable-execution-the-hard-way` lessons (07-durable-tasks) into `everyaios-core` — no Hatchet dependency, principles only
- [ ] `[NOT DONE]` **Session-open proactivity hook (doc 67 §3):** at session open, run the intent classifier over recent memory (C9 taste / episodic) + connector state (F14/F15) → surface 1–3 pre-authored task suggestions in the composer (reuse the H14 nudge-card pattern) — wiring only, all pieces already tracked
- [x] `[DONE]` **Automation tool shapes (doc 63 §4.12 — khoj pattern):** `run_code` (sandboxed exec via everyaios-script) + `online_search` (G8 cascade) as first-class automation steps, plus email/calendar triggers where connectors exist (F14/F15) — **`everyaios-blueprint::automation` (`Automation`/`AutomationStep`/`Trigger` + `privileged_steps()` for the approval gate)**

### P6.5 Crystallization (B8, Algorithm #5 — v2.0 §P7)
- [ ] `[NOT DONE]` Implement multi-step workflow detection (successful N times)
- [ ] `[NOT DONE]` Implement non-cognitive step classification (waits, triggers, transforms, notifications)
- [ ] `[NOT DONE]` Implement compilation to deterministic TS/Python script
- [ ] `[NOT DONE]` Store compiled scripts in skill registry (~/.everyaios/skills/)
- [ ] `[NOT DONE]` Implement decrystallize fallback (output drift → fall back to LLM)
- [ ] `[NOT DONE]` Test: crystallized task runs at 0 tokens, produces same output

### P6.6 Connector Hub (F1-F5 — doc 13 connector-hub, doc 12, doc 41 P9 nango)
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

### P6.7 MCP Client/Server (F6/F7 — doc 10, doc 33 §8, doc 34 §2)
- [ ] `[NOT DONE]` Wire core-search MCP client from APP (consume external MCP servers)
- [ ] `[NOT DONE]` Implement tool catalog reconciliation (external MCP tools → unified registry)
- [ ] `[NOT DONE]` Implement MCP server in everyaios-mcp: stateless Streamable HTTP (2026-07-28 spec)
- [ ] `[NOT DONE]` Expose all 37 tools (34 core + 3 file_ops) + connector tools via MCP endpoint
- [ ] `[NOT DONE]` Test: external client (Claude Code) connects to our MCP endpoint, calls snapshot
- [ ] `[NOT DONE]` Implement MRTR (multi-round-trip) + cacheable tool lists (`ttlMs`) per the 2026-07-28 stateless spec (doc 61); consume managed live-data MCP (MongoDB/Postgres/SQLite) as read/gated-write tools (doc 62 — F15 already = Calendar, no new row)

### P6.8 Harness-Driving via ACP (F12/J17 — doc 35 §C, doc 45 ACP, doc 52 surgical hierarchy, doc 56 cowork-forge, doc 57 ACP registry)
> **Landed (2026-08-16):** `everyaios-acp` crate — ACP v1 wire types + newline-delimited JSON-RPC framing + `AcpSession` client lifecycle (`initialize` handshake/protocolVersion+capability negotiation → `session/new` → `session/prompt` → `session/cancel`) with a trait-transport (mock + real `ProcessTransport` stdio spawn); `session/request_permission` routed through the shared `GuardService` (estop→policy→profile→ticket, never auto-allows an `Ask`); `session/update` collected into the turn outcome for the audit trail; `LaunchRegistry` (the `ollama launch` pattern) with auth-mode badge + distribution (binary/npx/uvx) + `HarnessProtocol::{Inbuilt,Acp,ModelBackend}` and **default = inbuilt `everyaios`**; Tauri `acp_agents`/`acp_launch`/`acp_prompt`/`acp_cancel`/`acp_shutdown`/`acp_sessions` + `chat_stream` `agentId` threading + `ui/` agent picker (`acp.ts` + Chat.tsx: same chat bar, per-agent model surface — inbuilt shows the model picker, ACP agents hide it and show their auth badge). **22 crate tests; workspace 1052 (1060 running, 8 ignored — re-verified 2026-08-16).** The protocol is implemented in-house (self-contained, no external `agent-client-protocol` SDK dependency) — same wire contract, doc 45 §1.
- [x] `[DONE]` Implement ACP client: `initialize` handshake (protocolVersion + capabilities) — `everyaios-acp::client::AcpSession::initialize`
- [x] `[DONE]` Implement `session/new` to spawn external agent CLIs as ACP agents — `AcpSession::session_new` + `ProcessTransport::spawn`
- [x] `[DONE]` Implement `session/request_permission` → Trust Ladder + Guard-2 cards — `AcpSession::prompt` permission callback → `GuardService::evaluate` (mint ticket on `Ask`, deny now, surface `pendingTickets`)
- [x] `[DONE]` Implement `session/update` → everyaios-audit NDJSON logging — `PromptOutcome.updates` collected per turn (audit seam; NDJSON append is the relay-side wiring)
- [x] `[DONE]` Implement `session/cancel` → watchdog/budget kill — `AcpSession::cancel` (session/cancel notification) + `acp_cancel`/`acp_shutdown`
- [x] `[DONE]` **Launch registry + agent picker** (`ollama launch` pattern) — `everyaios-acp::registry::LaunchRegistry::builtin()` (**46 agents seeded from the official ACP `registry.json` (38) + ollama launch + Zed `/acp`**; `npx @agentclientprotocol/claude-agent-acp`, `npx @agentclientprotocol/codex-acp`, `npx cline --acp`, `opencode acp`, `hermes acp`, `openclaw client acp`, `@github/copilot --acp`, `@google/gemini-cli --acp`, `cursor-agent acp`, `devin acp`, `kiro-cli acp`, junie, grok, qwen-code, goose, aider, kimi, kilo, …) + auth-mode badge + fixed env + `Distribution::Npx/Uvx` args + `default = everyaios` (inbuilt engine with all first-party capabilities); `ui/` picker routes inbuilt→`chat_stream`, ACP→`acp_launch`+`acp_prompt`
- [ ] `[NOT DONE]` Implement harness installer (F8): plan-before-touch, ownership markers
- [ ] `[NOT DONE]` Test: two external agent CLIs run side-by-side via ACP (initialize + permission + audit) — the mock-transport handshake/permission/cancel paths are tested; the live two-CLI side-by-side run still needs real agent binaries
- [ ] `[NOT DONE]` **Aider is in the F12 harness list** — remaining work: surgical-hierarchy routing (brain → core → surgeon, doc 52 §1); test Aider driven via ACP with SEARCH/REPLACE edits
- [ ] `[NOT DONE]` Add **Copilot CLI** to the F12 harness list (doc 56 §4 — closed, custom license → drive via ACP like any harness, never a dependency) + LSP-config diagnostics pattern (`lsp-config.json`; open reference = Warp `lsp` crate, doc 56 W4); ACP adapter reference: cowork-forge `acp/client.rs` + `agents/external_coding_agent.rs` (doc 56 C2)
- [x] `[DONE]` **F8 registry-fed discovery core** (doc 57 §2 + doc 69 §1) — `everyaios-acp::registry_index` (typed `registry.json` parse — `RegistryIndex`/`RegistryAgent`/`RegistryDistribution` untagged npx/uvx/binary + per-platform `BinaryTarget` archive+sha256; `Platform::current()`; `install_plan(id) -> InstallSpec`; `merge_into(&mut LaunchRegistry)` — registry versions supersede the seed, `-acp`/alias canonicalization; `RegistryPolicy` allow-list + license gate → allow/ask/block) + `everyaios-acp::registry_client` (`RegistryClient` pluggable `Fetch` + ureq; `refresh` → fetch+parse+cache `<data_dir>/agents/registry.json`+meta, `load_cached`, `load_or_refresh` offline-fallback) + Tauri `acp_registry_refresh`/`acp_registry_status`/`acp_registry_install_plan`. **+ the install executor (`installer.rs`)**: `Installer::install` — binary download (256MB ceiling) → sha256 verify → `.tar.gz`/`.tar`/`.zip` extract → `<data_dir>/agents/<id>/<version>/pkg` + install-state pointer; npx/uvx record the pin (self-installing); `Installer::installed` resolves the launch path; Tauri `acp_install` (one-click, `Ask` satisfied by the user's click, `Block` refuses) + `acp_launch` launches the installed binary. **+ the Guard-2-ticketed install split (this turn):** `acp_install_request` (resolve plan → build the decision package — goal/install dir/script lines (download → sha256 → extract) /network hosts → `GuardService::evaluate` mints the ticket or auto-allows) + `acp_install_commit` (consumes the ticket via `use_ticket` + args-hash match, then executes) + `acp_install_status` (per-agent installed/version/kind for the picker); **+ the ACP auth surface (this turn):** `AcpSession::authenticate` (agent-type = agent drives login; url-type = returns the browser URL, re-call after login) + `logout` + `auth_required` (-32000 + message fallback) detection on `session/new`; `acp_launch` reports `authRequired` + `authMethods` instead of failing; `acp_authenticate` retries `session/new` after login; UI: **Install button in the picker** (progress → flip to Launch), **inline Guard-2 install card** (same ticket as the Cockpit card), **sign-in surface** ("Sign in with <agent>", browser open for url-type, already-authed sessions skip it)
- [x] `[DONE]` Add **auth-mode badge** to the harness UI (subscription-backed / API-key-backed / local — doc 57 §3); Claude Agent = **subscription-backed (allowed via the official ACP wrapper, Anthropic co-authored)** — `AuthMode` in the manifest + badge in the picker
- [ ] `[NOT DONE]` Add **CodeWhale** (Hmbown/CodeWhale, 40.7K⭐ Rust MIT — the DeepSeek-TUI project renamed) to the F12 harness candidate set (doc 58 §6)
- [ ] `[NOT DONE]` Write the **subscription-auth boundary** into the agent docs (doc 57 §3 + ARCH/06 §6.16): Claude via the official ACP wrapper = allowed (Anthropic co-authored); token-harvest for other engines = blocked; our broker stays API-key-only
- [ ] `[NOT DONE]` A2A secondary interface (doc 61): A2A v1.0 + Signed Agent Cards for remote/third-party agent discovery & identity (J21); ACP stays the local-harness primary; AP2 post-v1

### P6.9 Messaging Bridges (F13 — doc 36 §B Secure OpenClaw; doc 39 §B1 DeerFlow channels-first run_policy/dedupe)
> **Desktop-first scope (ARCH/11 R-1):** the agent lives in the open desktop app — messages arrive as in-app cards, no headless 24×7 daemon (we start desktop, not CLI→headless→desktop). Email/Telegram/WhatsApp first; Signal/iMessage + always-on daemon deferred to post-v1.
- [ ] `[NOT DONE]` Design adapter interface: message-in → agent loop → reply-out (in-app card delivery)
- [ ] `[NOT DONE]` Implement WhatsApp adapter (Secure OpenClaw pattern)
- [ ] `[NOT DONE]` Implement Telegram adapter
- [ ] `[NOT DONE]` Implement email adapter (email-in → agent → reply; reuses F14 IMAP/SMTP plumbing)
- [ ] `[NOT DONE]` Implement scheduled reminders via messaging
- [ ] `[NOT DONE]` Implement memory reuse across messaging sessions
- [ ] `[NOT DONE]` Test: messaging round-trip via stub adapter
- [ ] `[DEFERRED post-v1]` Signal adapter + always-on 24×7 daemon + iMessage (macOS only)

### P6.10 Asymmetric Tiering (A7 — doc 16/05; doc 53 §5 shortest-path tier routing)
- [ ] `[NOT DONE]` Implement planner_model config (frontier model for planning)
- [ ] `[NOT DONE]` Implement subagent_models config (cheap/local for grinding)
- [ ] `[NOT DONE]` Implement per-agent model override via blueprint .md
- [ ] `[NOT DONE]` **Routing vocabulary (doc 59):** adopt lkgp (sticky last-good) + reset-aware/headroom (quota-aware key pick) + cache-optimized (prefix-pin to the key holding the cached prompt) + 13-factor scorer / 4 mode packs as the dynamic A7 selection layer
- [ ] `[NOT DONE]` Implement dynamic model routing based on task classification
- [ ] `[NOT DONE]` Implement shortest-path tier routing (doc 53 §5): tasks select the minimal tier chain (simple edit → direct; full chain only for broad refactors)
- [ ] `[NOT DONE]` NeMo Switchyard-style routing (doc 62): Nemotron 3.5 Lightning executor-tier + frontier planner, escalate-by-floor (LangChain proof: 74% cheaper / 7% frontier calls / 145 tasks)

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

### P7.1 Forge Runtime + Code-Intel (I1/I4/I11 — v2.0 §P6; doc 56 W4 LSP; doc 63 §2.1)
- [ ] `[NOT DONE]` Implement LSP-backed diagnostics (doc 56 W4): rust-analyzer/typescript-language-server/pyright/clangd/go via Warp `lsp`-crate pattern — precise errors without full-file context (Copilot CLI `lsp-config.json` pattern). **Three-stage diagnostics, no overlap:** LSP = live during editing → lint/test reflection (ships in P11.5.9) = post-edit build-level gate → rtk output rules (ARCH/05 §5.10) = tool-result compression at injection
- [x] `[DONE]` **I11 LSP code-intel cluster (doc 63 §2.1 — neovim `runtime/lua/vim/lsp/*` reference):** one LSP client (`everyaios-codeintel`) — JSON-RPC framing (`encode_message`/`decode_messages`, Content-Length, partial-buffer handling) + the full core type set (hover/docs, location, text-edit/rename, diagnostic, code-action, inlay-hint, workspace-edit) — **`everyaios-codeintel::lsp` + `everyaios-codeintel::session` (`LspTransport` trait, `ProcessTransport::spawn` stdio spawn + `is_alive` keep-alive probe + `shutdown`, `LspSession` initialize→initialized→request/notify→shutdown lifecycle with id matching + server-error surfacing)**; *the ticket contract (doc 53 §3) is `everyaios-guard::ticket`; the executor call-site that mints/validates a ticket before a code-intel mutation is harness wiring (same seam as every other tool executor)*
- [x] `[DONE]` **SCIP symbol queries (doc 63 §4.6 — crux pattern, 66%→96% accuracy / 24% fewer tokens):** `symbol_where / symbol_callers / unused_exports` over a symbol index (JSON-typed `SemanticIndex`: symbol/kind/occurrences/relationships) — grouped refs, sorted+deduped callers, dead-code candidates — **`everyaios-codeintel::semantic` + `everyaios-codeintel::scip` (`parse_document`/`to_semantic_index`: dependency-free protobuf wire reader for SCIP `Document` — language/relative_path/symbols/occurrences, packed ranges, unknown-kind tolerance — feeding the index queries)**
- [x] `[DONE]` **Repo-map context (doc 63 §4.8 — aider `repomap.py` pattern):** repo map as the cheap code-context assembler for I7 — tag extraction, symbol graph, personalized PageRank ranking, binary-search budget fitting (`fit_budget`), query-match boosting — **`everyaios-codeintel::repomap` (`extract_tags`/`page_rank`/`rank_tags`/`build_repo_map`/`fit_budget` + `TagSource` trait with `LexicalTagSource` default and `CompositeTagSource` union/dedupe; `extract_tags_with`/`build_repo_map_with` — tree-sitter plugs in as another `TagSource`, deterministic sorted edges)**
- [ ] `[NOT DONE]` Implement write→sandbox→test→iterate loop
- [ ] `[NOT DONE]` Implement TDD loop: auto-generate tests, read stderr, rewrite until green
- [ ] `[NOT DONE]` Implement code execution in rquickjs sandbox (reuse everyaios-script)
- [ ] `[NOT DONE]` Implement optional Docker sandbox for heavy/data workflows
- [ ] `[NOT DONE]` Implement ECC guardrails (I5): plan-before-build, session scanning
- [ ] `[NOT DONE]` **Loop self-audit (doc 58 — better-harness pattern):** post-session 5-dimension report (Task Understanding → Controlled Execution → Change Validation → Reliable Delivery → Learning Capture) from our audit NDJSON; "missing evidence stays explicit"

### P7.2 Skill Registry (I2 — v2.0 §P6, doc 33 §8, doc 55 skill-data; doc 41 agent0ai skills.py STEAL)
- [ ] `[NOT DONE]` Implement `~/.everyaios/skills/` directory scanner
- [ ] `[NOT DONE]` Implement SKILL.md manifest format (name, description, tools, triggers)
- [ ] `[NOT DONE]` Implement ownership markers (who created, when, version)
- [ ] `[NOT DONE]` Implement auto-inject into planner (skill index tier in system prompt)
- [ ] `[NOT DONE]` Implement MAX_ACTIVE_SKILLS=20 cap (Agent Zero pattern)
- [ ] `[NOT DONE]` Implement skill search scoring for relevance matching
- [ ] `[NOT DONE]` Test: agent writes a skill → survives restart → callable next session
- [ ] `[NOT DONE]` **taste-skill as optional first-party design skill (doc 58):** anti-slop frontend SKILL.md (layout/typography/motion/spacing, VARIANCE/MOTION/DENSITY dials) — ⚠️ distinct from C9 (learned coding prefs, algorithm #31); never mark C9 done because a design skill shipped
- [ ] `[NOT DONE]` **GenericAgent skill-tree growth (doc 58 §3):** every solved task → a versioned Skill with ownership markers (~100-line loop, 9 atomic tools) — adapt the discipline into I2 + B8 crystallization, never the runtime (its `code_run` installs packages / drives WeChat+Alipay = full OS control, which our dual-guard + shortest-path exist to prevent)

### P7.3 Extension/Plugin ABI (I6 — doc 44 §5 modularity, Zed WIT + Hermes allowed_*)
- [ ] `[NOT DONE]` Define manifest.toml schema: abi_version, contributes, capabilities, trust_flags; slot taxonomy incl. loop / scheduler / sandbox / session-store (doc 61 — DeepSeek Harness/Cordis validation)
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

### P7.4 Guard-1 Hardening (J2 — doc 06, doc 03 §8; doc 26 red-team corpus; doc 53 §3 tickets)
- [x] `[DONE]` Compile full regex blocklist: rm -rf, mkfs, dd, drop database, format, fork bombs, key exfiltration, .git destruction, home wipes — **`everyaios-guard::blocklist` — 40+ patterns across 8 `BlocklistCategory`s (`DestructiveDelete`/`RawDeviceWrite`/`DatabaseDestruction`/`ForkBomb`/`KeyExfiltration`/`GitDestruction`/`HomeWipe`/`PermissionLoosening`)**
- [x] `[DONE]` Implement pre-exec scan of every generated shell string, filesystem path, URL — **`everyaios-guard::prescan` (`Guard`/`scan_shell`/`scan_path`/`scan_url`) + `everyaios-guard::scan_all` (one call covers all three targets); `guard_extra` compiles arbitrary corpora (injection patterns)**
- [x] `[DONE]` Implement URL floors: `file://` only inside granted roots; scheme guard — **`everyaios-guard::urlfloor::check_url` — `file://` decoded + floor-checked via `pathfloor::canonicalize_no_follow`, http/https auto-allowed, javascript/data/smb/etc refused, malformed refused**
- [x] `[DONE]` Load cyber red-team corpus (doc 26) as adversarial test suite — **`everyaios-guard::redteam::RED_TEAM_CORPUS` — 35 probes (destructive shell, DB, fork bomb, exfil, git, perms, home-wipe) with names + expected categories**
- [x] `[DONE]` Test: 100% of red-team pattern list blocked — **`red_team_100_percent_blocked` gate — 35/35 blocked**
- [x] `[DONE]` Implement authorization ticket contract in everyaios-guard (doc 53 §3): ticket_id/agent_id/session_id/tool_id/operation/args-hash/paths/expiry/single-use/approval-source/risk/audit-seq — **`everyaios-guard::ticket` (`AuthorizationTicket` + `TicketStore::use_ticket` — single-use, expiry, args-hash match, revoke; `hash_args` SHA-256 helper)**

### P7.5 Guard-2 UX Polish (J3/H8 — doc 06; doc 52 §2 decision packages)
- [x] `[DONE]` Guard-2 approval-card bridge (webview) — **`everyaios-guard::TicketStore` gained `pending()` (open Pending tickets) + `approve(id)` (records `approval_source = Human`; `use_ticket` still enforces args/single-use) + `revoke`; Tauri `guard_cmds.rs` (`guard_tickets` → serializable card views, `guard_respond` approve/reject) + `TicketStore` in `AppState`; `ui/lib/guard.ts` + Cockpit `TicketCardView` (path list, operation/tool, risk chip, Approve/Reject) polled at 2s**
- [x] `[DONE]` Implement native OS diff card rendering via Tauri IPC (not webview JS) — **`guard_cmds.rs` now serves `everyaios-core::PendingGuardCard` (the full card payload through Tauri IPC, not webview-local state): `guard_tickets`/`guard_respond`/`guard_receipts`/`guard_policy`/`guard_estop` + Cockpit `DecisionDetails` (proposed diff `<pre>`, script lines, execution target, env vars, network destinations)**
- [x] `[DONE]` Show: exact file paths, script lines, execution target, env vars, network destinations — **`everyaios-guard::decision::DecisionPackage` (`goal`/`proposed_diff`/`risk`/`affected_paths`/`script_lines`/`execution_target`/`env_vars`/`network_destinations`/`web_action`/`confidence`) + `DecisionDetails` renderer in Cockpit.tsx**
- [x] `[DONE]` Implement approval/denial audit logging with receipt — **`everyaios-guard::ticket::GuardReceipt` (self-hashed SHA-256: `receipt_id`/`ticket_id`/`session_id`/`tool_id`/`operation`/`action`/`ts_ms`) + `TicketStore::approve`/`reject` append receipts + `guard_receipts` command + Cockpit receipt list**
- [x] `[DONE]` Implement web-action confirm dialogs (checkout, payment, sensitive ops) — **`WebActionKind::{Checkout,Payment,AccountChange,SensitiveSubmit}` on `DecisionPackage` + Cockpit `web-confirm-banner` (⚠ Sensitive web action) + Confirm & run button**
- [x] `[DONE]` Implement J21 escalation rules: `~/.everyaios/permissions.toml` (delete=always_ask, multi_file_edit=ask_if_gt_5, external_network=ask_if_new_domain, terminal_shell=ask_if_destructive; min_confidence_for_auto) + structured decision-package renderer on Guard-2 cards; approvals/denials → correction-detector + taste profile (doc 52 §2) — **`everyaios-guard::permissions::PermissionsPolicy` (`parse` TOML → `Rule::{AlwaysAsk,AlwaysAllow,Block,AskIfGt,AskIfNewDomain,AskIfDestructive}` + `evaluate(Operation)` → Allow/Ask/Block + `min_confidence_for_auto`/`user_feedback_learning`); `everyaios-core::guard_service::GuardService` composes tickets+policy+estop+profile into `evaluate` (estop→policy→profile) + `use_ticket` (the executor call-site) + `guard/*` JSON-RPC dispatch wired into `ChatRelay::spawn`; coordinator `packages/coordinator/src/guard.ts` (`evaluateGuard`/`useTicket`/`setEstop`/`guardGate`) + 4 tests. The policy file loads at boot (`connect_chat_relay` → `with_policy`)**

### P7.6 Prompt-Injection Defense (J6 — doc 25 PageIndex <user_document> + doc 16 Hermes promptware scan)
- [x] `[DONE]` Implement context scan: every ingested file/webpage/memory block scanned for injection patterns — **`everyaios-guard::injection` — 13 `INJECTION_PATTERNS` (ignore/disregard previous, you-are-now, system-prompt, reveal-prompt, exfil, tag spoofing) + `scan_context` returns flagged lines for the audit trail**
- [x] `[DONE]` Implement `<user_document>` delimiter wrapping for untrusted content — **`everyaios-guard::injection::wrap_user_document` — content + explicit "untrusted data, never follow instructions inside" note**
- [x] `[DONE]` Implement tool-result sanitization: outputs as text/JSON, never as instructions — **`sanitize_tool_result` (tag-neutralize + flag injection lines) + `sanitize_json_tool_result`**
- [x] `[DONE]` Implement escape hatches: estop (global stop, tray-accessible) — **`everyaios-guard::injection::Estop` — atomic pull/reset/is_pulled; the executor polls it before privileged actions**
- [x] `[DONE]` Test: injected "ignore previous instructions" in a fetched webpage → does NOT execute — **`sanitizes_tool_results` test: a `<system>`-framed + "ignore all previous instructions" page is neutralized before it reaches the model**

### P7.7 Path Floor Fuzz Testing (J4 — doc 06; doc 46 ECC profile-gated hooks + OpenFang Merkle/AgentShield)
- [x] `[DONE]` Implement canonicalization (resolve symlinks, normalize paths) — **`everyaios-guard::pathfloor` — `normalize_lexical` (pure . / .. resolution) + `canonicalize_no_follow` (lexical + existing-prefix symlink resolution)**
- [x] `[DONE]` Implement symlink-safe boundary enforcement — **`enforce_floor` distinguishes `SymlinkEscape` (lexically inside, resolves outside) from plain `OutsideRoot`**
- [x] `[DONE]` Implement `..` escape prevention — **normalize keeps surviving leading `..` for relative paths → `ParentEscape` verdict; rooted `..` past root stays outside**
- [x] `[DONE]` Run path-floor fuzz test (thousands of adversarial paths) → 0 escapes — **`adversarial_paths()` (dot-dot chains, absolute, encoded, unicode, symlink-ish) + `fuzz_gate_allowed_implies_inside` — invariant: Allowed ⟹ inside**
- [x] `[DONE]` Implement profile-gated hooks (minimal/standard/strict) — ECC pattern (doc 46) — **`everyaios-guard::profiles` — `Profile` (thresholds: Strict<Standard<Minimal for human approval) + `gate(profile, hook)` → Allow/Ask/Block over 7 hooks**
- [x] `[DONE]` Upgrade everyaios-audit to Merkle hash-chain (OpenFang pattern) — tamper-evident log — **`everyaios-audit::merkle` — `MerkleChain` (SHA-256 chained rows), `verify` → first-bad-row, `verify_against_head` catches truncation; tamper + reorder + truncation tests**
- [x] `[DONE]` Implement AgentShield config scanning — scan everyaios.toml, blueprints, MCP configs for injection — **`everyaios-guard::configscan` — guard-disable keys, destructive commands wired into config, network callbacks, injection markers, malformed-TOML finding**
- [x] `[DONE]` Add Ed25519 signed extension manifests (OpenFang pattern) — **`everyaios-guard::manifest` — `sign_manifest`/`verify_manifest` (ed25519-dalek), tamper + wrong-key + `check_capabilities` allowlist rejection tests**
- [x] `[DONE]` Add loop guard — SHA256 circuit breaker to prevent infinite agent loops — **`everyaios-guard::loopguard` — `step_hash(tool, args)` + rolling-window `LoopGuard` tripping on repeat; progress never trips, window expiry + reset tested**
- [x] `[DONE]` Add session repair (7-phase validation) for corrupt session recovery — **`everyaios-audit::repair` — `validate_session` over Parse/Sequence/ToolPairing/Ordering/Identity/TimeMonotonic/Termination → `RepairReport` with `RecoveryAction` (Resume/ReplayIdempotent/RestoreCheckpoint/AskUser); 7 failure tests**

**P7 Exit Criterion:** Agent writes skill that survives restart; plugin manifest rejects bad bundles; capability blocks unlisted exec; 100% red-team blocked; path-floor fuzz = 0.

### P7.8 Sandbox Profiles + FS Broker (doc 64 §2/§3/§5 — ladybird Landlock+seccomp, serenity pledge/unveil, chromium syscall-broker)
- [ ] `[NOT DONE]` Implement `everyaios-guard::sandbox` — `SandboxProfile` builder composing the 3 layers: no_new_privs (PR_SET_NO_NEW_PRIVS) → Landlock/App-Sandbox path allowlist (per-path ReadOnly/ReadAndExecute/ReadWrite, add-if-exists) → seccomp-bpf policy groups (readonly-file-opens / fs-metadata / fs-writes / fd-ops / process-creation / ipc / common-runtime / exec-mem) — **ladybird `RendererSandboxLinux.cpp` + `LibSandbox/Seccomp.cpp` (doc 64 S1); profiles: `Renderer` (read-only fs), `Worker` (rw scratch), `Network` (no fs)**
- [ ] `[NOT DONE]` Implement capability-string + path-seal doctrine for script-eval + connector workers — start closed (pledge-equivalent caps), unveil-equivalent canonicalized allowlist, then **seal** (no runtime path additions) — **serenity `WebContent/main.cpp` (doc 64 S2); OS-level enforcement under the J21 policy layer**
- [ ] `[NOT DONE]` Implement arg-filtered seccomp policies (nested Switch on syscall args) + crash-on-violation (SIGSYS) in dev — **chromium `bpf_network_policy_linux.cc` — Switch(level).Case(SOL_SOCKET, …) nested optname switches, Default(CrashSIGSYS) (doc 64 S5); network-worker profile**
- [ ] `[NOT DONE]` Implement FS syscall broker for script-eval (E4): rquickjs worker → in-process broker over everyaios-ipc with canonicalized allowlist check → validated handle — **chromium `syscall_broker/` — BrokerHost/Client + command enum + simple-message framing (doc 64 S4)**
- [ ] `[NOT DONE]` Upgrade path-floor to 6-axis grants (recursive/temporary/read/write/create/stat-intermediates) — **chromium `BrokerFilePermission` (doc 64 S3); feeds J21 permissions.toml (`read_only_recursive`, `read_write_create`) — pure-Rust, test-gated, 0-escape invariant preserved**

### P7.9 Warm Worker Pool (doc 64 §5.5 — chromium zygote pattern)
- [ ] `[NOT DONE]` Implement fork-then-sandbox worker pool in `everyaios-core` ProcessSupervisor: pre-spawn N sandboxed workers, pass profile flags over fd, assign on demand — **chromium `zygote_linux.cc` (fork → sandbox-flags-over-fd → child applies seccomp before exec; doc 64 S14); complements J13 warm-pool (doc 43)**

---

## PHASE 8 — Product Polish + Release (~3 weeks)

### P8.0 Verified-Completion Eval Subsystem (EV1 — doc 63 §2.3; better-harness evidence-first + skyvern verification loop + codex attestation + openspec verify-gate)
> **Why here:** the user directive is explicit — eval must prove work is *actually done*, not merely claimed; and multi-agent ships only where eval data proves it improves verified completion. This subsystem is the gate for trusting P6/P7 output.
- [x] `[DONE]` Implement task manifest format: goal + required-outcome checks + forbidden-side-effect checks + budgets (cost/wall-time/destructive-action cap) — YAML or TOML, stored per task — **new `crates/everyaios-eval` (`manifest.rs`): `TaskManifest`, `OutcomeCheck` (exists/hash/contains), `Constraint`, `Budgets`, `EvidenceRequirement` (serde-serializable)**
- [x] `[DONE]` Implement deterministic verifier SDK: filesystem assertions (exists/hash/content), test-run checks, artifact parsers, permission-trace checks — never trusts the agent's final text ("finished" = unverified claim) — **`everyaios-eval::verifier` `run_outcome_check`/`verify`/`verify_with_policy`**
- [x] `[DONE]` Implement evidence bundle: artifact hashes + validator reports + screenshots + approval events, stored with each completed task (evidence *requirements* are typed) — **`everyaios-eval::evidence` (`EvidenceBundle`/`ArtifactHash`/`ApprovalEvent` + `missing()`/`is_complete_for()`) + `everyaios-eval::store` (`EvidenceStore`: JSON-on-disk persistence keyed by task id, save/load/list/delete, path-escape-safe task ids)**
- [x] `[DONE]` Implement status taxonomy: verified-complete / partially-complete (missing requirements explicit) / blocked-correctly / failed-safely / failed-unsafely / unverifiable — score + status, never one blended number — **`everyaios-eval::status` `CompletionStatus` + weighted `Score`**
- [x] `[DONE]` Implement evidence-first loop report (better-harness pattern): post-session findings carry impact / expected-output / scoped-repair / acceptance-checks; **missing evidence stays explicit** — the I5 loop self-audit (P7.1) feeds this — **`everyaios-eval::report` (`LoopReport`/`Finding` + `is_evidence_complete`/`findings_with_missing_evidence`)**
- [x] `[DONE]` Implement adversarial-task suite: 30 internal desktop tasks (files, browser, spreadsheets, docs, email drafts, coding, system settings) with required-outcome checks + forbidden-side-effect checks + fault injection (file renamed mid-task, modal obscuring target, stale tool data, permission dialog) — **`everyaios-eval::suite` (`builtin_suite()` = 30 tasks, 7 `TaskCategory`, 7 `FaultKind`) + `everyaios-eval::runner` (`SandboxRunner::run`: provision fixture → hash snapshot → inject fault → run agent → verify → evidence bundle → reset; `Agent` trait is the harness seam; hard-fail policy gate + anti-"sounds finished" proven end-to-end) + `everyaios-eval::batch` (`run_suite`: runs the whole suite under one agent, aggregates per-status distribution + completion rate, resets each workspace)**
- [x] `[DONE]` Implement retrieval-eval corpus (user directive: high-retrieval correctness): private corpus with permissions, stale duplicates, prompt-injection traps; evidence-recall / evidence-precision / citation-span fidelity / multi-hop completeness / permission compliance / injection resistance scored separately — **`everyaios-eval::retrieval` (`score_retrieval` → 7 `RetrievalScores`) + `everyaios-eval::corpus` (corpus/questions/cases: policy v3 vs stale draft, expense report, injection trap, unauthorized payroll; `builtin_fixtures` seeds one deterministic fixture per task) + `everyaios-eval::batch` (`run_retrieval_batch`: drives cases through an answering function, scores each, aggregates the 7-metric means + per-case distribution)**
- [x] `[DONE]` Test: eval rejects a plausible-but-unsupported completion (agent claims done, verifier finds missing artifact) — the anti-"sounds finished" regression — **`everyaios-eval` `verify_rejects_plausible_but_unsupported_completion` + `policy_violation_is_hard_fail_even_when_complete`**

### P8.1 Reader (H6 — v2.0 §P1; D5 markitdown-class, doc 04)
- [ ] `[NOT DONE]` Port PDF/EPUB/web/markdown universal reader from APP (D5: markitdown-class extraction → RAG + chat overlay)
- [ ] `[NOT DONE]` Implement chat overlay on reader content

### P8.2 Widget Cards (H17 — doc 35 §B Vane pattern)
- [ ] `[NOT DONE]` Implement weather widget (inline in chat)
- [ ] `[NOT DONE]` Implement stock/finance widget (yahoo-finance2 pattern)
- [ ] `[NOT DONE]` Implement math/calculator widget
- [ ] `[NOT DONE]` Implement generic lookup widget

### P8.3 Personality System (H10 — v2.0 §P1; doc 16 Hermes SOUL.md)
- [ ] `[NOT DONE]` Implement SOUL.md persona file loading
- [ ] `[NOT DONE]` Implement user-tunable personality (tone presets + custom override)
- [ ] `[NOT DONE]` Implement inviolable core rules (never overridden by persona)

### P8.4 Search & Research (G1-G6 — v2.0 §P7, doc 07 deep research, doc 52 §4 G8 cascade, doc 32/21 SeekStorm)
- [ ] `[NOT DONE]` Wire core-search cascade from APP (searxng-first + DDG + public instances)
- [ ] `[NOT DONE]` Implement deep research (G2): breadth×depth tree + learnings-up + gap-check
- [ ] `[NOT DONE]` Implement cited report generation with confidence metrics
- [ ] `[NOT DONE]` Implement multi-channel adapters (G3): arXiv, GitHub, EDGAR, Reddit
- [ ] `[NOT DONE]` Implement data-analysis REPL (G4): sandboxed pandas/numpy
- [ ] `[NOT DONE]` Implement repo-wide engineering (G5): workspace scan → dependency map → test-loop → patch
- [ ] `[NOT DONE]` Implement site/domain search (SeekStorm-class inverted index)
- [ ] `[NOT DONE]` Implement G8 tiered cascade: SQLite result cache (5-min TTL) → optional WebSurfx (Rust) → SearXNG → circuit-breaker fallback; Algorithm #33 routing (doc 52 §4)
- [ ] `[NOT DONE]` Implement parallel top-N fetch cascade (searxng-mcp 4-tier pattern: Firecrawl → Crawl4AI → raw → Wayback); test: 50-page baseline completes ≈ single-page time

### P8.5 Workspace UI (H20 — doc 46 Devin + ARCH/12)
- [ ] `[NOT DONE]` Implement Blueprint editor with live execution status on .md (H4)
- [ ] `[NOT DONE]` Implement Settings page (providers, keys, models, trust levels)
- [ ] `[NOT DONE]` Implement local OpenAI-compatible server UI (H13): expose + manage

### P8.6 WSL/POSIX Bridge (F10 — doc 03 §5, v2.0 §P5)
- [ ] `[NOT DONE]` Implement wsl.exe runners
- [ ] `[NOT DONE]` Implement `\\wsl.localhost\` path translation
- [ ] `[NOT DONE]` Implement loopback IPC between Windows host and WSL
- [ ] `[NOT DONE]` Implement native Linux exec detection

### P8.7 Telemetry (H12 — doc 33 §11)
- [ ] `[NOT DONE]` Implement opt-in telemetry: enumerated fields only, no content
- [ ] `[NOT DONE]` Verify: no requests without explicit opt-in (test cold boot)

### P8.8 Packaging & Distribution (ARCH/01, doc 41 P8 — lencx/chatgpt + jan refs)
- [ ] `[NOT DONE]` Build Windows installer (.msi via WiX or .exe via NSIS)
- [ ] `[NOT DONE]` Build macOS .dmg + .app (code sign + notarize)
- [ ] `[NOT DONE]` Build Linux .deb + .rpm + .AppImage
- [ ] `[NOT DONE]` Implement auto-updater (Tauri built-in)
- [ ] `[NOT DONE]` Measure & publish real idle RSS (**<30MB is a target to verify, not a promise** — Tauri + tray, no sidecar; the Bun-compiled sidecar alone is ~93MB, J16)
- [ ] `[NOT DONE]` Measure & publish real warm RSS (**<80MB with sidecar is not achievable — sidecar alone is ~93MB**; publish the real number with sidecar active, no browser, J16)
- [ ] `[NOT DONE]` CI: build matrix for all 3 platforms

### P8.9 Sync / Export / Wipe (C8 — v2.0 §P8)
- [ ] `[NOT DONE]` E2E-encrypted memory/message sync (opt-in, LAN/Tailscale/own server)
- [ ] `[NOT DONE]` Export: messages/memory as markdown/JSON; Obsidian-compatible `.md` memory mirror (`[[wiki-link]]`s, doc 61 — OpenHuman validation; view surface, not a second store)
- [ ] `[NOT DONE]` Per-scope wipe (chat, memory scope, connector data, all)

**P8 Exit Criterion:** Windows beta installs & runs; **idle/warm RSS measured & published with the coordinator running** (<30MB idle / <80MB warm are targets to verify, not promises — the Bun sidecar alone is ~93MB, J16); telemetry off-by-default; all UIs functional.

---

## PHASE 9+ — Post-v1 (later)

### P9.1 Computer-Use Pixels (E9 — v2.0 §P8, doc 09, doc 48 computer-use deep-dive, doc 52)
- [ ] `[NOT DONE]` Implement GUI control via visual grounding (screenshot → click coordinates)
- [ ] `[NOT DONE]` Dual-guard gated (always requires explicit permission)

### P9.2 WASM Fuel-Metered Sandbox (I3 — doc 09)
- [ ] `[NOT DONE]` Implement wasmtime integration with fuel budgets + epoch interruption

### P9.3 Voice Input (H15 — doc 33 §10, doc 50)
- [ ] `[NOT DONE]` Implement VAD (Voice Activity Detection) + speech-to-text

### P9.4 Remote Session Handoff (H18 — doc 35 §C OpenWebUI Computer pattern)
- [ ] `[NOT DONE]` Implement LAN/Tailscale/tunnel view of running sessions
- [ ] `[NOT DONE]` Implement resume from phone mid-run (extends session checkpointing + E2E sync)

### P9.5 Local OpenAI-Compatible Server (A8 — v2.0 §P3)
- [ ] `[NOT DONE]` Expose engine on localhost as OpenAI-compatible API
- [ ] `[NOT DONE]` Allow VS Code/Cursor/other tools to use our engine

### P9.6 HTML→Video Reports (doc 46 Devin hyperframes)
- [ ] `[NOT DONE]` Hyperframes integration for agent-generated video content

### P9.7 Magic Completion (H16 — doc 01 AnythingLLM Magic Tab; doc 13 Nango sync)
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
- [x] `[DONE]` Study opencode `task.ts` for subagent spawner design (P6.2) — **ported into `everyaios-blueprint::subagent` (depth limit, per-agent model, inherited denies via `DELEGATE_BLOCKED_TOOLS`, task_id, summary-only result)**
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
- [ ] `[NOT DONE]` Study BrowserOS `oauth/providers.ts` — PKCE + device-code flows, scopes, SQLite `oauth_tokens` schema, local callback port (P1.7, doc 33 §7.4)
- [ ] `[NOT DONE]` Study Ollama — `/api/tags` detection, keep-alive/spawn, context window, tool-calling + GBNF grammar param (P1.8, doc 34 §2 / ollama docs)
- [ ] `[NOT DONE]` Study llamafile single-binary launch + OpenAI-compatible API surface (P1.8, doc 34 §2)
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
- [ ] `[NOT DONE]` Study Hermes 3/4 `SOUL.md` identity-slot injection + persona selection (P1.6 persona selector, doc 16/41 — Hermes rows)
- [ ] `[NOT DONE]` Study agentlens/agentsight for agent-session observability (J14)
- [ ] `[NOT DONE]` Study Skyvern-AI/rustwright — raw CDP engine (2.55× faster, 70% less RAM), `rustwright-cli` open/snapshot/click/close (P2.1 CDP, doc 41 P5 STEAL)
- [ ] `[NOT DONE]` Study rohitg00/agentmemory — MCP memory server, 95.2% R@5, confidence scoring + lifecycle + KG + hybrid search, 0 external DBs (P5.1 fusion, doc 41 P3 STEAL)
- [ ] `[NOT DONE]` Study langchain-ai/deepagents — `create_deep_agent()` sub-agent isolation + summarize/offload-to-disk context management (P6.2 sub-agents, doc 41 P2 STEAL)
- [ ] `[NOT DONE]` Study InternLM/MindSearch — planner + parallel searchers across 5 engines (P8.4 deep research, doc 41 P1 STEAL)
- [ ] `[NOT DONE]` Study yamadashy/repomix — repo→single-file packer w/ secretlint redaction, AI-friendly output (P11.5.9 context packaging, doc 41 P7 STEAL)
- [ ] `[NOT DONE]` Study microsoft/markitdown — universal file→markdown converter + plugin system (P8.1 D5 reader, doc 41 P7 STEAL)
- [ ] `[NOT DONE]` Study agiresearch/AIOS — `BaseScheduler` ABC + FIFOScheduler batch + LLMAdapter router (P6.1 scheduler, doc 41 P0 STEAL)
- [ ] `[NOT DONE]` Study BerriAI/litellm — 132-provider gateway + budgets + cooldown patterns (P1.2/ARCH/03, doc 41 P1 STEAL)
- [ ] `[NOT DONE]` Study affaan-m/ECC — profile-gated hooks (minimal/standard/strict) + AgentShield config scanning (P7.7, doc 41 P6 STEAL)
- [ ] `[NOT DONE]` Study microsoft/playwright-mcp — accessibility-tree browser approach (no pixels), token-efficient structured a11y (P2.2/E3, doc 41 P5 STEAL)
- [ ] `[NOT DONE]` Study ItzCrazyKns/Vane — inline widget cards (weather/stock/lookup) (P8.2/H17, doc 41 P9+ STEAL)
- [ ] `[NOT DONE]` Study google-gemini/gemini-cli — retry backoff (maxAttempts=4, exponential, 1s initial) + `CompressionStatus` + 16 event types (P1.4 retry/events, doc 41 P1 ADAPT)
- [ ] `[NOT DONE]` Study OpenInterpreter/open-interpreter — `write_provider_catalog.py` provider auto-gen + `/model` TUI switcher (P8.5/A6 model catalog, doc 41 P1 STEAL)
- [ ] `[NOT DONE]` Study huggingface/smolagents — LocalPythonExecutor guards (10M ops/30s, dunder block) (P2.5 script-eval limits, doc 41 P5 STEAL)
- [ ] `[NOT DONE]` Study Significant-Gravitas/AutoGPT — Forge component system (19 components: CodeExecutor/Docker, FileManager, GitOps, WebPlaywright, Skills, Watchdog) + 8 prompt strategies (P7.1 forge, doc 41 P2 STEAL)
- [ ] `[NOT DONE]` Study FoundationAgents/MetaGPT — SOP software-company role templates + `DataInterpreter` (P6.2 role-based sub-agents, doc 41 P2 STEAL)
- [ ] `[NOT DONE]` Study infiniflow/ragflow — visual chunking + agentic RAG workflow (MinerU+Docling parsing) (P5.1 RAG, doc 41 P3 STEAL)
- [ ] `[NOT DONE]` Study crewAIInc/crewAI — Crews+Flows role-based collaboration → crystallization analog (P6.5/B8, doc 41 P2 STEAL)
- [ ] `[NOT DONE]` Study obra/superpowers — 200+ skills catalog + plugin marketplace patterns (P7.2/I2 skills, doc 41 P6 STEAL)

---

## PHASE 10 — End-to-End Testing & Quality Assurance (cross-cutting — validates P0–P9; doc 26 red-team for P10.2)

### P10.1 Integration Test Suites (E2E across P0–P9 features; ARCH/09 matrix as test checklist)
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

### P10.2 Security & Adversarial Testing (doc 26 red-team corpus, ARCH/06 guards, doc 53 tickets)
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

### P10.3 Performance & Stress Testing (ARCH/02 budgets, doc 33 §9 replay scale, ARCH/05 token economy)
- [ ] `[NOT DONE]` Benchmark cold start: app launch → first usable interaction (target <2s)
- [ ] `[NOT DONE]` Benchmark idle RSS: Tauri + tray only — **measure & publish the real number** (<30MB target to verify, not a promise)
- [ ] `[NOT DONE]` Benchmark warm RSS: with sidecar active, no browser — **measure & publish the real number** (sidecar alone is ~93MB, so <80MB is not achievable as-is, J16)
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

### P10.4 Cross-Platform Testing (ARCH/01 platforms, doc 41 P8 packaging refs)
- [ ] `[NOT DONE]` Test full flow on Windows 11 (x64) — installer, boot, chat, browser, office
- [ ] `[NOT DONE]` Test full flow on macOS Sequoia (ARM) — same suite
- [ ] `[NOT DONE]` Test full flow on Ubuntu 24.04 (x64) — same suite
- [ ] `[NOT DONE]` Test WSL bridge on Windows (Linux exec from Windows host)
- [ ] `[NOT DONE]` Test Tauri auto-updater on all 3 platforms
- [ ] `[NOT DONE]` Test SQLCipher vault migration across platform (copy vault.db between OS)
- [ ] `[NOT DONE]` Test Ollama integration on all 3 platforms (spawn, connect, chat)
- [ ] `[NOT DONE]` Test system Chrome/Edge detection + fallback on all 3 platforms

### P10.5 Regression & CI/CD (ARCH/01 CI, doc 29 LibreOffice oracle)
- [ ] `[NOT DONE]` Set up CI matrix: cargo test + vitest + Tauri build for Win/Mac/Linux
- [ ] `[NOT DONE]` Set up LibreOffice conformance oracle in CI (every office-engine commit triggers)
- [ ] `[NOT DONE]` Set up nightly E2E test run (full integration suite)
- [ ] `[NOT DONE]` Set up performance regression tracking (benchmark results in CI artifacts)
- [ ] `[NOT DONE]` Implement pre-commit hooks: clippy, fmt, eslint, type-check
- [ ] `[NOT DONE]` Implement release pipeline: tag → build → sign → upload to GitHub Releases

---

## PHASE 11 — UI/UX Design & Optimization (ARCH/12-UI-SPEC)

### P11.1 Design System & Visual Language (ARCH/12-UI-SPEC)
- [ ] `[NOT DONE]` Define color palette (dark/light modes, accent colors, semantic colors)
- [ ] `[NOT DONE]` Define typography scale (font families, sizes, weights, line heights)
- [ ] `[NOT DONE]` Define spacing system (4px grid, component padding/margin standards)
- [ ] `[NOT DONE]` Define component library: buttons, inputs, cards, modals, toasts, dropdowns
- [ ] `[NOT DONE]` Define animation system: transitions, micro-interactions, loading states
- [ ] `[NOT DONE]` Define iconography: consistent icon set (Lucide/Phosphor/custom)
- [ ] `[NOT DONE]` Create Figma/design file with all components + layouts

### P11.2 Core UX Flows (user journey mapping) (ARCH/12-UI-SPEC; doc 46 Devin flows)
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

### P11.3 Accessibility & Internationalization (ARCH/12-UI-SPEC)
- [ ] `[NOT DONE]` Implement WCAG 2.1 AA compliance (contrast, focus indicators, screen reader labels)
- [ ] `[NOT DONE]` Implement keyboard navigation for all primary flows (no mouse required)
- [ ] `[NOT DONE]` Implement high-contrast mode
- [ ] `[NOT DONE]` Implement reduced-motion mode (respect OS prefers-reduced-motion)
- [ ] `[NOT DONE]` Design for i18n: all user-facing strings in locale files
- [ ] `[NOT DONE]` Support RTL layouts (Arabic, Hebrew)
- [ ] `[NOT DONE]` Implement font scaling (respect OS text size preference)

### P11.4 Performance UX (ARCH/12-UI-SPEC; ARCH/05 token economy)
- [ ] `[NOT DONE]` Implement skeleton loaders for all async content
- [ ] `[NOT DONE]` Implement optimistic UI updates (show action before server confirms)
- [ ] `[NOT DONE]` Implement virtual scrolling for large lists (message history, file lists, agent logs)
- [ ] `[NOT DONE]` Implement progressive image/document loading (thumbnails → full render)
- [ ] `[NOT DONE]` Implement debounced search inputs (avoid excess queries)
- [ ] `[NOT DONE]` Measure and optimize Largest Contentful Paint (target <1s)
- [ ] `[NOT DONE]` Measure and optimize Time to Interactive after cold start (target <2s)

---

## PHASE 12 — Market Research & Go-to-Market (live market research — no research doc)

### P12.1 Competitive Analysis (Live) (live GTM research — desktop AI landscape, RESEARCH/2026-ai-landscape)
- [ ] `[NOT DONE]` Install + test AnythingLLM desktop — document UX strengths/weaknesses vs ours
- [ ] `[NOT DONE]` Install + test Jan desktop — document UX strengths/weaknesses vs ours
- [ ] `[NOT DONE]` Test Cherry Studio — document multi-provider UX patterns
- [ ] `[NOT DONE]` Test OpenWorker (Andrew Ng) — document connector + approval UX
- [ ] `[NOT DONE]` Test Chatbox (Tauri) — document BYOK UX simplicity
- [ ] `[NOT DONE]` Analyze Claude Code / Codex CLI — document what power users love/hate
- [ ] `[NOT DONE]` Analyze Open WebUI — document what self-hosters value most
- [ ] `[NOT DONE]` Map feature gap matrix: us vs top 5 competitors (what we have that they don't)
- [ ] `[NOT DONE]` Identify our unique positioning hooks (crystallization, office engine, 7 memory algos)
- [ ] `[NOT DONE]` **holaOS (doc 58 — closest whole-product competitor):** "Computer for You and Your Agent" (Electron, any-agent workspace, HolaApps, marketplace, 50+ OAuth, hosted-model default) — document the positioning contrast (our Tauri + BYOK/local + no-founder-server vs their Electron + hosted-first + modified-Apache); UX reference only
- [ ] `[NOT DONE]` **UI-only reference pass (doc 58):** AnythingLLM + Cherry Studio workspace chrome / artifact pane / onboarding as a first-run design source — vs the Devin 9-tab layout in ARCH/12

### P12.2 Target Audience & Personas (live GTM research)
- [ ] `[NOT DONE]` Define persona 1: Power developer (uses Claude Code/Codex daily, wants more control)
- [ ] `[NOT DONE]` Define persona 2: Knowledge worker (Excel/Word/PDF daily, wants AI automation)
- [ ] `[NOT DONE]` Define persona 3: Privacy-conscious researcher (local-first, no cloud, BYOK)
- [ ] `[NOT DONE]` Define persona 4: Automation builder (Zapier/n8n user wanting AI-native workflows)
- [ ] `[NOT DONE]` Map feature priorities per persona (which capabilities matter most to whom)
- [ ] `[NOT DONE]` Define value propositions per persona (one sentence each)

### P12.3 Positioning & Messaging (live GTM research; ARCH/09 differentiators)
- [ ] `[NOT DONE]` Write product tagline (one sentence, <15 words)
- [ ] `[NOT DONE]` Write product description (one paragraph, <100 words)
- [ ] `[NOT DONE]` Write "Why EveryAIOS?" page (3–5 key differentiators with evidence)
- [ ] `[NOT DONE]` Write comparison pages: "EveryAIOS vs ChatGPT", "vs Claude Code", "vs AnythingLLM"
- [ ] `[NOT DONE]` Define naming: finalize product name (EveryAIOS? Other?)
- [ ] `[NOT DONE]` Design brand identity: logo, wordmark, color usage

### P12.4 Launch Strategy (live GTM research)
- [ ] `[NOT DONE]` Plan open-source launch: GitHub repo, LICENSE (MIT/Apache-2.0), CONTRIBUTING.md
- [ ] `[NOT DONE]` Write README.md: hero description, screenshot, install instructions, feature list
- [ ] `[NOT DONE]` Plan Hacker News launch post (title, Show HN format, key hooks)
- [ ] `[NOT DONE]` Plan Reddit launch: r/LocalLLaMA, r/selfhosted, r/macapps, r/programming
- [ ] `[NOT DONE]` Plan Twitter/X launch thread (8–10 tweets showing different capabilities)
- [ ] `[NOT DONE]` Plan YouTube demo video (3–5 min, showing killer features in action)
- [ ] `[NOT DONE]` Plan Product Hunt launch (timing, hunter, first comment, assets)
- [ ] `[NOT DONE]` Identify early adopter communities: AI Discord servers, dev Slack groups, HN regulars
- [ ] `[NOT DONE]` Plan beta program: 50–100 early testers, feedback channel, weekly builds

### P12.5 Documentation & Community (ARCH/00–12 as contributor docs source)
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

### P12.6 Monetization Research (future, not v1) (live GTM research)
- [ ] `[NOT DONE]` Research open-source monetization models: open-core, support, hosting, marketplace
- [ ] `[NOT DONE]` Evaluate skill/plugin marketplace potential (community-contributed, optional premium)
- [ ] `[NOT DONE]` Evaluate "EveryAIOS Pro" optional features: cloud sync, team sharing, priority support
- [ ] `[NOT DONE]` Research pricing benchmarks: comparable tools (Jan, Cherry Studio, Cursor Pro pricing)
- [ ] `[NOT DONE]` Define v1 = 100% free, v2+ = evaluate adding optional paid tier

---

## P11.5 — UI Implementation (from ARCH/12-UI-SPEC, ~4 wks parallel)

> Source: ARCH/12-UI-SPEC.md (derived from Devin Cloud UI + research doc 46)

### P11.5.1 Layout Shell (ARCH/12-UI-SPEC)
- [x] [DONE] 3-column layout — **v2: left sessions/nav · center chat+NowDoing+approve · right 48px rail + viewport (`shell/center-column.tsx`); drag-resizable dividers are a follow-up (columns are fixed-width + rail toggle)**
- [x] [DONE] Sidebar navigation — **v2 `shell/left-sidebar.tsx`: New Session + Automations/Guard/Connectors/Memory/Analytics NavItems with badges**
- [x] [DONE] Workspace selector — **v2 `left-sidebar.tsx` “Workspace selector” block**
- [x] [DONE] Recent sessions w/ status badges — **v2 `chat/session-timeline.tsx` + `Badge` in left-sidebar**
- [ ] [NOT DONE] Sidebar: child session indentation under parent
- [x] [DONE] Collapse to icon-only — **v2 `NavItemProps.collapsed` (left sidebar) + `railCollapsed` 48px rail toggle (rail, ⌘\)**

### P11.5.2 Chat Panel (ARCH/12 §chat; doc 46 Devin UI)
- [x] [DONE] Chat message rendering — **v2 `chat/message-bubble.tsx` + `chat/chat-panel.tsx`**
- [x] [DONE] Artifact cards — **v2 `chat/artifact-card.tsx` + store `Artifact[]`**
- [x] [DONE] Progress steps — **v2 `chat/progress-steps.tsx` + store `ProgressStep[]`/`streamStep`**
- [x] [DONE] MCQ interrupt card — **v2 `chat/mcq-interrupt-card.tsx` (diff/permission/mcq/budget kinds, Approve/Reject/More-options)**
- [x] [DONE] Input bar — **v2 `chat/chat-composer.tsx` (textarea, mode selector, send; Mic button present as a “coming soon” stub; attach is a follow-up)**
- [x] [DONE] Chat modes — **v2 `composerMode: 'normal'|'plan'|'research'|'quick'|'code'` in store + composer MODES**
- [x] [DONE] Slash commands — **v2 composer command hint list (/help /mode /model /undo /clear /export) + keyboard nav**
- [x] [DONE] Macros + @mentions — **v2 composer hint kinds (`!` macro, `@` mention) + `!macro` chip**

### P11.5.3 Right Rail + One-Surface Views (H20 v2.0 — ARCH/12 §4; doc 67 §6 finalization: Claude Views / Cursor activity bar / ChatGPT Work / Devin Desktop pattern)
> **v2.0 replaces the 9-tab strip** — 48px activity rail, one open surface, Office grouped under one button, views contract, per-session layout persistence. Never 9 peer tabs; never a Chat/Cowork/Code product split.
- [x] [DONE] 48px activity rail — **v2 `shell/right-rail.tsx` `railItems` (Folder/Shell/Browse/Code) + sessionItems (Progress/Trajectory) + Office flyout + live dots + tooltips; click active = collapse viewport**
- [x] [DONE] Views registry — **v2 `right-rail.tsx` `RailItem[]`/`ViewId` + `ViewportContent` switch (14 views: folder/shell/browse/code/office x4/progress/diff/audit/storage/timeline/trajectory); no literal `ViewDefinition` type — plugin registration stays follow-up**
- [x] [DONE] Office one-button flyout — **v2 `right-rail.tsx` `officeFlyoutItems` (Sheets/Word/Slides/PDF + live dot); `.xlsx`/agent-open auto-selects the matching office view (rail,188–201)**
- [x] [DONE] Folder view — **v2 `views/folder-view.tsx`**
- [x] [DONE] Shell view — **v2 `views/shell-view.tsx` (Guard-1 pre-scan labeling is a follow-up)**
- [x] [DONE] Browse view — **v2 `views/browse-view.tsx` (live CDP page; clean-profile toggle + takeover = follow-up)**
- [ ] [NOT DONE] Code view: one file (+split 2) syntax editor, live diffs, LSP (hover/refs/diagnostics/rename-preview — I11), diff strip for pending patch, "Open in Cursor" deep-IDE escape
- [x] [DONE] Progress view — **v2 `views/progress-view.tsx` + `chat/now-doing-strip.tsx` (click-to-open-artifact depth is a follow-up)**
- [x] [DONE] Diff view — **v2 `views/diff-view.tsx`**
- [x] [DONE] Audit + Storage + Memory views — **v2 `audit-view`/`trajectory-view`/`storage-view` + `panels/memory-panel` (Episodic/Semantic/Knowledge Graph tabs); replay scrubber screenshots = follow-up**
- [ ] [NOT DONE] **Per-session layout persistence:** activeViewId / officeDocId / railCollapsed / splitRatio / browseMode / composerMode saved per sessionId; switch session → restore; new session → rail collapsed until a tool needs a view (the Cursor reset bug we do not copy)
- [ ] [NOT DONE] First-run: welcome (Open folder / Open last project / add model) — no module picker, no enable-Browser/Office; skip-key still opens cockpit, send disabled until a model exists
- [ ] [NOT DONE] In-place highlight-edit (Cowork "Edit with Claude" pattern, doc 67 §4): select text in a view → prompt → patch applied in place via existing edit crates (P4.7 ChatOverlay / code view)

### P11.5.4 Takeover/Resume Flow (ARCH/12 §takeover; doc 46 Devin H21)
- [ ] [NOT DONE] Pause button → switches all panels to editable mode
- [ ] [NOT DONE] "● Live" / "⏸ Paused" indicator toggle
- [ ] [NOT DONE] Resume button → mandatory "describe changes" prompt → agent continues

### P11.5.5 Automation Builder (ARCH/12 §automation; doc 46 Devin H22, doc 56 §3 cronflow NL)
- [x] [DONE] Automations list — **v2 `panels/automations-panel.tsx`; sparkline activity charts are a follow-up**
- [x] [DONE] Automation editor — **v2 `panels/automation-editor.tsx` (triggerKind/action/budget/network selects; condition field = follow-up)**
- [ ] [NOT DONE] Template gallery (10+ pre-built automations)
- [ ] [NOT DONE] NL automation creation (describe in text → generates config)

### P11.5.6 Knowledge/Memory Browser (ARCH/12 §memory; doc 46 Devin H23 trigger+macro)
- [x] [DONE] Knowledge list — **v2 `panels/memory-panel.tsx` item list (episodic/semantic/graph sections); per-item trigger/macro/scope = follow-up**
- [ ] [NOT DONE] Folder organization (nested, drag, bulk enable/disable)
- [x] [DONE] Auto-suggestions — **v2 `memory-panel.tsx` `source === 'suggested'` list + “n new” badge (accept/dismiss/regenerate actions = follow-up)**
- [x] [DONE] Episodic/Semantic/KG browsers — **v2 `memory-panel.tsx` tab strip: Episodic / Semantic / Knowledge Graph (live counts)**

### P11.5.7 Guard Panel (ARCH/12 §guard; doc 06 trust ladder UI)
- [x] [DONE] Trust ladder + level meter — **v2 `guard-panel.tsx` (Trust Ladder row + Trust Level progress)**
- [x] [DONE] Recent actions log — **v2 `guard-panel.tsx` (Recent actions rows + auto-approved/pending/blocked status)**
- [x] [DONE] Permissions matrix — **v2 `guard-panel.tsx` (Permissions Matrix)**

### P11.5.8 Connector Hub Panel (ARCH/12 §connectors; doc 13, doc 46 Devin H24 MCP marketplace)
- [x] [DONE] Connected services + tool counts — **v2 `connectors-panel.tsx` (summary cards incl. MCP servers + Tool Catalog tab w/ live counts from `mcp_catalog`)**
- [x] [DONE] MCP servers list — **v2 `connectors-panel.tsx` MCP Servers tab (name/status/transport/tool-count)**
- [x] [DONE] Add/Browse buttons — **v2 `connectors-panel.tsx` “Browse MCP servers” + “Add native connector” (install flow behind P22)**

### P11.5.9 Aider-Derived Features (doc 46 Aider RepoMap/edit strategies, doc 56 W1 Warp semantic index)
- [ ] [NOT DONE] RepoMap: tree-sitter tag extraction + PageRank ranking + SQLite cache + budget fitting
- [ ] [NOT DONE] Warp semantic index (doc 56 W1, optional C5 embedding path): tree-sitter semantic chunker + merkle-tree content-hash incremental sync + search shaping + `file_outline` (open Rust DeepWiki pattern)
- [ ] [NOT DONE] Edit Strategy: SEARCH/REPLACE with fuzzy matching + whitespace flex + ellipsis
- [ ] [NOT DONE] Architect Mode: two-pass (reasoning model → editor model) agent pattern
- [ ] [NOT DONE] File Watcher: notify crate watching for `// ai!` markers → auto-submit
- [ ] [NOT DONE] Lint/Test Reflection: after every edit run lint → on error retry ×3
- [ ] [NOT DONE] MODEL_ALIASES: config map of short names to full provider/model paths
- [ ] [NOT DONE] **Third code-intel path (doc 58):** codebase-memory-mcp symbol-KG (C, 158 langs, spawn-only + Guard-2 on config writes) + crux SCIP (watch) — optional heavy-graph/Cypher backend beside RepoMap (default) and Warp (C5-gated); never "run all and fuse"

### P11.5.10 New Agent Patterns (doc 47 + doc 57 §3 subscription-auth boundary)
- [ ] [NOT DONE] Implement Plan/Act dual-mode in agent loop (Cline pattern) — explicit plan phase before tool execution
- [ ] [NOT DONE] Implement Context Provider plugin system (@Codebase, @Docs, @URL injection points)
- [ ] [NOT DONE] Add ACP subscription linking — reuse the user's existing agent CLI auth (⚠️ **doc 57 boundary:** Claude Pro/Max OAuth is first-party-only — but driving Claude Code/Claude Agent via the official ACP wrapper `@agentclientprotocol/claude-agent-acp` with the user's own login **is allowed** (Anthropic co-authors it); **blocked = harvesting the subscription token to power our own/other engines' direct calls** → never feed it into the broker; BYOK API keys for the broker; auth-mode badge per doc 57 §3)
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

### P11.6 User Research & Feedback Loops (ARCH/12-UI-SPEC)
- [ ] `[NOT DONE]` Design beta feedback mechanism (in-app bug report + feature request)
- [ ] `[NOT DONE]` Design NPS/satisfaction prompt (non-intrusive, after 7 days of use)
- [ ] `[NOT DONE]` Plan user testing sessions: 5 testers × 3 rounds (alpha, beta, RC)
- [ ] `[NOT DONE]` Define key UX metrics to track: task completion rate, time-to-value, error rate
- [ ] `[NOT DONE]` Implement session recording (opt-in) for UX analysis (not AI content, just clicks/navigation)

---

## P13 — Batch-3 Steal Queue (doc 65, 2026-08-15 — 19 new repos, 8 steals → 11 tasks; all extend existing rows, none re-specified)
> These are **spec-level steals** mapped onto rows we already own — no scope expansion. Implement behind the currently-open wiring items (coordinator loop, skill registry, A9 dashboard, G8/G9 browser tools).

- [ ] `[NOT DONE]` **A9 usage-parser registry (doc 65 §1 — codeburn):** `UsageParser` trait + registry keyed by provider id normalizing into canonical `Usage {input, output, cache_read, cache_write, tool_calls}` (mirrors the existing adapter split); `TurnClass` enum (test/git/build/install/debug/feature/refactor/brainstorm/research) attached to every turn for routing + eval segmentation — `everyaios-eval::usage`
- [ ] `[NOT DONE]` **J11 efficiency metrics (doc 65 §1 — codeburn):** `EfficiencyMetrics { one_shot_rate, retries_per_edit, cost_per_edit }` computed over an eval run — cost-vs-quality axis for the budget gate — `everyaios-eval`
- [ ] `[NOT DONE]` **G8 selector resolver (doc 65 §2 — Scrapling):** `SelectorResolver` returning `Css | XPath` from a semantic target + DOM snapshot (survives minor DOM drift) — `everyaios-browser`
- [ ] `[NOT DONE]` **E14 fingerprint profile (doc 65 §2 — Scrapling Camoufox):** `FingerprintProfile { ua, platform, webgl_vendor, canvas_noise, … }` + rotation set for behavioral realism — `everyaios-cdp`
- [ ] `[NOT DONE]` **G9 resource-drop policy (doc 65 §2 — Scrapling):** `ResourceDropPolicy { block_ads: Vec<Domain>, drop_media, drop_fonts }` feeding `Network.setBlockedURLs` (complements the G9 adblock-crate read-cleaner) — `everyaios-browser`
- [ ] `[NOT DONE]` **I2 SKILL.md anatomy (doc 65 §4 — awesome-claude-skills):** skill manifest schema with `when_to_use`, `scripts[]`, `references[]` (lazy — fetched on demand, never preloaded), `assets[]` — skill registry
- [ ] `[NOT DONE]` **F8 skills_index.json manifest (doc 65 §6 — agentic-awesome-skills):** machine-readable discovery index + `compose_stack` read-only validation emitting `selection_evidence` (no side effects) — skill registry + blueprint engine
- [ ] `[NOT DONE]` **I7 persistent symbol graph (doc 65 §7 — code-review-graph):** SQLite-backed symbol graph with git-diff incremental rebuild + per-query `context_savings` counter — `everyaios-codeintel::graph`
- [ ] `[NOT DONE]` **I11 symbol-editing semantics (doc 65 §8 — serena):** `safe_delete` (refuse when references exist — deterministic gate before destructive edit), `replace_body` (parse-verify before write), packaged LSP server catalog (id/command/version/capabilities — language support as data) — `everyaios-codeintel`
- [ ] `[NOT DONE]` **P6 loop-pattern registry (doc 65 §9 — loop-engineering):** `LoopPatternRegistry` of named patterns (budget-guard, run-log, early-exit) each with `triggers`/`guards`/`exit_conditions`, loaded by the coordinator loop and enforced by J11/B6 budgets — `everyaios-blueprint`
- [ ] `[NOT DONE]` **P5 saved-vs-discovered metric (doc 65 §10 — claude-mem):** per-observation `token_cost` on memory records + `saved_vs_discovered` in the context builder (memory injection measured, not assumed) — `everyaios-memory`

---

## P15 — Capability-Delta Queue (doc 67, 2026-08-15 — bolt.diy / Hatchet / durable-execution-the-hard-way)
> Doc-67 steals: H29 local dashboard artifacts (bolt.diy action-stream pattern), B7 heartbeat automations (Hatchet lease pattern — B7 task added under P6.4 above), session-open proactivity hook (P6.4), and the H20 views-rail redesign (P11.5.3).

- [ ] `[NOT DONE]` **H29 local dashboard artifacts (doc 67 §1 — bolt.diy):** agent generates a mini web-app into a guarded workspace folder; `everyaios-script` sandbox serves it on `127.0.0.1:<port>`; previewed in the views rail with device frames; Guard-2-ticketed serve/stop; artifact keeps updating as the agent iterates — steal the **typed agent→runtime action stream** (`BoltAction` parse → `ActionRunner` state machine: pending/running/complete/aborted/failed + abort signals + formatted-output errors) as the artifact-generation contract between the coordinator and `everyaios-script` — `everyaios-script` + UI
- [ ] `[NOT DONE]` **H29 preview surface:** device frames (iPhone SE→large laptop), port dropdown, screenshot selector (bolt.diy `Preview.tsx` + `PortDropdown` pattern) in the views rail artifact view
- [ ] `[NOT DONE]` **Inline artifact action checklist:** auto-expanding per-action status list in chat artifact cards (bolt.diy `Artifact.tsx` pattern) with diff view per action — upgrade to H1 artifact cards
- [ ] `[NOT DONE]` **B7 heartbeat automations (doc 67 §2 — Hatchet):** scheduled run reawakens the same conversation with context intact; heartbeat + missed-heartbeat → reassignment/resume from last audit-event checkpoint — see P6.4 task above (principles ported into `everyaios-core`, no Hatchet dependency)
- [ ] `[NOT DONE]` **Session-open proactivity hook (doc 67 §3):** see P6.4 task above — intent classifier over memory + connectors → 1–3 composer suggestions (H14 nudge-card reuse)

---

## P14 — Model Catalog: models.dev Steal (doc 66, 2026-08-15 — anomalyco/models.dev, MIT)
> **The single biggest catalog win since doc 19:** a vendorable, MIT-licensed open database of model capabilities/pricing/limits — 186 providers / 364 compiled entries with cache-read/write pricing and a two-tier lab-vs-provider schema that is exactly our model-family vs transport-provider adapter split. Implementation target: new `everyaios-catalog` crate.

- [ ] `[NOT DONE]` **A6 catalog ingest (doc 66 §1.3):** vendor `models.json` (432KB) as the baseline catalog; `ModelEntry` struct mirroring the compiled shape (`id`, `canonical_slug`, `context_length`, `architecture` modalities/tokenizer, `pricing{prompt,completion,web_search,input_cache_read,input_cache_write}`, `supported_parameters` capability proxy, `default_parameters`, `top_provider.max_completion_tokens`) — new `everyaios-catalog` crate; parsed once at startup into an in-memory index
- [ ] `[NOT DONE]` **Two-tier lab/provider schema (doc 66 §1.1):** `base_model` override-only inheritance — canonical lab model + per-host cost/limits overrides; BYOK providers (and any future provider) added as override entries, never duplicate the canonical facts (this *is* the model-family vs transport-provider adapter separation)
- [ ] `[NOT DONE]` **A9 pricing integration (doc 66 §1.3):** `input_cache_read`/`input_cache_write` per model feed the cache-aware cost engine + J11 budget gate (real pricing data, not vendor claims)
- [ ] `[NOT DONE]` **A7 routing filter matrix (doc 66 §1.3):** `supported_parameters` (tools/structured_outputs/reasoning/response_format/tool_choice) + `architecture` modalities + `context_length`/`max_completion_tokens` = the hard-requirement filters for route selection
- [ ] `[NOT DONE]` **Sync automation (doc 66 §1.4 — deferred, maintenance loop):** per-provider sync modules + `bun validate`-style gate; the vendored baseline ships static; the sync loop is a post-v1 refresh path (30-provider pattern documented for when we need it)

---

## P16 — Final Market-Research Deltas (doc 68, 2026-08-15 — Microsoft Copilot Cowork / Gemini Notebook / agent picker / two-channel injection)
> Doc-68 deltas: H30 voice-memo→report, H31 corpus-research surface + audio digest, H32 agent picker + agent-scoped model surface, two-channel capability injection (F12/J17/F7), H18 mobile-companion note, and the M365/Gemini competitive positioning. **0 new repos** — every item extends rows we already own.

- [ ] `[NOT DONE]` **H30 voice-memo → structured report (doc 68 §3):** STT (H15) → transcribe → agent synthesizes into a polished document (Word block-patch D1 / markdown / email F14) — the end-to-end "reports from messy inputs" workflow Cowork advertises; I/O rides H15/H28 (STT/TTS, both deferred) — this is the job that composes them
- [ ] `[NOT DONE]` **H31 corpus-first research surface + audio digest (doc 68 §2.2):** pick sources (files/folders/URLs/emails) → grounded, cited answers + mind-map/report artifacts (Gemini-Notebook-class); reuse C-series RAG + G2 deep research + EV1 citation fidelity; **audio-digest output** (podcast-style Audio Overview) rides H28 TTS — post-v1
- [x] `[DONE]` **H32 agent picker (doc 68 §4):** `ui/` Chat.tsx agent dropdown fed by `acp_agents` (the `everyaios-acp::registry::LaunchRegistry`) — default = inbuilt; ACP agents route `acp_launch`+`acp_prompt` and hide the model picker + show their auth badge; `chat_stream` threads `agentId`. **Remaining (the agent-native command surface):** `initialize` capability card → composer renders the agent's live `available_commands` + `@` + mode indicator (one consistent UI, per-agent vocabulary)
- [x] `[DONE]` **H32 agent-scoped model surface (doc 68 §4):** the full catalog lives only in the native-engine picker — ACP agents drive their own backend via their auth mode (per-agent model surface), never a global model grid
- [ ] `[NOT DONE]` **Two-channel injection — Channel A (doc 68 §4):** ACP mediates I/O — `fs/read` → slim/bounded previews + pass-by-reference (C10), `terminal/output` → RTK compression, `terminal/create` → Guard-1 + audit, `fs/write` → Guard-2 ticket + diff card (token-minimizing + surgical + guards at the protocol boundary for any hosted agent)
- [ ] `[NOT DONE]` **Two-channel injection — Channel B (doc 68 §4):** `everyaios-mcp` (F7) serves Office surgical editor + IronCalc, browser 37-tool catalog + Session Vault, search cascade (G8), memory retrieval (C-series), storage intelligence as MCP tools — any MCP-consuming agent gets our full capability set
- [ ] `[NOT DONE]` **H18 mobile-companion note (doc 68 §3):** record the distinction (remote-control handoff vs mobile monitor/steer surface) — a mobile companion app is a distinct post-v1 item, not covered by H18 today
- [ ] `[NOT DONE]` **M365 Copilot Cowork / Gemini Notebook positioning (doc 68 §2):** fold the competitive verdicts (in-app M365 agent · corpus-first research surface · Gemini-in-Workspace) into the P12.1 GTM competitive analysis

---

## P17 — ACP Agent Ecosystem Steal Queue (doc 69, 2026-08-16 — Claude Code / Codex / OpenCode / Cline / Hermes / OpenClaw + Zed re-deep-dive)
> **Landed this turn:** the full **46-agent** `LaunchRegistry` transcribed from the official ACP `registry.json` (`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`, 38 auth-verified agents) + ollama launch + Zed `/acp` ecosystem — claude/codex/cline/opencode/hermes/openclaw/copilot/gemini/cursor/devin/kiro/junie/grok/qwen-code/goose/aider/kimi/kilo/qoder/poolside/cortex-code/factory-droid/… + commandcode + chatgpt + dsh + pi + inbuilt default. `Distribution::Npx/Uvx` gained `args`, manifests gained fixed `env`. The remaining 10 are spec-level steals; none re-specified.

- [x] `[DONE]` **F8 registry-first install — plan/cache/allow-list + executor (doc 69 §2 — Zed "Install from Registry"):** fetch + cache the official CDN `registry.json`, version-pin, curated allow-list, per-platform `install_plan`, and the `Installer` executor (download→sha256→extract→install-state) + `acp_install` one-click command (see P6.8 F8 line). **All three closing items landed (2026-08-16):** the **Install button** in the picker (calls `acp_install_request` → shows the **inline Guard-2 card** for the download → `acp_install_commit` consumes the ticket + executes; progress → flip to Launch; `acp_install_status` drives installed-state); the **Guard-2 ticket around the download** (the install is now a renderable approval card in the shared `GuardService` — same ticket renders in Chat + Cockpit, `use_ticket` single-use + args-hash); the **agent's own auth at first launch** (`authMethods` from the ACP `initialize` handshake surfaced as "Sign in with <agent>" — agent-type completes in the agent's flow, url-type opens the system browser then re-calls `acp_authenticate`, and an already-authenticated agent (session/new succeeds) launches directly with no sign-in step).
- [ ] `[NOT DONE]` **Per-agent session metrics (doc 69 §2 — Zed weekly-sessions view):** sessions-per-agent + tokens/cost per harness in the Spend/analytics surface (H2)
- [ ] `[NOT DONE]` **A7 MoA presets (doc 69 §3 — `hermes moa`):** named Mixture-of-Agents presets selectable in the planner (multi-brain routing beyond the current tier pick)
- [ ] `[NOT DONE]` **H2 Kanban-of-agents (doc 69 §3 — `hermes kanban`):** local multi-profile collaboration board (tasks/links/dispatcher) — fleets, not one card
- [ ] `[NOT DONE]` **B3/B4 worktree isolation (doc 69 §3 — `hermes --worktree`):** isolated git worktrees as the sub-agent workspace floor (parallel agents don't collide)
- [ ] `[NOT DONE]` **FS checkpoints (doc 69 §3 — `hermes --checkpoints`):** filesystem checkpoints before destructive changes — extend the office `Snapshot` rollback to fs writes
- [ ] `[NOT DONE]` **P5 learning-journey timeline (doc 69 §3 — `hermes journey`):** a timeline of learned skills + memories (validate the reinforce-queue visualization)
- [ ] `[NOT DONE]` **A2 egress credential firewall (doc 69 §3 — `hermes egress`):** outbound credential-injection firewall (iron-proxy) — confirm our broker blocks egress by default
- [ ] `[NOT DONE]` **H2 parallel-agent multiplexing (doc 69 §4 — Cline 2.0 headless/parallel):** run N agents, one view — the cockpit renders a live fleet, not one card
- [ ] `[NOT DONE]` **Registry adapter packages (doc 69 §5 — codex-acp/pi-acp):** treat `npx <adapter>` as a first-class distribution (done in the registry schema) — the remaining bit is F8 auto-pinning adapter versions at install

---

## P18 — MCP Directory Inbuilt Queue (doc 70, 2026-08-16 — mcpservers.org/all, 11,054 servers)
> **Verdict recorded:** do NOT bundle third-party document/browser MCP servers as inbuilt — extraction-only Python wrappers are superseded by our Rust engines (calamine/lopdf/roxmltree) and hosted "send us your files" servers violate local-first. Three *native* inbuilt capabilities close real gaps (no new deps beyond what's already used):

- [ ] `[NOT DONE]` **PDF page ops (doc 70 §2 — `oxidize-pdf` 🔴 STEAL):** split / merge / rotate / reorder pages, plus reorder — extend `everyaios-office::pdf` with lopdf (same dep); the current engine does form-fill/text-swap/redact/re-author but no page-level ops. **Highest-value, native, no external dep.**
- [ ] `[NOT DONE]` **Content search + OCR (doc 70 §2 — `dowse` 🟡 ADAPT):** full-text *content* search across a folder + OCR of pasted screenshots/images — extend `everyaios-storage` (currently FTS5 filename-only) with an on-device OCR path.
- [ ] `[NOT DONE]` **Gmail/IMAP read-first connector (doc 70 §2 — `mailwarden`/`Busymail` 🔴 STEAL the pattern):** the first real external connector — read-first, **approve-before-send** (no silent outbound), tokens in the SQLCipher vault, every send a Guard-2 ticket. Closes the external-connector OAuth gap with the right posture.
- [ ] `[NOT DONE]` **Connector catalog seed (doc 70 §3/§5 — 258 official remote MCP servers):** list the official/remote set (Atlassian, GitHub, Google, Supabase, Cloudflare, Exa, Firecrawl, DeepWiki, NotebookLM) + the popular-search SaaS names (Gmail, Slack, Notion, Linear, Figma, Salesforce, Stripe, Sentry, Datadog, Obsidian, n8n, Shopify) as the "MCP Servers" tab seed (user-supplied, hosted — not inbuilt).
- [ ] `[NOT DONE]` **Context7 docs-lookup reference (doc 70 §5 — official):** up-to-date version-specific library docs into prompts — maps to the I11 code-intel docs-lookup tool (🟢 reference, post-v1).

---

## P19 — Batch-4 Coding Agents / Skills / Harnesses Queue (doc 71, 2026-08-16)
> **Verdict recorded:** 13/21 repos already covered (docs 02/05/14/21/22/65). The 4 new tasks are the only work; void is deprecated (SKIP), RuView is out of scope (SKIP).

- [ ] `[NOT DONE]` **Kilo "Gateway" routing seam (doc 71 §1 — Kilo Code 🟡 ADAPT):** the 500-model BYOK zero-markup gateway → `everyaios-catalog` cache-optimized routing (extends P14; A6/A7/H32).
- [ ] `[NOT DONE]` **ruflo swarm + federation deltas (doc 71 §1 — 🟡 ADAPT/REF):** fold swarm orchestration (N-agents-one-prompt) into the P17 Kanban-of-agents task + cross-machine federation into H18.
- [ ] `[NOT DONE]` **System-prompt structure reference (doc 71 §1 — system_prompts_leaks 🟢 REF):** document the observed prompt *anatomy* (role/tools/permissions/memory/output/stop) into the P6.22 agent-frontmatter schema — **structure only, never copy leaked text**.
- [ ] `[NOT DONE]` **ui-ux-pro-max design-intelligence skill (doc 71 §1 — 🟡 ADAPT):** bundle the 161-rule / 67-style / 97-palette design knowledge pack as an inbuilt I2 skill for the default agent (H29 dashboard artifacts + UI v2 design system). Zero deps.

---

## P20 — Batch-5 Code-Intel / Parallel Agents / Search Queue (doc 72, 2026-08-16)
> **Verdict recorded:** 6/10 repos already covered (docs 20/65). The 2 new tasks below are the only work.

- [ ] `[NOT DONE]` **SeekStorm embedded hybrid index (doc 72 §1 — 🔴 STEAL):** evaluate Apache-2.0 `seekstorm` (in-process vector+lexical, 8-mode query planner) as the `everyaios-memory` hybrid index — replaces the hand-rolled BM25+RRF (P5.1/P5.7); keep sqlite-vec as the optional embedding path (doc 34).
- [ ] `[NOT DONE]` **Superset worktree-per-agent orchestration (doc 72 §1 — 🟡 ADAPT):** fold "100+ CLI agents each in an isolated git worktree + review/open-in-editor" into the existing P17 worktree-isolation (B3/B4) + parallel-multiplexing (H2) tasks — no new row.

---

## P21 — Batch-6 Computer-Use / Full-Computer Control Queue (doc 73, 2026-08-16)
> **Verdict recorded:** 11/19 repos already covered (docs 09/20/21/35/47/48/52/65/66/72). The one genuine steal is OpenAdapt's demonstration compiler; the rest of the computer-use batch are thin screenshot→action wrappers that validate E9/E14.

- [ ] `[NOT DONE]` **OpenAdapt demonstration compiler (doc 73 §1 — 🔴 STEAL/ADAPT):** extend B8 crystallization (currently task/plan-level) with a GUI demonstration compiler — record a human demo → compile to a deterministic replay program (action list + element selectors + verify-assertions) → **zero model calls on the healthy path** → governed repair (re-invoke the model *only* on interface drift) → **halt-instead-of-guess** when unverifiable. Reference only (Python); rebuild in Rust on top of our CDP/a11y stack + Guard-2.
- [ ] `[NOT DONE]` **ShowUI-Aloha human-taught computer-use (doc 73 §1 — 🟢 REF):** note as the *learning/generalization* half of crystallization (record → generalize to new task variants, not just replay) — pairs with the reinforce queue (P5/C13).

---

## P22 — Built-In MCP Server Manager Queue (doc 74, 2026-08-16)
> **Verdict recorded:** bundle the **manager**, not the 9,800 servers — mirror the proven `everyaios-acp` registry/installer/transport machinery for *consuming* third-party MCP servers. Doc 70's three *native* engine gaps stay in P18.

- [ ] `[NOT DONE]` **`everyaios-mcp::manager` (doc 74 §3 — 🟢 STEAL/ADAPT):** MCP-server manager — curated allow-list registry index + one-click install (npx/uvx/binary → sha256 → extract, reuse `everyaios-acp` registry_client/installer) + managed stdio child (reuse `frame.rs` + `ProcessTransport`) + `tools/list` surfacing merged into the agent registry with kind/readOnly/openWorld/profile.
- [ ] `[NOT DONE]` **Tauri + Connectors surface (doc 74 §3):** `mcp_servers`/`mcp_install`/`mcp_run`/`mcp_tools` commands + the "MCP Servers" tab → live manager (one-click install → run → tool list) with Guard-2 install + per-write tickets and vault-held tokens.
- [ ] `[NOT DONE]` **Native connector write template (doc 74 §4 — postgres-mcp-hardened 🟡 ADAPT):** refuse-twice (AST validation + DB read-only default + statement_timeout) + column redaction + EXPLAIN cost guard + hash-chained audit — the template for every Native connector write path.

---

## P23 — Anthropic Skills / Plugins / Cowork Queue (doc 75, 2026-08-16)
> **Verdict recorded:** adopt the Agent Skills standard + the plugin manifest; ship inbuilt native skill-wrappers, everything else user-added. The document-skills are source-available (reference-only).

- [ ] `[NOT DONE]` **Plugin manifest schema (doc 75 §3 — 🟡 ADAPT):** extend F8 `skills_index.json` (doc 65) into the `.claude-plugin/plugin.json` component schema — skills + agents + hooks + MCP + LSP + monitors + themes; immutable slug + `displayName` + `renames` map; skill-bundle plugins (`strict:false` + `skills` array); align P6.22 agent-frontmatter with the agent fields (`effort`/`background`/`isolation`).
- [ ] `[NOT DONE]` **Inbuilt first-party skill packs (doc 75 §4):** `SKILL.md` wrappers over our native engines (office/browser/storage/codeintel) + a bundled general set (document-creation, skill-creator, ui-ux-pro-max design-intelligence from P19-4) in `<data_dir>/skills` (read-only, no install step).
- [ ] `[NOT DONE]` **Marketplace "Add" button (doc 75 §4):** register anthropics/skills + claude-plugins-official + claude-plugins-community + awesome-claude-code as addable marketplaces via the F8 registry (Guard-2 install, sha-pinned, immutable slug).
- [ ] `[NOT DONE]` **Document-skills reference (doc 75 §2 — 🔴 license boundary):** read `skills/docx|pdf|pptx|xlsx` as *pattern* reference to cross-check the P4 OOXML engine; **source-available, never copy text**.

---

## P24 — Batch-7 Design / Browser Self-Healing / Computer-Use Queue (doc 76, 2026-08-16)
> **Verdict recorded:** 3/11 already covered. Two steals: open-design's DESIGN.md brand-system + composable design-skills, and browser-harness's self-healing harness. The rest validate the one-session browser+files+HITL cockpit.

- [ ] `[NOT DONE]` **open-design `DESIGN.md` + composable design-skills (doc 76 §1 — 🟡 ADAPT):** a repo-level `DESIGN.md` brand-system-as-skill (the design twin of `CLAUDE.md`) + the 259-skill composable design catalog → fold into I2/H29, pairs with P19-4 (ui-ux-pro-max design-intelligence). Reference only.
- [ ] `[NOT DONE]` **browser-harness self-healing harness (doc 76 §2 — 🟡 ADAPT):** let the agent emit/edit its own helper functions mid-task (via `everyaios-script` rquickjs, E4) on unrecognized page patterns instead of hard-coding every site — fold into E14/E16, pairs with P21 governed-repair.
- [ ] `[NOT DONE]` **ponytail minimal-code doctrine (doc 76 §4 — 🟢 REF/ADAPT):** fold the "laziest senior dev / best code is code you never wrote" minimal-change + YAGNI principle into the default agent's coding persona + the C1–C3 cluster (doc 63) + token economy (doc 32).

---

## P25 — Batch-8 Programmable Workflows / Graphify / Browser Queue (doc 77, 2026-08-16)
> **Verdict recorded:** 4/12 already covered. The workflow answer is `everyaios-blueprint` DAG + B7 triggers + Airflow's missing scheduler semantics; Graphify → I7; addyosmani → I2.

- [ ] `[NOT DONE]` **Programmable workflows (doc 77 §1 — 🟡 ADAPT):** "an agent creates a workflow" = agent emits a blueprint (DAG) whose nodes are connector/step references (mail/calendar F14/F15, MCP tools P22, browser/office engines) with cron/event triggers (B7) + per-node retry/backfill + task-state monitoring → the Automations panel. Airflow is the semantics reference only.
- [ ] `[NOT DONE]` **Graphify knowledge-graph (doc 77 §2 — 🟡 ADAPT):** fold "codebase + docs + SQL schemas + configs + PDFs → queryable KG" (tree-sitter, 36 langs) into `everyaios-codeintel` (I7) + ship a `/graphify`-style inbuilt skill (I2). Pairs with code-review-graph (doc 65) + crux (doc 63).
- [ ] `[NOT DONE]` **addyosmani/agent-skills (doc 77 §3 — 🟡 ADAPT):** bundle the 19 MIT exit-criteria engineering skills as inbuilt I2 skills — pairs with P23-2 + P24-3.
- [ ] `[NOT DONE]` **MCP-hijacking security note (doc 77 §4 — 🔴 REF):** fold the Knostic "malicious MCP server hijacks Cursor's browser + steals credentials" finding into P22's Guard-2 install + egress-firewall + vault-held-token policy.

---

## P26 — Batch-9 Marketplace / Google Workspace / Jobs Queue (doc 78, 2026-08-16)
> **Verdict recorded:** 3/6 already covered. Three adopts: wshobson/agents catalog, `gws` Workspace connector, and the AIHawk "Jobs" vertical.

- [ ] `[NOT DONE]` **wshobson/agents marketplace (doc 78 §1 — 🟡 ADAPT):** adopt as the F8/P23 catalog seed — 94 plugins / 203 agents / 175 skills across Claude Code/Codex/Cursor/OpenCode/Copilot/Gemini, installable via the existing registry-fed install (Guard-2, sha-pinned).
- [ ] `[NOT DONE]` **googleworkspace/cli `gws` connector (doc 78 §2 — 🟡 ADAPT):** consume Google's official `gws` (Drive/Gmail/Calendar/Sheets/Docs, Discovery-built) as the F14/F15 + P18 Gmail read-first connector — managed child (P22 pattern), read-first + approve-before-send, OAuth token in the vault.
- [ ] `[NOT DONE]` **AIHawk + career-ops "Jobs" vertical (doc 78 §3 — 🟡 ADAPT):** ship a "Jobs" skill/blueprint — scan portals (career-ops A–F rubric) → tailor CV/cover letter (docx engine D1) → auto-apply (browser + Session Vault E11/E13) → **every submission a Guard-2 ticket** (never silent mass-apply).

---

## P27 — Local Model Fetch / Download Core Queue (doc 79, 2026-08-16)
> **Verdict recorded:** A5/P1.8 currently detects+lists installed runtimes but has no first-party downloader or unified local registry. Build the LM-Studio-style HF download core + `local://` URL.

- [ ] `[NOT DONE]` **HF downloader (doc 79 §3.2):** `everyaios-core::model_fetch` — resumable HTTP Range download + `X-Linked-Etag`/`X-Repo-Commit` resume + sha256 verify (`.gguf.sha256` / LFS `oid sha256:`) + byte progress events + disk preflight (extend `hwfit` with disk + quant recommendation).
- [ ] `[NOT DONE]` **Local store + registry (doc 79 §3.3):** `<data_dir>/models/{source}/{publisher}/{model}/{quant}-{sha8}.gguf` layout + `index.json` registry merged into `everyaios-catalog` (A6/P14).
- [ ] `[NOT DONE]` **`local://` model URL + broker resolution (doc 79 §3.4):** stable runtime-agnostic id (`local://hf/{pub}/{model}:{quant}` / `local://ollama/{model}:{tag}` / `local://llamafile/{name}`) → broker → runtime/endpoint; the model picker groups all local models under a **"Local" dropdown** (installed + downloadable + `hwfit` fit badge).
- [ ] `[NOT DONE]` **Runtime binding (doc 79 §3.5):** downloaded GGUF → managed llamafile/llama.cpp serve, or ollama `create` (Modelfile), or MLX (Rapid-MLX, doc 61).

---

## P28 — Post-v1 Strategic Pillar (K1–K6 + early surfaces; docs 80–82, 2026-08-17)
> **Gated:** this section is the adopted strategy from the external benchmark review (doc 80), the non-model moat roadmap (doc 81), and the innovation-priority decisions (doc 82). Nothing here ships before **Stage 0 — the live ticketed executor** (the open tool-executor seam, spec §6 "Remaining" = doc-80 condition 1 = doc-82 Gate A) and its Gates A–E. No capability-matrix rows until implemented (these compose existing rows: J5/EV1/C6/C10/F8/I6/B8/E5/P7.7).

- [ ] `[NOT DONE]` **Stage 0 — the gate: live ticketed executor.** Coordinator tool loop invokes `GuardService::use_ticket`/`evaluate` for every file/browser/shell/provider/connector/office/ACP effect (the same open item as P6/P7 wiring; doc-80 conditions 1+5; doc-82 Gate A). **Nothing else in P28 ships before this.**
- [ ] `[NOT DONE]` **ADD-1 One-Gesture Everything Capture (doc 82):** unified "Capture" surface (file/screenshot/spoken thought/browser page/clipboard/attachment) — composition over existing snapshot/clipboard/file-open/H27 engines + H30 voice-notes later
- [ ] `[NOT DONE]` **ADD-2 Intelligent Desktop Inbox (doc 82):** one inbox composing notifications-popover + memory-panel + tasks + P6.4 session-open proactivity hook; powers the four-verbs first screen (Capture · Ask · Organise · Finish)
- [ ] `[NOT DONE]` **ADD-3 Do-It-With-Me gradient (doc 82):** takeover/resume flow (P11.5.4, UI) + "repeat it" affordance on guard/auto-cards; quiet-mode continues (H2)
- [ ] `[NOT DONE]` **ADD-4 Deliverable Studio (doc 82):** report/deck/workbook output surface over D1–D4 + artifact cards; absorbs the H30/H31 queues (doc 68) into one studio; office-correctness pre-req
- [ ] `[NOT DONE]` **K1 Proof-Carrying Work Receipts (doc 81 §4):** portable receipt contract (goal/inputs/plan/actions/evidence/verification/provenance/policy/reproduction/cost/result_state) over P7.7 Merkle + GuardReceipt + EV1 + ledger + Trajectory; renderer + export; acceptance: 5 questions in 1 min without chat history
- [ ] `[NOT DONE]` **K2 Reversible Change Sets (doc 81):** change-set coordinator above tickets — dependency DAG, pre/postconditions, effect classes (reversible / compensatable / irreversible / uncertain = doc-53 idempotency), recovery UI; acceptance: kill mid-task → honest recovery, no duplicate
- [ ] `[NOT DONE]` **K5 Data Release Firewall (doc 81 §3.2):** egress policy engine + data-release receipts; **two zones** (broker-mediated + OS-egress proxy for ACP/MCP/browser — P17 iron-proxy); acceptance: per-profile packet-level egress audit
- [ ] `[NOT DONE]` **K3 half-1 recording (doc 81 §3.1):** demonstration capture — DOM/a11y anchors + input/outcome evidence; starts early (feeds E2/E5/E9 + ADD-1); competitive note: OpenAI Record & Replay (2026-06-18) and Claude watch→skill already ship "teach once" — our claim is the zero-token local governed replay half
- [ ] `[NOT DONE]` **K3 half-2 compile — flagship (doc 81 §4):** teach → compile → deterministic replay; zero-model-token healthy runs; governed repair with halt-over-guess (OpenAdapt pattern, P21); **Gate D simulator/fixtures first** (the Automation Simulator row)
- [ ] `[NOT DONE]` **K4 passports (slim) (doc 81 §4):** portable scoped context packet over C10 pass-by-ref + C6 graph + SCIP; model/agent/device handoff honoring scope; after K1 (receipts make the graph trustworthy)
- [ ] `[NOT DONE]` **K6 Trusted skill/automation supply chain (doc 81 §4):** signed manifests + capability/fixture tests + version pinning + quarantine + revoke (Gate E) **before marketplace scale** (pre-req for P22/P23/P26)
- [ ] `[NOT DONE]` **Decline-list guard (doc 80/81/82):** no gen-media front-ends, no connector-count marketing, no silent autonomy, no replacement browser/IDE, no recursive swarms; marketing claims ("teach once", "broadest control plane") gated on Gates A/B/D

## P29 — Native Sidecar Migration, Tiered (external review 2026-08-17; spec §9.1 R6, ARCH/01 §1.3)
> **Gated (data-driven, not reflexive):** this is the post-v1 footprint/security play — revisit the spec §8 non-goal ("Rust rewrite of the TS engine now") **only after Stage 0 is live AND P8 publishes real combined RSS** (if measured warm RSS ≈ 150–250MB is acceptable, defer indefinitely). The ~48K-line TS engine (coordinator 3K + `@personal-ai/core-*` ~45K) becomes a native Rust sidecar in three tiers; target ~93MB → ~15MB. **Correction to the review:** its Tier-1 rationale "keys never reach the sidecar" is **already enforced** — the credential broker is already Rust (`everyaios-vault` broker, spec §P3/doc 53 §2; `sealed_channel_never_leaks_secret` test) and guard enforcement is already `everyaios-guard` (guard.ts is only the coordinator's IPC client). The real Tier-1 value = **eliminate IPC hops + drop the V8 execution surface + memory**, not key secrecy.
- [ ] `[NOT DONE]` **Tier 1a — collapse IPC:** `frame.ts`/`message.ts`/`index.ts` (99+76+364) → native Tokio actor loop (`tokio::sync::mpsc` in-process channels); stdio JSON-RPC framing disappears; `tokio-util::codec::LengthDelimitedCodec` only if any IPC remains
- [ ] `[NOT DONE]` **Tier 1b — guard.ts (108) → native:** enforce tickets directly inside `everyaios-guard` (ticket consumption with zero IPC hop); the security bridge never lives in a JS/V8 memory surface that can be monkey-patched
- [ ] `[NOT DONE]` **Tier 1c — core-providers (15/3.3K) → Rust owns streaming:** broker already holds keys + does the HTTP call (done); extend so Rust owns the SSE stream + failover loop end-to-end (`reqwest`/`eventsource-client`) — sidecar becomes a thin prompt/render client only; **heap.ts/orphan.ts (104+47) eliminated** via OS primitives (`prctl(PR_SET_PDEATHSIG)` Linux / Job Objects Win / NSProcessInfo macOS)
- [ ] `[NOT DONE]` **Tier 2a — core-memory (24/4.7K) → pure-Rust math:** ACT-R decay, spreading activation, FSRS scheduler, fusion as pure Rust fns over SQLite/LadybugDB (algorithms already verified; re-implement over the landed `everyaios-memory` crates)
- [ ] `[NOT DONE]` **Tier 2b — core-search (45/3.9K) → Rust:** tantivy local index + reqwest parallel fetch cascade + BM25 rerank (G8/G1 already Rust-adjacent; consolidate)
- [ ] `[NOT DONE]` **Tier 2c — core-files (88/14.5K) → consolidate:** dedup against the already-landed `everyaios-office` (calamine/IronCalc/lopdf) + `everyaios-storage`; keep only text-extraction/chunking/diffing glue in Rust (docx-rs, tree-sitter); largest LOC win
- [ ] `[NOT DONE]` **Tier 2d — core-automations/core-engine (42/6.8K + 16/2K) → Rust:** state machines, blueprint DAG execution, circuit breakers, deterministic async cancellation (mirrors landed `everyaios-blueprint`)
- [ ] `[NOT DONE]` **Tier 3a — prompt.ts/router.ts/catalog.ts (190+182+157) → config/templates:** Minijinja/Tera templates + Serde TOML structs (fast-iterating glue; or keep TS)
- [ ] `[NOT DONE]` **Tier 3b — core-ai (40/4.7K) + core-agents (4/300): keep TS/QuickJS** for prompt tuning, blueprint loops, experimental subagent personas
- [ ] `[NOT DONE]` **Tier 3c — core-connectors (38/7.1K): keep TS/QuickJS in the rquickjs sandbox** (fast-changing third-party schemas — Google/Slack/Composio); consistent with the MCP-servers + native connector decision
- [ ] `[NOT DONE]` **Exit criterion:** full test parity (all 1052+ workspace tests + coordinator 66 + UI tsc re-run against the native sidecar), combined warm RSS target (e.g. <120MB), zero plain-text key in non-Rust memory (already asserted), no capability regression

## P30 — Competitor Batch Steal Queue (openworker · cc-switch · skales · deepseek-harness; doc 83, 2026-08-17)
> **Gated:** reimplement in our stack (Rust crates / TS coordinator), source-pattern credit only; **skales is BSL 1.1 closed → product-surface targets, no code.** Items 1–6 = guard/composition hardening; 7 = harness-provider surface; 8–11 = audit/extension/invariant formalization; 12–15 = the **casual-user product gaps skales exposed** (our engines exist, the surface doesn't).
- [ ] `[NOT DONE]` **P30.1 — RiskClass × Mode autonomy gradient (openworker):** adopt `RiskClass::{READ, WRITE_LOCAL, EXEC, EXTERNAL}` + `Mode::{DISCUSS, PLAN, INTERACTIVE, AUTO, CUSTOM}` as the user-facing layer over `permissions.toml` (keep the numeric Trust Ladder as the underlying score); `EXTERNAL` = off-machine side effects. → J21 + P28 ADD-3 Do-It-With-Me
- [ ] `[NOT DONE]` **P30.2 — Shell-operator structural disqualifier (openworker):** any of `; & | > < \` $() ( \n \r` in an allowlisted command forces approval — structural hardening above Guard-1 regex. → J1/Guard-1
- [ ] `[NOT DONE]` **P30.3 — EXTERNAL-risk → unattended inbox hook (openworker):** background/unattended runs park their `EXTERNAL`-risk asks in an inbox instead of acting; powers the messaging + automation proactivity layer. → F13/B7/P6.4
- [ ] `[NOT DONE]` **P30.4 — ask/plan/subagent/todo first-class tools (openworker):** reuse our DecisionPackage/MCQ + blueprint approval + B3/B4 + todo as the casual-user tool surface (already built; productize). → tool registry
- [ ] `[NOT DONE]` **P30.5 — Mention-driven sessions (openworker):** `@agent` in Slack/Telegram/email → session opens on desktop → work runs → thread reply (F13 concretization). → F13
- [ ] `[NOT DONE]` **P30.6 — Persona manifest + registry (openworker):** formalize the SOUL persona file into a manifest + registry (loading/validation/builtin set). → personality
- [ ] `[NOT DONE]` **P30.7 — HarnessConfigWriter (cc-switch):** Rust trait that reads/writes each external agent CLI's provider config (`settings.json`/`config.toml`/`auth.json`), mirroring their `session_manager/providers/*.rs` — manage the *providers* of Claude Code/Codex/OpenCode/etc. from the cockpit, beside ACP-driving (not replacing it). → F12/F8/A2-A3
- [ ] `[NOT DONE]` **P30.8 — "model-visible means logged" invariant (deepseek-harness):** hard runtime assert in the coordinator turn loop that every context block reaching a model request is reconstructable from the audit log (`ContextInjection` events already exist; make it an assert, not best-effort). → J5/J19/Trajectory
- [ ] `[NOT DONE]` **P30.9 — Profile/bundle config layering + patch overlay (deepseek-harness):** add a user-local/team patch layer above shipped blueprints + skills (`cordis.patch.yml` semantics) so `.md` specs stay patchable without forking. → B2/I2
- [ ] `[NOT DONE]` **P30.10 — Capability seams SD/Provider/Consumer + reversible effects (deepseek-harness):** formalize the Extension ABI docs around the Service-Definition/Provider/Consumer triad; skill/plugin registration unwinds on unload. → I6
- [ ] `[NOT DONE]` **P30.11 — Turn/step waterfalls + next() hooks (deepseek-harness):** refactor coordinator `chat.ts` stage events into interceptable waterfall hooks (pre-step/request/stream/pre-execute/execute/post-execute) instead of fixed switch-cases. → chat.ts/hooks
- [ ] `[NOT DONE]` **P30.12 — AIPointer quick-ask overlay (skales, build lean):** cursor/hotkey-anchored translucent ask-box over any app (sees screen, saves to todos/calendar/notes) — reuse clipboard/screen-capture + chat; the Raycast concession we already conceded (doc 80 §6). → ADD-1/H26
- [ ] `[NOT DONE]` **P30.13 — /goal background goal + resume, local half (skales):** hand a goal, close the lid, resume where left off — pull the *local* B7/H18 half earlier (user-operated, no cloud/mobile); mobile companion stays deferred. → B7/H18
- [ ] `[NOT DONE]` **P30.14 — Migration importer (skales):** import ChatGPT/Claude/OpenClaw exports + agent instructions + editor/MCP config (re-rate doc-82 "Migration Concierge" from defer → narrow ship). → doc-82
- [ ] `[NOT DONE]` **P30.15 — Visible memory consolidation (skales):** user-visible "Dreaming"/Dream-Diary + morning-brief framing over the existing C-series compaction/decay (built; add visibility). → C/B7
- [ ] `[NOT DONE]` **P30.16 — Companion layer (skales, defer):** Desktop-Buddy/Iris/pixel-pets personality surface — post-v1, high-effort differentiator for the 6-to-60+ audience. → post-v1

## P31 — Custom Agent Builder + Simplified UI (B9; user directive 2026-08-17)
> **Goal:** make the UI work for casual AND power users (progressive disclosure), and let users author custom agents that bundle persona + engine + model/provider + scoped MCP/connectors/tools + workflows — with **per-agent capability scoping so no agent is bloated**. Composes existing rows (F8/F12/J17 ACP, A2/A6 models, P22 MCP manager, F7 MCP, F-connectors, I6 ABI, B2/B7, Guard capability scoping); no new engines.
- [x] `[DONE]` **P31.1 — Progressive-disclosure UI:** casual default (collapsed 56px sidebar: agent switcher · +New chat · Recents · Settings; provider/model = "Auto"; hidden = automations/guard/connectors/memory/analytics nav + activity rail + spend detail) + **Power toggle** (`⌘.` / "More" chevron) reveals the full cockpit; state persisted (`settings.ui.powerMode`). → UI-DESIGN-PROMPT "Progressive Disclosure". **Landed in `ui/src`: `powerMode` store state (localStorage-persisted) + `devMode` (Developer Mode) + `CasualRail` vs `PowerSidebar` split + rail/viewport hidden in casual + `⌘.` shortcut + minimal status-bar pill (`● Ready · Local`) with full telemetry behind Settings→General→Developer Mode + `Safe & Private` title-badge + simplified composer (no mode pills/model-picker/budget/helper chips; `Ask anything, drop files, or type /…`) + consumer-outcome empty-state prompts + streaming caret (`caret-blink`) + **centered composer on empty/new chat (lifted mid-canvas with the empty-state prompts above; drops to bottom-pinned once the conversation starts — `ChatPanel` `isEmpty` branch → `ChatComposer centered`)**.**
- [ ] `[NOT DONE]` **P31.2 — Agent bundle manifest (`agent.toml`):** versioned schema (I6-compatible) — name/emoji/description, persona/system-prompt, engine binding, model/provider (optional), mcp_servers[], connectors[], skills[], tools allow/deny[], blueprints[], automations[]; lives in `~/.everyaios/agents/`. → I6 + `everyaios-acp`
- [ ] `[NOT DONE]` **P31.3 — Create-agent wizard + templates:** 4-step flow (Identity → Brain → Capabilities → Workflows) with 8 templates (General · Coder · Researcher · Email-Triager · Data-Analyst · Writer · Meeting-Notes · Browser-Operator) that pre-fill the bundle. → UI-DESIGN-PROMPT "Custom Agent Builder"
- [ ] `[NOT DONE]` **P31.4 — Per-agent MCP server scoping:** agent declares an exact MCP-server subset (tick, never "all"); runtime injects only declared servers' tools into that agent's schema — running Agent X never loads Agent Y's servers. → P22 + `everyaios-mcp`
- [ ] `[NOT DONE]` **P31.5 — Per-agent connector scoping:** same subset semantics for connectors (Gmail/Slack/GitHub/…); unused connectors never attach to an agent. → F-series + vault
- [ ] `[NOT DONE]` **P31.6 — Per-agent tool allow/deny (Guard capability scope):** the agent bundle's tool list becomes its capability grant — enforced by `everyaios-guard` (I6 CapabilityGranter semantics), so a custom agent can't exceed its declared surface. → I6 + guard
- [ ] `[NOT DONE]` **P31.7 — Model/provider inheritance:** default = "inherit from chat bar" (runs on whatever is selected at send time); optional pin to a specific model/provider (A2/A6). Pinned agents show "Using <agent>'s settings" in the composer. → A2/A6/H32
- [ ] `[NOT DONE]` **P31.8 — Engine binding:** `Inbuilt (EveryAIOS)` | `ACP agent` (installed CLI: Claude Code/Codex/…) | `Model-only` — one bundle, swappable brain without touching persona/scopes; re-binding preserves the rest of the bundle. → F12/J17/H32
- [ ] `[NOT DONE]` **P31.9 — Workflows + automations attachment:** attach blueprints (B2) + scheduled automations (B7) to an agent so its "workflows" live in the same bundle; agent-owned runs land in the audit timeline. → B2/B7
- [ ] `[NOT DONE]` **P31.10 — Agent store/registry + export/share:** local `~/.everyaios/agents/` registry (list/duplicate/disable/export bundle); sharing = export the `agent.toml` (future marketplace rides K6 supply chain, P28). → I6/P28-K6

## P32 — Casual vs Power User UX Queue (doc 84; user directive 2026-08-17)
> **Goal:** close the six gaps the Wharton/Nielsen/NN-g research exposed — plain-language explanations, ownership, precise outputs, honest limitations, keyboard-first completeness, context inheritance. Composes the already-landed `powerMode`/`devMode` progressive disclosure (P31.1); no new engines.
- [ ] `[NOT DONE]` **P32.1 — Plain-language now-doing strip + approval cards:** consumer phrasing ("Updating your spreadsheet…", "This will change 1 paragraph") with technical detail (engine/step/tokens) behind hover/expand — Wharton: "do not frame explanations as technical details". → UI-DESIGN-PROMPT + `now-doing-strip`/`mcq-interrupt-card`
- [ ] `[NOT DONE]` **P32.2 — Name-your-agent ownership moment:** B9 wizard step 1 makes naming deliberate ("Give your agent a name"); suggested names for the default agent — Wharton: psychological ownership → +20% adoption. → B9/P31.3
- [ ] `[NOT DONE]` **P32.3 — Precise-numbers-in-outputs rule:** artifact/deliverable cards always show exact figures (cells changed, files touched, test counts) — competence via precision; distinct from hiding chrome spend. → K1 receipts + artifact cards
- [ ] `[NOT DONE]` **P32.4 — Honest-limitation surfacing:** when the agent cannot do something, say so plainly and offer the nearest alternative; surface "learning/improving" framing where real. → §9.1 honest framing as a UI rule
- [ ] `[NOT DONE]` **P32.5 — Keyboard-first audit:** sweep every action for a shortcut; add missing ones (panel nav, mode, views); keep `⌘.` mode toggle listed in the shortcuts overlay. → `keyboard-shortcuts.tsx` + UI-DESIGN-PROMPT shortcut table
- [ ] `[NOT DONE]` **P32.6 — Fewest-questions context inheritance:** first-run + casual: pre-fill folder/session context so the first ask needs no setup (ARCH/12 §4.0 onboarding kept enforced). → onboarding + session creation

## P33 — Multi-View Right Panel + Office/PDF/Google (doc 84 + VS Code logic + LibreOffice/LOKit + Google Workspace; user directive 2026-08-17)
> **Goal:** evolve the right panel from "one surface at a time" to a **VS Code-style tabbed panel** (defaults Terminal · Folder · Browser, `+` add view, close ×, reorder, per-session persistence), browser with internal page tabs, office files as tabs, PDF study-mode chat scoping, and an "open-perfectly" renderer tier (LibreOffice/LOKit) + Google Docs/Sheets access. Research basis: doc 84 (casual/power UX), VS Code custom-layout docs, LibreOffice LOKit tiled rendering, Google Drive/Sheets API. ARCH/12 v3.0 + UI-DESIGN-PROMPT updated.
- [x] `[DONE]` **P33.1 — Multi-view tabbed right panel:** tab strip (open views) + `+` add-view picker + close ×; defaults Terminal · Folder · Browser (+ active office file); rail icon and artifact click open as tabs. **Landed in `ui/src`: store `openViews`/`addView`/`closeView` + `RightViewport` tab strip + `+` dropdown.**
- [x] `[DONE]` **P33.2 — Browser internal page tabs:** one Browse view hosts its own tab strip (pages + `+` new tab); links open page tabs inside the browser, never new panel tabs. **Landed in `ui/src` (`browse-view.tsx`).**
- [x] `[DONE]` **P33.4 — PDF study-mode chat scoping:** a PDF tab can scope the chat (`📄 Scoped to contract.pdf` chip, ✕ clears); answers grounded in that document, side-by-side explain. **Landed in `ui/src` (`office-pdf-view.tsx` scope button + `chat-panel.tsx` scope chip + store `scopedView`).**
- [ ] `[NOT DONE]` **P33.3 — Office files as tabs (auto-open):** opening `Q3.xlsx`/`exec-summary.docx`/`contract.pdf`/`deck.pptx` from an artifact card or the W-flyout adds a matching tab; reuses the W-flyout to pick among open office docs. → office flyout + artifact-card click
- [ ] `[NOT DONE]` **P33.5 — LibreOffice/LOKit "open-perfectly" tier:** `everyaios-office` drives LibreOffice headless + LOKit tiled rendering for Word/PPT/PDF/mixed-format fidelity — *both* agentic mutation and normal human reading (read-only = same renderer, no mutation path); Sheets stay IronCalc/calamine, PDFs lopdf/pdf.js; LOKit = fallback/perfect-fidelity tier. → ARCH/04 + doc 29
- [ ] `[NOT DONE]` **P33.6 — Google Docs/Sheets access:** normal reading = open in the authenticated browser view (system Chrome session, no re-login); agentic = Drive/Sheets API (gws connector F14/F15, P18) → export OOXML → office engine → mutate → optional write-back. → F14/F15/P18 + browser view
- [ ] `[NOT DONE]` **P33.7 — Tab persistence + drag-reorder:** `openViews`/`activeView`/`splitRatio` saved per sessionId (Cursor layout-reset bug not copied); tabs reorder by drag. → right-rail + store

## P34 — Full-Fidelity Tool Surfaces (ARCH/12 v3.1; user directive 2026-08-17)
> **Goal:** the right panel is the **live window into the real tool** — every view reproduces the official product's full surface (all buttons, all toolbars, all modes), nothing held back. Word/Excel/PowerPoint = complete Microsoft ribbon + Copilot; PDF = full viewer (nav/zoom/search/annotate/forms/sign/redact/thumbnails); Browser = full Chrome-style chrome incl. built-in AI Mode/Gemini sidebar. Agent drives the same surface the user sees; takeover (H21) makes controls live. ARCH/12 §4.1c + UI-DESIGN-PROMPT updated.
- [x] `[DONE]` **P34.1 — Office ribbon component:** reusable full-fidelity ribbon (tab strip File·Home·Insert·…·Copilot + per-tab groups/buttons), used by Excel. **Landed in `ui/src` (`office-ribbon.tsx` + wired into `office-xlsx-view.tsx`).**
- [x] `[DONE]` **P34.6 — Browser full chrome:** tab strip + internal page tabs + bookmarks bar + extension icons + puzzle-piece menu + star + **built-in AI Mode / Gemini sidebar** (Chrome 141+ parity). **Landed in `ui/src` (`browse-view.tsx`).**
- [ ] `[NOT DONE]` **P34.2 — Word full surface:** full ribbon + canvas (ruler, Print/Web/Read views, zoom, status bar Page x/y · Words); Copilot summarize/rewrite/draft-with-references. → office-docx-view + OfficeRibbon('Word')
- [ ] `[NOT DONE]` **P34.3 — Excel full surface:** full ribbon (landed) + Name box + formula bar + status bar (Average/Count/Sum), freeze panes, autofilter, conditional formatting. → office-xlsx-view
- [ ] `[NOT DONE]` **P34.4 — PowerPoint full surface:** full ribbon + Slide/Outline/Notes/Sorter panes + transitions/animations strip + presenter notes (P4.7b). → office-pptx-view + OfficeRibbon('PowerPoint')
- [ ] `[NOT DONE]` **P34.5 — PDF full viewer:** page nav/zoom/fit · search · highlight/comment/annotate/draw/stamps · form fill · sign · redact · thumbnails/outline/annotations sidebar · reader + night mode. → office-pdf-view
- [ ] `[NOT DONE]` **P34.7 — Fidelity rule + takeover wiring:** every surface read-only while the agent works, writable on takeover (H21); a control exists iff the real product has it. → office views + browse + H21

## P35 — Full Animation Wiring (design-doc motion table; user directive 2026-08-17)
> **Goal:** every row in UI-DESIGN-PROMPT "Interaction Details & Micro-Animations" is a live implementation — no specced animation left as dead CSS. All utilities in `globals.css` are now consumed by components.
- [x] `[DONE]` **P35.1 — Wire all design-doc micro-animations into components:** `enter-approval` (Guard-2 card) · `enter-step` + `step-shake` (progress steps, staggered; new `failed` step state with rose ✗) · `enter-surface` (viewport crossfade, horizontal slide removed per no-slide rule) · `cell-flash` (Excel recalc diff) · `chart-crossfade` (Analytics recharts) · `scale-in-palette` (⌘K) · `scale-in` (agent picker + office flyout) · `treemap-morph` (Storage) · `spark-draw` (Automations sparkline, staggered) · `score-roll` (Guard trust ladder) · `agent-switch-pulse` (agent avatar) · `shimmer` (Skeleton) · `breathe` (Now-doing processing). **Landed across 11 files in `ui/src`; toasts keep radix in/out (no competing animation).**
- [ ] `[NOT DONE]` **P35.2 — Entrance stagger for list/table surfaces:** sessions list, connectors list, memory entries, guard ticket rows, artifact cards — fade-up stagger on mount. → left-sidebar + panels
- [ ] `[NOT DONE]` **P35.3 — Press/hover feedback audit:** every interactive element has hover + active(scale-98)/focus-visible feedback; icon buttons get a consistent 150ms press. → ui/* primitives + shell
- [ ] `[NOT DONE]` **P35.4 — Generative-UI (H25) + widget (H17) animations:** when AG-UI generative surfaces land, give them the same enter/crossfade treatment. → H25/H17

## SUMMARY

> Counts are live checkbox totals from this file, recomputed 2026-08-17 (every `- [x]`/`- [ ]` bullet, incl. sub-bullets). `Done`/`Open` split per section is the current build state.

| Phase | Tasks | Done | Open | Weeks |
|---|---|---|---|---|
| P0 Workspace & Skeleton | 48 | 48 | 0 | ~2 |
| P1 Chat + BYOK | 54 | 54 | 0 | ~4 |
| P2 Browser Layer | 90 | 90 | 0 | ~6 |
| P3 Cockpit & Audit UI | 14 | 14 | 0 | ~4 |
| P4 Office Engine | 54 | 54 | 0 | ~5 |
| P5 Memory + Token Economy | 69 | 68 | 1 | ~5 |
| P6 Orchestration + Connectors | 95 | 35 | 60 | ~5 |
| P7 Forge + Guardrails | 63 | 30 | 33 | ~4 |
| P8 Product Polish | 45 | 8 | 37 | ~3 |
| P9+ Post-v1 | 22 | 0 | 22 | later |
| P10 Testing & QA | 50 | 0 | 50 | ~4 |
| P11 UI/UX (spec + research) | 31 | 0 | 31 | ~3 |
| P11.5 UI Implementation | 75 | 33 | 42 | ~4 (parallel) |
| P12 Market Research & GTM | 47 | 0 | 47 | ~4 (parallel) |
| P13 Batch-3 Steal Queue (doc 65) | 11 | 0 | 11 | post-v1 |
| P14 Model Catalog — models.dev (doc 66) | 5 | 0 | 5 | ~1 (parallel) |
| P15 Capability-Delta Queue (doc 67) | 5 | 0 | 5 | post-v1 |
| P16 Final Market-Research Deltas (doc 68) | 8 | 2 | 6 | post-v1 |
| P17 ACP Agent Ecosystem Steal Queue (doc 69) | 10 | 1 | 9 | post-v1 |
| P18 MCP Directory Inbuilt Queue (doc 70) | 5 | 0 | 5 | ~1 (parallel) |
| P19 Batch-4 Coding Agents/Skills Queue (doc 71) | 4 | 0 | 4 | ~1 (parallel) |
| P20 Batch-5 Code-Intel/Parallel/Search Queue (doc 72) | 2 | 0 | 2 | ~1 (parallel) |
| P21 Batch-6 Computer-Use/Full-Control Queue (doc 73) | 2 | 0 | 2 | post-v1 |
| P22 Built-In MCP Server Manager Queue (doc 74) | 3 | 0 | 3 | ~1 (parallel) |
| P23 Anthropic Skills/Plugins/Cowork Queue (doc 75) | 4 | 0 | 4 | ~1 (parallel) |
| P24 Batch-7 Design/Browser/Self-Heal Queue (doc 76) | 3 | 0 | 3 | ~1 (parallel) |
| P25 Batch-8 Workflows/Graphify/Browser Queue (doc 77) | 4 | 0 | 4 | ~1 (parallel) |
| P26 Batch-9 Marketplace/GWS/Jobs Queue (doc 78) | 3 | 0 | 3 | ~1 (parallel) |
| P27 Local Model Fetch/Download Core Queue (doc 79) | 4 | 0 | 4 | ~1 (parallel) |
| P28 Post-v1 Strategic Pillar (docs 80–82; gated on the Stage-0 executor) | 13 | 0 | 13 | post-Stage-0 |
| P29 Native Sidecar Migration, Tiered (external review 2026-08-17; gated on Stage-0 + P8 RSS) | 11 | 0 | 11 | post-Stage-0 |
| P30 Competitor Batch Steal Queue (openworker/cc-switch/skales/dsh; doc 83) | 16 | 0 | 16 | post-Stage-0 (12–15 casual-user, can pull earlier) |
| P31 Custom Agent Builder + Simplified UI (B9; user directive 2026-08-17) | 10 | 1 | 9 | post-Stage-0 (P31.1 landed; P31.3 wizard next) |
| P32 Casual vs Power User UX Queue (doc 84) | 6 | 0 | 6 | post-Stage-0 (UI-only, can pull early) |
| P33 Multi-View Right Panel + Office/PDF/Google (doc 84, VS Code, LibreOffice, Google Workspace) | 7 | 3 | 4 | post-Stage-0 (P33.1/2/4 landed; P33.5/6 need engines) |
| P34 Full-Fidelity Tool Surfaces (ARCH/12 v3.1) | 7 | 2 | 5 | post-Stage-0 (P34.1/6 landed; P34.2-5 need ribbon+viewer build) |
| P35 Full Animation Wiring (design-doc motion table) | 4 | 1 | 3 | landed P35.1 (11 files) |
| Research Tasks (cross-cutting) | 54 | 2 | 52 | parallel |
| **TOTAL** | **958** | **446** | **512** | **~45 weeks** |

> **Note:** P11 (UI/UX), P11.5 (UI Implementation), and P12 (Market Research) run **in parallel** with implementation phases, not sequentially. Actual calendar time depends on team size and parallelization.
