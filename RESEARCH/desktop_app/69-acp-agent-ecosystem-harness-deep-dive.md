# Doc 69 — ACP Agent Ecosystem + Harness Deep-Dive (2026-08-16)

Goal: make **every** major coding agent usable through our app via ACP ("same
chat bar, agent differs"), and record what to steal from each. Companion to
doc 45 (ACP spec), doc 57 (ACP registry + subscription auth), doc 56
(cowork-forge / Copilot CLI), doc 52 (surgical hierarchy). This doc is the
**live verified command catalog** + the architecture steals from a re-deep-dive
of the top harness CLIs + Zed.

---

## 1. Verified ACP entrypoints (the catalog behind `LaunchRegistry::builtin()`)

Source: agentclientprotocol.com/get-started/agents + zed.dev/acp (both
verified 2026-08). The ACP ecosystem is ~40 agents; we seed the **full 46-agent
catalog** transcribed from the official `registry.json`
(`cdn.agentclientprotocol.com/registry/v1/latest/registry.json`, 38
auth-verified agents) + ollama launch + Zed `/acp`, and the F8 installer +
registry-fed discovery re-pins versions + platform archives at install time.

The complete 46-agent catalog lives in `everyaios-acp::registry::builtin()`
(every spawn command transcribed verbatim from the registry `distribution`
blocks). The table below is the **curated highlights**; the remaining entries
(junie, kiro, kimi, kilo, qoder, poolside, cortex-code, factory-droid, harn,
dirac, stakpak, vtcode, sigit, corust-agent, autohand, amp, agoragentic, glm,
deepagents, fast-agent, minion-code, mistral-vibe, dimcode, nova, auggie,
codebuddy-code, crow-cli, commandcode) are in the code seed.

| Agent | Auth | ACP command (verified) | Notes |
|---|---|---|---|
| Claude Code / Claude Agent | subscription | `npx @agentclientprotocol/claude-agent-acp` | Anthropic-co-authored wrapper over the Claude Agent SDK (renamed from `@zed-industries/claude-code-acp`). Allowed; never token-harvested (doc 57 §3). |
| Codex CLI | subscription | `npx @agentclientprotocol/codex-acp` | stdio ACP **adapter** that starts the Codex app server + translates ACP (no native `--acp` flag). |
| Cline CLI 2.0 | local/API-key | `cline --acp` | Feb 2026: `--acp` turns Cline into an ACP agent; headless CI/CD + parallel execution. |
| OpenCode | local/API-key | `opencode acp` | Anomaly; provider-agnostic, all SOTA models; Zed/Neovim/Emacs/JetBrains. |
| Hermes Agent | local/OAuth | `hermes acp` | Nous Research; needs `uv pip install -e '.[acp]'` for ACP support. |
| OpenClaw | local | `openclaw client acp` | `client` subcommand spawns the ACP handler bridge. |
| Copilot CLI | subscription (preview) | `copilot --acp [--stdio/--port N]` | ACP public preview Jan 2026. |
| Gemini CLI | subscription | `gemini --acp` | First ACP integration (Aug 2025, with Zed). |
| Cursor | subscription | `agent acp` | `agent` CLI ships with the Cursor app. |
| Qwen Code | local/API-key | `qwen-code --acp` (via registry) | Alibaba; install-from-registry in Zed. |
| Goose | local | `goose` | Block's agent; **native** ACP (no flag). |
| Aider | API-key | `uvx aider-chat` (ACP via adapter) | SEARCH/REPLACE edits; surgical-hierarchy surgeon tier. |
| Grok Build | subscription | `grok --acp` | xAI. |
| Droid | subscription | `npx droid` | Factory. |
| Pi | local | `npx @agentclientprotocol/pi-acp` | adapter (not bare `pi`). |
| DeepSeek Harness | API-key | `dsh` | DeepSeek's harness. |

**Lesson (the "all agents usable" principle):** ACP is the open standard (Zed-
originated, Apache-2.0) that makes every agent a drop-in worker. Our value is
not re-implementing any one agent — it's hosting **all of them** behind one
Guard-2 ticket + one audit trail + one spend cap. The registry is data, not
code; the ceiling is registry-fed (TODO).

---

## 2. Zed — re-deep-dive (the ACP origin + "BYO agent" UX)

- **Zed is the reference ACP *client*.** It treats "bring your own agent" as
  the product: any ACP agent gains Zed's multi-file editing, full codebase
  context, and review tools. Privacy line: "nothing touches our servers, we
  never train on your code."
- **Top-3 most-used agents in Zed (their own metrics): Zed Agent, Claude
  Agent, Codex CLI** — i.e. people run frontier agents through a neutral
  window, which is *exactly* our cockpit bet.
- **Registry-first install:** Zed's "Add agent → Install from Registry" is the
  F8 harness-installer reference. A new agent is a registry entry + manifest,
  never a core edit (matches our "expandable by design" principle, SPEC #10).
- **Steal:** (1) install-from-registry as the primary harness discovery path;
  (2) the metrics view (weekly sessions per agent) → our Spend/analytics
  surface; (3) the privacy posture as copy, not just code.

---

## 3. Hermes Agent — the richest steal surface (Nous Research)

Hermes is a full agent OS with a huge CLI. Steal candidates for TODO:

- **`hermes acp`** — runs Hermes as an ACP server (already in our registry).
- **`hermes moa` (Mixture of Agents)** — named multi-model presets → our A7
  planner/subagent multi-brain routing (we have tiering; add named MoA
  presets).
- **`hermes kanban`** — multi-profile collaboration board (tasks, links,
  dispatcher) → validates H2 cockpit + F12 fleets; a *local* Kanban of agents.
- **`--worktree` / isolated git worktrees for parallel agents** → our
  sub-agent workspace isolation (B3/B4 currently logical; worktree = the git
  floor).
- **`--checkpoints`** — filesystem checkpoints before destructive changes →
  complements our office `Snapshot` rollback (extend to fs writes).
- **`hermes memory` + `hermes journey` (learning graph)** — external memory
  providers + a timeline of learned skills/memories → our P5 memory + FSRS
  reinforce queue (validate the "journey" visualization).
- **`hermes egress`** — outbound credential-injection firewall (iron-proxy) →
  our credential-broker + sealed-channel doctrine (P0/A2); confirm we block
  egress by default.
- **`hermes acp` + `--max-turns 500`** — the 500-turn ceiling mirrors our
  `IterationBudget` parent 500 (P6.3) — independent confirmation of the right
  number.
- **`--yolo` / approval prompts** — approval UX parity; our Guard-2 ticket is
  the same loop, deterministic (regex) rather than model-gated.

---

## 4. Cline CLI 2.0 — agentic architecture (the one to study for loops)

Cline is the most "agentic architecture" of the batch. Its 2.0 CLI:
- **`--acp`** ACP mode; **headless CI/CD** (non-interactive runs) and
  **parallel execution** of multiple agents in one terminal.
- **Plan/Act + checkpoints + MCP** as the core loop → we already have
  blueprint plan/verify + iteration budgets; Cline validates the
  plan→act→checkpoint shape end-to-end.
- **Steal:** parallel-agent *terminal multiplexing* (run N agents, one view) →
  our H2 cockpit should render a fleet, not one card (partially done; extend to
  live parallel sub-agent status).

---

## 5. Codex CLI + OpenCode + Claude Code — what we actually reuse

- **Codex CLI:** no native `--acp`; the `codex-acp` adapter is the translation
  seam. Lesson: **adapter packages are first-class** — our registry must treat
  `npx <adapter>` as a normal distribution, which it now does.
- **OpenCode:** `opencode acp` is the cleanest native ACP (no adapter) — the
  canonical "what a good ACP citizen looks like" for our own agent surface.
- **Claude Code:** the `claude-agent-acp` wrapper proves subscription auth
  works *through* ACP without harvesting (doc 57 §3) — the precedent for our
  auth-mode badge.

---

## 6. Steal-queue delta (→ TODO)

| # | Steal | Target TODO | Verdict |
|---|---|---|---|
| 1 | Registry-first install (Zed "Install from Registry") | F8 harness installer | 🟡 ADAPT — implement F8 with CDN registry.json |
| 2 | Per-agent session metrics (Zed weekly sessions) | H2/Spend analytics | 🟡 ADAPT |
| 3 | MoA presets (`hermes moa`) | A7 planner routing | 🟡 ADAPT |
| 4 | Kanban of agents (`hermes kanban`) | H2 cockpit fleets | 🟡 ADAPT |
| 5 | Worktree isolation (`hermes --worktree`) | B3/B4 sub-agents | 🟡 ADAPT (git floor) |
| 6 | FS checkpoints (`hermes --checkpoints`) | office Snapshot → fs writes | 🟡 ADAPT |
| 7 | Learning journey timeline (`hermes journey`) | P5 reinforce queue | 🟢 REFERENCE (validate UI) |
| 8 | Egress credential firewall (`hermes egress`) | A2 credential broker | 🟢 REFERENCE (already ours) |
| 9 | 500-turn ceiling (`hermes --max-turns`) | P6.3 IterationBudget | 🟢 REFERENCE (confirms 500) |
| 10 | Parallel-agent terminal multiplexing (Cline 2.0) | H2 cockpit | 🟡 ADAPT |
| 11 | Adapter-as-first-class (`codex-acp`/`pi-acp`) | F12/J17 registry | ✅ DONE (this turn) |

**Landing this turn:** #11 (the full 46-agent registry with verified commands
in `everyaios-acp::registry` — `Distribution::Npx/Uvx` gained `args`, manifests
gained fixed `env`) **+ #1 complete (F8 registry-fed install: `registry_index`
parse/`install_plan`/`merge_into`/`RegistryPolicy` + `registry_client`
fetch/cache + `installer` download→sha256→extract + **Guard-2-ticketed install
split** — `acp_install_request` resolves the plan and mints the decision-package
ticket through the shared `GuardService` (auto-allows allow-listed/open agents),
`acp_install_commit` consumes it via `use_ticket` (single-use + args-hash) then
executes; `acp_install_status` per-agent state for the picker) + **the ACP auth
surface** — `AcpSession::authenticate` (agent-type = the agent drives its own
login flow; url-type = returns the browser URL, client re-calls after the user
completes) + `logout` + `auth_required` (error -32000, message fallback)
detection on `session/new`; `acp_launch` reports `authRequired` + `authMethods`
from the `initialize` handshake instead of failing; `acp_authenticate` retries
`session/new` after login; the picker has an **Install button** (progress →
flip to Launch), an **inline Guard-2 install card** (same ticket as the Cockpit
card — one ticket, two UIs), and a **sign-in surface** ("Sign in with
<agent>"; url-type opens the system browser; an already-authenticated agent
launches directly with no sign-in step)**. #2–#10 remain TODO candidates; no
code landed for them yet.
