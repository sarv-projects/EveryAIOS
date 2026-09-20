# Competitive Positioning — P16 Deltas (doc 68, 2026-08-15)

> **Status:** research verdicts folded from doc 68 §2/§3 into the P12.1 GTM
> competitive analysis (P12 queue). Every claim below is a **positioning
> verdict**, not a shipped feature — the P12 queue owns the actual GTM
> packaging.

## 1. M365 Copilot Cowork / Gemini Notebook — the verdicts we compete with

### Microsoft 365 Copilot Cowork (doc 68 §2)
- **What it is:** an in-app M365 agent — meetings/email/calendar/Office docs
  inside the Microsoft walled garden.
- **Our honest position:** we are *not* an M365 replacement. We are the
  **local-first, BYOK, multi-agent control plane** that reaches *any*
  workspace (Office files via our byte-stable block-patch engine, email via
  read-first IMAP, browser, code) without a Microsoft account or a
  per-seat license.
- **Differentiator to lead with:** the same "reports from messy inputs"
  workflow Cowork advertises, but **open**: input from any file/URL/email/
  voice memo, output to docx/md/email — and every mutation guard-ticketed,
  zero founder servers.

### Gemini Notebook / corpus-first research surface (doc 68 §2.2)
- **What it is:** pick sources (files/URLs) → grounded, cited answers +
  mind-map/report artifacts; audio-digest output (podcast-style).
- **Our honest position:** H31 (corpus-first research surface) matches the
  *research* half — grounded answers with EV1 citation fidelity over the
  C-series RAG + G2 deep research. The audio digest rides H28 TTS (post-v1,
  deferred) — **do not claim it until the TTS seam lands** (decline-list:
  "teach once"-class claims gated on their gates).
- **Differentiator to lead with:** local, source-scoped, citation-verifiable
  answers with a reproducible evidence trail (K1 receipts), not a hosted
  notebook.

## 2. H18 mobile-companion note (doc 68 §3)

The H18 surface is a **remote-control handoff** seam (QR pairing →
confirmed session → the desktop executes), which the pairing module
(`everyaios-core::pairing`) implements. A **mobile monitor/steer surface**
(see sessions, steer, resume from the phone) is a **distinct post-v1 item** —
it is not covered by H18 today and must not be claimed as shipped.

## 3. Local models, BYOK catalog, computer use (2026-09-10)

- **vs LM Studio / Jan / Ollama:** we must match discover / fit / serve / OpenAI-compat API. Differentiator is not a prettier chat — it is the **same local model as a broker provider** the active agent, subagents, and tools use under Guard.
- **vs AnythingLLM:** document RAG stays the C-series memory plane. Do not fork a second workspace store.
- **vs ChatGPT Desktop / Claude Computer Use:** E9 is required parity **plus** background (user keeps the desktop) and **exact-path exe launch** from an allow-list so agents open real apps without a per-session toggle.
- **BYOK:** every models.dev provider (4h refresh) + custom inference + NVIDIA + **OpenCode Zen / OpenCode Go / OpenCode Free** (three list rows; Free is keyless). 429 rotates; generic 5xx does not. Live chat still `DEFAULT_BASE_URLS` until P55.5/P56.

## 4. Positioning rules applied (P28 decline-list)

- No "broadest control plane" marketing until Gates A+B are met (live
  ticketed executor ✅ + recovery evidence).
- No connector-count marketing (declined feature).
- H31 audio-digest is a *composition* of H28 TTS — gated, not claimed.
- "Reports from messy inputs" is claimable **now** via H30 (voice-memo →
  report, `everyaios-core::report`) because it composes existing engines.

## 5. Anthropic Claude Cowork (September 2026) & The Switzerland of AI Positioning

On September 16, 2026, Anthropic merged **Chat + Cowork** and launched **Claude Docs** and **Claude Slides** inside the Claude ecosystem. This formally moved the market from chat-only assistants to workspace coworkers.

### The Strategic Counter-Position: The Switzerland of AI
EveryAIOS explicitly rejects the proprietary coding agent trap. We do not compete with Anthropic, OpenAI, or OpenCode on building proprietary model-tuned agent loops. Instead, EveryAIOS is the **Universal Agentic OS & Desktop Harness ("Switzerland of AI")**:

| Dimension | Anthropic Claude Cowork (Sep 2026) | EveryAIOS (Universal Harness OS) | EveryAIOS Strategic Advantage |
| :--- | :--- | :--- | :--- |
| **Model Freedom** | Locked strictly to Anthropic Claude models. | **100% Vendor-Neutral**: Any model via models.dev, BYOK, OpenCode Zen/Go/Free, local GGUF/Ollama. | Zero lock-in; immunity to provider outages; run best-in-class models per task. |
| **Agent Autonomy & Choice** | Single closed Anthropic agent loop. | **Universal Agent Harness**: Host Claude Code, Codex CLI, OpenCode, Grok Build, Cline, Aider via ACP/stdio. | Users bring their existing subscriptions and specialized tools. |
| **Data Privacy & Sovereign Execution** | Cloud VM execution. Files, docs, and prompts reside on Anthropic cloud servers. | **100% Local-First & Sovereign**: SQLCipher encrypted vault, local sandboxing, secrets never leave the host. | Enterprise compliance, IP protection, offline operability. |
| **Spreadsheet Engine (XLSX)** | Text/code generation; cannot recalculate formula DAGs natively in-process. | **Embedded IronCalc 0.8.3 Engine**: Microsecond native formula recalculation DAG (300+ Excel functions) + surgical OOXML cell patcher. | Real financial modeling without corrupting macros, charts, or formulas. |
| **Document Engine (DOCX/PPTX)** | Claude Docs & Claude Slides: generates new markdown/documents; loses existing corporate templates. | **Surgical OOXML Part Patcher**: Direct XML node manipulation preserving corporate formatting, master slides, styles, VBA. | Round-trip enterprise document editing without format degradation. |
| **Multi-Agent Isolation** | Single-session linear execution; no parallel branches. | **Multi-Run Git Worktree Swarm**: Fan-out 1 prompt to up to 5 models in isolated Git worktrees with 3-way merge and rollback checkpoints. | Parallel exploration, automated code reviews, conflict-free collaboration. |
| **Browser Engine** | Cloud-based remote browser with latency and capture limitations. | **Tiered Local Browser Engine**: Lightpanda (ultra-fast headless) + Chrome CDP (full automation) + Scrapling + CloakBrowser stealth. | Zero-token DOM inspection, stealth scraping, login session vault. |
| **Operating System Control (CUA)** | Remote VM mouse/keyboard simulation. | **Native OS Computer Use**: Direct Windows Graphics Capture, A11y accessibility tree, Win32 `SendInput`, macOS CoreGraphics. | Full desktop app control, local application integration. |
| **Security & Governance** | Platform-level prompt guardrails in cloud. | **7-Layer Guard-2 Membrane**: Zero-I/O SSRF `netfloor`, lexical `pathfloor`, TTL tickets, OS sandbox (Job Objects/bwrap), Merkle audit log. | Cryptographically verifiable compliance and audit trails. |
| **Pricing & Licensing** | Anthropic subscription required ($20–$100+/mo). | **Free, Open-Source Desktop OS**: Bring Your Own Key (BYOK) or run keyless local/free models. | Zero subscription markup; accessible to everyone. |

