# 12 — UI/UX Specification: Desktop Layout & Interaction Design

> **Derived from [`CORE.md`](CORE.md) — the root authority; this document specializes, never restates, it.**
> **CONTRACT RE-SCOPED — see [`UI.md`](UI.md) first.** This document remains the authority for layout
> and interaction *detail*. `DESKTOP.md` owns the **boundary**: the UI is a projection, it owns no durable
> truth, it mutates only through the Work Gateway, and the File Workbench opens any resource through a viewer
> registry. **User-facing vocabulary is Chat, not Session** (see [`SESSION.md`](SESSION.md) §2): the sweep has landed — the sidebar, title bar, new-button, composer and palette labels below all read **Chat**. `Session` survives only as the internal/API term (`P69.A23` closed).
>
> **v1 scope/status clarification (2026-09-24):** This is a layout and interaction contract, not a Windows
> qualification record. The cockpit must show the canonical projection and keep `implemented — unverified`,
> `blocked`, `runnable`, and `open` states distinct. Voice input, speech-to-text, TTS, wake-word, voice memo,
> and audio-digest output are explicit post-v1 exclusions; a disabled or staged control is not a v1 capability
> claim. See [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md).
>
> **Projection/lease amendment (2026-09-24):** [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md)
> defines the per-Session `SessionWorkbenchProjection`/`LensState` contract. These are non-authoritative UI
> projections: active/open lenses, drafts, queues, approvals, receipts, and resource references render from
> canonical owners, never become a second kernel or permission system, and never carry bearer/token material.

## 0. Projection contract — what the UI reads, never owns, and how it mutates (`P69.A23`)

> Authority: [`CORE.md`](CORE.md) (root) · [`UI.md`](UI.md) (the boundary) · [`WORK.md`](WORK.md) (durable truth) · [`SESSION.md`](SESSION.md) (Chat vocabulary). This section is the contract; everything from §1 on is unchanged layout/interaction detail under it.

- **Reads:** projections of canonical state — Work status, the event-derived Timeline, artifact lists, agent activity, and the Settings `ConnectionRecord`/read models. Never the kernel, provider internals, or the event log directly; a presentation event contract sits between (UI.md §1).
- **Owns:** no durable truth. Every store entry is projection, cache (with an invalidation rule), or ephemeral UI state (selection, tabs, composer text) per UI.md §2. Optimistic presentation never asserts a completed effect before the receipt exists.
- **Mutates:** only through the Work Gateway — `UI → Tauri IPC → Work Gateway`, with effects additionally passing Guard (agent/automation paths carry an `AuthorizationTicket`; human UI acts through a trusted native gesture). The shell is never an alternate kernel, Work database, security engine, or event log.
- **Timeline:** the Progress view (§4.3) renders the canonical event log; the Chat vocabulary rule applies throughout this document.

### 0.1 LensState, per-Session projection, and resource honesty

[`ADR-0008`](ADR/0008-session-workbench-projection-and-resource-leases.md) is the boundary contract for the
right rail and all viewports. The shell reads one non-authoritative `SessionWorkbenchProjection` keyed by the
canonical `SessionId`; it composes `Session → Work → Run → AgentBinding` owners and safe `ResourceRef`/lease
attachments. `LensState` records the active/open lens, view order, observed resource generation, and
availability (`available | stale | unavailable | conflicting | pending`). It does not own a physical browser,
Office, Desktop, or provider resource.

- **Per-session persistence:** `activeView`, open lens order, selected resource references, and unsubmitted
  drafts are keyed by the current Chat/Session. Switching Chats restores only the selected Session's lens
  state; it never transfers a tab, queue, lease, or physical handle from the previous Chat.
- **Resource states:** stale generation, missing resource, revoked lease, and cross-Session conflict are
  explicit states. Disable mutating controls, explain the safe reason, and offer re-observe/reopen/reattach;
  never silently fall back to another resource or claim live access.
- **Drafts and queues:** a composer draft is durable pre-submit input; a submitted prompt becomes a Work/Run
  queue item with an event-cursor identity. Steering is an active-Run control, not a queue item. A question or
  review is attached to its exact Work/Run; an approval card is Guard-owned; a receipt is audit-owned.
- **Takeover:** user takeover is a native-gesture request. The old lease is fenced before user-controlled
  action, Guard still decides the effect, and the agent resumes from a checkpoint with stale refs invalidated.
- **Privacy:** IPC/UI payloads may contain safe ids, generations, availability, and conflict classes only—no
  bearer, token, cookie, private provider state, or credential value.
- **Responsive/accessibility:** the projection must preserve the rail/center/viewport layout, provide a
  keyboard-reachable lens switcher and focus restoration, announce freshness/lease conflicts and queue/approval
  changes to assistive technology, avoid color-only status, honor reduced motion/text zoom, and keep the
  center conversation/now-doing strip visible when the viewport collapses. The complete edge-case matrix is
  ADR-0008 §6 and remains pending implementation/qualification.

---


> **Full-Stack Module:** Module 3 — Unified Cockpit Shell & Context Compaction Engine (React 19 + Zustand 5 + Tailwind 4, 12 Center Screens & 22 Viewports).
> **Version:** UI-spec rev 3.10 (2026-09-15 — Windows-first runtime/picker/cowork audit, P66). **Numbering note:** the `3.x` in this header is the **UI-spec document revision**, a separate series from the workspace/shell version in `ui/src/lib/version.ts` (currently **v4.06** — the value `scripts/check-doc-sync.mjs` verifies). A `3.x` here is therefore *not* a stale shell version and never should be read as one.
> **Reference:** Claude Desktop Views / Cursor activity bar / ChatGPT Work / Devin Desktop (2026 work-cockpit pattern — doc 67 §6); Devin Cloud UI (doc 46) for viewers only  
> **Principle:** ONE project, ONE durable Work, ONE session, ONE effect-authorization model, ONE timeline. Chat + live progress stay in the center; the **right activity rail** selects the active lens while the viewport supports multiple open, reorderable tabs. Only one view is rendered at a time inside that viewport; the product is not split into separate Chat/Cowork/Code applications.
> **Cross-refs:** ARCH/01 (system architecture) · ARCH/09 (feature matrix H1–H36 — H20 redefined doc 67) · **ARCH/CORE.md §7 + ARCH/AGENT.md (the agent model — the chat surface this spec renders: the agent loop belongs to the bound agent, §7.4 first-class tools `ask`/`plan`/`subagent`/`todo`, §7.5 governance modes), and [`AGENT.md`](AGENT.md) for the Settings Control Center read model (`ARCH/17` §17.12 was its historical source; **archived 2026-09-22** — `P71.5a`) (split landed — the read models now live in AGENT.md + EXTERNAL-AGENTS.md per `P69.A26`; ARCH/17 archived, physical move `P71.5a`)** · ARCH/DIAGRAMS #7 (MCQ interrupt) + #27 (two planes — superseded, see CORE.md §7.1) · doc 67 §6 (finalization record)
> **v2.1 (2026-08-16, superseded visually by v3.78):** `UI-DESIGN-PROMPT.md` (repo root) is the **canonical production UI spec** — light/dark surfaces, cool-blue semantic brand, selectable accent tokens, full screen/panel/tab/overlay inventory, motion + mock-data tables. This ARCH/12 stays the layout/architecture contract (rail + one viewport, chat states, view contracts, keyboard map). When the two disagree on pixels, UI-DESIGN-PROMPT.md wins.
>
> **v3.10 (2026-09-15 — Windows-first runtime/picker audit):** Windows is the first release target. Agent discovery now has an explicit provenance contract (managed absolute path, PATH/App Paths, user path, package manager, or WSL distro/path); catalog entries never imply occupancy. The agent picker is a two-pane/full-screen configuration surface: installed/discovered agents left, selected agent-owned model/auth/native capabilities plus EveryAIOS shared grants right. The chat bar remains compact and blue-semantic themed; capabilities are enabled in a separate pane. Office/browser/computer-use/memory claims remain evidence-gated on real Windows acceptance. **Implementation status (2026-09-15):** the provenance read model, App Paths/WSL probes, stale-record rejection, full-screen two-pane picker, and cool-blue picker/agent cards are landed and unit/type/doc verified; WSL launch, the capability pane, global theme migration, and all Windows/cowork live acceptance remain open (TODO P66).
> **v3.9 (2026-09-13 — casual surface, P61):** casual mode asks **one** question instead of three. The composer keeps the SPEC three-control taxonomy in **power**, but casual renders **one plain autonomy dial** (`Look only · Ask me first · Balanced · Just do it`) over the same four `PermissionMode` values — a display layer only, so the per-task `config_hash` freeze, `syncAutonomyFromRust()` and every guard decision are unchanged. The right rail/viewport remains a power surface (`setActiveView`/`addView` switch to power when a view opens, so nothing traps the user). Home's empty state is pre-scoped starter cards; the Guard panel states one sentence in casual instead of the Trust Ladder meter and 5×5 matrix; high-blast interrupts require typing the resource name.
> **v3.8 (2026-09-10):** Two surfaces — Browse + Office inbuilt (no vision); Computer use = real OS see-pane + primary rail icon. Vision-gate modal. Progress renders CUA DAG.
> **v3.8 (2026-09-12 reconciliation):** Status bar and agent/model picker consume reachable live catalog rows, preserve provider-qualified model identity through routing, and label curated seed rows as fallback. Provider/profile rows with no supported transport are unavailable rather than guessed.
> **2026-09-25:** v1 has no built-in model card. The picker shows the selected agent's own model control when the handshake provides one, otherwise “managed by that agent.” Sign in or Set up appears only for methods that agent returned. A registry row that is not installed is not selectable. There is no EveryAIOS Native peer tab and no global Add key bar for agent login.
>
> **v3.8 (2026-09-12 model ownership — P60.12/P60.13), superseded for the Native card by the note above:** the picker is ownership-split. Any **external ACP agent** shows only its own ACP `configOptions` or an explicit “managed by &lt;agent&gt;” — never EveryAIOS's provider list. Runtime rows are **installed-only selectable**. Never render a curated fallback row as live.
>
> **v3.7 (2026-09-10):** Cockpit live-vs-stale table in spec §4.1 (P58). Keyboard cheat sheet, About stamp, Office `live: false`, status-bar `AGENTS`, picker curated models, composer slash, missing Computer use / Subagents nav.
>
> **v3.6 (2026-09-10):** Provider **+** opens a **new activate screen**: models.dev name/package/API/docs, key bar → Enter → green tick → **+ under the bar** for more keys, then dropdown + full models.dev model table (id, context, output, price, reasoning, tools, images).
>
> **v3.5 (2026-09-10):** Settings → Providers is a **full searchable list** with **+** / verify / green tick, OpenCode-shaped custom inference, OpenCode-free + `big-pickle`, NVIDIA/NIM; Computer use allow-list by exact path. Live-vs-chrome table lives in spec §4.1.
>
> **v3.4 (2026-08-21):** settings + composer chrome expanded from inspiration **screenshots as layout reference** (Cursor auto-run / browser+network / LSP; Qoder voice+mobile+wiki+schedule+Spec Q&A; Ollama launch cards; TRAE Work/Code/Design + permission modes; ZCode skills/hooks/migrate; Cowork folder chips). EveryAIOS naming only. Canonical pixels stay in `UI-DESIGN-PROMPT.md` §5.6.
>
> **v3.3 (2026-08-19):** resolved the layout identity split: the activity rail remains the navigation lens, while the right viewport is a persistent multi-view tab container; only the active tab renders at once. Updated H20, the diagrams, and the index to use this single contract. Cache/server status and deferred-runtime boundaries remain explicit.
>
> **v3.2 (2026-08-19):** the canonical spec was **completely rewritten to match the shipped cockpit** — every tab is now live (Automations Active/Templates/History, Memory Episodic/Semantic/Graph/Skills, Connectors Native/MCP/Catalog), every panel button wired (right-rail view actions, Guard Allow/Deny + vault CTAs, Storage cleanup, Settings actions, Analytics export, automation editor Save/Cancel), tab-content crossfades added, and the mock-data inventory documented. Layout contract unchanged.
>
> **v3.1 (2026-08-17): Full-fidelity tool surfaces ("nothing held back").** The right panel is the **live window into the real tool** — every view reproduces the official product's full surface, not a stripped preview: **Word/Excel/PowerPoint get the complete Microsoft ribbon** (File·Home·Insert·…·View + **Copilot** on Home) with all groups/buttons; **PDF gets a full viewer** (page nav, zoom, search, annotations, forms, sign, redact, thumbnails/outline); **Browser gets full Chrome-style chrome** (tabs, omnibox, back/forward/reload, bookmarks bar, extensions, profile, and the built-in **AI Mode / Gemini sidebar**). The agent drives these surfaces; the user can touch them (takeover). Detail in §4.1c.
>
> **v3.0 (2026-08-17): Right panel = VS Code-style multi-view tabbed panel** (replaces "one surface at a time"; user directive + doc 84 + VS Code layout logic). **Default open views: Terminal · Folder · Browser.** A **`+` button** opens a picker to add any view (Code, Office, Progress, Diff, Audit, Storage, Memory, Research); tabs **close ×**, reorder, and **persist per session** (same per-session persistence as v2). **Browser = one view with internal page tabs** (many pages, one browser surface). **Office files open as their own tabs** (`Q3.xlsx`, `exec-summary.docx`, `contract.pdf`, `quarterly-deck.pptx`) — opened by the agent or by clicking an artifact card. **PDF study mode:** scope the chat to a document (`📄 Scoped to contract.pdf`) for side-by-side explain-this-document. **"Open perfectly" = LibreOffice/LOKit** (tiled rendering, agentic + normal reading) layered on the surgical engines (IronCalc/calamine/lopdf); **Google Docs/Sheets** open through the authenticated browser view (normal access) or pulled via Drive/Sheets API → OOXML → office engine (agentic). Details in §4.1b.

---

## 1. Core Layout: Left Chats · Center Conversation · Right Rail + Viewport

```
┌───────────────┬─────────────────────────────┬──┬───────────────────────────────┐
│  LEFT         │      CENTER                 │R │ RIGHT VIEWPORT (collapsible)   │
│  chats        │  chat · now-doing · tickets │R │ active view + persisted tab strip │
│  automations  │  approve cards              │I │ (0px collapsed ~ 50-60% open)  │
│  memory/guard │                             │L │                                │
│  (240 / 48px) │                             │  │                                │
└───────────────┴─────────────────────────────┴──┴───────────────────────────────┘
                                                 ▲
                                                 │ 48px icon rail
                                                 │ click active icon → collapse; center goes wide
```

**Responsive behavior:**
- Left sidebar 240px, collapsible to icon-only (48px); width persists
- **Right rail 48px**, always visible; viewport 0px (collapsed) ↔ ~50–60%
- Viewport collapse → center chat goes full-width (**never unmount** — the agent's now-doing strip stays visible)
- Viewport expandable to fullscreen (⤢ button); drag-resizable divider
- **Per-session layout persistence:** `activeViewId`, `railCollapsed`, `splitRatio`, `browseMode`, `composerMode` saved per sessionId (the Cursor layout-reset bug we do not copy)

### 1.1 Window chrome (every screen)

| Piece | Always | Notes |
|-------|--------|-------|
| Title bar | Project · chat title · Guard chip · $spent/$cap | native Tauri |
| Left | 240px or 48px icon-only | persist width |
| Center | chat + 2-line now-doing under composer | never unmount on rail collapse |
| Right rail | 48px icons | click active icon = collapse viewport |
| Right viewport | 0px or ~50–60% | Cmd+\ toggles |
| Tray | quiet sentence or idle | independent of window (H2 cockpit quiet) |

---

## 2. Left Sidebar (Navigation)

### 2.1 Structure

```
┌─────────────────────────┐
│ 🟢 EveryAIOS            │  ← App icon + name
│ workspace-name ∨        │  ← Project/workspace selector (dropdown)
├─────────────────────────┤
│ 🔍  [Search]            │  ← Global search (Cmd+K)
├─────────────────────────┤
│ + New chat               │  ← Primary action button
│ ⏱ Automations           │  ← Scheduled tasks & event triggers
│ 🔒 Guard                │  ← Security overview & permissions
│ 🔌 Connectors           │  ← Connector hub status
│ 🧠 Memory               │  ← Knowledge/memory browser
│ 📊 Analytics            │  ← Token usage & cost dashboard
├─────────────────────────┤
│ Recent                   │  ← Section header
│  🔍  ⚙  ⋯              │  ← Search, filter, more actions
│                          │
│  Chat 1 title...         │  ← Active chat (highlighted)
│    ● Action required     │  ← Status badge (orange = needs input)
│  Chat 2 title...         │
│    ✓ Completed           │  ← Green = done
│    └─ Sub-chat 1         │  ← Child chats indented
│    └─ Sub-chat 2         │
│  Chat 3 title...         │
│    ⏳ Running             │  ← Yellow = in progress
├─────────────────────────┤
│ ⚙  📥  ❓               │  ← Settings, Downloads, Help
└─────────────────────────┘
```

### 2.2 Sidebar Interactions

| Click | Action |
|-------|--------|
| Workspace dropdown | Switch between projects/workspaces |
| + New chat | Opens an empty chat with focus on the input |
| Automations | Shows automation list with sparkline activity charts |
| Guard | Shows Guard status, recent blocks, permission grants |
| Connectors | Shows connected services, MCP servers, status indicators |
| Memory | Browse knowledge items, skills, episodic memory |
| Analytics | Token usage chart, cost per model, chat history |
| Chat entry | Opens that chat in Chat + Workspace panels |
| Sub-chat | Opens sub-chat (parent stays in breadcrumb) |
| Status badge | Quick-action: respond to MCQ interrupt inline |

### 2.3 Session Status Indicators

| Icon | Color | Meaning |
|------|-------|---------|
| ● | Orange | Action required (MCQ interrupt / confirm / approve) |
| ⏳ | Yellow | Running (agent is working) |
| ✓ | Green | Completed successfully |
| ✗ | Red | Failed / Error |
| ⏸ | Grey | Paused (user took over) |
| 🔄 | Blue | Waiting (scheduled, queued) |

---

## 3. Center Panel: Chat & Progress

### 3.1 Layout

```
┌─────────────────────────────────────────┐
│ Chat Title                       🏴 ⋯  │  ← Title + flag + menu
├─────────────────────────────────────────┤
│                                          │
│  [Chat messages scroll area]             │
│                                          │
│  User: "Update the Q3 numbers..."       │
│                                          │
│  AI: Working on it...                    │
│    ┌──────────────────────────────┐     │
│    │ 📄 ARTIFACT CARD             │     │  ← Rendered file preview
│    │ quarterly-report.docx        │     │
│    │ ──────────────────────────── │     │
│    │ [Preview of content]         │     │
│    │                   </> 📋 📥  │     │  ← Code/Copy/Download buttons
│    └──────────────────────────────┘     │
│                                          │
│  ● Action required: Confirm next step   │  ← MCQ interrupt (orange)
│    [Approve] [Edit] [Reject] [Options]  │  ← Action buttons
│                                          │
├─────────────────────────────────────────┤
│ [+] [Chat input...          ] 🎙 [▶]  │  ← Input bar
│     Mode: Normal ∨                      │  ← Mode selector
└─────────────────────────────────────────┘
```

### 3.2 Chat Elements

#### Message Types
- **User messages**: Right-aligned or full-width, light background
- **AI messages**: Left-aligned, includes progress steps, artifact cards, action requests
- **System messages**: Centered, muted, for status updates

#### Artifact Cards (inline rendered previews)
Displayed when the agent creates/edits a file. Shows:
- File name + type icon
- Rendered preview (markdown, code with syntax highlighting, spreadsheet grid, document layout)
- Action buttons: `</>` (view source), `📋` (copy), `📥` (download), `🔗` (open in workspace)
- Click card → opens file in Workspace panel tab

#### Progress Steps (inline in chat)
```
  ✓ Reading quarterly-data.xlsx
  ✓ Updating cells B7:B12 with Q3 actuals
  ● Regenerating revenue chart
  ○ Updating executive-summary.docx
  ○ Exporting final PDF
```
- ✓ = completed (green)
- ● = in progress (pulsing blue)
- ○ = pending (grey)
- Click any step → right viewport jumps to the relevant view + position (Excel cell, browser screenshot, shell line, file)

#### MCQ Interrupt (Action Required)
- Orange dot + "Action required: [description]"
- Shows diff-card for destructive actions
- Buttons: Approve / Edit / Reject / More Options
- Maps to the Guard-2 diff-card handshake (see SECURITY.md; ARCH/06 is derived)

#### Generative UI Components (H25, AG-UI — doc 50)
- Agent-emitted live components (React/HTML/Mermaid) render **inline in sandboxed iframes** — strict CSP + process isolation (Anthropic Artifacts pattern), never inline-script in the main window
- Wire protocol = **AG-UI** (tool calls + UI updates over one JSON channel, ~16 event types) on top of our P0.5 framed IPC
- Artifact cards upgrade from static previews → "make live" opt-in (token cost: component descriptors preferred over raw source, §1.3 doc 50)
- Version selector reuses the H1 preview pane

#### Resumable Stream Indicator (H27 — doc 50)
- On network drop/refresh/suspend: "🔄 Reconnecting…" chip in the message area
- Coordinator holds in-flight stream state → auto-resume from the **last token/id** (LibreChat pattern); the reply continues in place, never restarts
- Idempotent retry semantics per ARCH/03 (retry idempotent calls)

### 3.2a Chronological Collapsible Sub-boxes Hierarchy (Closed-by-Default Contract)

The chat conversation represents the primary chronological narrative of an agent turn. To eliminate visual clutter and avoid sprawling transcripts when external CLI agents execute complex operations, every assistant turn strictly enforces a 4-tier chronological visual hierarchy:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. [ 🧠 Reasoning Sub-box (Closed by default once settled) ▾]│
├─────────────────────────────────────────────────────────────┤
│ 2. [ 🔧 Grouped Tool Sub-box (Closed by default settled)  ▾]│
│    ┌──────────────────────────────────────────────────────┐ │
│    │ (Nested drawer: args, status, logs, spooled refs)    │ │
│    └──────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ 3. 💬 Assistant Markdown & LaTeX Response Body               │
├─────────────────────────────────────────────────────────────┤
│ 4. 📄 Artifact Cards & Guard-2 Approval Cards               │
└─────────────────────────────────────────────────────────────┘
```

1. **Reasoning Sub-box (`<ReasoningSubbox />`):**
   - **Streaming / In-Flight:** Displays a pulsing indicator (`Thinking... 1.8s`) with an active ~4Hz live ticking stopwatch (`useLiveElapsed`). May auto-expand while the agent is actively thinking.
   - **Settled / Completed:** **Immediately and unconditionally auto-collapses** to a sleek, compact summary pill: `[ 🧠 Thought for 4.2s ▾ ]` with a subtle violet tint and tabular monospace figures.
   - **Expanded State (On Click):** Smoothly discloses the sequential thought steps (`Thought 1`, `Thought 2`, ...) without shifting surrounding layout.

2. **Grouped Tool Execution Sub-box (`<ToolExecutionBox />`):**
   - **Single-Tool Turn:** Collapses to `[ ✓ Read src-tauri/src/main.rs (120ms) ▾ ]`.
   - **Multi-Tool Turn (2+ actions):** Compares and groups all tool executions into **one compact sub-box**: `[ 🔧 Executed N actions (Read, Terminal, Patch) · 1.8s ▾ ]`.
   - **Settled State (Closed):** Always closed by default once execution finishes so the user's primary focus remains on the final response text.
   - **Expanded Drawer (On Click):** Opens a sleek nested drawer with itemized action rows:
     - **Header:** Tool name, risk rating (`low`, `medium`, `destructive`), and execution latency.
     - **Input Parameters:** Formatted JSON syntax-highlighted block.
     - **Execution Output:** Formatted result, error message, or spooled disk handle with `[Inspect in Right Rail ↗]`.
     - **Retry Action:** Inline `Retry` affordance for failed executions.

3. **Assistant Response Body:**
   - Real-time Markdown, KaTeX math rendering, and `highlight.js` syntax-highlighted code blocks with language tags and copy buttons.
   - Footnote citations (`applyCitationMarks`, `[^1]`) linked to verified references.

4. **Artifact & Approval Cards:**
   - Rendered previews of created/modified files (`quarterly_report.xlsx`). Clicking any card automatically focuses that file in the right rail viewport.
   - Guard-2 human-in-the-loop MCQ approval cards and diff comparisons before any destructive mutation executes.

### 3.2b CLI Stream Normalization, Spooled Payloads & Zero CLS Bounding

1. **CLI Terminal Stream Normalization:**
   - External CLI agents output continuous raw terminal streams containing ANSI color codes, spinner lines, tool call prompts, diff blocks, and grep traces.
   - The desktop ACP harness (`everyaios-acp`) parses raw stdout into structured `UIEventEnvelope` blocks. Under no circumstances may raw, unformatted terminal dumps spill into the main chat bubble. All CLI execution details are contained inside the closed tool sub-boxes.

2. **Spooled Big-Payload Tool Card:**
   - When a tool result exceeds 2,000 tokens, it is spooled to content-addressed storage on disk (`retrieve_original(hash)`).
   - In the tool sub-box drawer, the result renders as a **Spooled Blob Card** with a concise AI summary and a direct `[Inspect in Right Rail ↗]` action to view the raw data in Monaco diff or spreadsheet view without bloating the chat thread.

3. **Zero Cumulative Layout Shift (CLS = 0) Bounds:**
   - Pre-allocates min-height CSS bounds and skeleton placeholders for in-flight tool chips and reasoning blocks. Prevents vertical layout jumping during fast token and tool streaming (Linear/Apple standard).

4. **Context Passport Visual Inspection Pill:**
   - Renders a discreet `<memory_passport>` pill in the assistant bubble header.
   - Clicking opens an inspector drawer displaying the exact warm memory facts, active skills, and governance constraints injected into that turn.

5. **Subagent / Specialist Attribution Badges:**
   - Every delegated sub-step inside the tool execution drawer explicitly displays an attribution badge identifying the external agent that performed the task (e.g., `@Codex CLI`, `@Claude Code`, `@Aider`).

### 3.3 Chat Input Bar

| Element | Function |
|---------|----------|
| `+` button | Attach files, images, screenshots, URLs |
| Text input | Main prompt area (multiline, auto-expand) |
| Mode selector | Normal / Plan / Research / Quick / Code — **SUPERSEDED (2026-09-10):** the shipped composer is the SPEC three-control taxonomy (WHO Agent ▾ / WHAT Work-Mode Auto·Plan·Build·Research / HOW MUCH Autonomy Sandbox·Ask·Auto·Maximum, default `[Auto] [Ask]`); Code/browser/Office/terminal are capabilities inside Build, not modes. See SPEC composer section. **Casual (v3.9, 2026-09-13):** the row collapses to one plain autonomy dial (`Look only · Ask me first · Balanced · Just do it`); Agent ▾ / Work Mode ▾ are power-only. Display layer over the same `PermissionMode` — no policy change. |
| 🎙 Microphone | Voice-to-text recording — **post-v1**, disabled/honest until qualified |
| 🔊 Speaker | Read-aloud toggle (H28 — **post-v1**, disabled/honest until qualified; offline sherpa-onnx TTS remains deferred) |
| ▶ Send | Submit message (Enter also works) |
| Slash commands | **Agent-dependent (H32).** Built-in runtime bound: EveryAIOS `/help` `/mode` `/model` `/undo` `/compact` `/clear` `/export` (local intercept). ACP agent: live `available_commands_update` list; submit `/name args` as `session/prompt` text — do **not** intercept EveryAIOS slash. No per-harness hardcoded tables. |
| `!macro` | Knowledge macro expansion (e.g., `!deploy-checklist`) — inbuilt composer only |
| `@mention` | Workspace file refs (path / ACP resource block when `embeddedContext`); not a per-CLI `@agent` table |

### 3.4 Chat Modes

> **SUPERSEDED (2026-09-10):** the five-mode table below predates the shipped
> composer. Canonical: SPEC three-control taxonomy (Agent WHO / Work-Mode
> WHAT Auto·Plan·Build·Research / Autonomy HOW MUCH Sandbox·Ask·Auto·Maximum).
> Kept for history.

| Mode | Behavior |
|------|----------|
| **Normal** | Full agent with tools + edits + browser |
| **Plan** | Read-only analysis, architecture suggestions, no edits |
| **Research** | Deep research mode (breadth×depth, web search, synthesis) |
| **Quick** | Lightweight Q&A, no tool dispatch, memory retrieval only |
| **Code** | Code-focused, RepoMap context, edit strategies active |

---

## 4. Right Panel: Activity Rail + Multi-View Viewport (v3.0)

### 4.0 First-Run Rule (non-negotiable — tasks, not modules)

- **First run shows chat + an empty viewport. No nine tabs, no module wall.**
- A view opens **only when that surface is actually in use** (agent opened a browser, a file, a terminal — not because the feature exists).
- Guard, Connectors, Memory, Analytics, ACP/MCP, vault, plugins live behind the left sidebar + **"+" Add view** until the user needs them.
- The default interaction is: pick a folder → ask for an outcome → watch the Progress timeline → check/edit the artifact → approve only consequential actions. The system decides whether it needs a browser, office, terminal, or harness.
- One useful default task completes before advanced settings surface (onboarding item: "add first key → first chat" is chat-app onboarding; the control-plane onboarding is one end-to-end task).
- Modes (Normal / Plan / Research / Quick / Code) are optional; the default is "do the task".
- **UI reference sources (doc 67 §6, finalization):** Claude Desktop **Views**, Cursor **activity bar**, ChatGPT **Work vs Codex**, Devin Desktop **command center** — all converged on rail + one-open-surface; Office is grouped (ChatGPT Work keeps docs/slides/sheets in "Work", not next to the terminal). AnythingLLM + Cherry Studio are the *first-run* reference ("tasks not modules"); **holaOS** is the closest whole-product competitor (side-by-side app+agent + marketplace UX) — validation only (modified-Apache).

### 4.0a The Interactive 4-Stage Onboarding Modal Flow (`onboarding-modal.tsx`)

On first launch, if `onboardingCompleted` is false, an interactive full-screen modal engages the user with zero cognitive friction:

1. **Stage 0: Brand & Purpose Cycling Animation**
   - Renders a dynamic typographic cycling title (`EveryAIOS` · `EveryAgent` · `EveryWork` · `EveryDoc` · `EveryModel` · `EveryTask`) with physical spring motion (`framer-motion`).
   - Introduces EveryAIOS as the universal desktop operating harness and shared cowork plane.
2. **Stage 1: Engine Capabilities & Theme Customization**
   - Showcase cards for full-stack engines (Agent Orchestration & Control, Multi-Model Cloud/Local BYOK, Tiered Browser & CDP, Office & IronCalc, Guard-2 Security, Durable Memory).
   - Dynamic Dark/Light mode toggle and semantic cool-blue accent color customizer (`blue`, `sky`, `emerald`, `violet`, `amber`).
3. **Stage 2: Live ACP Agent Discovery & Auto-Detection**
   - Automatically probes host for installed ACP coding agents (`claude`, `codex`, `opencode`, `aider`, `grok`, etc.) via `acpInstallStatus` (`acp_install_status`).
   - Displays 🟢 *Auto-Detected & Ready* badges for discovered CLIs without requiring redundant re-installation.
   - For uninstalled agents, provides a one-click *Install* button that initiates a ticketed Guard-2 install flow (`acpInstallRequest` / `acpInstallCommit`).
4. **Stage 3: Security & Passphrase (Optional)**
   - Offers an optional master passphrase for power users seeking custom vault encryption.
   - Defaults to zero-homework transparent OS Keychain / keyring encryption fallback for casual users, ensuring immediate usability without forced credential setup.

### 4.1 The 48px Activity Rail

```
┌────┐
│ 📁 │  Folder      Cmd+Shift+E   ← files / project tree
│ >_ │  Shell       Ctrl+`        ← same cwd as session folder
│ 🌐 │  Browse      Cmd+Shift+B   ← clean profile vs My Chrome toggle
│ </>│  Code        Cmd+Shift+C   ← one file (+split 2), LSP, diff strip
│ ── │
│ W  │  Office      Cmd+Shift+O   ← ONE button → flyout (never 4 icons)
│ ── │
│ ▢  │  Progress    Cmd+Shift+P   ← full timeline (2-line strip stays in center)
│ +  │  Add view                  ← Diff, Audit/Replay, Storage, Memory, plugin views
└────┘
```

- **4 core verbs:** Folder · Shell · Browse · Code. The rail is the fast lens switcher; the viewport may keep several views open as tabs without turning them into competing product modules.
- **Office = one button (W).** Word/Excel/PPT/PDF are a flyout, not four rail icons. Opening `Q3-Budget.xlsx` auto-selects W → Excel (the agent's file opens the matching view; the user never hunts a tab).
- **Session views** (Progress full-timeline, Diff, Audit/Replay, Storage) under ▢ / +; a 2-line "now doing" strip stays under chat so collapsing the rail never hides the agent.
- Click **active icon → collapse** viewport (center 100%). Click another icon → switch lens; the selected tab remains persisted and the session keeps running. Hover = tooltip + live/idle/gap badge.
- `+` = **Add view** — first-party office/session views and third-party plugins register through the same slot (the I6 dogfood rule: no 10th header tab).

**Office flyout**
```
┌─────────────────────────────┐
│ Sheets    Q3-Budget.xlsx  ● │   ● = agent touching it now
│ Word      Exec-Summary.docx │
│ Slides    Pitch.pptx        │
│ PDF       Invoice-8402.pdf  │
│ ──                          │
│ Open another…               │
└─────────────────────────────┘
```

### 4.1a Settings Control Center (v3.78 — provider, runtime, and installed-resource patterns)

Settings is a control center, not a collection of decorative panels. It uses the same two-pane pattern as the agent picker: searchable inventory on the left, selected-resource detail on the right. Every row is backed by a Rust/Tauri read model and every mutation is reread from the backend.

```
┌──────────────────────────────┬─────────────────────────────────────┐
│ Settings                     │ Selected resource                   │
│ [Search settings/resources]  │ name · kind · readiness · health     │
│                              │                                     │
│ Providers                    │ Native capabilities                  │
│ Agents                       │ Shared EveryAIOS capabilities         │
│ Channels & Connectors       │ Configuration / scopes / model        │
│ Schedules                    │ [Save] [Connect] [Verify] [Disable]  │
│ Installed                    │                                     │
│ Marketplace                 │ Activity / audit / error detail       │
└──────────────────────────────┴─────────────────────────────────────┘
```

**Providers.** Sections are `Configured`, `Popular`, and `All providers`, with all-character search. Selecting a row opens activation detail: catalog metadata, auth method, key bars or keyless action, metadata-only verification, then searchable models and default model. The UI displays `configured`, `API key required`, `Sign in`, `Local CLI`, `Keyless`, `Health failed`, or `Ready`; a green tick always has an accessible `verified` label and is never inferred from a non-empty field.

**Agents.** Selecting an installed agent shows two separate capability cards: `Native capabilities` (the agent's own loop, tools, search, model/account, permissions, and sessions) and `EveryAIOS shared capabilities` (Office, Browser, Computer Use, Workspace/CodeIntel, Connectors, Artifacts, Work, Scheduler, Recovery, Evidence, Budget, Guard). The settings screen may configure only the EveryAIOS side and the verified integration seam. Subscription agents show their own sign-in instead of a key-copy control. Current P63 provider binding is launch-time environment injection; the UI shows variable names and `writesToAgentConfig: false`.

**Channels & Connectors.** Show `Discovered`, `Installed`, `Connected`, `Disconnected`, and `Degraded` groups. Each detail includes transport, scopes, data/effect summary, enabled consumers, health, last error, and connect/disconnect/revoke actions. A connected badge comes only from the backend's live attach/OAuth truth. MCP tools are not displayed as a flat 51-row wall; task-shaped shared façades are the target surface.

**Schedules.** Show trigger, target Work/blueprint, **the active agent binding**, capability scope, autonomy, budget, network policy, next run, last run, and state. `Run now` creates a normal Work and does not edit the recurrence. In-flight runs retain their frozen runtime manifest when settings change.

**Installed / Marketplace.** `Installed` shows skills, plugins, MCP servers, ACP runtimes, hooks, and tools with version, digest/signature, trust, capabilities requested/granted, bound agents, activation, and health. `Marketplace` is discovery only. Install is validate → preview → Guard-2 consent → sandbox/grant → atomic write → inventory → lazy activation → health. Disable/remove/rollback actions operate on the pinned installed record.

**Persistence and failures.** A setting change is rendered as pending until Rust validates, persists atomically, applies live where possible, and rereads. The result must identify `appliedLive`, `restartRequired`, or an actionable error. Missing credentials, missing binaries, unsupported transport, stale OAuth, failed health, and unavailable platform capabilities are separate states; none is represented as a generic green “configured” badge.

### 4.1a.1 Windows agent discovery and configuration surface

The production Windows shell must make runtime provenance visible. An agent row includes `source` (`EveryAIOS install`, `PATH`, `App Paths`, `user selected`, `package manager`, `WSL`) and an exact path when one exists. WSL rows include the distro and Linux executable path and launch through the WSL terminal backend; they are not merged into the Windows executable list. The list separates `Discovered`, `Installed`, `Ready`, `Needs sign-in`, `Needs key`, `Unavailable`, and `WSL` rather than using one installed badge.

Selecting an agent opens a wide/two-pane view, not another dense card grid:

```
┌──────────────────────────────┬─────────────────────────────────────────┐
│ Installed / discovered       │ Claude Code                             │
│ ● EveryAIOS Native           │ Native capabilities · auth · readiness  │
│ ● OpenCode · PATH            │ [agent-owned model selector]             │
│ ● Cline · WSL Ubuntu         │ EveryAIOS shared capabilities            │
│ ○ Codex · not found          │ [Use vault provider at launch] [Health] │
└──────────────────────────────┴─────────────────────────────────────────┘
```

The selected agent's model selector is the only model selector in this view. Native uses EveryAIOS's provider/model catalog; external agents use ACP/config options or their own native account. The vault button is a launch-time binding and displays env-variable names only. The view must expose `path`, `source`, `distro`, `version`, `verified_at`, and `last_error` without exposing secrets.

### 4.1a.2 Session capability pane

MCP servers, skills, plugins, connectors, Office, Browser, Computer Use, artifacts, and memory are managed as session capability rows with `enabled`, `health`, `scope`, `source`, `native_or_shared`, and `applies_to` fields. Installed healthy capabilities default enabled, but a user may disable them for the session/run. The pane changes the next turn/run only, snapshots into the Work `RuntimeManifest`, and never dumps all schemas into the prompt. A disabled, unhealthy, or unpermissioned capability is not presented as active.

### 4.1a.3 Visual system update

The shell uses a cool blue semantic brand with light/dark themes and selectable accent tokens. Existing `orange-*` utility usage must be migrated to semantic tokens; orange may remain only where an existing status meaning explicitly requires it and must not represent selection or brand. The composer has one calm row—Agent, agent-owned Model, Work Mode, Autonomy—with advanced configuration in a popover/full-screen surface. Accessibility labels and text state accompany every status color.

### 4.1a.4 Dynamic Local Models & Hardware Profiling Panel (`local-models-panel.tsx`)

Settings → Local Models eliminates all hardcoded static presets (e.g. fixed 3B/7B labels) and dynamically tailors recommendations to the host machine:
- **Host Hardware Profile:** Probes host RAM (`ram_bytes`), CPU cores, and GPU status (`getHardware()` / `local_hardware`).
- **Dynamic Headroom Zones:** Computes memory safety boundaries directly from total host RAM:
  - 🟢 **Safe / Fast & Smooth (<= 60% RAM):** Ample headroom for host OS and multi-turn KV cache.
  - 🟡 **Capable / Moderate (60%–85% RAM):** Balanced performance, may experience memory pressure during deep context turns.
  - 🔴 **Resource Intensive (> 85% RAM):** Exceeds safe host memory limits; requires dedicated GPU or high VRAM.
- **Live Per-File Fit Scoring:** Calculates exact memory consumption via Rust `model_estimate_fit` on searched Hugging Face GGUF models.
- **Progressive Disclosure:** Advanced technical details (quantization formats, KV cache quantization, tensor splits, context limits) are hidden behind a toggle ("Show Advanced / Quantization Details") for casual users.

### 4.1b Multi-view tabbed panel (v3.0 — VS Code logic)

The right viewport is a **tabbed view container** (VS Code editor-group / panel-region pattern), not a single surface.

```
┌───────────────────────────────────────────────────────────────┐
│ [📁 Folder] [>_ Terminal] [🌐 Browser] [📄 contract.pdf] [+] │  ← tab strip
├───────────────────────────────────────────────────────────────┤
│  active view content (one tab at a time)                      │
└───────────────────────────────────────────────────────────────┘
```

- **Defaults:** Terminal · Folder · Browser open on first power-mode use; the rail icon switches the active tab (click active icon → collapse to 0px, chat full-width — never unmount).
- **`+` Add view:** picker lists every not-open view (Code, Office files, Progress, Diff, Audit, Storage, Memory, Research, plugin views). Selecting adds a tab and activates it. This is the I6 dogfood slot (no 10th header tab).
- **Close × / reorder / persist:** tabs close, reorder by drag, and persist per session (`openViews`, `activeView`, `railCollapsed`, `splitRatio` per sessionId — the Cursor layout-reset bug is not copied).
- **Browser = one view, many pages:** the Browse tab hosts its own internal tab strip (page tabs + `+` new tab). Opening a link spawns a page tab inside the browser view — never a new panel tab.
- **Office files = one tab each:** opening `Q3.xlsx` / `exec-summary.docx` / `contract.pdf` / `deck.pptx` (agent or artifact click) adds a tab; the matching engine renders it. Reuses the W-flyout to pick among open office docs.
- **PDF study mode:** a PDF tab can **scope the chat** (`📄 Scoped to contract.pdf` chip in the chat header, ✕ clears). Answers are grounded in that document — side-by-side "explain this paragraph" without leaving the doc.
- **Open-perfectly renderer (LibreOffice/LOKit):** for Word/PPT/PDF and mixed-format fidelity, `everyaios-office` can drive **LibreOffice headless + LOKit tiled rendering** for *both* agentic mutation and normal human reading (read-only mode = same renderer, no mutation path). Sheets stay on IronCalc/calamine (deterministic recalc); PDFs on lopdf/pdf.js; LOKit is the fallback/perfect-fidelity tier for anything the surgical engines don't cover.
- **Google Docs/Sheets:** normal access = open in the authenticated browser view (system Chrome session, no re-login). Agentic access = Drive/Sheets API (gws connector, F14/F15, P18) → export OOXML → office engine → mutate → (optional) write back. Never a bespoke Google renderer.

### 4.1c Full-fidelity tool surfaces (v3.1 — "nothing held back")

> **v3.55 boundary reconciliation (F6):** this section is the **long-horizon UI target**, not a current-state claim. It is governed by the control-plane boundary rule (DESKTOP-APP-SPEC §4.3): a rich view may exist only when every control calls the same native ticketed engine — a view is never a second mutation engine, ledger, or source of truth. D-series Office is **ON HOLD (2026-08-22; partial lift 2026-08-26 — the honest-viewer tier landed per the doc-29 verdict: per-file tabs, LO companion, Google Docs browser read path, block list / selection status / thumbnails / ticketed edits / takeover locks), not a ribbon clone**. Full ribbons / full Chrome chrome are post-hold targets and must be wired to the existing engines (docx block-patch, IronCalc, pdf suite) — never rebuilt as presentational chrome.

The right panel is the **user's window into what is actually happening** in the real tool. Every view reproduces the official product's full surface — all buttons, all toolbars, all modes. Nothing is stripped for "preview". The agent drives the same surface the user sees; takeover (H21) makes any control live.

**Word — full Microsoft ribbon** (File · Home · Insert · Draw · Design · Layout · References · Mailings · Review · View · Help · **Copilot**):
- Home: Clipboard (Paste/Cut/Copy/Format Painter) · Font (type, size, B/I/U, color, highlight) · Paragraph · Styles · Editing
- Insert: Pages · Tables · Illustrations · Header & Footer · Text · Symbols · Insert Copilot-draft
- Design: Document Formatting · Page Background · References: TOC · Footnotes · Citations & Bibliography
- Review: Proofing · Comments · Tracking · View: Views · Show · Zoom · Window
- **Copilot** (Home, Dynamic Action Button): summarize, rewrite, ask about the document, draft with references
- Canvas: ruler, page views (Print/Web/Read), zoom slider, status bar (Page x/y · Words · language)

**Excel — full ribbon** (File · Home · Insert · Page Layout · Formulas · Data · Review · View · Help · **Copilot**):
- Home: Clipboard · Font · Alignment · Number · Styles · Cells · Editing
- Insert: Tables · Charts · Sparklines · Filters · Links · Text · Insert Copilot-chart
- Page Layout: Themes · Page Setup · Scale to Fit · Sheet Options · Formulas: Function Library · Defined Names · Formula Auditing · Calculation
- Data: Get & Transform Data · Queries & Connections · Sort & Filter · Data Tools · Review: Proofing · Comments · Protect
- **Copilot**: analyze, suggest formulas, highlight trends, build charts
- Canvas: **Name box + Formula bar**, grid, sheet tabs, status bar (Average/Count/Sum/zoom), freeze panes, autofilter

**PowerPoint — full ribbon** (File · Home · Insert · Design · Transitions · Animations · Slide Show · Review · View · Help · **Copilot**):
- Home: Clipboard · Slides · Font · Paragraph · Drawing · Editing · Insert: Slides · Tables · Images · Illustrations · Media · Text
- Design: Themes · Variants · Customize · Transitions: Preview · Transition to This Slide · Timing
- Animations: Preview · Animation · Advanced Animation · Timing · Slide Show: Start · Set Up · Monitors
- Review: Proofing · Comments · Compare · View: Presentation Views · Show · Zoom · Window
- **Copilot**: generate slides from outline, design ideas, rehearse coach
- Panes: Slide · Outline · Notes · Slide Sorter; thumbnail strip; presenter notes (P4.7b)

**PDF — full viewer** (Adobe/Edge-class): open/save/print/download/share · page nav ◀ ▶ · page number · zoom +/− · fit page/width · search · highlight/underline/strikeout · comment & annotate · draw/shapes/stamps · form fill · sign · redact · thumbnails/outline/annotations sidebar · reader mode · night mode

**Browser — full Chrome-style chrome** (v3.1): tab strip (tabs + `+` new tab + pinned + tab actions) · toolbar (back/forward/reload/home · **omnibox** address+search · star/bookmark · extension icons + puzzle-piece menu · profile avatar · ⋮ menu) · **bookmarks bar** · **built-in AI Mode / Gemini sidebar** (no extension — Chrome 141+ parity) · reader mode · downloads · history · settings · page actions

**Fidelity rule:** a control exists in the view iff the real product has it. Read-only while the agent works (H21); writable on takeover. This is the "right panel connects — the user sees what is actually going on" contract.

### 4.2 Views Contract (how "+" stays one product)

```ts
interface ViewDefinition {
  id: string;                 // view.browser | view.office.xlsx
  icon: string;               // SVG / icon identifier
  label: string;
  group: "core" | "office" | "session" | "plugin";
  when?: (session: SessionState) => boolean;  // contextual availability
  open: "replace" | "split"; // v1 = replace only
}
```

- Core four + Office + Progress are first-party views using this contract; plugins use the same `+` slot
- **Per-session persistence** (session-state fix): activeViewId, officeDocId, railCollapsed, splitRatio, browseMode (clean | my-chrome), composerMode (agent | plan | research | quick | code) saved per sessionId — switching chats restores exactly what you left; a new chat starts rail-collapsed until a tool needs a view. These are `LensState`/projection preferences, not ownership of a physical resource; the scope and reattachment rules are normative in [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md) §1.3 and §4.

### 4.3 Progress View (view.progress)

Unified timeline of all agent actions:
```
┌───────────────────────────────────────┐
│ Progress                               │
├───────────────────────────────────────┤
│ 09:15:02  📂 Opened quarterly.xlsx    │
│ 09:15:04  ✏️  Updated B7:B12         │
│ 09:15:08  📊 Regenerated chart        │
│ 09:15:12  🌐 Searched Google for...   │
│ 09:15:15  📂 Opened report.docx       │
│ 09:15:18  ✏️  Wrote §3.2 paragraph   │
│ 09:15:22  💻 Ran `npm test`           │
│           └─ Output: 42 passed ✓      │
│ 09:15:25  📄 Exported report.pdf      │
└───────────────────────────────────────┘
```
- Each entry is clickable → jumps to relevant tab + position
- Timestamps for full audit trail
- Expandable entries (click to see details/output)
- Filterable by type (shell/code/browser/office/file)

### 4.4 Shell View (view.shell) — H36 terminal profiles (v3.80 one-plane rewrite)

```
┌──────────────────────────────────────────────────────────┐
│ ☰ PowerShell ▾   [+ ▾]  [Find] [History]     [Eye Int]   │
│    PowerShell · cmd · Git Bash · Ubuntu (WSL) · bash     │
├──────────────────────────────────────────────────────────┤
│ ◆ Agent · npm test (read-only)   ← provenance tab        │
│ PS C:\work> npm test                                     │
│ PASS 42 tests                                            │
│ ● exit 0 · work         ← OSC 633 shell-integration mark │
│ PS C:\work> _                                            │
├──────────────────────────────────────────────────────────┤
│ You session · integration: Rich · keystrokes → gesture   │
└──────────────────────────────────────────────────────────┘
```
- **`+` dropdown** lists detected profiles (VS Code model): PowerShell, cmd, Git Bash, each WSL distro, `$SHELL`/bash/zsh/fish. Not one hardcoded `sh`/`cmd`.
- Default profile per OS; **Select Default Profile** at the bottom of the dropdown.
- **Automation profile** (tasks/agent `script.run`) is separate from the user shell, but renders in the same view.
- **One read model for the plane (2026-09-17, P54.5):** the view's four read commands (`terminal_status`, `terminal_commands`, `terminal_last_command_context`, `terminal_history_context`) and the coordinator's read-only `terminal/*` RPC arm serialize the *same* `everyaios_core::terminal` structs (`TerminalSessionView`/`TerminalCommandView`/`TerminalPlaneStatus`). A session row the agent is told about therefore cannot describe a different shell than the tab strip draws. `attached: false` means *this host has no shell* and must not be rendered as “zero sessions”; a `trusted: false` record must not be presented as fact. The arm carries **no run method** — the only way to cause a shell effect stays the ticketed `script.run` tool, so the view and the agent share a picture without sharing authority.
- Multiple tabs; each tab is a `PtySession` (`pty_id` + `profile_id` + `backend` + `origin`).
- **Provenance (v3.80):** human / agent / task tabs share one PTY plane and render with origin chips; agent/task tabs are watch-only — the UI and the write path both refuse input (authority cannot be laundered through a tab). Reattach on view reopen restores origin.
- **Shell integration (v3.80):** OSC 633 reporting (bash `PS0`, zsh/fish hooks, pwsh `PSConsoleHostReadLine`) gives the real cwd, per-command exit codes (rendered as `● exit N` marks), and trusted command records. Find-in-scrollback, web links (open externally only), and the recent-command picker all read those records. Quality ladder: Rich (integration reporting) / Basic / none.
- Human typing = `human_gesture`; agent/ACP terminals stay ticketed. Keystrokes are never audited raw (PTYs carry passwords) — agent commands are audited as `terminal.agent_run`.
- **One plane (v3.80):** the legacy piped `shell_cmds.rs` path is deleted; the IDE workbench bottom panel mounts this same view, so there is exactly one terminal surface in the product.
- **Copilot-style follow (v3.80):** `@terminal` in the composer attaches the last trusted command block (command · cwd · exit · output) as turn context; `null` (never fabricated) when no trusted record exists.
- **Open in terminal here (v3.80):** Explorer directory rows expose a terminal button that spawns the default profile rooted at that directory (Rust re-verifies the dir).
- **Honest ceilings:** splits (P54.4) and output ring-buffer replay after reattach remain open. Remote profile (`backend: Remote`) targets a user-owned ExecutionNode (H33 v1 attach) — that is the cloud terminal, not a founder host; fail-closed `remote_unavailable` today.

### 4.5 Code View (view.code)

```
┌───────────────────────────────────────┐
│ src/api/users.ts              ●       │  ← filename + modified indicator
├───────────────────────────────────────┤
│  1  import { Router } from 'express' │
│  2  import { db } from '../db'       │
│  3                                    │
│  4+ export async function getUsers() {│  ← green = added
│  5+   const users = await db.query(  │
│  6+     'SELECT * FROM users'        │
│  7+   )                               │
│  8+   return users                    │
│  9+ }                                 │
│ 10                                    │
├───────────────────────────────────────┤
│ Ln 4, Col 1 │ TypeScript │ UTF-8     │
└───────────────────────────────────────┘
```
- Full code editor with syntax highlighting (100+ languages)
- Real-time diff view as agent edits (green +, red -)
- Line numbers, minimap, breadcrumbs
- Read-only by default, toggle to editable for takeover
- File tree panel (togglable) for multi-file navigation

**P41.1 (landed 2026-08-23) — `view.code` is now the IDE workbench (`ide-workbench.tsx`), the VS Code-style surface over real backends:** activity bar (Explorer · SCM · Problems · rail views) · Explorer over the real disk (`fs_cmds`) · SCM over real git (`git_cmds`: status/stage/commit) · Problems over real LSP diagnostics (`lsp_cmds` → `everyaios-codeintel::lsp_runner` `publishDiagnostics`) · Monaco editor tabs (MIT — VS Code's own editor component; CodeMirror-6 lock superseded) with offline `?worker` bundling · bottom panel · status bar. **Still open:** P41.2 worktree-first parallelism, P41.3 ticketed writes (Guard-2), P41.4 receipts-in-editor — the workbench renders the VS Code interaction model; the Rust editor core (floem-editor-core/gpui) stays the documented future native-path reserve.

### 4.6 Browse View (view.browser)

```
┌───────────────────────────────────────┐
│ 🌐 Browser                    ● Live  │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐  │
│ │ [◀ ▶ 🔄] https://google.com   │  │  ← Address bar
│ ├─────────────────────────────────┤  │
│ │                                  │  │
│ │   [Live browser rendering]      │  │  ← Actual page content
│ │   User can see agent navigating │  │
│ │   clicking, filling forms, etc. │  │
│ │                                  │  │
│ └─────────────────────────────────┘  │
├───────────────────────────────────────┤
│ [◀ Back] [▶ Forward]      ● Live     │  ← Navigation + status
└───────────────────────────────────────┘
```
- Shows actual browser the agent is using
- "● Live" indicator (red dot) when agent is actively browsing
- Interactive: user can click to help (CAPTCHAs, MFA, navigation)
- Address bar shows current URL
- Back/Forward navigation
- Cookie persistence across session

### 4.7 Office — Excel View (view.office.xlsx) (📊 UNIQUE TO EVERYAIOS)

```
┌───────────────────────────────────────┐
│ 📊 quarterly-data.xlsx        ● Live  │
├───────────────────────────────────────┤
│     A        B        C        D      │
│ 1  Quarter  Revenue  Cost    Profit   │
│ 2  Q1       $1.2M    $800K   $400K   │
│ 3  Q2       $1.5M    $900K   $600K   │
│ 4  Q3      [$1.8M]  [$950K] [$850K]  │  ← Cells being edited (highlight)
│ 5  Q4       ...      ...     ...      │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │  📈 Revenue Chart (live update)  │  │  ← Chart regenerating
│ └──────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Sheet1 │ Sheet2 │ Charts │           │  ← Sheet tabs
└───────────────────────────────────────┘
```
- Spreadsheet grid with real-time cell editing visible
- Cells being modified are highlighted (yellow flash → settle)
- Formula bar showing active formula
- Charts update live as data changes
- Sheet tabs for multi-sheet navigation
- Powered by IronCalc (Rust) + calamine

### 4.8 Office — Word View (view.office.docx) (📝 UNIQUE TO EVERYAIOS)

```
┌───────────────────────────────────────┐
│ 📝 executive-summary.docx     ● Live  │
├───────────────────────────────────────┤
│                                        │
│  Executive Summary                     │
│  ═══════════════                       │
│                                        │
│  Q3 2026 Performance                   │
│                                        │
│  Revenue grew 20% QoQ, reaching       │
│  $1.8M driven by enterprise deals.    │
│  [█████████████████___] ← typing      │  ← Live cursor showing AI writing
│                                        │
│  Key Highlights:                       │
│  • New enterprise contracts: 12       │
│  • Churn rate: 2.1% (down from 3.4%) │
│                                        │
├───────────────────────────────────────┤
│ Page 1/3 │ Words: 847 │ Modified      │
└───────────────────────────────────────┘
```
- WYSIWYG document rendering
- Live cursor showing where AI is writing/editing
- Text appearing in real-time (typewriter effect)
- Headers, lists, tables rendered properly
- Page indicator, word count
- Powered by block-patch engine (GenOffice pattern)

### 4.9 Office — Slides View (view.office.pptx) (📑 UNIQUE TO EVERYAIOS)

```
┌───────────────────────────────────────┐
│ 📑 quarterly-deck.pptx        ● Live  │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐  │
│ │                                  │  │
│ │   Q3 2026 Results               │  │  ← Slide being built
│ │   ─────────────────              │  │
│ │   Revenue: $1.8M (+20%)         │  │
│ │                                  │  │
│ │   [📊 Chart placeholder]        │  │
│ │                                  │  │
│ └─────────────────────────────────┘  │
│                                        │
│ [1][2][3●][4][5]                      │  ← Slide navigator
├───────────────────────────────────────┤
│ Slide 3/5 │ Editing text box          │
└───────────────────────────────────────┘
```
- Slide preview with elements being placed/edited
- Slide strip at bottom for navigation
- Current slide highlighted
- Elements flash when being modified
- **Presenter mode (P4.7b — doc 63 §3, guizang SPEAKER_NOTES contract):** speaker-notes panel keyed by stable slide IDs (never page numbers — reorder-safe), rehearsal view with per-slide timing, auto-advance, notes↔slides sync validated by a port of guizang's `validate-presenter-mode.mjs`

### 4.10 Office — PDF View (view.office.pdf) (📄)

```
┌───────────────────────────────────────┐
│ 📄 contract.pdf               ● Live  │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐  │
│ │                                  │  │
│ │  [PDF page rendering]           │  │
│ │  Form fields being filled       │  │
│ │  Annotations being added        │  │
│ │                                  │  │
│ └─────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Page 2/8 │ [◀ ▶] │ Zoom: 100%       │
└───────────────────────────────────────┘
```
- PDF page rendering (pdf.js)
- Form fields highlighted when being filled
- Annotations/highlights visible as added
- Page navigation, zoom controls

---

## 5. Takeover / Resume Flow

### 5.1 Normal State (Agent Working)
- Right viewport shows "● Live" indicator (and rail icon badge)
- All panels are read-only
- User can watch in real-time

### 5.2 Interrupt (User Takes Over)
1. User clicks **⏸ Pause** button (or agent asks for input)
2. "● Live" → "⏸ Paused" indicator
3. All panels become interactive/editable only after the native user gesture and the Work/Run lease transition succeed
4. Shell toggles to writable
5. Code editor accepts input
6. Browser allows clicking/typing

A takeover request against a conflicting or stale lease shows the conflict and leaves the old holder fenced;
it never transfers a physical handle implicitly. The agent is notified and its prior element/resource refs are
invalidated. Guard still authorizes each mutating effect.

### 5.3 Resume
1. User clicks **▶ Resume** button
2. System prompts: "Describe what you changed" (required text field)
3. User types: "Fixed the formula in B4, updated chart title"
4. Agent receives context and continues
5. Panels return to read-only, "● Live" restores

Resume reuses the same canonical Session/Work/Run/Binding context and Work/Run-owned lease or fence; it does not
invent a new owner. These takeover and stale-generation cases are required pending acceptance rows in ADR-0008 §6.

---

## 6. Automation Builder UI

### 6.1 Automations List

```
┌─────────────────────────────────────────────────────────────────────┐
│ Automations                                    [+ Create automation] │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ Name             │ Trigger    │ Action  │ Activity    │ Status │  │
│ ├──────────────────┼────────────┼─────────┼─────────────┼────────┤  │
│ │ Daily backup     │ ⏱ Daily   │ Run     │ ▁▃▅▇▅▃▁▃▅ │ ⏻ ON  │  │
│ │ CI failure fixer │ 🔗 Webhook │ Session │ ▃▅▇▅▃▁▁▃▅ │ ⏻ ON  │  │
│ │ Weekly report    │ ⏱ Weekly  │ Run     │ ▁▁▁▁▁▁▁▇▁ │ ⏻ ON  │  │
│ │ Slack triage     │ 💬 Slack   │ Triage  │ ▅▇▅▃▅▇▅▃▅ │ ⏻ OFF │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
│ Templates: [View all →]                                              │
│ [CI Fixer] [Weekly Deps] [Security Scan] [Release Notes] [...]      │
│                                                                       │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ Describe an automation in natural language...           [▶]   │  │
│ └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Automation Editor

```
┌─────────────────────────────────────────────────────────────────────┐
│ Edit Automation: "Daily Backup"                          [Save] [⋯] │
├─────────────────────────────────────────────────────────────────────┤
│ Trigger:  [⏱ Schedule ∨]  Every day at 2:00 AM                     │
│ Condition: [None]                                                    │
│ Action:   [Start session ∨]                                         │
│ Prompt:   "Back up all project files to..."                         │
│ Blueprint: [@daily-backup ∨]                                        │
│ Budget:   [10,000 tokens max ∨]                                     │
│ Network:  [Restricted — local only ∨]                               │
├─────────────────────────────────────────────────────────────────────┤
│ Activity:  Last 30 days                                             │
│ ▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃▁▃▅▇▅▃                                  │
│ Runs: 28 │ Success: 26 │ Failed: 2                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Knowledge / Memory Browser UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ Memory                                          [+ Add knowledge]    │
├────────────────────────┬────────────────────────────────────────────┤
│ Categories:            │ Knowledge Items:                            │
│                        │                                             │
│ 📁 Coding standards   │ ┌─────────────────────────────────────┐   │
│ 📁 Deployment         │ │ "Use pnpm not npm"                   │   │
│ 📁 Project context    │ │ Trigger: package management           │   │
│ 📁 Personal prefs     │ │ Macro: !pnpm                         │   │
│ 📁 Skills             │ │ Scope: all projects                   │   │
│                        │ │ [Enabled ✓] [Edit] [🗑]             │   │
│ ────────────────       │ ├─────────────────────────────────────┤   │
│ Episodic memory        │ │ "Deploy to prod checklist"           │   │
│ Semantic store         │ │ Trigger: deploying, production       │   │
│ Knowledge graph        │ │ Macro: !deploy                       │   │
│                        │ │ Scope: backend-api project           │   │
│                        │ └─────────────────────────────────────┘   │
│                        │                                             │
│                        │ Suggestions (2 new):                       │
│                        │ [Accept] [Dismiss] "Always run lint..."   │
└────────────────────────┴────────────────────────────────────────────┘
```

---

## 8. Guard / Security Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Guard                                                                │
├─────────────────────────────────────────────────────────────────────┤
│ Trust Level: ████████░░ 75/100                                      │
│                                                                       │
│ Recent Actions:                                                      │
│ ✓ Read src/utils.ts                    (auto-approved)              │
│ ✓ Write src/api/handler.ts             (within workspace)           │
│ ⚠ Execute `npm run deploy`            [Approve] [Deny]             │
│ ✗ Blocked: rm -rf /                    (Guard-1 regex)              │
│                                                                       │
│ Permissions:                                                         │
│ [Workspace read] [Workspace write] [Shell (restricted)]             │
│ [Browser (owned tabs)] [External API (with approval)]               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Connector Hub Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│ Connectors                                      [Browse MCP servers] │
├─────────────────────────────────────────────────────────────────────┤
│ Connected:                                                           │
│ ✓ Gmail (OAuth)          │ 3 tools available                        │
│ ✓ Google Calendar        │ 5 tools available                        │
│ ✓ MCP Servers (user)   │ n tools available                       │
│ ✓ Local SearXNG         │ Web search                                │
│                                                                       │
│ MCP Servers:                                                         │
│ ✓ filesystem-server      │ Running on stdio                         │
│ ✓ github-mcp            │ Running on HTTP                           │
│ ○ slack-mcp             │ Not connected [Connect]                   │
│                                                                       │
│ [+ Add native connector] [+ Install MCP server]                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Design Tokens & Visual Language

> **SUPERSEDED (2026-09-10):** the token values in §10.1–10.2 below are the
> pre-v2.1 draft (`#FFFFFF/#FF6B00`). The canonical production tokens live in
> `UI-DESIGN-PROMPT.md` (cool-blue semantic brand + selectable light/dark accent tokens) and the
> implementation in `ui/src/globals.css` — per the v2.1 note at the top of
> this doc, UI-DESIGN-PROMPT.md wins on pixels. This section is kept for
> history; do not build from it.

### 10.1 Colors
- Background: #FFFFFF (light) / #1A1A1A (dark)
- Sidebar: #F8F9FA (light) / #232323 (dark)
- Primary accent: #FF6B00 (orange — action required, send button)
- Success: #22C55E (green)
- Warning: #EAB308 (yellow)
- Error: #EF4444 (red)
- Active/Running: #3B82F6 (blue)
- Muted: #9CA3AF (grey)

### 10.2 Typography
- Headings: Inter/System, 600 weight
- Body: Inter/System, 400 weight
- Code: JetBrains Mono / Fira Code, 400 weight
- Sizes: 14px base, 12px small, 16px heading, 20px title

### 10.3 Spacing
- Sidebar width: 240px (collapsible to 48px)
- Tab height: 40px
- Chat message padding: 12px 16px
- Card border-radius: 8px
- Input bar height: 56px (expands with content)

### 10.4 Icons
- Lucide icon set (consistent with Tauri ecosystem)
- 20px default, 16px in dense areas
- Monochrome, colored only for status indicators

---

## 11. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+K | Global search / command palette |
| Cmd+N | New chat |
| Cmd+Enter | Send message |
| Cmd+Shift+P | Progress view / Pause-Resume agent |
| Cmd+Shift+E | Folder view |
| Ctrl+` | Shell view |
| Cmd+Shift+B | Browse view |
| Cmd+Shift+C | Code view |
| Cmd+Shift+O | Office flyout |
| Cmd+Shift+D | Diff view |
| Cmd+\\ | Collapse / expand right viewport (full-width chat) |
| Cmd+Shift+F | Fullscreen viewport |
| Escape | Stop agent / close modal / cancel |

---

## 12. Generative UI, Resumable Streams & Voice Output (docs 49–50)

- **Storage intelligence UI (D9–D12/G7/G8):** Files tab gains a **treemap view** (squarified, stable extension-hashing colors), disk-usage summary, duplicate-group reports, large-file finder list, and a **storage-health card** (drive thresholds, cleanup plans — D12) — all with Guard-2 diff-card cleanup; a **global instant-search palette** (`Cmd+K`-adjacent, FTS5 filename index) matches the Everything/UltraSearch UX (doc 49); the search palette and research flows use the **tiered cascade (G8)** — cached <10ms, 50-page parallel fetch (doc 52 §4)
- **Generative UI (H25):** sandboxed live components in chat (§3.2); AG-UI wire protocol
- **Resumable streams (H27):** reconnecting chip + resume-from-last-token (§3.2)
- **Voice I/O (post-v1 exclusion):** H15 voice input, speech-to-text, and wake-word plus H28 TTS/read-aloud are not v1 acceptance surfaces. Any staged mic or speaker control must be disabled/honest, must not inject a transcript or audio result, and must not be presented as qualified. The text/cited research portion of H31 may remain in scope; its audio-digest output remains post-v1 under [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md).
- **Image generation (A10):** chat image tool → provider endpoint (GPT-Image-1/DALL·E 3/Flux/SD/MCP), results as ref-handle artifact cards
- **Clipboard (H26):** guard-ticketed clipboard read/write tools; history panel opt-in

## 13. Mobile / Compact Considerations

Not primary target (desktop app), but for future:
- Sidebar becomes bottom sheet
- Workspace tabs become swipeable
- Chat and Workspace stack vertically
- Progress steps collapse to summary

---

## 14. Accessibility

- All interactive elements focusable via Tab
- ARIA labels on icons and status indicators
- High contrast mode support
- Screen reader announces progress steps and status changes
- Reduced motion mode (disables live typing animation)
- WCAG 2.2 AA is the accessibility target; verify contrast and other success criteria with automated and manual evidence before claiming conformance.
- Focus must remain visible and not be obscured; dialog focus is trapped and restored; status/progress changes are announced without relying on color alone.
- Respect `prefers-reduced-motion`, text scaling, RTL, and keyboard operation; use native controls and APG focus patterns before adding ARIA.

---

## Repo-comparison additions (briefs 01–19)

> Delta group: *"ARCH/12-UI-SPEC.md + ARCH/UI.md + ARCH/SESSION.md"* (`REPO-COMPARE/DELTA-ANALYSIS.md` §3).
> Evidence paths are repo-relative under `/home/sarvesh/business_Dev/REPO-COMPARE/clone2/`. Dispositions are
> the briefs' tags; arrows into files not owned here carry `→ <file> §…` and are cross-domain deferred.
> The boundary half of these items lives in [`UI.md`](UI.md); the workspace/session half in [`SESSION.md`](SESSION.md).

- **12-14/16-13** · `add` — SOURCE: workany (Tauri v2; pattern-read) · evidence: `workany/src/shared/hooks/useAgent.ts` (plan/execute/chat/ACP phase state machine), `PlanApproval` (gates plan→execute), `QuestionInput` (mid-run pauses) — LOGIC: plan → approval → execute → chat becomes a first-class **plan-approval chat mode** with an explicit plan-approval surface and mid-run question pauses, specified as **blueprint/Work-native** — the old coordinator `plan.ts` executor is archived (`P71.2c`; no new work names archived modules as owners), so the plan object, phase machine and approval gate are blueprint/Work state the UI only renders. → target §3.3–§3.4 (mode selector; first-class plan-approval mode over the shipped three-control taxonomy) + §0 (projection contract: the UI renders plan state and approval interrupts, never owns the plan); WORK.md §3 (phase machine as Work contract) cross-domain deferred to the WORK lane.
- **10-10** · `improve` — SOURCE: prompts.chat (MIT code / CC0 data) · evidence: `prompts.chat/prompts.config.ts` (single typed white-label surface: branding, theme tokens, feature flags, locale) — LOGIC: theming, accent tokens, feature toggles and locale concentrate in one declarative typed product-config surface instead of scattering across Zustand stores. → target §4.1a.3 (visual system) + design-system note (UI-DESIGN-PROMPT.md keeps pixel authority; this centralizes *where the knobs live*).
- **CON-6** · `add` (cross-ref — UI-side indicator only; item owned by the SECURITY lane) — SOURCE: nango (ELv2 — pattern-mining only; brief 02 is a reconstruction, "re-clone upstream for line-level provenance") · evidence: `nango` (connection lifecycle hooks + per-provider credential-verification probes wired to Guard audit) — LOGIC: when a credential-verification probe fails, the provider/connector row must surface an explicit `invalid_credentials` reconnect state (with a reconnect affordance) rather than a generic failed/configured badge — an I15 truthful-state indicator. → target §4.1a (Providers / Channels & Connectors state lists — extends `Health failed`/`Ready` with `invalid_credentials`); probe implementation + Guard audit wiring → SECURITY.md §6 + 15-CONNECT-STORE cross-domain deferred (SECURITY lane owns CON-6).
- **11-1 (see-pane half)** · `add` (cross-ref) — SOURCE: eliza (MIT) · evidence: `eliza/contracts/computer-use.ts` — LOGIC: the CUA see-pane renders digest-bound confirmation previews and distinguishes `UNCERTAIN_EFFECT` and lease-conflict vs stale-observation so the user sees exactly what is and is not proven about each desktop effect. → target §3.2 (interrupt/approval rendering) + the CUA see-pane surface named in the v3.8 header; primary effect vocabulary → DESKTOP.md §2–§3 — this document carries the UI half only.
- **19-8 (truthful-status half)** · `improve` (cross-ref) — SOURCE: agentapi (MIT, deprecated upstream), ccmanager, claude-squad · evidence: `REPO-COMPARE/clone3/agent-control/agentapi/lib/termexec/termexec.go` (16 ms vsync-style stabilized capture, ≤48 ms, retry×3 — never snapshot mid-redraw), `lib/msgfmt/agent_readiness.go` (per-agent input-box readiness as data) — note: brief 19 clones live under `clone3/`, not `clone2/` — LOGIC: TUI-fallback agent readiness renders as truthful degraded status data (stabilized snapshots, per-agent readiness flags) and never as structured chat events. → target §2.3 / §4.1a status indicators + status-bar honesty; primary AGENT.md §5 matrix (`streaming_events`) cross-domain deferred (agent lane owns AGENT.md).
