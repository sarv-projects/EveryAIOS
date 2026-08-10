# 33 — BrowserOS (browseros-ai/BrowserOS) Source Deep-Dive: The Agent Browser

> Fetched live 2026-08-06 via **shallow git clone** (`/tmp/browseros-deep`, 344MB, 3,248 tracked files / 3,243 present — only 5 LFS media files missing). Depth: **⬛ code-level** — the README/docs claim in doc 30 §3 is now superseded by source reads of the monorepo, the Rust workspace, the Bun server, and the Chromium-fork build manifest.
> ⚠️ **License: AGPL-3.0** (plus a separate `LICENSE.ungoogled_chromium` for the fork base). We **learn the architecture, never copy code** into a MIT/Apache project. Everything below is a *design* map + what-to-steal *conceptually*.
> ⚠️ Honest limits: (a) the **recording-capture side lives inside the Chromium checkout** (`chrome/browser/browseros/*`, applied as patches at build time) — its `.cc`/`.ts` are **not in this repo**, so capture internals are inferred from the ingest contract + `.features.yaml` paths, not source-read; (b) the private `.internal-docs` submodule is unreachable (git@ URL); (c) `packages/archive/` unexamined.

---

## §0 The repo at a glance

| Field | Value |
|---|---|
| URL | `https://github.com/browseros-ai/BrowserOS` |
| ⭐ | **12,933** (was 12,931 in doc 30; re-verified this pass) |
| License | **AGPL-3.0** + `LICENSE.ungoogled_chromium` (fork base) + `CLA.md` (contributor license agreement — they run a controlled community) |
| Default branch / size | `main` · 199,114 KB (~200MB tree) |
| Products | **BrowserOS** (consumer "second browser") and **BrowserOS neo** (the agent browser, formerly *BrowserClaw* — docs/`~/.browserclaw/` keep the old name) |
| Docs site | Mintlify (`docs/docs.json`, theme `maple`) — all docs are **in-repo**, which is why we could verify feature claims against source |

**Positioning (their own words):** *"A second browser for your AI agents. Import your logins from Chrome in one click, connect Claude Code, Codex, Cursor, or any MCP agent, hand off web tasks. Agents run in parallel in their own tabs. You watch live, or replay any session like a video."*

---

## §1 Monorepo map (source-verified)

```
BrowserOS/
├── packages/
│   ├── browseros/           # The Chromium fork + bos_build release system (Python)   [§3]
│   ├── browseros-agent/     # The agent platform: Rust crates + Bun server + extension [§4-§8]
│   └── archive/             # (unexamined)
├── docs/                    # Mintlify docs — neo/, features/, comparisons/, integrations/
├── updates/                 # Appcast XML feeds (Sparkle for mac, custom for server/extensions)
├── tools/ · signatures/     # build helpers + minisign signatures
```

`browseros-agent/` is itself a monorepo with **two parallel toolchains**:

```
packages/browseros-agent/
├── crates/                      # RUST workspace (edition 2024, rust 1.94, [lints] unsafe_code = "deny")
│   ├── browseros-cdp/       747 LOC   # CDP WebSocket client + generated protocol types
│   ├── browseros-core/    5,019 LOC   # snapshot/diff/input/observer/navigation engine
│   ├── browseros-mcp/     2,989 LOC   # the MCP tool catalog (17 tools) + framework
│   ├── claw-api/         (generated)  # pure-serde API contract shared with the dashboard
│   └── harness-integrations/ 791 LOC  # one-click MCP install into 7 AI harnesses + skills reconciler
├── apps/
│   ├── claw-server-rust/  14,022 LOC  # neo backend: axum HTTP API + rmcp MCP server  [§4]
│   ├── server/ (Bun)               # agent loop + chat + 53+ MCP tools (legacy/main product) [§7]
│   ├── app/ (WXT + React)          # the browser extension UI (new tab, side panel chat)
│   ├── claw-app/ (WXT + React)     # neo dashboard extension (watch / replay / audit)
│   ├── claw-onboard/               # first-run onboarding flow
│   └── cli/ (Go)                   # terminal control + self-update
├── packages/ (TS, bun workspace)
│   ├── cdp-protocol/       # auto-generated type-safe CDP bindings (per-domain + protocol-api)
│   ├── browser-core/       # TS twin of browseros-core (BrowserSession, Observer, Input…)
│   ├── browser-mcp/        # TS twin of browseros-mcp (MCP server, registry, output-file)
│   ├── shared/             # constants: ports, timeouts, limits, exit codes, schemas (llm, browser-context)
│   ├── acpx-ai-provider/   # MIT inlined from DaniAkash/agent-toolkit — AI SDK provider over ACP
│   ├── agent-mcp-manager/  # MIT inlined from agent-toolkit — add/link/unlink MCP across agents
│   ├── claw-api / claw-api-client / build-server-tools / onboarding-video
└── config.sample.json · contracts/ · process-compose.yaml · third_party/
```

**Key insight:** the Rust crates (`browseros-core`/`browseros-mcp`) and the TS packages (`browser-core`/`browser-mcp`) are **parallel implementations of the same engine** — the Rust side powers neo (claw-server-rust), the TS side powers the Bun server. Same snapshot/diff/refs design in both languages → the design is the product; language is incidental.

---

## §2 Architecture in one picture

```
┌──────────────────────────────────────────────────────────────────────┐
│              Chromium 148.0.7778.97 fork (packages/browseros)        │
│   • chrome/browser/browseros/* : native browser_os API, onboarding,  │
│     metrics, extension installer/loader, embedded server resources   │
│   • bundled_extensions : the app UI, chat side panel, dashboard      │
│   • chrome/utility/importer/browseros : Chrome history/autofill/     │
│     password importers  • sparkle/winsparkle self-updaters           │
└───────────────▲───────────────────────────────────────┬──────────────┘
                │ CDP (server connects to 127.0.0.1:49337/9000)
                │ recording NDJSON (x-recording-* headers)  screenshots
┌───────────────┴───────────────────────────────────────▼──────────────┐
│   claw-server-rust (neo)  ·  port 9200                               │
│   • HTTP API: audit/cockpit/live/previews/sessions/settings/system   │
│   • rmcp MCP server: /mcp (Streamable HTTP) + stdio mode             │
│   • guards → effects → observers pipeline per tool call              │
│   • sea-orm SQLite: sessions, tool_dispatches, recordings, tab_claims│
└───────────────▲───────────────────────────────────────┬──────────────┘
                │ MCP (Streamable HTTP / SSE / stdio)
┌───────────────┴───────────────┬───────────────────────▼──────────────┐
│  AI harnesses (7, one-click):  │  Bun server (apps/server, :9100)    │
│  Claude Code · Codex · Cursor  │  • AI SDK agent loop + compaction   │
│  OpenCode · Antigravity · VS   │  • OAuth BYOK (ChatGPT/Copilot/Qwen)│
│  Code · Zed  (harness-        │  • Klavis connector proxy (40+ apps)│
│  integrations crate)           │  • filesystem Cowork tools          │
└───────────────────────────────┴──────────────────────────────────────┘
```

Everything user-side is local (`~/.browserclaw/`, ports on 127.0.0.1). **One cloud dependency found:** the 40+ app integrations (Gmail/Slack/GitHub…) route through a hosted **Klavis** proxy → see §7.7 (honesty flag).

---

## §3 The Chromium fork — what they actually changed

**Version:** `MAJOR=148 MINOR=0 BUILD=7778 PATCH=97`, base commit `6b3fa66a…` (ungoogled-chromium lineage, hence `LICENSE.ungoogled_chromium` + `series_patches/ungoogle-chromium/`).

### 3.1 Patch-as-files model (not .patch diffs)
`chromium_patches/` mirrors **Chromium source paths** with full checked-in modified files (e.g. `components/search/ntp_features.cc`, `chrome/common/pref_names.h`). The definitive feature manifest is **`.features.yaml`** — layered, ordered, self-documenting:

- **LAYER 0** build-resources: the fork **embeds the server binaries as Chromium resources** — `chrome/browser/browseros/{claw_server,server,onboarding}/resources/`. This is why the comparison page says *"Architecture: built into the browser"* vs Chrome DevTools MCP's external process.
- **LAYER 1** browseros-core (prefs/switches/product identity, shared command IDs, toolbar), branding (dock icons, vector icons, about page), browserclaw-product-dir (**per-product user-data roots** via `browseros_product` buildflag — BrowserOS ≠ BrowserClaw data).
- **LAYER 2** windows-patches, crash-reporter branding.
- **LAYER 3** **mac-sparkle-updater + winsparkle** (self-update, Sparkle appcast feeds live in `updates/`), `server` feature, `metrics` (fork-side `browseros_metrics_handler.cc` + histograms).
- **LAYER 4** `api`: the **native extension API** `chrome/browser/extensions/api/browser_os/` — `browser_os_api.cc` + **`browser_os_change_detector.cc`** + `browser_os.idl` + side-panel service + toasts. This is the native bridge the bundled extensions use to control tabs.
- **LAYER 5+** ota-updater (extensions OTA update), **chrome-importer** (the one-click Chrome login import), first-run, onboarding-import, **llm-chat** (native LLM chat side panel), pin-chat, pin-extensions-toolbar, flags, keyboard-shortcuts, **vertical-tabs**, chromium-urls, agent-v2-infobar, **cdp-api** (fork-level CDP exposure), chromium-ui-fixes, cdp-fixes, side-panel-fixes.

### 3.2 The Chrome profile importer (source-verified)
`chromium_patches/chrome/utility/importer/browseros/`: `chrome_history_importer.cc`, `chrome_autofill_importer.h`, `chrome_password_importer.cc`, `chrome_decryptor.cc` — **this is how "import your logins from Chrome in one click" works**: a native importer utility process. (Behavior — reads another Chrome profile's history/autofill/passwords and decrypts saved credentials — is inferred from these file names + the docs' one-click claim; the importer source itself is not in this repo and was not read.) Our spec's auth-wall answer (docs 12/13 OAuth hub research) can reference this pattern — but it's Chrome-profile-level, not OAuth.

### 3.3 bos_build — the composable release pipeline (Python)
`bos_build/` is a uv-managed Python CLI. Mental model (from README, source-verified): *"preset + product + platform + arch + switches → ordered list of steps"*. Local build vs **release** = GitHub workflow → R2 upload → staged update feeds → human promotes. Products: `browseros` vs `browserclaw` (`chromium_files/products/<id>/` branding). Patch-stack health check: `browseros dev doctor`. Signature + update feeds under `updates/` (appcast XML for browser/server/extensions; minisign keys in `signatures/`).

---

## §4 claw-server-rust — the neo backend (14K LOC, source-read)

### 4.1 Config (source-read)
- Ports: **server 9200** (default; the MCP URL `http://127.0.0.1:9200/mcp`), **CDP 49337** (dev config uses 9000), optional proxy port.
- Session lifecycle: idle 30 min · retention 60 min (keep agent-opened tabs inspectable) · sweep every 60 s · **replay retention 7 days**.
- Data dir `~/.browserclaw/` (dev: `.browserclaw-dev`); **`auth_token: Option<String>`** — the MCP/HTTP endpoint can be token-gated (local auth we should replicate).
- Logs: rolling daily in `~/.browserclaw/logs/claw-server.log`, non-blocking appender.
- CLI: `--version` / `--config <path>` / `--stdio` (MCP over stdio for non-HTTP harnesses).

### 4.2 HTTP API surface (source-verified from `src/api/http/`)
`audit.rs` · `cockpit.rs` (dashboard stats) · `connections.rs` · `live.rs` (live session state) · `previews.rs` (live preview tiles) · `recordings.rs` (NDJSON ingest) · `replay.rs` (recording metadata + event download) · `screenshots.rs` · `sessions.rs` (list/detail/cancel) · `settings.rs` (telemetry on/off) · `system.rs` (health/info/capabilities/shutdown). This is a **complete REST dashboard contract** (`claw-api` generated models: `SessionDetail`, `SessionSummary`, `ToolEvent`, `LiveSessionState`, `RecordingMetadata`, `AuditStorageState`, `CockpitStats`, `SessionTokenUsage`…).

### 4.3 The MCP layer — the interesting design (source-read)
`src/api/mcp/` is a **pipeline architecture** around every tool call:

- **dispatch.rs** — `ToolCall` carries session/identity/ownership + a **linked `CancellationToken`** (session cancel and client cancel follow the same protocol-error path — no orphaned effects). `ARBITRARY_SCRIPT_TOOLS = ["run", "evaluate"]` are flagged specially.
- **guards/** — `browser_connected`, `navigate_scheme` (reject dangerous schemes), `page_ownership` (reject touching another agent's/user's page). Guards run **before** effects.
- **effects/** — `ownership_claims`, `session_naming`, `tab_activity`, `tab_groups`, `tabs_list_view`: side effects like **claiming pages an agent opens**, auto-grouping tabs as `<client>/<name>`.
- **observers/audit.rs** — after every dispatch, a bounded audit event is built (maxes: identity 512, tool name 128, target 512, URL 4096, title 1024) and pushed to an **audit worker**. Every dispatch gets **token estimates** (`estimate_tool_input_tokens` / `estimate_tool_output_tokens`, `TOKEN_ESTIMATOR_VERSION`).
- **service.rs** — `SERVER_NAME = "browserclaw"`, `SERVER_TITLE = "BrowserOS neo"`; a synthetic **`name_session`** tool (2–3 word lowercase label → tab group title); **ClientIdentity resolution** (Profile vs Ephemeral) from MCP `clientInfo` — multi-agent attribution without accounts.
- **script_hook.rs / prompt.rs** — `BROWSERCLAW_MCP_INSTRUCTIONS` injected system prompt + a host hook for script tools (see §6.3).

### 4.4 Persistence (source-verified schema)
Sea-orm entities: `agent_session_starts/ends`, `tool_dispatches`, `recording_streams/batches/payloads`, `tab_claims`, `tab_recordings`, `session_tabs`, `tasks`, `audit_log`, `session_efficiency_stats`. Every row is insert-once + bounded — **the audit trail is append-only** (matches our doc 03 §8 trust-ladder audit requirement).

---

## §5 browseros-cdp + browseros-core — the control engine

### 5.1 browseros-cdp (747 LOC)
CDP WebSocket client: discovery (loopback-only hosts `127.0.0.1/localhost/[::1]` — **hard loopback guard**), session-per-target routing, `sha2` in build.rs (protocol file integrity), generated protocol types from a pinned `protocol.json`.

### 5.2 browseros-core (5,019 LOC) — the snapshot/diff brain
- **snapshot/render.rs** — renders the page as an **indented accessibility tree** (`AxNode`), every actionable element gets a **stable `[ref=eN]`**, **iframes stitched inline** at their placeholder line, depth-capped (1..=100), `Full` vs `Interactive` modes. This is their "context = tree, not HTML".
- **snapshot/diff.rs** — line-level diff of two snapshots with `+n added, -n removed` gutter, collapse to context radius 3, plus **URL-change detection**: on known URL change the "diff" returns the full new snapshot flagged `url_changed` (avoids garbage diffs across navigations).
- **observer.rs** — per-page observer with **multi-frame capture** (max frame depth 5, `MAX_STABLE_CAPTURE_ATTEMPTS 3`, capture budget + stage tracing), baseline → observation → diff lifecycle; refs are scoped to (document_id, url) so refs never leak across navigations.
- **input/** — mouse/keyboard via CDP `Input.dispatchMouseEvent`/`dispatchKeyEvent` with `geometry.rs` (element → point resolution from the a11y snapshot).
- **content_markdown.rs** — injected `assets/content-markdown.js` DOM walker → clean markdown with selector/viewport/links/images options. **This is their read-the-page-as-markdown path** (same idea as firecrawl/browser-use, but in-process).

---

## §6 browseros-mcp — the tool catalog + the `run` paradigm

### 6.1 The 17 Rust-neo tools (source-verified registry) — note: the Bun server ships a wider 53+ tool set (README-verified); the counts are different surfaces, not a conflict
`tabs` · `tab_groups` · `history` · `navigate` · `snapshot` · `diff` · `act` · `download` · `upload` · `read` · `grep` · `screenshot` · `pdf` · `wait` · `windows` · `evaluate` · `run`.

Tool framework (framework.rs): schemars JSON-schema inputs, `ToolAnnotations::read_only(true)` / `open_world(true)` (MCP tool annotations — clients like Claude Code honor read-only hints), **`OutputFileAccess`** (a `HashSet<PathBuf>` gate for large tool outputs → written to temp files instead of the context), `CancellationToken` cancel, and the **`InnerCallHook`** (see 6.3).

### 6.2 The loop pattern (their docs + tool descriptions)
`snapshot → act → (act reads back a post-settle diff) → re-snapshot only for fresh refs`. `act` kinds: click/click_at/type/type_at/fill/press/hover/hover_at/focus/check/uncheck/select/scroll/drag/drag_at/dialog_accept/dialog_dismiss — and it **"ALWAYS fills a whole form in one call via fields[], never field-by-field"** (instruction-level token discipline). `wait` supports `{for: text|selector}`; `read` truncates huge pages "with a note pointing to a saved file" (the OutputFileAccess path).

### 6.3 ⭐ The `run` tool — their "Think in Code" (source-read)
**The single most important thing in this repo for our spec.** `run` executes **async JavaScript in the server runtime via rquickjs** (embedded QuickJS — no browser process, no remote eval): memory limit **64MB**, stack 512KB, max 1,000 log entries / 1MB logs / 2MB return value, 30s timeout. The script gets a **`browser` SDK**:

- `browser.pages.newPage(url)` / `close(id)` / `list()` / `getInfo(id)`
- `browser.observe(pageId).snapshot()` / `.diff()` / `.resolveRef(ref)`
- `browser.input(pageId).click/fill/type/press/hover/selectOption/scroll`
- `browser.nav(pageId).goto/back/forward/reload`
- `browser.read/grep/wait/screenshot/evaluate/pdf/download/upload/tabGroups/windows`
- **raw escape hatch: `browser.cdp(method, params?, sessionId?)`**

Its instruction block is a masterpiece of agent-prompt engineering (multi-step flows in ONE call, `Promise.all` parallelization, "close only tabs you own", **`ownership: "mine" | "user" | "other-agent"`** filtering). And the framework guarantees every inner primitive is governed by the **`InnerCallHook`**: `authorize(page)` (ownership check per primitive), `record(...)` (each primitive logged as a **child audit row** — scripts can't bypass auditing), `on_page_created` (script-opened tabs get claimed + grouped like `tabs new`). This is doc 32's tokenmining rule *"structure instead of narrate"* executed at production scale — one `run` replaces 47 `snapshot`+`act` round-trips.

`evaluate` is the lighter sibling (CDP `Runtime.evaluate` in-page, with `trust_boundary::wrap_untrusted`); `token_estimate.rs` gives per-tool input/output estimators.

---

## §7 The Bun server — agent loop, BYOK, connectors (apps/server)

### 7.1 Agent loop (source-read `src/agent/`)
Built on **Vercel AI SDK** (`LanguageModelV3`, `ToolLoopAgent`, `wrapLanguageModel` + `@ai-sdk/devtools`). Per-call: normalize messages → build system prompt (`prompt.ts`) → **build browser toolset** (MCP adapter `tool-adapter.ts`, 120s browser-tool timeout, error-summarization so token blowups are capped) + filesystem tools + nudge tools → run with **compaction** (below). **chat-mode** restricts to read-only browser tools + `tabs`.

### 7.2 ⭐ The compaction engine (source-read — a ready-made spec for doc 03 §7)
`agent/compaction.ts` + `agent/compaction/utils.ts` implement a **full context-compaction protocol**:
- `computeConfig(contextWindow)`: **reserveTokens** (50% below small-window threshold), **triggerThreshold = ctx − reserve**, **keepRecentTokens** (fraction of threshold, capped), **minSummarizableTokens** (floor + min of available), safety multiplier, image-token estimate, `toolOutputMaxChars`.
- `findSafeSplitPoint` (never split mid-turn), `slidingWindow` (keep recent, summarize the rest), `reduceToolOutputs` / `stripBinaryContent` / `pruneMessages`.
- `callSummarizer`: transcripts messages → `<conversation_transcript>` → **streams a summarization** via `streamText` with **timeout + AbortController** (fails open to `null`), max output tokens; summary prepended on next turn with compaction-count tracking.

This is the *Agent Zero compaction protocol* (doc 16) and the *Janus pipeline* (doc 31) already productized — with exact knobs we can lift as defaults.

### 7.3 BYOK providers (source-read `provider-factory.ts` + `lib/clients/llm/`)
Anthropic · OpenAI · Azure · Amazon Bedrock · Google Gemini · **OpenAI-compatible** (with the caveat: SDK defaults to Responses API, many proxies only speak Chat Completions → UI hints at the OpenAI-Compatible template) · **OpenRouter** (with `extraBody: { reasoning: {} }` and a custom fetch that can add keys). Plus mock/test providers. This is the same ProviderAdapter shape as doc 19's synthesis — nothing exotic, which is itself the lesson.

### 7.4 ⭐ OAuth subscription login (source-read `lib/clients/oauth/providers.ts`) — BYOK without keys
Three providers with real client IDs + flows (source-verified):
| Provider | Flow | Scopes | Notes |
|---|---|---|---|
| **chatgpt-pro** | **PKCE** (auth code + code_verifier) | openid, profile, email, offline_access | `extraAuthParams: { id_token_add_organizations, codex_cli_simplified_flow, originator: "browseros" }` → GPT-5 Codex / GPT-5.4 up to 400K ctx |
| **github-copilot** | **device-code** | read:user | device code + PKCE optional |
| **qwen-code** | device-code + PKCE | openid, profile, email, model.completion | form content type |

Token lifecycle: local callback server on `OAUTH_CALLBACK_PORT`, `PendingOAuthFlow` (state + verifier), **SQLite `oauth_tokens` table** (PK `browserosId+provider`; access+refresh+expiry+email+accountId). This is exactly the "sign in with your existing ChatGPT Pro subscription" pattern — and a direct answer to our docs 12/13 connector-hub research: **public-client OAuth with a local callback port**, per-user token store in SQLite. (Honesty: the client IDs here are BrowserOS's own app registration — we'd register our own; and unofficial clients hit Google's warning screens — their picks (OpenAI/GitHub/Qwen) are all officially-public device-code/PKCE endpoints.)

### 7.5 Connector hub — the Klavis proxy (source-read, ⚠️ cloud flag)
The 40+ integrations (Gmail, Slack, GitHub, Google Calendar, Linear, Notion…) are **not local code**. `lib/clients/klavis/` + `api/services/klavis/`: the server calls a **hosted `KLAVIS_PROXY`** to `createStrata(userId, connectors)` — a hosted **Strata MCP server** — then opens an **MCP client session to it** (`StreamableHTTPClientTransport`) and merges its tools. `getConnectorCatalog()` / `isSupportedConnector` gate the UI. **This is the Composio/Nango pattern (docs 12/13) verbatim**: a hosted connector-as-MCP proxy. → For our *fully local, zero-server* build this is the one capability we deliberately do **not** copy as-is; our hub stays local (browser-session-based access to logged-in web apps) + optional BYOK OAuth. Flagged prominently because the privacy page's "nothing leaves your machine" is accurate for browser sessions but **connector traffic passes through Klavis**.

### 7.6 Cowork (filesystem tools) + agents (ACP)
`src/tools/filesystem/`: read/write/edit/bash/ls/grep/find + **`path-boundary.ts`** (scoped workspace) — the Cowork feature (7 tools). `src/lib/agents/acp/`: hosts **ACP (Agent Client Protocol)** agents — `acp-agent-runtime.ts` + `browseros-skill.ts` + `acp-agent-policy.ts`; `host-acp/` bundles a Bun runtime + native binary for hosted sub-agents. `acpx-ai-provider` (MIT, from DaniAkash/agent-toolkit) turns ACP agents into AI SDK models — **sub-agents as first-class model objects**.

### 7.7 MCP manager
`lib/mcp-manager/`: reconcile/service/manager — the server itself *acts as an MCP client* for user-configured external MCP servers (tools merged into the agent), with drift reconciliation. Plus `mcp-transport-detect` + `native-addon-guard`.

---

## §8 harness-integrations — the one-click connect (source-read)

**The cleanest "install my MCP into your agent" implementation we've seen** (and it's a standalone Rust crate — portable to our hub).

- **catalog.rs**: `AgentId` = Claude Code, Codex, Cursor, OpenCode, Antigravity, VS Code, Zed (7 harnesses). `McpTransport` = Stdio | Sse | Http. `ConfigFormat`, `HttpShape`, `PerOsPaths`, `KeyTransform`, `InjectValue` — per-harness knowledge encoded as data.
- **planner.rs**: `plan_link` / `plan_unlink` / `plan_disconnect` / `plan_migration_install` — **"computes a link plan without touching the filesystem"**: validate spec → resolve agent config file → detect **foreign entries** (server already in config but not in our manifest → refuse unless `allow_overwrite`) → emit planned edits → then apply. Plan-then-touch = crash-safe, reviewable installs.
- **emitter/io**: writes each harness's config in its own format (JSONC via jsonc-parser, TOML via toml_edit, YAML via serde-saphyr), `FsOp`-based, atomic temp-file writes.
- **skills/**: `SkillReconciler` + `skills.json` manifest (per-entry: target_path, skill_name, content_hash, consumers) + **`.browserclaw-managed.json` ownership markers** — they *install skills into harnesses* (e.g. a browseros skill for Claude Code) and can reconcile/uninstall by ownership + hash. (Their skills dir also feeds `skills-lock.json` at monorepo root.)
- Migration: recognizes old `BrowserClaw` entries and migrates them (docs-confirmed).

This crate is a direct blueprint for our connector-hub installer (docs 12/13): a catalog of harness config paths/formats + plan-before-touch + ownership markers.

---

## §9 Audit, replay & session analytics (the moat feature, source-read)

### 9.1 On-disk layout (docs + config source-verified)
```
~/.browserclaw/
├── browserclaw.sqlite        # audit history, tasks, sessions, recording indexes,
│                             # tab claims, tab ownership (sea-orm migrations)
├── screenshots/              # one JPEG per screenshotted step
├── replays/                  # recording data per session (NDJSON event files on disk)
└── logs/claw-server.log
```

### 9.2 Ingest contract (source-read `api/http/recordings.rs`)
The browser posts **NDJSON event batches** to the server: headers `x-recording-tab-id` · `x-recording-document-id` (validated as chrome document id) · `x-recording-batch-id` + gap header. Server parses, and **malformed/dropped lines or recorder-gap evidence become sticky `has_gap`** on the recording stream — any replay of that stream is marked incomplete (honest recording; no fake "complete" replays).

### 9.3 Storage (source-read `db/recording_index.rs`)
Each accepted non-empty batch commits **stream metadata + NDJSON payload + durable dedupe identity in one transaction** (sea-orm transactional APIs; the `sea_query::OnConflict` upsert appears in the efficiency-stats path, not here). Streams are per-document; a document is permanently bound to the tab id from its first persisted batch; `target_id` attribution is best-effort and never overwritten. Replay metadata (per-tab → per-segment: document_id, first/last event, size, event_count, has_gap, legacy) is served by `api/http/replay.rs`.

### 9.4 Session efficiency stats (source-read)
`session_efficiency_stats.rs`: insert-once projections from `session_starts` + `session_ends` + `tool_dispatches`, gated on **`ELIGIBLE_TOKEN_ESTIMATOR_VERSION = 1`** — i.e. they compute **tokens-per-session efficiency scores** from the token estimator + audit rows. **This is a token-mining telemetry pillar we should copy** (doc 32): every session gets a cost/efficiency profile with zero extra model calls.

### 9.5 The dashboard/replay UX (docs-verified)
Cockpit: "Running now" live cards (live preview + LIVE chip + action trail + tab count + **Watch**/**Stop**) + "Recent activity". Audit page: searchable session list (agent/title/tools/action-count/duration/status Live|Done|Failed). Task detail: per-tab action timelines with **screenshots per step**. Replay: full-fidelity playback (DOM changes, scrolls, clicks — the real page, not screenshots), scrubber + synced action timeline, per-tab recordings with independent time origins.

---

## §10 Extension UI + CLI (brief, source-verified)

- **apps/app (WXT + React)**: new-tab dashboard, side-panel chat; Radix UI, `@ai-sdk/react`, TanStack Query + async-storage persister, **VAD web** (voice activity detection — voice input), MDX editor, GraphQL codegen, Sentry, PostHog.
- **claw-app**: neo dashboard extension (watch/replay/manage).
- **cli (Go)**: cobra + `modelcontextprotocol/go-sdk` + `minio/selfupdate` (signed self-update) + minisign + PostHog; `cmd/`, `config/`, `mcp/`, `update/` packages.
- **Onboarding**: fork-native `browseros_onboarding.cc` + `browseros_onboarding_api.ts` + prefs; one-click Chrome import; MCP connect board (endpoint `http://127.0.0.1:9200/mcp` + per-harness Connect buttons + auto-migration).

---

## §11 Docs-verified feature surface (docs/ is in-repo — high trust)

- **BYOK**: ChatGPT Pro / GitHub Copilot / Qwen Code via OAuth (§7.4) or any API key; **local models** via Ollama/LM Studio with a loud warning: **Ollama's default 4,096-token context is too low — below 15K the agent loops trying to recover; set 15–20K**.
- **Scheduled Tasks + Smart Nudges**: after a task that could recur, the agent calls `suggest_schedule` (a **sentinel tool** — its JSON is intercepted by the chat UI to render an interactive schedule card; see `nudge-tools.ts`). Daily/hourly/minutes schedules.
- **Cowork**: 7 filesystem tools with workspace boundary.
- **Sync-to-cloud**: optional account sync for conversations/settings/tasks (the *one* feature that needs their servers — skip for our local build).
- Ad-blocking, vertical tabs, keyboard shortcuts; **MCP manual setup docs for Hermes Agent, Vercel AI SDK, OpenClaw, Gemini CLI** (their docs literally show `hermes mcp add browserclaw`).
- Comparison page: BrowserOS MCP **53+ tools** vs Chrome DevTools MCP 29; "40+ external app integrations" vs none; "built into the browser" vs external debug process.

---

## §12 What to steal (conceptually — AGPL forbids copying code)

| Capability | Where they have it | Take for our spec | Status |
|---|---|---|---|
| **A11y-tree snapshot + stable refs + line diff** | browseros-core snapshot/ + diff.rs | Our browser tool: `snapshot` returns tree with `[ref=eN]`, `diff` collapses to context radius, URL-change short-circuit | Copy design (doc 03 §5) |
| **`run` = embedded sandboxed scripting (Think in Code)** | browseros-mcp run.rs + rquickjs | Our script-eval tool: 64MB/512KB limits, `browser` SDK, ownership-filtered page lists, `Promise.all` guidance | **Copy design (doc 32 rule 3)** |
| **Per-primitive audit via InnerCallHook** | framework.rs | Every script inner-call authorized + child-audited — scripts can't bypass the audit trail | **Copy design (doc 03 §8)** |
| **Ownership isolation (mine/user/other-agent)** | tabs-and-isolation docs + dispatch.rs guards | Tab-claim + group-per-agent + refusal to touch foreign pages — the Trust Ladder's file-level analog | Copy design |
| **Plan-before-touch harness installer** | harness-integrations crate | Our hub installer: catalog + plan + foreign-entry refusal + ownership markers + skills reconciler | **Copy design (docs 12/13)** |
| **Compaction engine knobs** | server compaction/utils.ts | Defaults: reserve 50% small-window, keep-recent fraction, safe split points, fail-open summarizer | Copy config (doc 03 §7) |
| **Token efficiency telemetry** | session_efficiency_stats + token_estimate | Per-session tokens/dollar projections from audit rows, zero model calls | Copy design (doc 32) |
| **OAuth subscription login (PKCE/device-code + local callback + SQLite store)** | oauth/providers.ts | Our BYOK "use your subscription" path; register our own client IDs | Copy pattern (docs 19/12/13) |
| **Replay as event stream + sticky gap + dedupe** | recordings ingest + recording_index | Our session recorder: NDJSON batches, document-bound tabs, honest `has_gap` | Copy design |
| **Read-only MCP annotations + OutputFileAccess** | browseros-mcp framework | Tool annotations so harnesses know read-only; large outputs → files | Copy design |
| **Embed server binaries as browser resources** | .features.yaml layer 0 | (Fork-scale only — we won't fork Chromium; note as option) | Reference |
| **fork-side CDP + change detector** | chromium_patches api/ + cdp-api | If we ever fork, this is the map | Reference |

**What we deliberately skip:** Klavis-hosted connectors (cloud — violates our zero-server constraint; our hub is local-session-based + optional OAuth), sync-to-cloud, Sparkle/winsparkle self-update plumbing (we ship via package managers), forking Chromium (we embed a real browser via Tauri webview + CDP instead).

---

## §13 Honest gaps

1. **Recording capture internals not source-read** — lives in the Chromium checkout (`chrome/browser/browseros/*`, applied at build from the patch set). Verified indirectly: `.features.yaml` layer-0 resource embedding + the ingest contract (NDJSON, x-recording-* headers, chrome document ids) + `recording_index` schema. The exact event types (DOM mutation batching? screenshot triggers?) are inferred, not read.
2. **`.internal-docs` submodule** is private (git@ URL) — any internal architecture docs unreachable.
3. **`packages/archive/`** unexamined; `apps/claw-app`/`claw-onboard`/`app` UI internals read only at manifest level (not component-level).
4. **Klavis** is a black box (hosted service); connector catalog contents (`getConnectorCatalog`) not enumerated beyond docs' "40+ (Gmail, Slack, GitHub…)".
5. 5 LFS media files absent from the clone (docs/videos + gifs) — non-code, no impact.
6. Rust `test_util` dev-deps + test suites exist (cargo tests, bun tests incl. `tests/tools/keyboard.test.ts`, snapshot diff tests) but were **not executed** this pass.

*Supersedes the README-level BrowserOS section of doc 30 §3; ledger row updated (12,931 → 12,933, depth ⬛, docs 30/33). Star counts live as of 2026-08-06.*
