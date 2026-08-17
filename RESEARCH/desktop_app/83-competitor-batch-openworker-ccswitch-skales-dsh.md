# Doc 83 — Competitor Batch: openworker · cc-switch · skales · deepseek-harness (code-level, cloned + source-read)

**Date:** 2026-08-17 · **Sources (cloned + source-read, shallow):** `andrewyng/openworker` (Python 14.7k★, Tauri+aisuite), `farion1231/cc-switch` (Tauri 2, 126k★, 8 agent CLIs), `skalesapp/skales` (BSL 1.1 closed-source, Electron+Next.js, 1.6k★, v12.8.0), `deepseek-ai/deepseek-harness` (MIT, 93k★, Cordis plugin kernel). Cross-checked against our `DESKTOP-APP-SPEC` v3.22, `crates/everyaios-*`, `packages/coordinator`, `ARCH/01`, `ARCH/06`, docs 27 (ledger), 61 (desktop land-grab), 68 (market research), 80–82.

**Question (user):** *"deep-dive these 4 repos — our goals are especially casual users. Analyse capabilities + architecture, compare against current docs, decide what to steal vs build our own."*

**One-line result:** two of the four are **architectural twins** of our own design (openworker = Tauri shell + Python agent server; deepseek-harness = plugin-composable harness whose 51-package taxonomy mirrors our 16 crates + coordinator almost 1:1). The genuine *new* signal is (a) openworker's **risk-class × mode permission matrix** and **shell-operator hardening**, (b) cc-switch's **per-agent config-writer** for managing external CLI providers, (c) skales' **casual-user surface** (AIPointer quick-ask, `/goal` background goals, migration importer, Dreaming memory, companion layer) — the exact thing our spec *has* the engine for but *hasn't* productized — and (d) deepseek-harness' **"model-visible means logged" runtime invariant** + **profile/bundle config composition**. → **TODO P30**.

**Doctrine (unchanged):** steal = reimplement in our stack (Rust crates / TS coordinator) with source-pattern credit; never vendor/copy code. **skales is BSL 1.1 closed-source → observe the product surface only** (no code steal; the repo is a historical v7 snapshot, not what runs). **Ledger: 281 → 282** (only `skalesapp/skales` is new; openworker/cc-switch/deepseek-harness already tracked — this pass upgrades openworker + deepseek-harness to code-level, re-reads cc-switch).

---

## 0. Verdict table (what this pass changes)

| Repo | Ledger said | doc 83 (cloned + source-read) | Steal verdict |
|---|---|---|---|
| **openworker** (14.7k★) | 🟪 README-verified (doc 40) | Tauri shell + Python agent server on **aisuite**; 38K-LOC `coworker/`; permission engine (`permissions.py` + `risk.py`), automations, inbox/mentions/selfwake, skills/personas, 25+ connectors, MCP | ✅ **6 concrete steals** (risk×mode matrix, shell-op hardening, EXTERNAL→inbox hook, ask/plan/subagent/todo tools, mention-driven sessions, persona manifests) |
| **cc-switch** (126k★) | ⬛ code-level (docs 19/22/23/31) | Tauri 2 + React; Rust `session_manager/providers/{claude,codex,gemini,opencode,hermes,openclaw,pi}.rs` = **per-agent config writers**; one-click provider switching (subscription↔key↔relay); session/terminal manager | ✅ **1 concrete steal** (HarnessConfigWriter pattern for F12/F8) |
| **skales** (1.6k★) | **NEW → +1 (282)** | BSL 1.1 closed; Electron+Next.js; ~300MB; ReAct loop, 180+ tools; `/goal` background + resume; `/code` folder-bound; QR phone pairing; AIPointer; Desktop Buddy; Iris Orbit; Dreaming memory; migration importer | 🔍 **observe only** — 6 product-surface lessons (casual-user moat) |
| **deepseek-harness** (93k★) | 🟩 map (doc 61 §1) | MIT; 500K-LOC TS monorepo, 51 packages, Cordis kernel; profiles/bundles + `--dump-config`; append-only SessionEvent log w/ **"model-visible means logged"** invariant; capability seams; turn/step waterfalls; `native/landlock-run` | ✅ **4 concrete steals** (logged-invariant, profile/bundle composition, capability seams, waterfall extension points) |

---

## 1. openworker — Andrew Ng's desktop coworker (code-verified)

**Stack:** Tauri shell + React GUI (`surfaces/gui/`) → local **Python agent server** (`coworker/`, 38K LOC) on **aisuite** (unified chat-completions across providers) + Rust STT sidecar (`stt/`). BYO key for OpenAI/Anthropic/Gemini/GLM/DeepSeek/Kimi/Qwen/MiniMax/Mistral/Grok + Together/Fireworks + Ollama. Local-first; OAuth-broker cloud piece only.

**Agent surface (`coworker/`):** `engine.py` (1199) + `agent.py` (504) = the loop; `providers/` (registry 866, openai 548, anthropic 640, gemini 547, bedrock 579); `connectors/` (integration_tools 4923, descriptors 1470, tool_defs 1203, adapters 480, email_tools 843, browser_automation 585); `memory/` (SQLite); `automation/` (models/scheduler/store/tools); `skills/` (base/store); `personas/` (manifest/registry/builtin); `mcp/` (client/config/oauth/tools); `tools/` (ask, directories, files, git, plan, registry, search, shell, **subagent**, todo); `permissions.py`, `risk.py`, `audit.py`, `inbox.py`, `mentions.py`, `selfwake.py`, `unattended.py`, `workspace_trust.py`, `compaction.py` (561), `cloud.py` (689), `server/` (app 2106, manager 4176).

**The two most valuable modules — and why they matter for us:**

**(1) `permissions.py` + `risk.py` — a cleaner formulation of our dual-guard.** It decides allow/deny/ask per tool call from a **RiskClass × Mode** matrix:
- `RiskClass`: `READ` (no side effects, always allowed) · `WRITE_LOCAL` (workspace, path-scoped) · `EXEC` (commands) · `EXTERNAL` (side effects off-machine → *unattended Inbox hook*).
- `Mode`: `DISCUSS` (read-only) · `PLAN` (read-only + planning contract) · `INTERACTIVE` (default, ask on writes/commands) · `AUTO` · `CUSTOM` (interactive + auto-allow list).
- **Shell-operator disqualification** (`_SHELL_OPERATORS = ; & | > < ` $() ( \n \r`): any of these metacharacters in an "allowlisted" command **forces approval** — closes the `cmd; rm -rf /` injection class structurally, not by regex alone.
- Session allowlist + path-under-root + command-prefix refinement.

> **Our take:** we have Trust Ladder (numeric 0–100) + `permissions.toml` `Allow/Ask/Block` + Guard-1 regex + Guard-2 cards. openworker's 4-level risk × 5-level mode is *conceptually cleaner for a casual user* (a single "autonomy slider" DISCUSS→PLAN→INTERACTIVE→AUTO) and its `EXTERNAL` risk class is exactly the hook our F13/B7 proactivity layer is missing. **Steal: adopt the RiskClass enum + Mode enum as the user-facing gradient on top of our existing `permissions.toml`** (which already has `Allow/Ask/Block` + `min_confidence_for_auto`); keep our numeric ladder as the underlying score. **Steal the shell-operator structural check into Guard-1** (regex already covers patterns, but the metacharacter disqualifier is a strict-superset guard for allowlisted commands).

**(2) `inbox.py` + `mentions.py` + `selfwake.py` + `unattended.py` — the proactivity/messaging layer.** Slack `@OpenWorker` → session opens on desktop → work runs → thread reply. Unattended runs **park their asks in an inbox** instead of acting. Scheduled automations (morning brief, weekly report, standing watch). This is our F13 messaging bridge + B7 heartbeat automations + P6.4 session-open proactivity hook, concretized into one coherent surface.

**Other steals:** `tools/ask.py` (ask the user mid-task — maps to our DecisionPackage/MCQ interrupt), `tools/plan.py` (propose_plan approval contract — maps to our blueprint approval), `tools/subagent.py` (maps to B3/B4), `personas/` manifest+registry (maps to our SOUL persona file). **Build-own:** it's Python/aisuite — we keep TS/Rust; we reimplement the *concepts*, not the code.

---

## 2. cc-switch — the 8-CLI provider hub (code-verified)

**Stack:** Tauri 2 + React 18 + TS + Rust (`src-tauri/src/`). v3.19.2, MIT, Win/macOS/Linux. "All-in-One Manager for Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build, OpenCode, OpenClaw & Hermes Agent" — one-click switching between Anthropic/OpenAI subscriptions ↔ API providers ↔ third-party relays.

**The core mechanism = per-agent Rust config writers** (`src-tauri/src/session_manager/providers/`): `claude.rs` (500), `codex.rs` (997), `gemini.rs` (258), `opencode.rs` (1001), `grokbuild.rs` (296), `hermes.rs` (603), `openclaw.rs` (473), `pi.rs` (1106) — each module reads/writes that CLI's own config file (`settings.json` / `config.toml` / `auth.json`) to swap the provider. Plus `session_manager/terminal/mod.rs` (440) and `tray.rs` (1575). Monetized by relay-provider sponsorships (ZenMux/AICodeMirror/etc.).

> **Our take:** our F12/J17 already *drives* these CLIs via ACP at runtime (cleaner than editing their configs), and F8 installs them registry-fed. What cc-switch adds is the **static provider-routing layer**: pointing the user's *already-installed* Claude Code/Codex at any provider from a cockpit UI, with per-app failover and live config sync. **Steal: a `HarnessConfigWriter` trait** (mirroring their `providers/*.rs` shape) so our cockpit can manage the *providers* of external CLIs — complementing ACP-driving, not replacing it. This also strengthens our A2/A3 story ("your 8 CLIs and our broker all draw from the same key-ring"). **Skip:** the relay-sponsorship monetization (we're free/open) and the tray/session-manager breadth.

---

## 3. skales — the casual-user benchmark (observe only, BSL 1.1)

**Stack:** Electron + Next.js (App Router) + Tailwind + TS; storage `~/.skales-data` (JSON+SQLite); ReAct loop, **180+ tools**, multi-agent delegation, per-turn tool budgeting; E2E-encrypted relay for Mobile↔Desktop. ~300MB RAM. Win/macOS/Linux + Android/iOS. **Closed-source**; repo = distribution + historical v7 snapshot.

**Why it matters for "our goal = casual users":** skales is the closest *product* to our end-state, and it productizes exactly the surfaces our spec builds engines for but doesn't yet expose:

| Skales surface | What it is | Our equivalent (built but not productized) |
|---|---|---|
| **`/goal` "close the lid"** | background goal, runs across many steps, resumes where left off | B7 heartbeat automations + H18 remote (both deferred) |
| **`/code`** | bind a folder to any chat, inline diffs, one-click undo | D-series + codeintel + Guard-2 diffs (built) |
| **AIPointer ⦿** | cursor-anchored quick-ask overlay over *any* app (hold right-Cmd) | our clipboard/screen-capture + chat (built, no overlay) |
| **Desktop Buddy / Iris Orbit** | floating mascot + voice-with-a-face, on-device wake word, 55 languages | SOUL persona (text) + H15/H28 voice (deferred) |
| **Dreaming memory** | 3-phase overnight consolidation + Dream Diary; semantic history search (local embed) | C-series compaction/decay (built, no visibility) |
| **Custom Agents w/ per-agent memory** | each agent distils a lesson per task | B3/B4 + taste profile C9 (built) |
| **Migration importer** | import from OpenClaw/Hermes/ChatGPT | doc-82 "Migration Concierge" (I deferred it) |
| **bi-temporal memory** | short+long term + identity, cross-surface (WhatsApp/Buddy) | C-series + identity (built) |
| **QR phone pairing** | phone drives the desktop's full toolset | H18 mobile companion (deferred) |

> **Our take:** skales *validates* our casual-user thesis and the four-verbs first screen (doc 82), and shows the three highest-value product gaps we should close: **(1) AIPointer-style quick-ask** (the Raycast concession we already conceded — doc 80 §6), **(2) `/goal` background-with-resume** (local half of H18/B7 — pull earlier, keep it user-operated), **(3) migration importer** (re-rate doc-82 "Migration Concierge" from defer → narrow ship). The companion layer (Buddy/Iris/pixel pets) is a genuine differentiator for "6 to 60+" but high-effort → post-v1, and our Tauri+Bun is already leaner than their Electron ~300MB. **No code to steal (BSL) — these are product-surface targets.**

---

## 4. deepseek-harness — the plugin-composable harness (code-verified)

**Stack:** MIT, 500K-LOC TS monorepo, 51 packages, Cordis kernel ("spatiotemporal composability"). `npx @deepseek-ai/dsh web` → Web UI :3080. Native `landlock-run` (Linux sandbox).

**Why it has loads of users:** (1) DeepSeek official brand + model popularity; (2) **"everything is a plugin"** — no privileged core to patch, every part (model adapter, tool registry, session log, agent loop) is replaceable from config; (3) MIT + a real plugin ecosystem (`dsh-plugin` topic); (4) the **session-log-as-truth** discipline ("every run is traceable", resume/fork/replay on one event stream). It's the reference implementation of the extensibility story our I6 ABI + Forge aim at.

**The four steal-worthy patterns:**

**(1) "Model-visible means logged" runtime invariant.** The append-only `SessionEvent` log is the single source of context: `deriveMessages()` projects model history from it, and a **runtime invariant asserts that anything reaching a model request is reconstructable from the log**. Fork/resume/transcripts/telemetry/persistence all derive from this stream. → **Our J5/J19 audit is append-only + Merkle-chained, but we don't *assert* "model-visible ⟹ logged" at runtime.** Adopt this as an explicit invariant in the coordinator turn loop (every context block injected must carry a log event — we already emit `ContextInjection` events in `everyaios-audit`; make it a hard assert, not a best-effort).

**(2) Profiles & bundles + `--dump-config`.** A running harness = a plugin tree composed at boot from ordered layers: base → web/headless → profile `cordis.patch.yml` → home patch → `--patch` overlay; a patch targets a row by id. → Maps to our Markdown-blueprint + skill-registry composition, but adds **patchable config layering** (a user/team override layer above the shipped blueprint). **Steal the layering semantics** for our blueprint/skill registry (our `.md` specs are already the "profile"; add a user-local patch overlay).

**(3) Capability seams** (Service Definition / Provider / Consumer). A swappable capability needs all three roles; registrations are reversible effects that unwind on unload. → Formalizes our Extension ABI (I6) + MCP/ACP seams. **Steal the SD/Provider/Consumer framing** for I6 documentation + the "reversible effect" principle for our skill/plugin lifecycle.

**(4) Turn/step waterfalls.** A step = one model request + tools; a turn = 0+ steps. Extension points are waterfalls (`agent/pre-step`, `agent/request`, `llm/stream`, `tools/pre-execute`/`execute`/`post-execute`) whose listeners call `next()` to delegate. → Maps to our coordinator `chat.ts` stage events (compiling/routed/streaming_start/extracting_memory/tool_call/tool_result/risk_assessment/done). **Steal the waterfall+`next()` delegation pattern** so our own stages become interceptable extension points (hooks), not fixed switch-cases.

**Package taxonomy (validates our layout):** their 51 packages (acp/mcp/lsp/code-runtime/sandbox/e2b/guard/credentials/goal/plan/workflow/subagent/skill/compaction/context/session/storage/schedule/jobs/hooks/feedback/shell/terminal/workspace/identity/interaction/…) map to our 16 crates + coordinator core-* almost 1:1 — no structural gap, just naming.

---

## 5. Comparison vs our architecture (the net)

| Dimension | EveryAIOS (ours) | openworker | cc-switch | skales | deepseek-harness |
|---|---|---|---|---|---|
| Shell | Tauri (Rust) | Tauri (Rust) | Tauri 2 (Rust) | Electron | n/a (web/headless) |
| Engine | Bun/TS coordinator + 16 Rust crates | Python/aisuite | Rust+TS (config mgmt) | TS/Next (closed) | TS/Cordis (500K) |
| Guard | dual-guard (G1 regex + G2 card) + tickets + Trust Ladder | risk×mode matrix | — | (closed) | guard pkg + sandbox |
| Tools | 37 browser + 5 storage + MCP/ACP | 25+ connectors + MCP | — | 180+ tools | everything-is-a-plugin |
| Memory | 7 algos + KG + taste | SQLite memory | — | bi-temporal + Dreaming | session log + context |
| Casual UX | four verbs + v2 cockpit | deliverables + Slack | provider switcher | AIPointer/Buddy/Iris | web UI |

**The honest gaps skales exposes (our engines exist, the surface doesn't):** AIPointer quick-ask, `/goal` background-with-resume, migration importer, visible memory consolidation ("Dreaming"), companion/personality layer. Everything else we match or exceed architecturally (we're already leaner than their Electron, and our guard is stronger than openworker's).

---

## 6. Steal vs build — decision table → TODO P30

| # | Item | Source | Decision | Maps to |
|---|---|---|---|---|
| 1 | RiskClass (READ/WRITE_LOCAL/EXEC/EXTERNAL) × Mode (DISCUSS/PLAN/INTERACTIVE/AUTO/CUSTOM) as user-facing autonomy gradient | openworker | **STEAL** (reimplement over permissions.toml; keep numeric ladder) | J21 + ADD-3 |
| 2 | Shell-operator structural disqualifier (`; & | > < ` $() ( \n`) | openworker | **STEAL** (Guard-1 hardening) | J1/Guard-1 |
| 3 | EXTERNAL-risk → unattended inbox hook (park asks, don't act) | openworker | **STEAL** | F13/B7/P6.4 |
| 4 | Ask / plan / subagent / todo first-class tools | openworker | **STEAL** (reuse our DecisionPackage/MCQ/B3-B4) | tool registry |
| 5 | Mention-driven sessions (Slack @agent → desktop session → reply) | openworker | **STEAL** (F13 concretization) | F13 |
| 6 | Persona manifest + registry | openworker | **STEAL** (formalize SOUL) | personality |
| 7 | HarnessConfigWriter — per-agent provider config read/write | cc-switch | **STEAL** (Rust trait beside ACP-driving) | F12/F8/A2-A3 |
| 8 | "Model-visible means logged" runtime invariant | deepseek-harness | **STEAL** (hard assert in turn loop) | J5/J19/Trajectory |
| 9 | Profile/bundle config layering + patch overlay | deepseek-harness | **STEAL** (blueprint patch layer) | B2/I2 |
| 10 | Capability seams SD/Provider/Consumer + reversible effects | deepseek-harness | **STEAL** (I6 formalism) | I6 |
| 11 | Turn/step waterfall + next() extension points | deepseek-harness | **STEAL** (coordinator hooks) | chat.ts |
| 12 | AIPointer quick-ask overlay over any app | skales | **BUILD lean** (clipboard/screen + chat) | ADD-1/H26 |
| 13 | `/goal` background goal + resume (local half) | skales | **BUILD** (pull earlier, user-operated) | B7/H18 |
| 14 | Migration importer (ChatGPT/Claude/OpenClaw) | skales | **BUILD narrow** (re-rate from defer) | doc-82 |
| 15 | Visible memory consolidation ("Dreaming" / Dream Diary / morning brief) | skales | **BUILD** (framing over C-series) | C/B7 |
| 16 | Companion layer (Buddy/Iris/pixel pets) | skales | **DEFER** (post-v1; high-effort differentiator) | — |

**Explicit non-steals:** openworker's Python/aisuite (we keep TS/Rust) · cc-switch's relay-sponsorship monetization (we're free) · skales' code (BSL 1.1 closed) · deepseek-harness' Cordis dependency itself (we reimplement the patterns over our own kernel, not adopt Cordis).

---

## 7. Ledger + index deltas

- **Ledger 281 → 282** (new: `skalesapp/skales` 1.6k★, BSL 1.1, ⚪ observe-only).
- Depth upgrades: `andrewyng/openworker` 🟪 → ⬛ (code-level); `deepseek-ai/deepseek-harness` 🟩 → ⬛ (code-level); `farion1231/cc-switch` ⬛ re-read (config-writer steal extracted).
- **TODO P30** carries the 13 steal/build items (items 12–15 are the casual-user product gaps skales exposed; item 7 the cc-switch harness-provider surface; 1–6 + 8–11 the guard/composition/invariant hardening).
