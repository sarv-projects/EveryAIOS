# 50 — Generative UI, Image Gen, Voice, Clipboard & Email/Calendar Gaps

> **Date:** 2026-08-09 · **Status:** 🟦 web-verified (protocol docs, READMEs, secondary sources)
> **Repos/protocols:** AG-UI (`ag-ui-protocol/ag-ui`, MIT), CopilotKit, LibreChat (image gen + resumable streams), Piper, sherpa-onnx, espeak-ng, Coqui TTS, openWakeWord, Porcupine, Vosk, whisper.cpp, arboard, imapflow, openonion/email-agent
> **Purpose:** Close the remaining gap-audit items: generative UI/AG-UI, image generation, clipboard tool, resumable streams, voice output + wake word, email/calendar connectors.
> **Cross-refs:** doc 49 (storage — same gap-audit batch), ARCH/12 (UI spec — this doc feeds it), ARCH/06 (Guard-2 for clipboard/cleanup tools), A2/A3 (key-rings — image providers ride the same rails), F1–F5 (connector hub — email/calendar attach here), H15 (voice input), P0.5 IPC (resumable stream state).

---

## 1. Generative UI — AG-UI (H25) 🟦

### 1.1 AG-UI — the protocol to adopt
**AG-UI (Agent-User Interaction protocol, `github.com/ag-ui-protocol/ag-ui`, MIT)** is an open, lightweight, event-based wire protocol standardizing communication between backend agents and frontends. It streams a single sequence of **JSON events (~16 standard event types)** over standard transports (SSE / WebSockets / webhooks), enabling bidirectional state sync, human-in-the-loop flows, and real-time context enrichment. Framework bindings exist for Python, Kotlin, Go, Dart, **Rust**, etc.

**Adopters** (1st-party/framework integrations): **LangGraph, CrewAI, Microsoft Agent Framework, Google ADK, AWS Strands Agents / Bedrock AgentCore, Mastra, PydanticAI, Agno, LlamaIndex, AG2**.

**Decision:** adopt the **AG-UI wire format** for our chat ↔ coordinator UI channel (H25) — it is a protocol, not a framework, so we implement our own renderer (no CopilotKit dependency; consistent with "steal the architecture" doctrine). Tool calls and UI updates over one channel is exactly our P0.5 framing + JSON-RPC design, with event types layered on top.

### 1.2 Generative UI patterns (renderer design)
| Pattern | Mechanism | What we take |
|---|---|---|
| **OpenAI Code Artifacts / ChatGPT Canvas** | interactive elements inline in the conversational stream; version-selector | we already have the **version-selector preview pane** (H1) — extend to live components |
| **Anthropic Artifacts** | code outputs rendered in a **dedicated sandboxed side-panel iframe with strict CSP + site-level process isolation** | the security model for rendering agent-emitted React/HTML — **sandboxed iframe + strict CSP, never inline-script in the main window** |
| **v0-style** | prompt → production React components (Tailwind) via live sandboxed bundler (Sandpack) | the "component as artifact" UX; we render, not bundle (token cost of shipping component code is a real cost — see §1.3) |

### 1.3 Token cost reality
Sending JSX/React component source through the model costs tokens (a single component ≈ 0.5–2K tokens). Mitigation: **component descriptors** (JSON schema → local renderer) for common shapes; raw HTML/Mermaid only when requested; artifact cards stay preview-first (static render + "make live" opt-in).

---

## 2. Image generation (A10) 🟦

**How LibreChat implements it** (reference): image generation lives in **Agents as tool calls**, not a separate page:
- **GPT-Image-1** via tool calls (text-to-image **and** image editing, tracking reference image IDs from conversation history)
- **Gemini image models** (API key or Vertex)
- **DALL·E 3** (legacy; style/quality/size options)
- **Stable Diffusion / Flux** via configurable endpoints (Automatic1111 WebUI local, BFL Flux API cloud)
- **MCP image servers** supported (`@gongrzhe/image-gen-server`, fal/stability-class MCP servers) — images must conform to the MCP image format.

**Decision → A10:** image generation is a **provider-layer endpoint** (same key-ring + failover semantics as A2/A3, priced like any provider call). Local engines (SD/Flux via llama.cpp-class runtimes or user's own) attach as **I6 extension bundles**; any MCP image server works out of the box via our MCP client (F6). Results return as **ref-handles** (never raw base64 in context — consistent with C10/pass-by-reference and P0.5 truncation).

---

## 3. Resumable streams (H27) 🟦

| Mechanism | Details | Our take |
|---|---|---|
| SSE / EventSource | native reconnect attempts, but mid-stream state is lost unless token-tracked; `Last-Event-ID` header enables server-side resume | coordinator replays from last emitted id |
| WebSocket | app-level heartbeat + exponential-backoff reconnect | our P0.5 IPC framing + retry-idempotency (ARCH/03 note) already designed for exactly this |
| **LibreChat resumable responses** | single-instance: in-memory Node **EventEmitter** tracks stream state; horizontally scaled: **Redis Streams** (`XADD`/`XRANGE`) + pub/sub + hashes reconstruct incomplete responses on reconnect | **single-instance = coordinator (Bun) holds in-flight stream state in memory**; the reconnect UI resumes from the last token. Redis only if we ever scale (explicit non-goal today) |
| OpenAI Responses API `resume` | server persists run steps/deltas/chunks; client reconnects with `resume` | a model-side option we can map onto our coordinator-held state |

**Decision → H27:** coordinator-held in-flight stream state + `Last-Event-ID`-style resume + "Reconnecting…" UI chip. No lost replies on network drop, refresh, or suspend. (Mirrors the P0.5 "resumable-streams UI + retry idempotent calls" ARCH/03 design note — now a task.)

---

## 4. Clipboard tool (H26) 🟦

- **arboard** (`1Password/arboard`, MIT/Apache-2.0, Rust): cross-platform text **and image** clipboard on Windows/macOS/Linux.
  - **Linux caveat:** X11/Wayland use selection ownership — clipboard contents vanish when the app exits unless a persistent manager runs or `wait()` blocks; Wayland needs the `wayland-data-control` feature + compositor support (`ext-data-control-v1`).
- CLIs: `wl-copy`/`wl-paste` (wl-clipboard-rs wrapper), `pbcopy`/`pbpaste` (macOS).

**Decision → H26:** `clipboard_read` / `clipboard_write` / `clipboard_history` tools in `everyaios-core` (arboard), **guard-ticketed** (ARCH/06) — read is a normal read-only tool; write is a mutation. History is local, opt-in, and privacy-aware (matches telemetry policy).

---

## 5. Offline voice (H15 extension + H28 TTS) 🟦

| Tech | License | CPU | Rust story |
|---|---|---|---|
| **Piper TTS** | MIT | very low (RPi-class) | ⚠️ **ARCHIVED** (rhasspy wind-down) — use **sherpa-onnx Piper voices** (active) instead; `piper-rs` only as a pinned alternative |
| **espeak-ng** | GPL-3.0 | minimal | phonemizer data for Piper/sherpa |
| **sherpa-onnx (TTS+STT)** | Apache-2.0 | low–moderate | **official Rust crate** (VITS/Matcha/Kokoro/Zipformer) |
| **Coqui TTS** | MPL-2.0 | high (Python) | no first-class Rust; company wound down → **skip** |
| **openWakeWord** | Apache-2.0 | low (ONNX) | Python-first; wrapper needed |
| **Porcupine (Picovoice)** | **proprietary/commercial** | very low | commercial license caveat → **BYO only, never bundled** |
| **Vosk** | Apache-2.0 | moderate (Kaldi) | community Rust wrappers |
| **whisper.cpp** | MIT | moderate–high (tiny→base ok) | `whisper-rs` bindings |

**Decisions:**
- **H15 extension:** offline STT options (**Vosk / sherpa-onnx / whisper.cpp**) + **optional wake word (openWakeWord)** — openWakeWord is Apache-2.0, Porcupine is excluded by license (consistent with spec §8 non-goal policy).
- **H28 Voice output (TTS):** default **offline sherpa-onnx** (Apache-2.0, **active**, hosts Piper/Matcha/Kokoro VITS voices); ⚠️ **rhasspy/piper is archived (read-only)** — use its voices via sherpa-onnx, never piper-rs as a primary dependency; optional BYOK cloud TTS (OpenAI/ElevenLabs) rides provider rails. Doc 46's R9 note ("our spec already has better TTS plan") is now concrete: offline-first + BYOK.

---

## 6. Email & calendar connectors (F14/F15) 🟦

| Path | Mechanism | Verdict |
|---|---|---|
| **Gmail API + Google Calendar API** | OAuth with independent scopes (`gmail.readonly`/`gmail.send`/`gmail.modify`, calendar full-access); tokens (access+refresh+expiry) stored locally **encrypted** (our everyaios-vault SQLCipher), background refresh | **primary path** — rides the existing Auth Bridge (F4) OAuth machinery |
| **IMAP/SMTP** | `imapflow` (Node) or `async-imap` + `lettre` (Rust); IMAP **IDLE** for real-time inbox push | provider-agnostic fallback (works for any IMAP host, not just Google) |
| **Browser-session automation** | drive web Gmail/Outlook via our browser layer | brittle (DOM churn, CAPTCHA) — already partially covered by the P6 "Gmail-via-browser flow" test; keep as last resort |
| Reference | `openonion/email-agent` (open-source local OAuth + NL email agent) | design reference for tool surface (search, triage, meeting scheduling) |

**Decisions → F14 (email) + F15 (calendar):** attach to the connector hub (F1–F5) as native adapters — **Gmail/Google Calendar via Auth Bridge OAuth with vault-stored tokens; IMAP/SMTP (imapflow or async-imap+lettre) for non-Google hosts**. Tools: read/search/send/reply/triage (F14); list/create/update/delete events + availability + nudge integration with B7 scheduled tasks (F15). Local-first: tokens on-device, no cloud proxy.

---

## 7. Matrix summary (all from the gap audit)

| Row | Capability | Status |
|---|---|---|
| A10 | Image generation (provider endpoint / MCP bundle) | ⚪ |
| F14 | Email connector (Gmail API / IMAP-SMTP / browser-session) | 🟡 |
| F15 | Calendar connector (Google Calendar API + ICS) | 🟡 |
| H15 (ext) | Voice input — offline STT (Vosk/sherpa-onnx/whisper.cpp) + wake word (openWakeWord) | ⚪ |
| H25 | Generative UI (AG-UI) | 🔵 |
| H26 | Clipboard tool (arboard, guard-ticketed) | ⚪ |
| H27 | Resumable streams (coordinator-held state) | ⚪ |
| H28 | Voice output TTS (sherpa-onnx offline — hosts Piper voices; ⚠️ piper archived — + BYOK) | ⚪ |

**Ledger: 181 → 192 repos.** Reading-order: 49 (storage) → **50** (this doc) → 51 (aider recheck) → spec v3.8.
