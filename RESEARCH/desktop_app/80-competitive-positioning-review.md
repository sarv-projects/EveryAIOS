# 80 — Competitive Positioning Review: EveryAIOS vs. the Global Desktop-AI Landscape (external benchmark, reviewed & corrected)

> **Source:** external product benchmark provided 2026-08-17 — a **forward-looking** assessment of EveryAIOS at *full v3.21 spec build* (explicitly not a claim of current production state). This doc is the fact-checked, corrected, repo-mapped version.
> **Verification:** competitor claims live web-verified 2026-08-17 against first-party pages/docs (sources §7). EveryAIOS claims cross-checked against the actual codebase (`DESKTOP-APP-SPEC.md` v3.21, `crates/`, `src-tauri/`, `ui/`, `TODO.md`).
> **Repos:** 0 new repos — **ledger unchanged 281**.
> **Verdict on the benchmark:** unusually accurate and current; its §8 release conditions map **exactly** onto the repo's real open seams (this is its most valuable insight). Applied corrections: 4 scorecard cells re-scored, 2 stale competitor classifications fixed (Cline, Gemini Notebook), 2 comparators added (Warp, OpenAI Atlas), OpenClaw promoted from footnote to closest-architectural-peer, 1 dead URL fixed.

---

## 1. Verified correct — the benchmark's claims hold

### 1.1 EveryAIOS baseline (spec/code): all real

| Baseline claim | Repo evidence |
|---|---|
| Tauri/Rust/TypeScript hybrid runtime | `src-tauri/` (v2) + 17 `crates/` + Bun-compiled coordinator (`packages/coordinator`) |
| Ticket-gated privileged execution | `everyaios-guard` — `TicketStore`, `GuardReceipt`, `DecisionPackage`, `GuardService::evaluate`/`use_ticket` (P7.4, J21) |
| Native office/file engines | `everyaios-office`: docx block-patch (genoffice), IronCalc recalc + calamine + deterministic planner, pptx part-editor, pdf suite (lopdf), LibreOffice conformance oracle, `Snapshot` rollback (D1–D8) |
| Browser/session vault | `everyaios-cdp` + Session Vault cookie seal→inject, agent never sees raw cookies (E11/E13), challenge handler (E12), behavioral realism (E14), replay (E5) |
| Local memory/research | `everyaios-memory`: RRF fusion, ACT-R, taste (C9), compaction, graph (C6), Letta paging, FSRS, ghost-index, BM25 |
| MCP/ACP interoperability | `everyaios-mcp` registry (42 tools: 37 browser + 5 storage) + `everyaios-acp` (wire types, `AcpSession` lifecycle, LaunchRegistry — 46 agents, installer, Guard-2-ticketed download) |
| Extension ABI (I6) | spec'd (versioned manifest + granter + host facades); **not yet built** — post-v1 queue |

### 1.2 Competitor facts: all live-verified primary sources

| Claim | Verification (2026-08-17) | ✅ |
|---|---|---|
| Claude Desktop = Chat + Cowork + Code; local execution, parallel sessions, computer use | Anthropic help center + release notes (2026-08-06: "Cowork brings Claude Code's agentic capabilities to the Desktop app… runs locally"); desktop-only live artifacts + local MCP plugins; computer control (2026-04) | ✅ |
| Copilot Cowork: plan-and-action grounded in M365, approval checkpoints, auditable, cloud sandbox | Microsoft Learn + product page: "Cowork actions are auditable, sensitive steps pause for approval" (risk indicator); GA 2026-06-16; 3rd-party: "entirely in the cloud" | ✅ |
| LM Studio Bionic: work/code agent w/ documents, automations, computer control | LM Studio blog (2026-07-16): "Bionic = the AI agent … document creation/editing, coding, automations, computer control" | ✅ |
| Perplexity Comet: Mac/Win/iOS/Android personal-assistant browser | perplexity.ai/comet + App Store/Play listings; task automation in-browser | ✅ |
| NotebookLM: code execution, web-source discovery, grounded answers, rich deliverables (reports/charts/docs/slides/sheets) | Google blog (2026-06-08) + TechCrunch (source repository from chat) | ✅⚠️ see §2.2 (renamed) |
| Raycast: multi-model AI, AI Extensions/Commands, local Ollama, BYOK | Raycast changelog v1.99 (local models w/ Ollama, 2025-05) + v1.100 (BYOK, 2025-06) | ✅ |
| ChatGPT Work / Desktop: apps+files+browser, computer use, plugins, scheduled tasks, document generation (docs/slides/sheets/Sites), Codex-style agent | OpenAI announcement + independent 2026 coverage | ✅ |
| VS Code agents: plan→edit→test→self-correct, browser tools, custom agents/skills/MCP/hooks/plugins, approvals | code.visualstudio.com/docs/agents | ✅ |
| Cursor Cloud Agents: isolated VMs, MCP, hooks, PRs, remote desktops, Slack/Linear/API entry | cursor.com/docs/cloud-agent | ✅ |
| Devin Desktop: embedded cloud agent, VM, browser/computer use, PR review, Agent Command Center/Spaces | docs.devin.ai/desktop | ✅ |
| Junie: multi-step plans, broad edits, terminal/tests, approvals+rollback, MCP, debugger | JetBrains Junie official | ✅ |
| Raycast §4.9 summary (OS context, web, local storage, sync, Ollama, BYOK) | raycast.com/core-features/ai | ✅ |

### 1.3 The strategic reads that are right
- "Would **not** be the best IDE / browser / cloud agent / enterprise suite" — correct and matches the project's own non-goals (spec §8).
- "Concede tenant-native (M365/Google) and IDE depth rather than fight" (§5–6) — matches doc 68's competitor conclusions.
- "CDP child browser ≠ everyday browser; use system browsers + tiers" (§4.9) — matches the tiered browser architecture (E10/E13 + Lightpanda/Obscura).
- The five **release conditions (§8)** map one-to-one onto the TODO's actual open seams (see §4) — the most valuable part of the document.

---

## 2. Corrections applied to the benchmark

### 2.1 Scorecard corrections (EveryAIOS row)

Scores = *designed capability surface*, not quality (benchmark's own framework). Even so, four cells overclaim what the spec itself defines.

| Cell | Original | Corrected | Why |
|---|---|---|---|
| Coding | 4 | **3** | Spec §6.9: coding = "review/orchestration … not a multi-year attempt to recreate a full IDE". A category-defining coding workbench it is not; the benchmark's own §4.5–4.7 concede IDE depth. |
| Browser/computer | 4 | **4 (browser) / 2 (computer use, v1)** | Browser plane genuinely 4 (tiers, session vault, replay, WebMCP). But pixel-level computer use (E9) is a **post-v1 non-goal** — "DOM snapshot > pixel in v1" (spec §8). The cell conflates a 4-worthy browser with a v1-absent computer-use half. |
| Research/data | 4 | **3** — gate to 4 | §4.4 of the benchmark itself: "**do not market as a NotebookLM replacement before citation-fidelity and source-grounding are independently demonstrated**". The corpus-research surface (H31) is a post-v1 queue item. |
| Agent workspace | 4 | **4*** — see footnote | Designed surface genuinely 4 (blueprints/DAG, automation, crystallization, ACP cockpit). Actual live agent loop does **not** exist yet (condition 1 — the "tool-executor seam", spec §6). | 

Other cells kept: Office **4** (engine-true is genuinely category-differentiating), Local/BYOK **4** (broker, ring fail-over, OAuth, SQLCipher vault — real), Tools/connectors **4** (at full build; today = MCP-first surface, F8 install, native catalog seed), Governance/durability **4** (deepest designed surface), Interop **4*** (ACP + MCP + ABI designed; real-agent tests pending condition 5).

### 2.2 Stale classifications / missing comparators

1. **NotebookLM → "Gemini Notebook"** (Google rename, 2026-07-16 — same product, new name). §2/§4.4 to be updated; reference [5] keeps the June blog (still valid).
2. **Cline is no longer "IDE extension/CLI" only** — Cline Desktop ships a real **standalone desktop app** (v0.0.6, 2026-07-28; macOS-first "Cline Code"; OAuth for remote MCP servers; BYOK, local-first). Belongs in §2 (local/BYOK table) or at least the adjacent list with a correction.
3. **OpenClaw = closest architectural peer, not a footnote.** OpenClaw is an open-source, local-first agent OS (kernel-with-syscalls class — the same class the repo validated against OpenFang/ZeroClaw in doc 42) with agent-managed Chrome/Edge profile browsing, apps/files/APIs, computer use, running on-user hardware; its product surface is chat-apps-first (Telegram/Discord…) rather than a GUI desktop, which defends "adjacent, not scored" — but at "full build" EveryAIOS beats it on governed GUI, ticket/audit, and office-engine fidelity, and the benchmark should say so explicitly instead of a one-line mention.
4. **Warp (agentic dev-environment) missing.** Warp is a real desktop product: Rust terminal + agent orchestration, universal CLI-agent support (Codex/Claude Code/…), parallel+programmable+auditable agents, MCP; open-sourced (2026). Should sit in §4.7/adjacent.
5. **OpenAI Atlas missing.** The agentic-browser peer set is "Comet, **Atlas**, Dia, Opera Neon" (2026 surveys). §6 name-drops Dia; Atlas (OpenAI) is the bigger one.
6. **Gemini desktop app missing** from §2/adjacent: native Gemini for macOS (2026-04-15, with screen context + task automation; Windows build present). Adjacent consumer assistant, not a direct same-category peer.
7. **Ref [3] URL moved** → `code.claude.com/docs/en/desktop` (was docs.anthropic.com/en/docs/claude-code/desktop).

---

## 3. Corrected capability matrix (full-build design)

| Product | Agent workspace | Coding | Office/files | Browser/computer | Research/data | Local/BYOK | Tools/connectors | Governance/durability | Interop |
|---|---|---|---|---|---|---|---|---|---|
| **EveryAIOS — full build (corrected)** | 4* | **3** | 4 | **3/2** | **3→4 gated** | 4 | 4 | 4 | 4* |
| ChatGPT (Work/Codex/index) | 4 | 4 | 3 | 4 | 3 | 0 | 4 | 3 | 3 |
| Claude (Desktop/Cowork/Code) | 4 | 4 | 3 | 4 | 3 | 0 | 3 | 3 | 3 |
| M365 Copilot Cowork | 4 | 1 | 4* | 1 | 3 | 0 | 4* | 4* | 3 |
| Gemini Notebook | 3 | 2 | 3 | 2 | 4 | 0 | 2 | 3 | 1 |
| VS Code Agents/Copilot | 1 | 4 | 0 | 2 | 1 | 4 | 4 | 4 | 4 |
| Cursor | 1 | 4 | 0 | 3 | 1 | 1 | 3 | 3 | 3 |
| Devin Desktop | 1 | 4 | 0 | 3 | 1 | 0 | 2 | 3 | 2 |
| Zed | 1 | 4 | 0 | 1 | 1 | 3 | 3 | 2 | 4 |
| JetBrains Junie | 1 | 4 | 0 | 1 | 1 | 2 | 3 | 3 | 3 |
| Raycast AI | 3 | 1 | 1 | 1 | 2 | 3 | 4 | 2 | 3 |
| LM Studio Bionic | 2 | 2 | 2 | 2 | 1 | 4 | 2 | 1 | 1 |
| AnythingLLM | 3 | 1 | 1 | 1 | 3 | 4 | 3 | 2 | 3 |
| Jan | 2 | 1 | 1 | 1 | 2 | 4 | 3 | 2 | 2 |
| Cherry Studio | 2 | 1 | 1 | 1 | 2 | 4 | 3 | 1 | 2 |
| Comet | 3 | 0 | 0 | 4 | 3 | 0 | 2 | 1 | 1 |

Footnote. * EveryAIOS: 4* = designed surface that is not yet live (agent loop / two-real-ACP-agents / MCP server — conditions 1 + 5; today's actual build scores ~3/3/4/2–3/3/4/3/4&4 on those columns). M365: 4* = category-defining inside the 365 tenant. Rest unchanged from the benchmark (verified against 2026 primary sources).

---

## 4. The five release conditions → live repo status (the actionable core)

The benchmark says the competitive conclusion is "valid only if" these five hold. Here is exactly where the repo stands (re-verified 2026-08-16/17):

| # | Condition | Repo status | Evidence |
|---|---|---|---|
| 1 | Mandatory ticket path for every mutation — no back door | 🔴 **OPEN (the #1 seam)** | `GuardService::evaluate`/`use_ticket` built + tested + wired over `guard/*` JSON-RPC, but **no tool executor in the coordinator invokes them yet** (spec §6 "Remaining"; same seam as TODO P6/P7 wiring). |
| 2 | Office demonstrably correct (golden tests, LibreOffice round-trip, recalc, rollback, reviewable diffs) | 🟢 **DONE core** | `parts_diff`/atomic write/`Snapshot` (D6/D7), LibreOffice conformance tests, IronCalc recalc + engine-diff in the UI, xlsx insert/delete/structure tests. |
| 3 | Browser automation safer than generic agents (scoped session, injection, visible approvals, replay, no-raw-cookie) | 🟢 **LARGELY LANDED** | Session Vault (E11/E13), Challenge handler (E12), realism (E14), injection defense (P7.6), replay/audit — each with tests; untested on real authenticated workloads. |
| 4 | Simpler than its architecture (first-run experience) | 🟡 **UI v2 built; unproven** | v2 cockpit exists (108 files) but no first-run/simplicity test evidence. |
| 5 | Interop with real agents/MCP, not mocks | 🟡 **MCP registry real; agents pending** | mock-transport ACP lifecycle tested; TODO P6.8 "two external agent CLIs run side-by-side" = NOT DONE (needs real binaries); `everyaios-mcp` server surface (F7) not built (P6.7); ACP + install + auth flows all landed. |

**Action:** treat §8 as a release gate; conditions 1 and 5 are exactly the two TODO items blocking the marketing claim.

---

## 5. Strategic verdict (endorsed + one addition)

Endorse the benchmark's positioning:

> **"Sovereign Agentic Workstation"** — a local-first, model-neutral, protocol-native desktop control plane for real files, real browsers, real tools, and real agents.

Also endorsed without change: the avoid-list (§7.2), the buyer profiles (§7.1), and the six leadership properties (§5). **Addition:** concede OpenClaw (and the ZeroClaw/OpenFang family, per doc 42–44) as the same thesis; EveryAIOS's differentiation is not "the only local-first agent OS" but the **governed, GUI-native, audit-first, engine-true** implementation of it. Also: never ship a marketing claim that requires conditions 1 + 5 to be true before they are.

User-adoption notes: the benchmark's §4.8 weakness analysis (capability advantage becomes a usability liability without a simple first-run) matches doc 68; recommended mitigations (chat-first progressive disclosure, opinionated starter packs) are documented in the UI spec (UI-DESIGN-PROMPT.md).

---

## 6. Sources (verified 2026-08-17)

| Claim | Source |
|---|---|
| Claude Desktop Chat/Cowork/Code, local exec, computer control | https://support.claude.com/en/articles/13345190 (get-started with Cowork) · https://support.claude.com/en/articles/12138966 (release notes 2026-08-06) · https://code.claude.com/docs/en/desktop |
| Copilot Cowork | https://www.microsoft.com/en-us/microsoft-365-copilot/cowork · https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/ |
| LM Studio Bionic | https://lmstudio.ai/ · https://lmstudio.ai/blog/introducing-lm-studio-bionic (2026-07-16) · https://lmstudio.ai/docs/bionic |
| Perplexity Comet | https://www.perplexity.ai/comet · https://apps.apple.com/us/app/comet-ai-browser-assistant/id6748622471 |
| Gemini Notebook (rename) | https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/ (2026-07-16) |
| NotebookLM research features | https://blog.google/innovation-and-ai/products/notebooklm/better-research-notebooklm/ (2026-06-08, "source repository from chat") |
| ChatGPT Work | https://openai.com/index/chatgpt-for-your-most-ambitious-work/ |
| VS Code agents | https://code.visualstudio.com/docs/agents/overview |
| Cursor Cloud Agents | https://cursor.com/docs/cloud-agent |
| Devin Desktop | https://docs.devin.ai/desktop |
| Zed | https://zed.dev/ |
| Junie | https://www.jetbrains.com/help/ai-assistant/junie-agent.html |
| Raycast local/BYOK | https://www.raycast.com/changelog/macos/1-99-0 (2025-05) · https://www.raycast.com/changelog/macos/1-100-0 (2025-06) · https://www.raycast.com/core-features/ai |
| Cline Desktop | https://www.devagentradar.com/assistants/cline (v0.0.6 2026-07-28, "first public release of Cline Code for macOS") |
| OpenClaw | https://openclaw.ai/ · https://docs.openclaw.ai/tools/browser (agent-managed Chrome profile) · https://github.com/openclaw/openclaw |
| OpenAI Atlas browser | https://asteroid.ai/blog/what-are-browser-agents/ · https://www.firecrawl.dev/blog/best-browser-agents ("Comet, Atlas, Dia, Opera Neon", 2026-06-16) |
| Dia (Browser Company) | https://www.diabrowser.com/ · https://nohacks.co/blog/agentic-browser-landscape-2026 (mid-2025, Mac) |
| Gemini desktop | The Verge 2026-04-15 (native macOS app) + https://gemini.google/mac/ |
| EveryAIOS current repo state | `DESKTOP-APP-SPEC.md` v3.21 · `TODO.md` (reconciled 2026-08-16: 884 tasks / 438 done) · `crates/` 1052 workspace tests |

---

## 📊 Summary

- External benchmark: **technically accurate and current (verified 2026-08-17)**, strategically sound, honest about being forward-looking.
- Corrections: 4 scorecards changed with spec-consistent rationale; Cline Desktop reclassified; Gemini Notebook rename; OpenClaw promoted to first-peer; Atlas/Warp/Gemini-desktop added; one dead URL.
- Its **five release conditions = a live TODO gate** (conditions 1 + 5 == the tool-executor seam + the two-real-ACP test). Actionable next step: implement condition 1 (coordinator tool loop calling `GuardService::use_ticket`) — it both clears the marketing claim and unlocks P6/P7 executor wiring.