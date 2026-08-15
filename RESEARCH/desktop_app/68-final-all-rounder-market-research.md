# 68 — Final All-Rounder Market Research (2026) & Capability Scorecard

> **Date:** 2026-08-15 · **Method:** web-verified against primary sources (vendor help centers, official announcements, JetBrains Apr-2026 survey) + cross-checked against our own docs 66–67 + ARCH/12 v2.0. **0 new GitHub repos** — this is a market/competitive consolidation, not a steal pass.
> **Where it lands:** three new capability rows (**H30/H31/H32**), one extension (**H18** mobile note), two cross-cutting extensions (**F12/J17 two-channel capability injection**, **A6/A7 agent-scoped model picker**), and the positioning record vs the competitors the prior analysis conflated.
> **Verdict up front:** finished EveryAIOS is the **widest** desktop-agent surface in the field, and the only one that is **local-first + BYOK + engine-true Office + verified-completion + ACP cockpit**. It loses on default brain (frontier model baked in), habit/brand, and cloud-continue-when-lid-closed. That is the honest, verified trade.

---

## 1. The 2026 field, capability-by-capability (verified scorecard)

Legend: ● = they do it well as the product · ◐ = partial / add-on · ○ = not the product. **EveryAIOS column = if the spec ships and is tested** (queued items are marked ◐/⚪, not claimed as done).

| Capability | Claude Desktop | ChatGPT Desktop | Cursor | Copilot | AnythingLLM / Jan | **EveryAIOS (final)** |
|---|---|---|---|---|---|---|
| Chat, stream, fork | ● | ● | ● | ◐ | ● | ● |
| Any model / BYOK / many keys / failover | ○ (Claude-only*) | ○ (OpenAI-only*) | ◐ some | ○ (Microsoft) | ● | ● designed for this |
| Local models first-class (Ollama/llamafile/MLX + hardware-fit) | ○ | ○ | ◐ | ○ | ● | ● |
| No vendor account | ○ paid | ○ paid | ○ paid | ○ work ID | ● | ● |
| Data on disk, no founder cloud | ○ | ○ | ◐ | ○ | ● | ● vault + no founder server |
| Point at a folder → run a job | ● Cowork | ● Work | ● repo | ◐ | ◐ workspace | ● |
| Surgical Word/Excel/PPT/PDF (engine math, byte-stable) | ◐ create + Office add-ins | ◐ artifacts/Work | ○ | ◐ (M365 Copilot Cowork: ● in-app) | ○ chat-with-docs | ● IronCalc + OOXML |
| Live your Chrome (logged-in, no raw cookies to model) | ◐ Chrome ext | ◐/computer-use | ◐ embedded | ○ | ○ | ● Session Vault + attach |
| Cheap browser / scrape / slim snapshot | ○ | ○ | ○ | ○ | ○ | ● tiers + 37 tools |
| Drive Claude Code / Codex / Aider in one window (ACP) | ○ they are Claude | ○ they are Codex | ○ Cursor agent | ○ | ○ | ● this is the product |
| IDE-grade Tab / inline edit | ○ | ○ | ● | ● | ○ | ◐ Code view + "Open in Cursor" |
| Repo map / LSP / tests | ● Code tab | ● Codex | ● | ● | ○ | ● (I7/I11) — less polished than Cursor |
| Memory that persists | ◐ projects; chat≠Cowork | ● | ◐ rules | ◐ | ● RAG | ● one store + taste + FSRS |
| Schedule / wake same thread | ● cloud cron | ● heartbeat | ◐ | ◐ | ◐ | ● local + lease (B7) |
| Approve before mutate / hard $ cap | ◐ modes | ◐ | ◐ | ◐ | ○ | ● one ticket + default $2 cap |
| "Done" checked with files/tests | ○ they say so | ○ | ◐ tests if asked | ○ | ○ | ● EV1 |
| Phone / continue in cloud | ● | ● | ◐ cloud agents | ◐ | ○ | ⚪ later (H18) |
| Voice memo → structured report | ● (headline) | ● | ○ | ◐ | ○ | ⚪ **H30 (new)** |
| Corpus-first research + audio digest | ◐ | ◐ | ○ | ◐ | ◐ | ◐ **H31 (new)** |
| Image / voice / Sites-hosted | ◐ | ● | ○ | ◐ | ○ | ◐ H29 localhost Sites; voice later |
| Agent picker w/ per-agent model surface | ○ | ○ | ◐ | ○ | ● | ● **H32 (new)** |
| Install: double-click, no Docker | ● | ● | ● | ● | ◐ (AnythingLLM heavy) | ● |

*\*Third-party models exist at the edges; the product is still one lab.*

---

## 2. What the earlier analysis missed (the real 2026 additions)

The prior scorecard (doc 67 turn) conflated "Copilot" into GitHub Copilot and had no Google column. Verified corrections:

### 2.1 Microsoft **Copilot Cowork** (launched Mar 9, 2026) — a first-class competitor, not a footnote
- **What it is:** an in-app agent inside Microsoft 365 — executes multi-step work across **Outlook, Teams, Excel, PowerPoint, Word** (Microsoft's own blog, Mar 2026). "Copilot Cowork turns intent into action across Microsoft 365."
- **Why it matters to us:** this is the **closest rival to our Office engine + folder jobs**, and it lives inside the apps people already pay Microsoft for. The prior "Copilot ○ for Word/Excel" row was only true for *GitHub* Copilot.
- **Where we win:** they are **Microsoft-graph-locked** (OneDrive/Outlook tenant, enterprise admin gated) and **not local-first / not BYOK / not engine-verified** in the sense we are (they generate; we patch byte-stable OOXML + IronCalc truth + LibreOffice oracle). Our **sovereignty + surgical-Office + multi-agent + tickets** is the contrast; their **installed-tenant reach** is the wall (recorded in §8 non-goals, not a feature we can out-run).

### 2.2 Google **Gemini Notebook** (NotebookLM renamed; runs Gemini 3) — the research-surface competitor
- **What it is:** corpus-first research assistant grounded in *your* sources — **Audio Overview** (podcast-style), **Video Overviews**, **mind maps**, **flashcards**, **quizzes**, reports (Google + Feb-2026 DigitalOcean + elephas "runs on Gemini 3").
- **Why it matters:** it is the **daily-driver research surface** the prior analysis's table had no column for. Our machinery (C-series RAG + EV1 citations + G2 deep research + FTS5/vector/graph fusion) already covers the *grounding*; what we lack is the explicit **surface** (pick sources → ask → cited answer) and the **audio-digest output** (rides H28 TTS). → **H31**.

### 2.3 **Gemini-in-Workspace** — the in-app Gmail/Docs/Sheets agent
- **What it is:** Gemini agent inside Google Workspace (draft/answer in Gmail, Docs, Sheets) — a whole product category, the Google twin of Copilot Cowork.
- **Translation for us:** our **F14/F15 (email/calendar) + browser-session connectors (F3) + Office engine (D1–D4)** already cover the equivalent *capability*; the gap is only the **in-app presence**, which we deliberately do not chase (we are the control plane *above* those apps, not inside them — SPEC §1 positioning). Recorded as a positioning note, not a row.

---

## 3. The three concrete spec gaps (now tracked)

| Gap | Cowork/Work/NotebookLM evidence | Our status | New row |
|---|---|---|---|
| **Voice memo → structured report** | Cowork help center verbatim: "Reports from messy inputs: turn voice memos and scattered notes into polished documents" | H15/H28 cover STT/TTS *I/O* (both ⚪ deferred); no *workflow* row | **H30** (⚪) |
| **Corpus-first research surface + audio digest** | Gemini Notebook: sources → grounded cited answers + Audio/Video Overview + mind map | Machinery exists (C-series + EV1 + G2); no explicit surface + no audio-digest output | **H31** (🟡 surface; audio digest rides H28 ⚪) |
| **Mobile companion surface** | Cowork/Work ship phone apps to monitor/steer | H18 is LAN/Tailscale *remote control of a running session* — not a mobile *surface* | **H18** note (⚪) |

---

## 4. Agent picker + agent-scoped model surface + two-channel injection (the ACP/MCP cockpit)

Verified from the official ACP spec (protocol/v1) + the agent registry (38 agents: Claude Agent, Codex, Gemini CLI, Qwen Code, OpenCode, Goose, Copilot, Kiro, OpenClaw…).

- **Agent picker (H32):** pick an agent → `initialize` capability card → our chat bar renders the agent's **live `available_commands`** + `@` + mode indicator. One consistent UI; per-agent vocabulary.
- **Agent-scoped model picker (A6/A7):** ACP carries **no model field** — the model is the agent's own config. Tap Codex → Codex models; tap Claude Code → Anthropic models; never the 364-model grid. The models.dev catalog (doc 66) lives *only* in the **native engine** picker, and even there as **intent-first** (Fast/Quality/Private/Cheap) + a power-user drawer.
- **Two-channel capability injection (F12/J17 + F7):**
  - **Channel A — ACP mediates I/O:** the agent asks *us* for `fs/read`, `fs/write`, `terminal/*`. We intercept every one → slim/bounded previews + pass-by-reference (token-minimizing at the boundary), RTK shell compression, **Guard-1 pre-scan + audit before run**, **Guard-2 ticket + diff card before write**. Works for *any* agent, at the protocol boundary.
  - **Channel B — MCP exposes our engine as tools:** `everyaios-mcp` (F7) serves Office surgical editor + IronCalc, browser 37-tool catalog + Session Vault, search cascade (G8), memory retrieval (C-series), storage intelligence — so Claude Code *and* Codex *and* Cursor all get our capability set.
  - **EV1 works across agents:** verified-completion checks the *final state*, not who did the work.
- **Honest boundary:** we **mediate and provide** but cannot rewrite an agent's in-loop planner/compaction (proprietary). Their brain, our hands, our guard, our verification.

---

## 5. Where the finished app is ahead / behind (honest, unchanged)

**Ahead (the control-plane bet):**
1. One session across Office + browser + code + mail — no Chat/Cowork/Code product split.
2. "Bring five brains, one approve card" — run their agents (ACP) + DeepSeek/Ollama on the same ticket; nobody they pay for does this.
3. Office as truth (IronCalc + surgical patch), not "here's a generated xlsx, hope the formulas work".
4. Keys never reach the model; spend dies on a number (metered BYOK, not burned cloud quota).
5. Verifier — "it said done" is a Reddit wound; EV1 treats it as a product feature.
6. Local Sites (H29) vs ChatGPT hosted Sites — same idea, opposite sovereignty.

**Behind (the walls we already acknowledge in SPEC §8):**
- Frontier model baked in (people open Cowork because Opus/GPT is the worker).
- Cursor as home (they already type there; our Code view is a lens + "Open in Cursor").
- Copilot at work (IT installed it; we won't displace that with open source).
- Cloud-continue when the lid is closed (Cowork/Work are cloud; we're local-first, H18 later).
- Habit + brand + polish (two clicks, already signed in vs our first shipping window).

**Score:** *breadth* — finished EveryAIOS is the widest desktop-agent surface in the table. *Depth on code/chat* — still behind Claude/Cursor. *What people pay for today* — brains and habit, not breadth. So the fight we win is the **five-window Frankenstein** (chat + AnythingLLM + browser MCP + Office + Claude Code) — that is the only "most-used stack" our spec matches, and it is the one we replace.
