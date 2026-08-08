# 11 — AI Chat Features: Copy · Convert · Reject (the derivation)

> **User directive (verbatim):** *"for the ai chat features, copy from hermes, etc., and the rest from under ~business_Dev/APP/architecture.md — check the AI chat section. You need to understand what to copy, or convert, and not."*
> This doc is that analysis. It takes the **two source corpora** and produces one clear list:
> 1. **COPY** — reuse as-is (already built & tested in `APP/packages/`, or a research pattern to implement directly).
> 2. **CONVERT** — adapt (mobile → desktop, or research concept → our stack; keep the idea, change the plumbing).
> 3. **REJECT** — do NOT copy (locked out, wrong stack, server-dependent, or explicitly out of scope).
>
> Grounding: `APP/architecture.md` §§ Conversation Engine / Retrieval / Agent / Provider & Routing (verified against `core-engine/`, `core-ai/`, `core-providers/`, `core-tools/` source) + research docs 01 (AnythingLLM), 02 (Hermes blueprint), 05 (pi/Claude Code/Reasonix), 16 (tier-1 agent implementations), 23 (LibreChat/deep-dive leftovers), 33 (BrowserOS) + ARCH 03 (key-rings), 05 (token economy), 07 (memory), 08 (browser).

---

## 0. The two corpora, one rule

```
COPY-SOURCE A (our own code):  APP/architecture.md AI-chat section = ConversationEngine + SmartRouter +
                               system prompt + StreamSession + output normalizer + risk compass + agents
COPY-SOURCE B (research):      Hermes (doc 02/16) — plus AnythingLLM (01/16), pi + Claude Code + Reasonix (05),
                               LibreChat (23), BrowserOS (33)
RULE:  chat *engine plumbing* (loops, routing, streaming, compression, gating) comes from A — it's built,
       tested (~100 test files), and is the mobile asset the desktop reuses as the sidecar.
       chat *features/UX beyond the engine* (personality, delegation UX, artifacts, reasoning UI, resumable
       streams, sub-agent live logs, skills-as-memory) come from B — implement the pattern in the sidecar.
```

Why this split: A is **already production-wired in the sidecar language (TS)** and covers the hard 80% (3-stage loop, tool loop, permission gate, cache-affine prompt assembly, stream batching). B contributes **feature surface** Hermes/others proved out (SOUL.md personality, self-created skills, fresh-context subagents, length-guard) that A lacks. The division-of-trust (ARCH 01 §1.3) is unchanged: sidecar proposes, Rust disposes — chat never leaves the sidecar except through everyaios-guard tickets, everyaios-vault key rings, and everyaios-audit ingest.

---

## 1. COPY — reuse from `APP/architecture.md` as-is (source A)

These are the shipped chat atoms. The desktop sidecar imports them unchanged (they are pure TS; the mobile-only UI hooks live in `app-mobile`, which we do NOT import).

| # | Chat atom | Source file (APP/packages) | What it gives | Status in matrix |
|---|---|---|---|---|
| A-1 | **ConversationEngine** | `core-engine/src/engine.ts` | 3-stage turn loop (RetrievalPlanner → ToolPlanner → PermissionGate) + tool loop (≤5 rounds, extra-final-round guard) + abort-safe streaming + trajectory + risk compass + artifact hook | B1 (`🟡 (loop)` → actually 🟢 core exists; loop hardening 🟡) |
| A-2 | **Stage: RetrievalPlanner** | `core-engine/src/stages/retrieval-planner.ts` | scope resolution (project / sources / source_hard / none) + web/memory enable flags | 🟢 |
| A-3 | **Stage: ToolPlanner** | `core-engine/src/stages/tool-planner.ts` | 26 tool IDs / 5 families, surface mounts, agent sandbox intersection, fail-closed unknown tools | 🟢 |
| A-4 | **Stage: PermissionGate** | `core-engine/src/stages/permission-gate.ts` | 4-tier risk ladder (read auto / local-write session / external-write & destructive confirm), 200-entry session map, 30-min TTL | 🟢 (J1 keeps Trust Ladder; this is the chat-side gate) |
| A-5 | **SmartRouter + HeuristicClassifier** | `core-ai/src/router/*` | intent classification (7 intents), decision tree (offline / byok / managed / vision), PromptGuard (>12K chars), size-aware reroute, cache affinity (conversationId stickiness) | A1/A6 (route → key-ring router in 03) |
| A-6 | **System prompt assembly** | `core-ai/src/chat/system-prompt.ts` | 12-segment stable-prefix prompt + CACHE_BOUNDARY + `<untrusted>` envelope + RAG scope lock + citation invariant | J6 (injection defense) |
| A-7 | **Persona presets** | `core-ai/src/chat/persona.ts` | 4 tone overlays (~30 tokens), default straight-shooter | H10 (base; SOUL.md added by B-2) |
| A-8 | **Agent UI catalog** | `core-ai/src/chat/agents.ts` | 9 shipped agents → descriptions + system overlays + tool-hint derivation, anti-drift test | B3 (base registry) |
| A-9 | **Output normalizer** | `core-ai/src/chat/output-normalizer.ts` | strips fluffy openers/closers/AI-disclaimers, never touches fenced code | 🟢 |
| A-10 | **StreamSession** | `core-ai/src/streaming/stream-session.ts` | TTFT event, 33ms batch flush, token checkpoints, cancellation token — **credit-aware pause folded into C-4** (budget-aware streaming replaces it on desktop; `creditAware`/`shouldContinueStreaming` become dead config) | H1 (port) |
| A-11 | **Context compressor** | `core-ai/src/context/context-compressor.ts` | sentence scoring vs query, 50/50 trusted/untrusted budget split, `<untrusted>` wrap | C4/C7 (base) |
| A-12 | **Tiered compaction** | `core-ai/src/context/tiered-compaction.ts` | multi-tier history compression | 05 (extend w/ Reasonix ratios — already in ARCH 05) |
| A-13 | **Risk compass (#8)** | `core-engine/src/risk-compass.ts` | hallucination-risk banding per turn (uncertainty markers, length, grounding) | C1 |
| A-14 | **Provider clients + catalog** | `core-providers/src/` (openai/anthropic clients, registry, vault) | 114-provider catalog, SSE drivers, sealed vault | A1 (vault → everyaios-vault key rings) |
| A-15 | **Trajectory logging** | `core-engine/src/trajectory.ts` | per-turn step log (reasoning/tool/risk) → audit input | J5 |
| A-16 | **DocMaker artifact side-channel** | `core-engine` hooks + `core-ai/artifact-maker/*` | detect-intent → separate LLM call → validate → fix-loop → binary; chat stream unaffected | H1 (artifacts) |

**Copy verdict:** A-1…A-16 import as-is into the sidecar. **The only change** is wiring: `generatePrompt` gains the key-ring router (03) and token budgets (05); `executeTool` calls the everyaios-guard ticket flow (06); `persistTurn` also feeds everyaios-audit (06/08).

---

## 2. COPY — feature patterns from research to implement (source B)

These are proven patterns we implement in the sidecar (or Rust where noted). Each maps to a matrix row.

| # | Feature | From (repo, doc) | Pattern to implement | Status |
|---|---|---|---|---|
| B-1 | **Frozen-snapshot memory injection** | Hermes `memory_tool.py` (02) | MEMORY.md/USER.md injected as stable snapshot at session start; mid-session writes go to disk only → **preserves prefix cache all session** (this is the byte-stable-prefix doctrine of 05, made operational) | 🟡 (C7) |
| B-2 | **SOUL.md personality** | Hermes `SOUL.md`/`USER.md` (02, also 16 §prompt_builder) | User-tunable persona file the agent can propose edits to; core rules inviolable; layered under A-7 presets | 🟡 (H10) |
| B-3 | **Self-created skills (procedural memory)** | Hermes `skill_manager_tool.py` (02) | Agent writes SKILL.md after a successful task; skills spliced into system prompt (skills index tier); security audit of skill code (`skills_ast_audit`) | 🟡 (I2) |
| B-4 | **Fresh-context subagents** | Hermes `delegate_tool.py` (02) | Child agent = fresh conversation, own workspace; parent sees only summary; **DELEGATE_BLOCKED_TOOLS** (delegate/clarify/memory/send_message/cronjob); batch parallel mode | 🟡 (B3 — 🟢 base in core-engine tool loop) |
| B-5 | **Length-guard on tool calls** | pi `agent-loop.ts` (05 §6.5) | `stopReason === "length"` → **fail all tool calls from truncated message**, never execute borked args | 🟡 (B1 loop hardening) |
| B-6 | **Model-swap / steering hook** | pi `prepareNextTurn` (05 §6.5) | per-turn hook to swap model, inject steering messages, rewrite context — a loop concern, lands on B1 | 🟡 (B1) |
| B-7 | **Trivial-prompt skip** | Hermes `TRIVIAL_PROMPT_RE` (02) | skip memory prefetch for "ok/yes/thanks" — token saving | 🟡 (05) |
| B-8 | **Conversation compression pipeline** | Hermes `context_compressor.py`/`trajectory_compressor.py` (02) | mid-session compress + trajectory-anchored compaction — fold into A-12 with Reasonix ratios (05) | 🟡 (05) |
| B-9 | **LLM-extraction search summaries** | Hermes `web_tools.py` (02) | web results → LLM extracts key excerpts + markdown summaries **to cut tokens** | 🟡 (G2) |
| B-10 | **Sub-agent live logs** | Hermes `delegation_live_log.py` (02) | stream child progress to parent chat UI | 🟡 (H2 cockpit) |
| B-11 | **Reasoning UI** ⚠️ README/user-paste-level in research (23 §B — web re-confirmation stalled); adopt as feature, verify against LibreChat source at build time | LibreChat (23 §B) | render chain-of-thought blocks separately (DeepSeek-R1 class models) | 🟡 (H1) |
| B-12 | **Resumable streams** ⚠️ README/user-paste-level in research (23 §B); adopt the concept, implement against our own stream protocol | LibreChat (23 §B) | auto-reconnect + resume on connection drop (sidecar-held buffer → re-request with last-token anchor) | 🟡 (H1) |
| B-13 | **Chat artifacts / generative UI** ⚠️ same hedge as B-11/12 | LibreChat (23 §B) | render React/HTML/Mermaid blocks in chat | 🟡 (H1) |
| B-14 | **Chat history as searchable tool** | AnythingLLM AIbitat `chat-history` (16 §21) | reuse `search_chat_history` tool (already in A catalog) + `chat_search_index` FTS5 | 🟢 (exists) |
| B-15 | **Event-stream shape** | pi `EventStream` (05) | turn_start/turn_end/agent_end + text deltas + tool calls — **A-1 already yields these**; align naming, don't re-build | 🟢 |
| B-16 | **Prompt-injection scan of persona files** | Hermes `prompt_builder.py` (16 §38) | scan AGENTS.md/.cursorrules/SOUL.md for promptware before injection | 🟡 (J6) |
| B-17 | **Streaming TTS input** | Hermes `tts_streaming.py`/BrowserOS voice (02, 33 §10) | voice chat (VAD) — later/optional | ⚪ (H15) |

---

## 3. CONVERT — adapt, don't copy blindly

| # | Item | From | Converted form (what changes) | Why |
|---|---|---|---|---|
| C-1 | **Chat UI hooks** | `app-mobile` (`useConversationEngine`, `useBridgeStreamingToStore`, `chatStore`, `ChatBubble`, `MessagePartAssembler`) | Port the *behavior* (100ms batching, stage chips, TTFT, risk chip) into the desktop webview UI; **do not import app-mobile code** (it's React Native/Expo) | RN components don't run in Tauri webview; engine events (A-1) are the stable interface |
| C-2 | **Managed/paid routing** | APP SmartRouter `MANAGED_FREE/FAST/SMART` + server pools | **Remove server pools entirely** (desktop is open-source, no servers). Route = BYOK key-ring → local (Ollama/llamafile) → OAuth subscription. Keep the intent classifier + cache affinity + size-aware reroute | v2.0 §0.5: zero server components; ARCH 03 owns key-ring routing |
| C-3 | **Credit/billing** | `core-billing` (fractional bands, packs, subscriptions) | Desktop: **no credits**. Replace with token/cost ledger + per-key budgets (ARCH 05 §5.6) + free-local-model paths | Mobile monetization doesn't belong in an open-source desktop app |
| C-4 | **Server-authoritative chat flow** | GCP `svc-api` reserve→stream→commit | Rejected at server; client keeps the *reserve/pause* semantics via credit-aware StreamSession → replaced by budget-aware streaming (05) | open-source, no infra |
| C-5 | **DocMaker artifacts** | A-16 (mobile: docx via fflate, pdf via expo-print) | Same side-channel LLM pattern → **desktop office engine** (ARCH 04 surgical OOXML + IronCalc + pdf-lib/lopdf) | 04 replaces the mobile binary builders |
| C-6 | **OAuth subscriptions** | AnythingLLM/Composio managed-auth (01, 13) | BrowserOS-style device-code/PKCE (ChatGPT Pro / Copilot / Qwen) stored in **everyaios-vault**, not cloud proxy | ARCH 03 §5; local-first hub (13) |
| C-7 | **Composio orchestrator** | `core-connectors` (Lane A/B/C) | Keep Lane A (direct adapters) + user-key Lane B; **drop org-pool managed auth** → user-key only | 13: local hub, no hosted pool |
| C-8 | **Hermes skill layout** | `~/.hermes/skills/<name>/SKILL.md` + references/templates/scripts | Adopt layout under `~/.everyaios/skills/` with ownership markers + AST audit (B-3) | 33 §8 ownership pattern |
| C-9 | **AnythingLLM embed widget / multi-user** | AnythingLLM (01) | **Reject multi-user/embed** (single-user desktop); keep workspace isolation concept → project scope (A-2) | scope |
| C-10 | **Claude Code plugins** | Claude Code (05) | Steal the *extension surface concept* (tool registry + permission classes, F9), not the closed engine | closed source — patterns only |
| C-11 | **BrowserOS compaction** | `callSummarizer` (33 §7.2) | Fold into A-12/A-8 compaction: transcript envelope, safe split point, fail-open summarizer | 05 §5.2 |

---

## 4. REJECT — do NOT copy (locked out)

| # | Item | Source | Reason |
|---|---|---|---|
| R-1 | Hermes **Python gateway + 21 platform adapters** (Telegram/Discord/Slack/WhatsApp/Signal/…) | Hermes (02) | Wrong stack (Python) + our scope is desktop + webhook/email first; adapter registry pattern (02 §1) is the only part we keep (F1/F2) |
| R-2 | Nous-hosted **tool gateway** (subscription lock) | Hermes (02) | Open-source promise: no founder-run infra (v2.0 §0.5) |
| R-3 | **Agent-browser CLI dependency** (Hermes browser tool) | Hermes (02) | We have the CDP browser layer (08) — strictly better on desktop |
| R-4 | **OpenCode archived Go fork** | opencode (05 §1) | Archived; evaluate anomalyco rewrite only (24 §2.1) |
| R-5 | **Claude Code engine internals** | Claude Code (05) | Closed source — patterns only (C-10) |
| R-6 | pi's **"no permissions by default"** | pi (05 §6.5) | Deliberate opposite: Trust Ladder + dual-guard (06) is our product moat |
| R-7 | **Reasonix DeepSeek-only lock-in** | Reasonix (05 §6) | Multi-provider BYOK is ours; only the cache-first *mechanics* are copied (05) |
| R-8 | **Mobile hosted free-model pool + cloud sync relay** | APP mobile (architecture §0.5) | Desktop is server-free; free chat = local models + BYOK |
| R-9 | **Legacy `useStreamingResponse`** (~935 lines) | app-mobile (audits) | Retired in mobile (c670248); must not resurrect |
| R-10 | **XState conversation machine** | app-mobile (dead code) | Deleted in mobile (dead-code sweep); engine loop (A-1) replaces it |
| R-11 | **AnythingLLM Electron shell + multi-user server** | AnythingLLM (01) | Tauri (lightweight) + single-user local-first — the whole point |
| R-12 | **LibreChat multi-tab/device sync via Redis** | LibreChat (23) | Requires server; desktop sessions are local SQLite; multi-window sync is UI-level only |

---

## 5. Result — the desktop chat feature contract

After applying COPY (A-1…A-16, B-1…B-17), CONVERT (C-1…C-11), REJECT (R-1…R-12), the desktop **AI chat** surface is:

**Engine (sidecar, reuses A):**
- ConversationEngine 3-stage loop + tool loop + trajectory + risk compass + artifact hooks
- SmartRouter with key-ring routing (03), intent classifier, cache affinity, size-aware reroute
- Cache-affine 12-segment prompt assembly + untrusted envelope + citation invariant
- StreamSession batching/checkpoints/cancel + budget-aware streaming (05)
- Tiered compaction + Reasonix ratios + Hermes trajectory-anchor + BrowserOS fail-open summarizer (05)
- Frozen-snapshot MEMORY.md/USER.md + SOUL.md personality + agent-created skills (B-1/2/3)
- Fresh-context subagents with DELEGATE_BLOCKED_TOOLS + live logs (B-4/10)
- pi length-guard + model-swap hook (B-5/6) + trivial-prompt skip (B-7) + injection scan (B-16)

**UI (desktop webview, ports C-1):**
- Streaming chat + stage chips + TTFT + risk chip + token/cost streamer (H1/H9)
- Reasoning blocks (B-11), resumable streams (B-12), artifacts/Generative UI (B-13, A-16)
- Message branching, pinning, searchable history via `chat_search_index` (A-14/B-14)
- Chat overlay on office docs/reader (ARCH 04 §overlay) + cockpit + audit/replay UI (H2/H3)
- Voice input later (H15)

**Gates (unchanged from ARCH 06/08):** sidecar proposes → everyaios-guard ticket → Rust disposes; keys in everyaios-vault; every mutating chat tool call audited.

---

## 6. Matrix delta

- B1 row: **🟢 core loop EXISTS** (A-1) · 🟡 additions = length-guard + model-swap hook (B-5/6).
- H1 row: expand description to include reasoning UI + resumable streams + artifacts/Generative UI (B-11/12/13).
- H10 row: base persona (A-7) + SOUL.md (B-2) — already listed.
- C7 row: frozen-snapshot injection (B-1) folds into memory injection — already listed.
- No new matrix rows needed: every B/C item lands on an existing row **or the token-economy doc (05)** — B-7/B-8 fold into C7 + 05 §5.2 (checked against 09).
