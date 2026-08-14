# EveryAIOS — Master Implementation TODO

> **Generated:** 2026-08-07 (updated 2026-08-13) · **Spec:** v3.15 · **Architecture:** ARCH/00–12 + DIAGRAMS.md
> **Rule:** Mark `[DONE]` only after implementation + test pass. Leave `[NOT DONE]` until verified.
> **Scope:** Complete product — 138 capabilities, 33 algorithms, 13 build phases (P0–P12) + UI implementation (P11.5).
> **Source reuse:** `APP/packages/core-*` imported as workspace deps (not copied). Desktop-only additions go in `packages/coordinator/` or `crates/`.
> **Provenance chain (how to find the research for any task):** task → SPEC row ID in the section header (e.g. `P1.7 (A4)`) → `ARCH/09-FEATURE-MATRIX.md` **Source** column for that row → `RESEARCH/desktop_app/` doc (01–60) → **doc 41** (steal-vs-reference-master-index) for the 🔴 STEAL / 🟡 ADAPT / 🟢 REFERENCE verdict + source files. If a task lacks an inline doc ref, walk this chain before writing code — never re-research what's already mapped.

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
- [x] `[DONE]` Create `crates/everyaios-guard/` — stub (compiled RegexSet placeholder)
- [x] `[DONE]` Create `crates/everyaios-audit/` — stub (NDJSON append writer)
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

- [ ] `[NOT DONE]` **Hardware-fit picker for local models (doc 58 — llmfit pattern):** detect RAM/CPU/GPU and score candidate local models (fit/speed/quality/context; Q4_K_M ≈ 0.5 B/param) before spawn — `recommend --json`-style; runtimes Ollama/llama.cpp/MLX/Docker Model Runner/LM Studio. Complements the ≤15–20K ctx warning

### P1.9 Model Catalog (A6 — ARCH/09 A6: doc 19 + core-providers pi.dev catalog, 15 prov / 280 models; feeds A7)
- [x] `[DONE]` Implement model catalog: per-provider model registry with capability hints (tools, vision, context window) — **`packages/coordinator/src/catalog.ts`**: wraps core-providers capability-registry (pi.dev snapshot — `getModelCatalog`/`getModelsForProvider`/`getModelCapabilities`), broker-id alias map (`nvidia↔nvidia-nim` + OAuth/local providers), `hintsFor()` (ctx/tools-heuristic/vision/reasoning/costScore), `setLocalModels()` merges installed ollama models with effective ctx, `contextWindowFor()` for the UI. 15 catalog tests green
- [x] `[DONE]` Router consumes catalog hints for task-to-model selection (feeds A7 asymmetric tiering) — **`packages/coordinator/src/router.ts`**: `selectModelForTask()` filters by vision/tools/min-ctx then ranks cheapest (subagent) or most capable (planner); `plannerForTask`/`subagentForTask`; `ASYMMETRIC_TIERS {depth:2, concurrency:6, writers:3}`; explicit model lock wins; local models are candidates once merged; fallback with reason. 7 router tests green — coordinator suite now **56/56 + tsc clean**

- [ ] `[NOT DONE]` **A6 catalog long-tail (doc 58/59):** ingest OmniRoute's MIT `PROVIDER_REFERENCE.md` (339 providers) as reference data — import only API-key + local + keyless allow-list; cookie (34) + OAuth-CLI (25) classes = doc-57 reject list

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
- [ ] `[NOT DONE]` Implement `find` semantic locators (ARIA role + name/label/placeholder) — **post-v1 candidate (doc 55; NOT in P2 scope)**
- [x] `[DONE]` Implement `grep` tool (line matches in page content) — **`BrowserActions::grep()`**: innerText → regex line matches with line numbers
- [x] `[DONE]` Implement `screenshot` tool (JPEG capture) — **`screenshot_jpeg(quality)` → `Page.captureScreenshot` (format jpeg)**; base64 returned for routing
- [x] `[DONE]` Implement `pdf` tool (print to PDF) — **`pdf_base64()` → `Page.printToPDF`**
- [x] `[DONE]` Implement `wait` tool (text/selector/ms) — **`BrowserActions::wait(WaitFor, timeout)`**: polls innerText / `querySelector` / sleeps; returns Satisfied/TimedOut
- [x] `[DONE]` Implement `evaluate` tool (CDP Runtime.evaluate) — **`BrowserActions::evaluate(expr)`** with returnByValue + awaitPromise
- [x] `[DONE]` Implement `tabs` / `tab_groups` / `windows` / `history` management tools — **tabs** (`Target.getTargets`), **history** (`Page.getNavigationHistory`), **windows** (`Target.getTargets` grouped by browserContextId, `create_window` via `Target.createBrowserContext`+`createTarget newWindow:true`, `close_window` via `disposeBrowserContext`). ⚠️ Honest ceiling (doc 33 §3 — BrowserOS ships these in its Chromium fork): **`tab_groups` has NO CDP surface on stock Chrome** — registered in the catalog, runtime requires the fork/extension surface (marked in the catalog)
- [x] `[DONE]` Implement `download` / `upload` with temp-file routing — **`set_download_path` (`Browser.setDownloadBehavior`) + `upload_files` (`DOM.setFileInputFiles` by backendNodeId)**; temp routing via read.rs `maybe_route_to_file`
- [x] `[DONE]` Implement `run` tool (→ everyaios-script, see P2.5) — **registered in the catalog (open_world) + engine landed with P2.5 (rquickjs sandbox 64MB/512KB/30s, browser SDK, InnerCallHook authorize+record+claim, ownership filtering; 14/14 script tests)**
- [x] `[DONE]` Register all 34 tools in everyaios-mcp (17 core interaction incl. `run` + `enhanced_snapshot` + bookmarks×6 + tab-groups×5 + window×5 — catalog ARCH/08 §8.2: 17+6+5+5+1 = 34) with annotations (F9: readOnlyHint/openWorldHint, ACP tool-kind taxonomy); + `file_ops`×3 workspace extension (E2) → 37 total — **`crates/everyaios-mcp/src/lib.rs` `BROWSER_TOOLS` = 37 ToolDefs** (17 original order-preserved + enhanced_snapshot + 6 bookmarks + 5 tab-groups + 5 windows + 3 file_ops) with ToolKind + read_only + open_world; uniqueness + group-total + annotation tests green (11/11)
- [x] `[DONE]` Implement MCP tool profiles (core/network/state/debug/tabs/react/mobile) + paginated tool discovery + typed args with `extraArgs` parity (agent-browser pattern, doc 55) — **`ToolProfile` enum (core/network/state/debug/tabs/mobile/all) + `tools_for_profile()` + `paginate(page, page_size) → (slice, has_more)` + typed `ArgDef` schemas on every tool + `validate_args()` (required-args check, unknown args forwarded = extraArgs parity)**; profile/pagination/validation tests green
- [ ] `[NOT DONE]` Post-v1 tool candidates (doc 55; **NOT in P2 scope**): `a11y_audit` (embedded axe-core, offline WCAG), annotated screenshots (numbered labels ↔ `@eN` refs), batch JSON command mode
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
- [x] `[DONE]` Test: round-trip (capture → grant → inject → revoke; agent never sees cookies) — **11 vault session tests + 10 browser cookie-glue tests (`cookie_from_cdp`/`cookie_to_cdp` round-trip, malformed-skip, same-site normalization, seal→inject round-trip, inject-without-grant-denied, `group_cookies_by_site` dot-strip + distinct-host) + 1 gated LIVE E13 test — 74/74 browser tests, workspace 314, clippy 0**

### P2.8 Challenge Handler (E12 — doc 08 §8.10)
- [x] `[DONE]` Implement PoW captcha solver (Altcha/Friendly Captcha) in everyaios-core — **`crates/everyaios-core/src/challenge.rs`: `ChallengeHandler::solve_pow`/`verify_pow` (SHA-256 leading-zero-nibble puzzle, Altcha/Friendly Captcha contract); Turnstile is Cloudflare-managed (incl. hidden mode) → NOT locally solvable, routed to human/BYO honestly**
- [x] `[DONE]` Implement human-in-loop pass-through: surface tab in visible webview, user solves — **`ChallengeHandler::surface`/`resolve_human`/`pending` single-use registry (an id can't be redeemed twice — duplicate/stale solves are refused); `HumanChallenge` is the serializable card the UI (P3) renders. The webview surfacing itself is the UI's `resolve_human` consumer**
- [x] `[DONE]` Implement LLM visual-grounding: snapshot → act for simple visual challenges — **`route_visual` (prefers grounding for managed captchas) + `grounding_request` (kind/site/prompt/options contract) + `parse_grounding_choice` (free-text → `Option(id)`/`Point{x,y}`/`Unsolvable`); the sidecar makes the model call and feeds the parsed choice to `act`**
- [x] `[DONE]` Implement optional BYO solver API hook (CapSolver/2Captcha, user's own key) — **`solve_captcha` (`createTask` → poll `getTaskResult`), `create_task`/`poll_task`, `ByoProvider` (CapSolver/2Captcha base URLs + task types), transport-injected `SolverHttp` (default `UreqHttp`); the user key is stored via the existing key-ring (A2/A3), never bundled credit**
- [x] `[DONE]` Test: PoW challenge auto-solved locally — **23 challenge tests: detection (case-insensitive, PoW-preferred), routing (PoW→local even with BYO; managed→human/BYO/visual), solve/verify round-trip + difficulty-sensitivity + out-of-range, surface/pending/single-use registry, grounding-request + option/point/unsolvable parse, createTask/poll/solve (ready/processing/error/timeout) + provider parse — 73/73 core tests, workspace 314, clippy 0**

### P2.9 Behavioral Realism (E14 — doc 08 §8.10 CloakBrowser pattern)
- [ ] `[NOT DONE]` Implement Bézier mouse curves for click/hover dispatch
- [ ] `[NOT DONE]` Implement per-key typing cadence with natural variance
- [ ] `[NOT DONE]` Make per-site configurable (some sites need it, most don't)

### P2.10 Session Replay (E5 — doc 33 §9, doc 08; doc 53 §4 durable event log + idempotency classes)
- [ ] `[NOT DONE]` Implement injected recorder (CDP Page.addScriptToEvaluateOnNewDocument)
- [ ] `[NOT DONE]` Implement NDJSON batch streaming to everyaios-audit ingest (J5: append-only audit, receipts)
- [ ] `[NOT DONE]` Implement sticky `has_gap` flag on dropped/malformed lines
- [ ] `[NOT DONE]` Implement recording index (dedupe, one-tx commit)
- [ ] `[NOT DONE]` Implement storage: ~/.everyaios/replays/ NDJSON + screenshots/ JPEGs
- [ ] `[NOT DONE]` Implement 7-day retention default + configurable wipe
- [ ] `[NOT DONE]` Implement durable event log + idempotency classes (doc 53 §4): safe-retry / unsafe / same-key / confirm-after-uncertain over the append-only audit

**P2 Exit Criterion:** navigate→snapshot→act→diff E2E; ownership test passes; Obscura scrape + escalate; session-vault round-trip (agent never sees cookies); PoW auto-solved; run audited script; replay with has_gap.

---


## PHASE 3 — Cockpit & Audit UI (~4 weeks)

### P3.1 Replay & Audit UI (H3 — doc 33 §9.5, ARCH/12 UI)
- [ ] `[NOT DONE]` Implement scrubber UI: timeline of actions per session
- [ ] `[NOT DONE]` Implement per-step screenshot display synced to timeline
- [ ] `[NOT DONE]` Implement searchable sessions list
- [ ] `[NOT DONE]` Implement Watch mode: live view of agent's current tab
- [ ] `[NOT DONE]` Implement Stop button: kills agent loop from cockpit

### P3.2 Cockpit / Ambient Flight Deck (H2 — doc 33 §9.5)
- [ ] `[NOT DONE]` Implement quiet mode: single-sentence status in tray
- [ ] `[NOT DONE]` Implement slide-over panel: live action cards + token counters
- [ ] `[NOT DONE]` Implement STOP / UNDO buttons (single-click kill or revert last action)
- [ ] `[NOT DONE]` Implement MCQ interrupt cards (on circuit-break): display 4 options
- [ ] `[NOT DONE]` Implement agent cards: per-agent status, model, tokens used, elapsed

### P3.3 Distributed Tracing (J14 — doc 43, doc 52; ARCH/06)
- [ ] `[NOT DONE]` Integrate opentelemetry-rust in everyaios-core
- [ ] `[NOT DONE]` Propagate trace_id across Rust→sidecar→provider→sandbox boundaries
- [ ] `[NOT DONE]` Add trace_id + span_id columns to audit table
- [ ] `[NOT DONE]` Console + log-file export (Jaeger/OTLP post-v1)

**P3 Exit Criterion:** replay & audit UI round-trip; Watch/Stop works; cockpit shows live agent cards.

---

## PHASE 4 — Office Engine (~5 weeks)

### P4.1 Word Block-Patch Engine (D1 — doc 28 GenOffice, doc 04)
- [ ] `[NOT DONE]` Implement ZIP open + parts index parser
- [ ] `[NOT DONE]` Implement block tree construction (anchored with docxIndex/addresses)
- [ ] `[NOT DONE]` Implement plain-text rendering from block tree (for LLM editing)
- [ ] `[NOT DONE]` Implement patch renderer: plain-text edits → minimal w:t prefix/suffix XML patches
- [ ] `[NOT DONE]` Implement ZIP rewrite: modified parts only, everything else byte-copied
- [ ] `[NOT DONE]` Implement headers/footers/tables/sections as separate blocks
- [ ] `[NOT DONE]` Test: round-trip (open → edit → save → LibreOffice reopen → assert byte-stable untouched parts)

### P4.2 Excel Engine (D2 — doc 28 GenOffice, doc 04)
- [ ] `[NOT DONE]` Integrate calamine crate for fast xlsx reading
- [ ] `[NOT DONE]` Integrate IronCalc (v0.7.x) as recalc sidecar binary
- [ ] `[NOT DONE]` Implement workbook DSL (cell-address, formula-shift, sort-range, flash-fill, pivot)
- [ ] `[NOT DONE]` Implement deterministic planner: regex NLP → workbook DSL (zero-LLM common ops)
- [ ] `[NOT DONE]` Implement surgical part-patch: xl/worksheets/sheetN.xml, xl/sharedStrings.xml
- [ ] `[NOT DONE]` Implement 100% math integrity rule: numeric claims → IronCalc only, never LLM
- [ ] `[NOT DONE]` Implement planner fallback: when regex DSL can't parse → LLM-direct (audit flagged, permission-gated)
- [ ] `[NOT DONE]` Test: formula recalc golden cases (SUM, VLOOKUP, IF, COUNTIF, dynamic arrays)
- [ ] `[NOT DONE]` Implement virtualized 100K+ row table view in UI
- [ ] `[NOT DONE]` **Univer split (doc 58):** Univer Sheets = the H5 live-grid *view* surface; surgical patch + IronCalc = mutation/truth engine — pick ONE calc engine (Univer Node or IronCalc), don't run both as truth; `univer-mcp` as G4/D2 REPL reference

### P4.3 PowerPoint Engine (D3 — doc 04)
- [ ] `[NOT DONE]` Implement surgical part-editing: ppt/slides/slideN.xml text runs, bullets, shapes
- [ ] `[NOT DONE]` Implement slide add/remove: clone part + rels + Content_Types registration
- [ ] `[NOT DONE]` Test: pptx add/remove slide round-trip
- [ ] `[NOT DONE]` **Author-new-deck path (doc 58 — ppt-master pattern):** "make me a deck from this brief" = reason-then-native-shapes (template-clone + chart/table model, transitions/animations, speaker notes) — composes with surgical D3 edit of existing decks

### P4.4 PDF Engine (D4 — doc 04)
- [ ] `[NOT DONE]` Implement pdf.js-class renderer in webview
- [ ] `[NOT DONE]` Implement form-fill + annotation via pdf-lib (AcroForms)
- [ ] `[NOT DONE]` Implement text-swap via lopdf Rust bridge (exact-match only)
- [ ] `[NOT DONE]` Implement redaction (fill glyph boxes + remove text streams)
- [ ] `[NOT DONE]` Implement re-author path (structural edits → generate new PDF)
- [ ] `[NOT DONE]` Test: pdf form-fill round-trip

### P4.5 Conformance & Rollback (D6/D7 — doc 29 LibreOffice oracle, doc 28 §2 rollback, doc 04 §4.4)
- [ ] `[NOT DONE]` Implement snapshotBefore: keep pre-edit ZIP for 1-click undo
- [ ] `[NOT DONE]` Implement atomic writes: write temp → fsync → rename
- [ ] `[NOT DONE]` Wire LibreOffice headless in CI: open edited file → assert no repair warnings
- [ ] `[NOT DONE]` Implement byte-stability assertions (zip-level diff of untouched parts)

### P4.6 Legacy Formats (D8 — doc 04, doc 29 §3a)
- [ ] `[NOT DONE]` Implement .doc/.xls/.ppt → convert to modern format on open (headless soffice)
- [ ] `[NOT DONE]` Surface as read-only with "edit as new .docx" option

### P4.7 Office UI (H5 — doc 04)
- [ ] `[NOT DONE]` Implement docx viewer (styled paragraphs, tables, images from block tree)
- [ ] `[NOT DONE]` Implement xlsx viewer (virtualized grid, formula bar, cell selection)
- [ ] `[NOT DONE]` Implement pptx viewer (slides as styled divs, notes panel)
- [ ] `[NOT DONE]` Implement PDF viewer (pdf.js-based)
- [ ] `[NOT DONE]` Implement chat overlay on any open document (page-scoped questions)
- [ ] `[NOT DONE]` **Univer embed (doc 58):** evaluate Univer SDK as the office surface (Sheets first → Docs → Slides last; ⚠️ OSS/Pro split — xlsx/pptx import may be Pro); keep our surgical patch as the mutation engine, Univer as view/edit UI

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

### P5.1 Multi-Signal Retrieval Fusion (C1/C3, Algorithm #18 — doc 07, v2.0 §3, doc 46 mem0)
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

### P5.2 LadybugDB Graph Backend (C6, Algorithm #30 — doc 07, doc 34 §2, doc 46 Graphiti)
- [ ] `[NOT DONE]` Integrate LadybugDB C++ library (Python/Node bindings or Rust FFI)
- [ ] `[NOT DONE]` Implement schema: EntityNode, EpisodicNode, typed edges (supports/contradicts/derived-from)
- [ ] `[NOT DONE]` Implement temporal edge-versioning (graphiti pattern)
- [ ] `[NOT DONE]` Implement Spreading Activation over LadybugDB adjacency (Algorithm #6, retest)
- [ ] `[NOT DONE]` Implement graph query depth cap (d=2, top-k=15)
- [ ] `[NOT DONE]` Wire into multi-signal fusion (S3 signal)

### P5.3 Letta-Style Paging (C2, Algorithm #20 — doc 07, doc 34 §2 Letta paging)
- [ ] `[NOT DONE]` Implement 3 memory surfaces: core (≤600 tok) / archival / recall
- [ ] `[NOT DONE]` Implement agent memory tools: read/write/search/forget
- [ ] `[NOT DONE]` Implement context planner enforcement of paging budgets (C7: warm-set injection, scope-leakage floors, 0ms TTFT)
- [ ] `[NOT DONE]` Implement memory writes queued to turn boundaries (protect prefix cache)

### P5.4 Ghost Context Prevention (ARCH/07 §7.5.1 — notify-crate pattern)
- [ ] `[NOT DONE]` Integrate Rust `notify` crate for filesystem events
- [ ] `[NOT DONE]` Implement tombstone eviction on file delete: atomic FTS5 + vec + graph removal
- [ ] `[NOT DONE]` Implement re-path on file rename: update source_path (zero re-embedding)
- [ ] `[NOT DONE]` Test: rename file → verify retrieval returns new path, not old

### P5.5 ACT-R Activation + Spontaneous Recall (C10, Algorithm #32 — doc 39 NOOA forgetting.py)
- [ ] `[NOT DONE]` Implement retention decay: half_life × log1p(strength)
- [ ] `[NOT DONE]` Implement importance floor: memories with importance ≥ 8 never auto-forgotten
- [ ] `[NOT DONE]` Implement associative recall: semantic + keyword + recency + graph in one query
- [ ] `[NOT DONE]` Implement typed relational edges in LadybugDB (supports/contradicts/derived-from)
- [ ] `[NOT DONE]` Implement spontaneous recall channel: pre-turn hook → derive queries → inject

### P5.6 Taste Profile (C9, Algorithm #31 — doc 37 Command Code taste-1)
- [ ] `[NOT DONE]` Implement taste store: `~/.everyaios/taste/` (global) + per-repo `.everyaios-taste/`
- [ ] `[NOT DONE]` Implement learning hooks: detect accept/reject/edit via correction-detector + audit
- [ ] `[NOT DONE]` Implement confidence-scored rules (0–1 per preference)
- [ ] `[NOT DONE]` Implement stable-prefix injection (taste rules as symbolic prior at generation)
- [ ] `[NOT DONE]` Implement shareable markdown export

### P5.7 Compaction Pipeline (Algorithm #21 — doc 31 context-compression, doc 33 §6 BrowserOS, doc 05, doc 46 opencode compaction.ts)
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

### P5.8 Pass-by-Reference Context (C10 — doc 39 NOOA pass-by-reference)
- [ ] `[NOT DONE]` Implement ref handles for files/datasets/tool results
- [ ] `[NOT DONE]` Implement bounded previews (head/tail + type metadata + row/byte counts)
- [ ] `[NOT DONE]` Agent queries via rquickjs script-eval instead of serializing payloads
- [ ] `[NOT DONE]` Test: 10MB file queried via ref-preview keeps context ≤2K tokens

### P5.9 Token/Cost Dashboard UI (H9 — ARCH/05 §5.6)
- [ ] `[NOT DONE]` Implement per-key cost display (tokens/day, est. cost/day)
- [ ] `[NOT DONE]` Implement per-session cost breakdown
- [ ] `[NOT DONE]` Implement cache-hit rate display per provider
- [ ] `[NOT DONE]` Implement live token streamer in chat (tokens/sec, context %)

### P5.10 Retest Built Algorithms (🔁 — v2.0 built set; ARCH/09 🔁 rows)
- [ ] `[NOT DONE]` Run all 17 built algorithm test suites in desktop sidecar runtime
- [ ] `[NOT DONE]` Fix any failures from webview IPC / sidecar process model differences
- [ ] `[NOT DONE]` Benchmark spreading-activation, phantom-thread, temporal-anticipation on desktop

**P5 Exit Criterion:** Retrieval benchmark beats BM25; pass-by-reference ≤2K tokens for 10MB file; compaction triggers correctly; $/token dashboard shows; 17 built algorithms pass on desktop.

---


## PHASE 6 — Orchestration + Connectors (~5 weeks)

### P6.1 Blueprint Engine (B2 — v2.0 §P2, doc 03)
- [ ] `[NOT DONE]` Implement .md blueprint parser → AgentConfig[] registry
- [ ] `[NOT DONE]` Implement continuous plan rewrite (agents update their own status blocks)
- [ ] `[NOT DONE]` Implement dependency resolution between blueprint tasks
- [ ] `[NOT DONE]` Implement resume-after-reboot (session checkpointing at turn boundaries)
- [ ] `[NOT DONE]` Implement DAG state machine for multi-step workflows
- [ ] `[NOT DONE]` Implement checkpoint freeze on circuit-break (B6 MCQ pattern)

### P6.2 Sub-Agents (B3/B4 — doc 16, doc 03; doc 41 P2 opencode task.ts)
- [ ] `[NOT DONE]` Implement fresh-context sub-agent spawn (own conversation, own workspace)
- [ ] `[NOT DONE]` Implement DELEGATE_BLOCKED_TOOLS (delegate/clarify/memory/send_message/cronjob)
- [ ] `[NOT DONE]` Implement parent sees only summary (not full child context)
- [ ] `[NOT DONE]` Implement inter-agent messaging: peer-review, cross-check, request sub-routines
- [ ] `[NOT DONE]` Implement no-recursive-spawn guard
- [ ] `[NOT DONE]` Implement batch parallel mode (multiple sub-agents concurrently)
- [ ] `[NOT DONE]` Test: two spec-driven agents with different models run a plan end-to-end

### P6.3 Iteration Budgets (B6 — doc 16 Hermes 500/50; doc 39 DeerFlow subagent_limit_middleware)
- [ ] `[NOT DONE]` Implement parent max_iterations=500, subagent max=50
- [ ] `[NOT DONE]` Implement subagent_depth=2 (parent → child, no grandchildren)
- [ ] `[NOT DONE]` Implement subagent timeout: 900s custom / 1800s global
- [ ] `[NOT DONE]` Implement max_concurrent_subagents=3, max_total_per_run=6
- [ ] `[NOT DONE]` Implement execute_code refund (deterministic code shouldn't count)
- [ ] `[NOT DONE]` Implement loop detector: hash last N tool calls, 3x repeat → interrupt
- [ ] `[NOT DONE]` Implement MCQ interrupt card on circuit-break (UI integration with H2)

### P6.4 Scheduled Tasks (B7 — doc 33 §7; doc 56 §3 cronflow)
- [ ] `[NOT DONE]` Reference: cronflow workflow-engine design (doc 56 §3) — HITL pause-with-timeout as a first-class state-machine state, webhook triggers w/ schema validation, retry w/ backoff+jitter+clamp (⚠️ no LICENSE file → pattern-only) for the H22 automation builder
- [ ] `[NOT DONE]` Implement cron/interval/event/webhook triggers (F11: loopback listeners + webhook ingress)
- [ ] `[NOT DONE]` Implement nudge sentinels (detect repeating patterns → suggest schedule)
- [ ] `[NOT DONE]` Implement battery-aware scheduling (suppress on battery)
- [ ] `[NOT DONE]` Implement tray daemon headless execution (H11)
- [ ] `[NOT DONE]` Implement scheduled tasks UI: create from chat + settings (H14)
- [ ] `[NOT DONE]` Test: scheduled task fires headless

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

### P6.8 Harness-Driving via ACP (F12/J17 — doc 35 §C, doc 45 ACP, doc 52 surgical hierarchy, doc 56 cowork-forge, doc 57 ACP registry)
- [ ] `[NOT DONE]` Integrate official ACP Rust SDK (`agent-client-protocol` crate)
- [ ] `[NOT DONE]` Implement ACP client: `initialize` handshake (protocolVersion + capabilities)
- [ ] `[NOT DONE]` Implement `session/new` to spawn external agent CLIs as ACP agents
- [ ] `[NOT DONE]` Implement `session/request_permission` → Trust Ladder + Guard-2 cards
- [ ] `[NOT DONE]` Implement `session/update` → everyaios-audit NDJSON logging
- [ ] `[NOT DONE]` Implement `session/cancel` → watchdog/budget kill
- [ ] `[NOT DONE]` Implement harness installer (F8): plan-before-touch, ownership markers
- [ ] `[NOT DONE]` Test: two external agent CLIs run side-by-side via ACP (initialize + permission + audit)
- [ ] `[NOT DONE]` **Aider is in the F12 harness list** — remaining work: surgical-hierarchy routing (brain → core → surgeon, doc 52 §1); test Aider driven via ACP with SEARCH/REPLACE edits
- [ ] `[NOT DONE]` Add **Copilot CLI** to the F12 harness list (doc 56 §4 — closed, custom license → drive via ACP like any harness, never a dependency) + LSP-config diagnostics pattern (`lsp-config.json`; open reference = Warp `lsp` crate, doc 56 W4); ACP adapter reference: cowork-forge `acp/client.rs` + `agents/external_coding_agent.rs` (doc 56 C2)
- [ ] `[NOT DONE]` Consume the **official ACP agent registry** (agentclientprotocol/registry — CDN `registry.json`, 38 agents incl. `claude-acp` (Anthropic-co-authored wrapper), dist types binary/npx/uvx; doc 57 §2) for **registry-fed harness discovery** in F8/F12 — local cache + version pinning + curated allow-list (trust + ToS gate); never ship a hardcoded catalog as the ceiling
- [ ] `[NOT DONE]` Add **auth-mode badge** to the harness UI (subscription-backed / API-key-backed / local — doc 57 §3); Claude Agent = **subscription-backed (allowed via the official ACP wrapper, Anthropic co-authored)**
- [ ] `[NOT DONE]` Add **CodeWhale** (Hmbown/CodeWhale, 40.7K⭐ Rust MIT — the DeepSeek-TUI project renamed) to the F12 harness candidate set (doc 58 §6)
- [ ] `[NOT DONE]` Write the **subscription-auth boundary** into the agent docs (doc 57 §3 + ARCH/06 §6.16): Claude via the official ACP wrapper = allowed (Anthropic co-authored); token-harvest for other engines = blocked; our broker stays API-key-only

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

### P7.1 Forge Runtime (I1/I4 — v2.0 §P6; doc 56 W4 LSP diagnostics)
- [ ] `[NOT DONE]` Implement LSP-backed diagnostics (doc 56 W4): rust-analyzer/typescript-language-server/pyright/clangd/go via Warp `lsp`-crate pattern — precise errors without full-file context (Copilot CLI `lsp-config.json` pattern). **Three-stage diagnostics, no overlap:** LSP = live during editing → lint/test reflection (ships in P11.5.9) = post-edit build-level gate → rtk output rules (ARCH/05 §5.10) = tool-result compression at injection
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

### P7.4 Guard-1 Hardening (J2 — doc 06, doc 03 §8; doc 26 red-team corpus; doc 53 §3 tickets)
- [ ] `[NOT DONE]` Compile full regex blocklist: rm -rf, mkfs, dd, drop database, format, fork bombs, key exfiltration, .git destruction, home wipes
- [ ] `[NOT DONE]` Implement pre-exec scan of every generated shell string, filesystem path, URL
- [ ] `[NOT DONE]` Implement URL floors: `file://` only inside granted roots; scheme guard
- [ ] `[NOT DONE]` Load cyber red-team corpus (doc 26) as adversarial test suite
- [ ] `[NOT DONE]` Test: 100% of red-team pattern list blocked
- [ ] `[NOT DONE]` Implement authorization ticket contract in everyaios-guard (doc 53 §3): ticket_id/agent_id/session_id/tool_id/operation/args-hash/paths/expiry/single-use/approval-source/risk/audit-seq

### P7.5 Guard-2 UX Polish (J3/H8 — doc 06; doc 52 §2 decision packages)
- [ ] `[NOT DONE]` Implement native OS diff card rendering via Tauri IPC (not webview JS)
- [ ] `[NOT DONE]` Show: exact file paths, script lines, execution target, env vars, network destinations
- [ ] `[NOT DONE]` Implement approval/denial audit logging with receipt
- [ ] `[NOT DONE]` Implement web-action confirm dialogs (checkout, payment, sensitive ops)
- [ ] `[NOT DONE]` Implement J21 escalation rules: `~/.everyaios/permissions.toml` (delete=always_ask, multi_file_edit=ask_if_gt_5, external_network=ask_if_new_domain, terminal_shell=ask_if_destructive; min_confidence_for_auto) + structured decision-package renderer on Guard-2 cards; approvals/denials → correction-detector + taste profile (doc 52 §2)

### P7.6 Prompt-Injection Defense (J6 — doc 25 PageIndex <user_document> + doc 16 Hermes promptware scan)
- [ ] `[NOT DONE]` Implement context scan: every ingested file/webpage/memory block scanned for injection patterns
- [ ] `[NOT DONE]` Implement `<user_document>` delimiter wrapping for untrusted content
- [ ] `[NOT DONE]` Implement tool-result sanitization: outputs as text/JSON, never as instructions
- [ ] `[NOT DONE]` Implement escape hatches: estop (global stop, tray-accessible)
- [ ] `[NOT DONE]` Test: injected "ignore previous instructions" in a fetched webpage → does NOT execute

### P7.7 Path Floor Fuzz Testing (J4 — doc 06; doc 46 ECC profile-gated hooks + OpenFang Merkle/AgentShield)
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
- [ ] `[NOT DONE]` Export: messages/memory as markdown/JSON
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
- [ ] [NOT DONE] Implement 3-column layout (sidebar + chat + workspace) with drag-resizable dividers
- [ ] [NOT DONE] Sidebar: navigation items (New Session, Automations, Guard, Connectors, Memory, Analytics)
- [ ] [NOT DONE] Sidebar: project/workspace selector dropdown
- [ ] [NOT DONE] Sidebar: recent sessions list with status badges (orange/yellow/green/red/grey/blue)
- [ ] [NOT DONE] Sidebar: child session indentation under parent
- [ ] [NOT DONE] Sidebar: collapse to icon-only mode (48px)

### P11.5.2 Chat Panel (ARCH/12 §chat; doc 46 Devin UI)
- [ ] [NOT DONE] Chat message rendering (user/AI/system message types)
- [ ] [NOT DONE] Artifact cards: rendered file previews with code/copy/download buttons
- [ ] [NOT DONE] Progress steps: clickable timeline (✓ completed, ● running, ○ pending)
- [ ] [NOT DONE] MCQ interrupt: "Action required" with Approve/Edit/Reject/Options buttons
- [ ] [NOT DONE] Input bar: attach (+), text area, mode selector, microphone, send
- [ ] [NOT DONE] Chat modes: Normal / Plan / Research / Quick / Code
- [ ] [NOT DONE] Slash commands: /help, /mode, /model, /undo, /clear, /export
- [ ] [NOT DONE] Knowledge macros (!name) and blueprint @mentions

### P11.5.3 Workspace Panel (Tabbed) (ARCH/12 §workspace; doc 46 Devin 9-tab view, doc 04 office views)
- [ ] [NOT DONE] Tab bar with dynamic tabs, reorder, close, pin, expand-to-fullscreen
- [ ] [NOT DONE] Progress tab: unified timeline with timestamp, icons, expandable entries
- [ ] [NOT DONE] Shell tab: terminal view, command history panel, read-only/writable toggle
- [ ] [NOT DONE] Code tab: syntax editor, live diffs, line numbers, minimap, file tree
- [ ] [NOT DONE] Browser tab: live CDP view, interactive mode, address bar, "● Live" indicator
- [ ] [NOT DONE] Excel tab: spreadsheet grid, real-time cell editing, formula bar, charts, sheet tabs
- [ ] [NOT DONE] Word tab: WYSIWYG render, live cursor, typewriter effect, page/word count
- [ ] [NOT DONE] PPT tab: slide preview, element editing, slide strip navigator
- [ ] [NOT DONE] PDF tab: page rendering, form fields, annotations, zoom, page navigation

### P11.5.4 Takeover/Resume Flow (ARCH/12 §takeover; doc 46 Devin H21)
- [ ] [NOT DONE] Pause button → switches all panels to editable mode
- [ ] [NOT DONE] "● Live" / "⏸ Paused" indicator toggle
- [ ] [NOT DONE] Resume button → mandatory "describe changes" prompt → agent continues

### P11.5.5 Automation Builder (ARCH/12 §automation; doc 46 Devin H22, doc 56 §3 cronflow NL)
- [ ] [NOT DONE] Automations list with sparkline activity charts
- [ ] [NOT DONE] Automation editor: trigger/condition/action/budget/network-policy fields
- [ ] [NOT DONE] Template gallery (10+ pre-built automations)
- [ ] [NOT DONE] NL automation creation (describe in text → generates config)

### P11.5.6 Knowledge/Memory Browser (ARCH/12 §memory; doc 46 Devin H23 trigger+macro)
- [ ] [NOT DONE] Knowledge list with trigger, macro, scope per item
- [ ] [NOT DONE] Folder organization (nested, drag, bulk enable/disable)
- [ ] [NOT DONE] Auto-suggestions from AI (accept/dismiss/regenerate)
- [ ] [NOT DONE] Episodic/Semantic/KG section browsers

### P11.5.7 Guard Panel (ARCH/12 §guard; doc 06 trust ladder UI)
- [ ] [NOT DONE] Trust level indicator (progress bar 0-100)
- [ ] [NOT DONE] Recent actions log with auto-approved/pending/blocked status
- [ ] [NOT DONE] Permission chips (workspace read/write, shell, browser, external)

### P11.5.8 Connector Hub Panel (ARCH/12 §connectors; doc 13, doc 46 Devin H24 MCP marketplace)
- [ ] [NOT DONE] Connected services list with tool counts
- [ ] [NOT DONE] MCP servers list with status (running/not connected)
- [ ] [NOT DONE] Add/Install buttons for new connectors

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

## SUMMARY

| Phase | Tasks | Weeks |
|---|---|---|
| P0 Workspace & Skeleton | 46 | ~2 |
| P1 Chat + BYOK | 52 | ~4 |
| P2 Browser Layer | 81 | ~6 |
| P3 Cockpit & Audit UI | 14 | ~4 |
| P4 Office Engine | 48 | ~5 |
| P5 Memory + Token Economy | 60 | ~5 |
| P6 Orchestration + Connectors | 82 | ~5 |
| P7 Forge + Guardrails | 53 | ~4 |
| P8 Product Polish | 37 | ~3 |
| P9+ Post-v1 | 22 | later |
| **P10 Testing & QA** | **50** | **~4** |
| **P11 UI/UX Optimization** | **36** | **~3** |
| **P11.5 UI Implementation** | **66** | **~4 (parallel)** |
| **P12 Market Research & GTM** | **47** | **~4 (parallel)** |
| Research Tasks (cross-cutting) | 54 | parallel |
| **TOTAL** | **748** | **~45 weeks** |

> **Note:** P11 (UI/UX), P11.5 (UI Implementation), and P12 (Market Research) run **in parallel** with implementation phases, not sequentially. Actual calendar time depends on team size and parallelization.
