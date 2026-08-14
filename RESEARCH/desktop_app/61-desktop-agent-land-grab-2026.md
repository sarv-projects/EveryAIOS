# 61 — Desktop Agent Land-Grab 2026 (market + harness/memory/model/protocol batch)

> **Pass:** user-supplied "Desktop Agent Wars" research (Aug 2026) + repo list, cross-checked against docs 01–60 and live-verified via GitHub API 2026-08-14 (⭐ + SPDX + pushed_at).
> **Ledger:** 247 → **255 repos** (8 new live). **Unverifiable flags:** RavenClaws · ReflexionOS · Keelson · "Iroh desktop agent" · Distri · M1K3 — **never cite these** (see §8).
> **Thesis unchanged:** this pass *validates* the spec, it does not widen it. Every real find maps onto an existing matrix row; nothing new is added to the 138-row contract.

---

## 0. Market validation — the "desktop agent land grab" is real

易观 (Analysys) 2026-Q2 report: **17 Chinese desktop AI-native office agents**, **60M+ monthly visits in June 2026** (3× the ~20M of March). **Tencent WorkBuddy** leads (20.97M June visits — launched Mar 9 2026 by a ~10-person team, "fully compatible with the OpenClaw skill ecosystem", ships desktop + IM + mini-program); **ByteDance TRAE IDE** 12.79M; Alibaba folded QoderWork/悟空/MuleRun into **QwenWork** (Aug 3). Market forecast 212亿→449亿 CNY (+110% YoY).

**What this means for us — and why it does NOT change the build order:**

1. The "desktop is where agents turn from chat into action" thesis (our SPEC §1) is now a measured, funded market, not a bet. ✅
2. **WorkBuddy "compatible with OpenClaw skill ecosystem"** is the strategic tell: the winners are aggregating the open "Claw" skill/harness ecosystem, not replacing it. That is *exactly* our F12/J17 harness-driving + I2 skill-registry position — **we aggregate, we don't compete** with the CLIs.
3. The Chinese players are **cloud-model-first** (hosted Kimi/GLM/GPT/Claude). Our **local-first + BYOK + no-founder-server** stance remains the differentiator (same gap we noted vs holaOS in doc 58).

**Action: none to the matrix.** This is positioning ammunition for the SPEC §1 product line and P12 (GTM). No code steal — these are closed products.

---

## 1. DeepSeek Harness — "everything is a plugin" (STEAL, validates I6 + J5)

> **Repo:** `deepseek-ai/deepseek-harness` · **93,087⭐** · **MIT** · pushed 2026-08-13 · docs deepseek.com/harness · built on **Cordis** meta-framework. npx `@deepseek-ai/dsh`.

**What it is:** an agent *harness* (not a model) whose core axiom is **"everything is a plugin"** — models, tools, skills, sessions, sandboxes, storage, loops, scheduling, and even the UI are all plugins composed by configuration, mounted/unmounted/dependency-managed by the Cordis kernel. Second axiom: **"every run is traceable"** — an append-only session log records system prompts, reasoning, tool calls + results, subagent scheduling, and every context injection; the Trajectory view inspects by source, and resume/fork/search/replay all operate on the same event stream. Runtime modes: **Standard** (full toolset) / **Code** (model-generated code orchestrates multi-round tool calls via a Code Mode SDK) / **Minimal** (bash + str_replace_editor only, for model benchmarking) / **Creator** (inspect runtime, test plugins in memory, compose new presets).

**Why it matters — this is the strongest independent validation of two of our hardest spec rows:**

- **I6 (Extension/plugin ABI, doc 44 §5):** our "dogfood rule — first-party features ship as plugins; P4–P6 features built directly into crates and migrated to bundles once the ABI lands in P7" is *precisely* DSH's shipped model (even the UI is a plugin). 93K stars in one day proves the "everything is a plugin" harness is a product, not a paper. **Steal: the plugin taxonomy granularity (sessions/sandboxes/storage/loops/scheduling as first-class plugin slots), not their TypeScript/Cordis stack** — our ABI stays Rust `everyaios-guard` + capability allow-lists (Zed `CapabilityGranter`, doc 44), but the *slot list* should explicitly include **loop, scheduler, sandbox, and session-store** so a future "swap the loop" isn't a core rewrite.
- **J5 (audit trail) + P3 replay:** "every run is traceable → one append-only event stream → resume/fork/search/replay on that same stream" is *verbatim* our durable-event-model + idempotency design (doc 53 §4, 10 event types) and the BrowserOS/ACP audit NDJSON we already specified. **Steal: the Trajectory-view "inspect records by source" UX** as the P3.1/P3.2 cockpit's session-inspector affordance, and the explicit "context injection is also a logged event" rule (we log tool calls + file ops; DSH also logs *what was injected into context and when* — add that event type).
- **B1/B5 self-healing tool parsing (§7):** DSH's Code mode (model writes a TS program to batch tool calls) is a reference for our "Think-in-Code" script-eval (P2.5/E4, doc 33 §6.3). Already specified — no change.

**License:** MIT — we may reimplement patterns freely (never vendor Cordis itself).

---

## 2. OpenHuman — memory-as-markdown vault (REF/STEAL-pattern, GPL — learn-don't-copy)

> **Repo:** `tinyhumansai/openhuman` · **36,281⭐** · **GPL-3.0** · pushed 2026-08-14 · Rust core + TS. #1 trending on GitHub for 9 straight days after launch.

**What it is:** a personal-AI "super intelligence" = brain + orchestrator + deep researcher. The pieces that matter:

| Piece | What it does | Our row |
|---|---|---|
| **Memory Tree + Obsidian wiki** | data compressed into scored Markdown trees in SQLite, **mirrored as an Obsidian vault you open/edit** — "no vector-soup black box" | **C12** (markdown-vault *surface*), C8 |
| **Auto-fetch** | 100+ OAuth / 5k MCP / 90k skills sync into memory on a **20-minute loop** | C8 auto-sync benchmark |
| **Subconscious** | background loop diffs your world, advances goals, writes a morning briefing | (new idea — B7 background loop; post-v1) |
| **TokenJuice** | tool output compressed before it hits the model (up to 80% fewer tokens) | C10/pass-by-ref + rtk (doc 31) |
| **Orchestrator (tinyagents/tinyflows)** | checkpointed graph runs, HITL pause, resume mid-run, replay with per-call cost | **B3/B4 + H22** |
| **Split brain** | fast reflex agent triages inbound; deep reasoning core delegates to worker fleets | **B3** (shortest-path, doc 53 §5) |
| **A2A over Signal E2E + x402** | agent-to-agent orchestration, USDC bounties | B4/J17 (see §4) |
| **17 messaging channels + native email (IMAP IDLE/SMTP)** | agent reaches you where you are | **F13** |
| **Privacy Mode** | one switch = no inference leaves the machine, **enforced in the Rust core** | our local-first invariant |
| **agentmemory backend** | optional `memory.backend = "agentmemory"` — proxies to the same store Claude Code/Cursor/Codex/OpenCode already use | C1/C3 interop |

**Verdict: the single best reference for our C-section "one memory model" invariant (doc 60).** Two concrete steals, both *pattern-only* (GPL-3.0 → learn-don't-copy):

1. **"Memory as a readable Markdown mirror"** — our C12 already stores KG + vectors + sessions (Cognee/LadybugDB). OpenHuman's killer feature is the **Obsidian-compatible `.md` mirror** so the user can *read, edit, and git-version* their own memory. This is a *view/export surface*, not a second store — fold it into C12/C8 as "every memory asset also exports to `~/.everyaios/memory/**/*.md` with `[[wiki-link]]`s", preserving the doc-60 "one memory model" invariant (no second engine).
2. **20-minute auto-fetch cadence + "subconscious" background loop** — a concrete benchmark for C8 sync (we specified opt-in sync but no cadence; 20 min is the reference) and a candidate B7 background-loop idea (post-v1).

**Competitor note:** OpenHuman is a subscription-default product (Exa search bundled, hosted models default). Its GNU license + hosted-default model are the opposite of our BYOK/no-server stance — REF for UX + memory surface only, WATCH for positioning (same bucket as holaOS).

---

## 3. Local models — Muse Glimmer + Nemotron 3.5 Lightning + MLX (A5/A7 enrichment)

| Model | ⭐/license | What | Our A5/A7 effect |
|---|---|---|---|
| **Meta Muse Glimmer** | Apache-2.0 | 30B dense, **120K+ context**, multimodal, distilled from Muse, runs on a single consumer GPU (~20GB RAM in 4-bit) | **First major model built for always-on desktop agents.** Add to A5; **retire the "15–20K ctx warning" for this class** (120K ctx) |
| **NVIDIA Nemotron 3.5 Lightning** | open | 30B **MoE with 3B active**, "execution layer for always-on agents", up to 4× faster, NVFP4 | A5 + **A7** — a natural *executor/subagent* tier model (planner = strong model, executor = Nemotron Lightning) |
| **NeMo Switchyard** (NVIDIA) | open (no distinct repo found) | model-routing library — routes by quality/latency/cost | **A7 reference** (already have OmniRoute 13-factor scoring, doc 59 — Switchyard is NVIDIA's hosted/tooling twin) |
| **Rapid-MLX** (`raullenchai/Rapid-MLX`, 3,461⭐, Apache-2.0) | — | "4.2× faster than Ollama, 0.08s cached TTFT, 100% tool calling" on Apple Silicon | **A5 MLX backend** for Mac (native, no Ollama) |

**Action:** enrich A5 with (Muse Glimmer, Nemotron 3.5 Lightning, MLX-via-Rapid-MLX) + correct the ctx-warning to reflect the 120K-ctx model class; note Nemotron Lightning as the A7 executor-tier candidate. **No new row** — this is the A5/A7 catalog long tail. (No on-device *training* — Unsloth Desktop LoRA/QLoRA stays IGNORE/parked post-v1, consistent with doc 58's unsloth verdict.)

---

## 4. A2A protocol — secondary agent interface (REF, fold into J17/J21)

> **Repo:** `a2aproject/A2A` · **25,344⭐** · **Apache-2.0** · Linux Foundation · **v1.0 GA Mar 2026** · 150+ orgs (Google/Microsoft/AWS/IBM).

**What it is:** Agent-to-Agent for *opaque remote agents* — Agent Cards (JSON capability manifests) + v1.0 **Signed Agent Cards** (cryptographic identity), **AP2 Agent Payments Protocol**, MLS/quantum-safe E2E. Complementary to ACP, not competing: **ACP = drive a local CLI agent over stdio (our F12/J17); A2A = discover/invoke a remote agent by card.**

**Action:** fold into **J17** as the *secondary* interface — "ACP for local harness-driving (F12), A2A + Signed Agent Cards for remote/third-party agent discovery & identity (J21)". **No new row** — this is the same "unify, don't reimplement" principle, now with the industry-standard remote-discovery card format. AP2 (agent payments) noted for future monetization; out of v1 scope.

---

## 5. Flock / nilbox / OpenOcta / RepoMapper — ADAPT/REF (H22, J8/E9, F13, I7)

| Repo | ⭐ | License | Verdict → row |
|---|---|---|---|
| `Onelevenvy/flock` | 1,098 | Apache-2.0 | **ADAPT** — Rust desktop multi-agent harness + **visual workflow editor** (node graph, sandboxed local agents). Confirms H22's drag-and-drop builder direction (ReactFlow-class); our H22 already = "NL + templates" → add "visual node graph" as the editor surface (Flock/OpenHuman-tinyflows pattern) |
| `rednakta/nilbox` | 14 | GPL-3.0 | **REF** — desktop sandbox running agents/MCP on a **dedicated Linux VM** with **Zero Token Architecture** (host proxies requests + injects keys; agent never sees the real API key) + agent firewall + one-click store. Validates our **J8 "keys never reach the agent"** as a *named principle* (we already do this via the credential broker, doc 53 §2) + E9's VM-isolation ceiling. Learn-don't-copy (GPL) |
| `openocta/openocta` | 3,062 | Apache-2.0 | **REF** — China's first open-source personal desktop agent: single Go binary (~30MB) + embedded Control UI + **IM remote (WeChat/DingTalk/Feishu)** + 4-level memory + L4 evolution + Skills/MCP/Knowledge Vault. Validates F13's IM-bridge demand (Asia) + C9's "memory that evolves" + the "single-binary install" benchmark. Go → we stay Rust/Tauri |
| `pdavis68/RepoMapper` | 195 | MIT | **REF** — MCP server: tree-sitter + PageRank + binary-search to fit a repo map into a token budget. Confirms **I7 RepoMap** (already specified, doc 46/51 aider origin) — no new work, cite as an MCP-surface reference |

---

## 6. Role-based model routing — already ours, ACRouter is the research tail

The "planner/executor/verifier split" (Aider architect/editor, Pi Flow, Relay, LazyCodex) is **already covered** by A7 (planner_model/subagent_models) + B3 + doc 05/46/56. New research finding: **Agent-as-a-Router / ACRouter** (arXiv 2606.22902) formalizes routing as a **Context→Action→Feedback loop with cumulative regret** as the streaming metric. Our A7 already has the production-grade version (OmniRoute 13-factor weighted scorer + mode packs, doc 59); ACRouter adds the *learning* dimension (regret-minimizing router that adapts over time). **Action:** note in A7 as the post-v1 dynamic-learning tail — not now.

---

## 7. MCP 2026-07-28 — we already cite it; two explicit additions

The stateless rewrite (drop sessions/initialize, header-based routing, cacheable lists with `ttlMs`, **MRTR** multi-round-trip) is already referenced in SPEC §F6/F7 (via doc 34/52). Two explicit asks from this batch worth writing down:

1. **MRTR support** for long-running ops (B1 loop, B6 subagents) — mid-call input without held-open streams.
2. **Cacheable tool lists (`ttlMs`)** in our F7 server + F6 client — stop refetching tool catalogs on reconnect (startup-latency target).

**Action:** one-line enrichment each to F6/F7 (below). WebMCP (Cloudflare, Aug 6) → add to the browser network-containment surface list in ARCH/06 §6.15 as a new attack vector (noted for the next ARCH/06 pass).

---

## 8. Unverifiable flags — never cite

Six of the pasted "repos" do not exist as described. Live API checks (2026-08-14) return 404 or resolve to a *different* project:

| Claimed | Reality | Flag |
|---|---|---|
| **RavenClaws** (Rust swarm orchestration, 4 topologies, self-healing circuit breakers, WASM Plugin ABI, 5.2MB binary, Cosign+SBOM) | no such repo; only `The-Swarm-Corporation/swarms-rs` / `swarmclawai/swarmclaw` / `ClawSwarm` exist | ⚠️ **unverifiable — do not cite swarm/self-healing/WASM/SBOM claims to it** |
| **ReflexionOS** (ActionReceipts, 8-level effect classification, 80+ commands) | 404; `ReflexioAI/reflexio` is a *different* self-improvement harness | ⚠️ **unverifiable** (the "8-level effect classification" idea is good but must not be sourced here — see note) |
| **Keelson** (Tauri + Tantivy workbench) | 404 | ⚠️ **unverifiable** |
| **"Iroh desktop agent"** (dual-privilege AI_Worker, time-travel snapshots, `.gemini/brain`) | `n0-computer/iroh` (12,161⭐, Apache-2.0) is a **p2p QUIC/NAT library**, not a desktop agent | ⚠️ **conflated — the p2p lib is irrelevant; the "desktop agent" claims unverifiable** |
| **Distri** (markdown+TOML agents, A2A) | 404; closest real spec = `wso2/agent-flavored-markdown` (AFM) | ⚠️ **unverifiable** (the *pattern* — declare agents in markdown+frontmatter — is real via AFM/AGENTS.md, cite those instead) |
| **M1K3** (Apple Silicon MLX agent) | 404; the MLX-on-Mac pattern is real via `mlx-lm` / `raullenchai/Rapid-MLX` | ⚠️ **unverifiable — cite Rapid-MLX/mlx-lm, not M1K3** |

**Note on "8-level effect classification" (ReflexionOS claim):** the *idea* — rate every command read-only → destructive on a fixed ladder before execution — already exists in our Trust Ladder (J1) + Guard-1 deterministic pre-scan + doc 53 ticket risk classes. Keep our taxonomy; do not attribute it to an unverifiable repo.

---

## 9. Steal → code mapping (all reimplement, none vendor)

| # | From | To | Action |
|---|---|---|---|
| 1 | DeepSeek Harness (MIT) | I6 | add **loop / scheduler / sandbox / session-store** to the plugin slot taxonomy; keep Rust guard + capability allow-lists |
| 2 | DeepSeek Harness | J5/P3 | add **"context injection"** as a logged event type; Trajectory-view inspect-by-source UX → P3.1/P3.2 |
| 3 | OpenHuman (GPL, pattern) | C12/C8 | add **Obsidian-compatible `.md` memory mirror** (`[[wiki-link]]`s) as an export *surface*, not a second store |
| 4 | OpenHuman | C8/B7 | **20-min auto-fetch** cadence benchmark; "subconscious" background loop as post-v1 B7 idea |
| 5 | Muse Glimmer / Nemotron Lightning / Rapid-MLX | A5/A7 | catalog additions + retire 15–20K ctx warning; Nemotron Lightning = A7 executor-tier candidate; MLX = Mac backend |
| 6 | a2aproject/A2A | J17/J21 | A2A + Signed Agent Cards as the **remote-agent** secondary interface (ACP stays local-harness primary) |
| 7 | Onelevenvy/flock | H22 | visual node-graph editor surface (ReactFlow-class) |
| 8 | rednakta/nilbox | J8/E9 | name the **"keys never reach the agent"** principle explicitly; VM-isolation ceiling for E9 |
| 9 | pdavis68/RepoMapper | I7 | cite as MCP-surface reference (no new work) |
| 10 | MCP 2026-07-28 | F6/F7 | MRTR + cacheable `ttlMs` tool lists |

**Ledger:** 247 → **255 repos** (8 new live: deepseek-harness, openhuman, A2A, Rapid-MLX, openocta, flock, RepoMapper, nilbox). **Unverifiable (6, never added):** RavenClaws, ReflexionOS, Keelson, Iroh-desktop-agent, Distri, M1K3.
