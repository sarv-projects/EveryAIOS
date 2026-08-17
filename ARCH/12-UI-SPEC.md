# 12 — UI/UX Specification: Desktop Layout & Interaction Design

> **Version:** 3.1 (2026-08-17)  
> **Reference:** Claude Desktop Views / Cursor activity bar / ChatGPT Work / Devin Desktop (2026 work-cockpit pattern — doc 67 §6); Devin Cloud UI (doc 46) for viewers only  
> **Principle:** ONE project, ONE session, ONE ticket, ONE timeline. Chat + live progress in the center; a thin **right activity rail** switches *what you are watching* — one surface at a time. Never 9 peer tabs, never a Chat/Cowork/Code product split.  
> **Cross-refs:** ARCH/01 (system architecture), ARCH/09 (feature matrix H1-H25 — H20 redefined doc 67), ARCH/DIAGRAMS #7 (MCQ interrupt), doc 67 §6 (finalization record)
> **v2.1 (2026-08-16):** `UI-DESIGN-PROMPT.md` (repo root) is now the **canonical production UI spec** — pixel-level design language (warm-cream `#F7F7F4` + orange `#F54E00`, 28-screen inventory, motion/accessibility tables) that supersedes this doc's visual details. The v2 cockpit in `ui/` implements it; this ARCH/12 stays the layout/architecture contract (rail + one viewport, chat states, view contracts, keyboard map). When the two disagree on pixels, UI-DESIGN-PROMPT.md wins.
>
> **v3.1 (2026-08-17): Full-fidelity tool surfaces ("nothing held back").** The right panel is the **live window into the real tool** — every view reproduces the official product's full surface, not a stripped preview: **Word/Excel/PowerPoint get the complete Microsoft ribbon** (File·Home·Insert·…·View + **Copilot** on Home) with all groups/buttons; **PDF gets a full viewer** (page nav, zoom, search, annotations, forms, sign, redact, thumbnails/outline); **Browser gets full Chrome-style chrome** (tabs, omnibox, back/forward/reload, bookmarks bar, extensions, profile, and the built-in **AI Mode / Gemini sidebar**). The agent drives these surfaces; the user can touch them (takeover). Detail in §4.1c.
>
> **v3.0 (2026-08-17): Right panel = VS Code-style multi-view tabbed panel** (replaces "one surface at a time"; user directive + doc 84 + VS Code layout logic). **Default open views: Terminal · Folder · Browser.** A **`+` button** opens a picker to add any view (Code, Office, Progress, Diff, Audit, Storage, Memory, Research); tabs **close ×**, reorder, and **persist per session** (same per-session persistence as v2). **Browser = one view with internal page tabs** (many pages, one browser surface). **Office files open as their own tabs** (`Q3.xlsx`, `exec-summary.docx`, `contract.pdf`, `quarterly-deck.pptx`) — opened by the agent or by clicking an artifact card. **PDF study mode:** scope the chat to a document (`📄 Scoped to contract.pdf`) for side-by-side explain-this-document. **"Open perfectly" = LibreOffice/LOKit** (tiled rendering, agentic + normal reading) layered on the surgical engines (IronCalc/calamine/lopdf); **Google Docs/Sheets** open through the authenticated browser view (normal access) or pulled via Drive/Sheets API → OOXML → office engine (agentic). Details in §4.1b.

---

## 1. Core Layout: Left Sessions · Center Chat · Right Rail + Viewport

```
┌───────────────┬─────────────────────────────┬──┬───────────────────────────────┐
│  LEFT         │      CENTER                 │R │ RIGHT VIEWPORT (collapsible)   │
│  sessions     │  chat · now-doing · tickets │A │ one surface at a time          │
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
| Title bar | Project · session title · Guard chip · $spent/$cap | native Tauri |
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
│ + New session            │  ← Primary action button
│ ⏱ Automations           │  ← Scheduled tasks & event triggers
│ 🔒 Guard                │  ← Security overview & permissions
│ 🔌 Connectors           │  ← Connector hub status
│ 🧠 Memory               │  ← Knowledge/memory browser
│ 📊 Analytics            │  ← Token usage & cost dashboard
├─────────────────────────┤
│ Recent                   │  ← Section header
│  🔍  ⚙  ⋯              │  ← Search, filter, more actions
│                          │
│  Session 1 title...      │  ← Active session (highlighted)
│    ● Action required     │  ← Status badge (orange = needs input)
│  Session 2 title...      │
│    ✓ Completed           │  ← Green = done
│    └─ Sub-session 1      │  ← Child sessions indented
│    └─ Sub-session 2      │
│  Session 3 title...      │
│    ⏳ Running             │  ← Yellow = in progress
├─────────────────────────┤
│ ⚙  📥  ❓               │  ← Settings, Downloads, Help
└─────────────────────────┘
```

### 2.2 Sidebar Interactions

| Click | Action |
|-------|--------|
| Workspace dropdown | Switch between projects/workspaces |
| + New session | Opens chat with empty session, focus on input |
| Automations | Shows automation list with sparkline activity charts |
| Guard | Shows Trust Ladder status, recent blocks, permission grants |
| Connectors | Shows connected services, MCP servers, status indicators |
| Memory | Browse knowledge items, skills, episodic memory |
| Analytics | Token usage chart, cost per model, session history |
| Session entry | Opens that session in Chat + Workspace panels |
| Sub-session | Opens sub-agent session (parent stays in breadcrumb) |
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
│ Session Title                    🏴 ⋯  │  ← Title + flag + menu
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
- Maps to ARCH/06 Guard-2 diff-card handshake

#### Generative UI Components (H25, AG-UI — doc 50)
- Agent-emitted live components (React/HTML/Mermaid) render **inline in sandboxed iframes** — strict CSP + process isolation (Anthropic Artifacts pattern), never inline-script in the main window
- Wire protocol = **AG-UI** (tool calls + UI updates over one JSON channel, ~16 event types) on top of our P0.5 framed IPC
- Artifact cards upgrade from static previews → "make live" opt-in (token cost: component descriptors preferred over raw source, §1.3 doc 50)
- Version selector reuses the H1 preview pane

#### Resumable Stream Indicator (H27 — doc 50)
- On network drop/refresh/suspend: "🔄 Reconnecting…" chip in the message area
- Coordinator holds in-flight stream state → auto-resume from the **last token/id** (LibreChat pattern); the reply continues in place, never restarts
- Idempotent retry semantics per ARCH/03 (retry idempotent calls)

### 3.3 Chat Input Bar

| Element | Function |
|---------|----------|
| `+` button | Attach files, images, screenshots, URLs |
| Text input | Main prompt area (multiline, auto-expand) |
| Mode selector | Normal / Plan / Research / Quick / Code |
| 🎙 Microphone | Voice-to-text recording |
| 🔊 Speaker | Read-aloud toggle (H28 — offline sherpa-onnx TTS by default; hosts Piper voices, ⚠️ piper archived) |
| ▶ Send | Submit message (Enter also works) |
| Slash commands | `/help`, `/mode`, `/model`, `/undo`, `/clear`, `/export` |
| `!macro` | Knowledge macro expansion (e.g., `!deploy-checklist`) |
| `@mention` | Reference blueprints, skills, files |

### 3.4 Chat Modes

| Mode | Behavior |
|------|----------|
| **Normal** | Full agent with tools + edits + browser |
| **Plan** | Read-only analysis, architecture suggestions, no edits |
| **Research** | Deep research mode (breadth×depth, web search, synthesis) |
| **Quick** | Lightweight Q&A, no tool dispatch, memory retrieval only |
| **Code** | Code-focused, RepoMap context, edit strategies active |

---

## 4. Right Panel: Activity Rail + One-Surface Views (v2.0 — replaces the 9-tab strip)

### 4.0 First-Run Rule (non-negotiable — tasks, not modules)

- **First run shows chat + an empty viewport. No nine tabs, no module wall.**
- A view opens **only when that surface is actually in use** (agent opened a browser, a file, a terminal — not because the feature exists).
- Guard, Connectors, Memory, Analytics, ACP/MCP, vault, plugins live behind the left sidebar + **"+" Add view** until the user needs them.
- The default interaction is: pick a folder → ask for an outcome → watch the Progress timeline → check/edit the artifact → approve only consequential actions. The system decides whether it needs a browser, office, terminal, or harness.
- One useful default task completes before advanced settings surface (onboarding item: "add first key → first chat" is chat-app onboarding; the control-plane onboarding is one end-to-end task).
- Modes (Normal / Plan / Research / Quick / Code) are optional; the default is "do the task".
- **UI reference sources (doc 67 §6, finalization):** Claude Desktop **Views**, Cursor **activity bar**, ChatGPT **Work vs Codex**, Devin Desktop **command center** — all converged on rail + one-open-surface; Office is grouped (ChatGPT Work keeps docs/slides/sheets in "Work", not next to the terminal). AnythingLLM + Cherry Studio are the *first-run* reference ("tasks not modules"); **holaOS** is the closest whole-product competitor (side-by-side app+agent + marketplace UX) — validation only (modified-Apache).

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

- **4 core verbs:** Folder · Shell · Browse · Code. Everything else opens from an icon, not another tab.
- **Office = one button (W).** Word/Excel/PPT/PDF are a flyout, not four rail icons. Opening `Q3-Budget.xlsx` auto-selects W → Excel (the agent's file opens the matching view; the user never hunts a tab).
- **Session views** (Progress full-timeline, Diff, Audit/Replay, Storage) under ▢ / +; a 2-line "now doing" strip stays under chat so collapsing the rail never hides the agent.
- Click **active icon → collapse** viewport (center 100%). Click another icon → switch lens; session keeps running. Hover = tooltip + live/idle/gap badge.
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

### 4.1b Multi-view tabbed panel (v3.0 — VS Code logic)

The right viewport is a **tabbed view container** (VS Code editor-group / panel-region pattern), not a single surface.

```
┌───────────────────────────────────────────────────────────────┐
│ [📁 Folder] [>_ Terminal] [🌐 Browser] [📄 contract.pdf] [+] │  ← tab strip
├───────────────────────────────────────────────────────────────┤
│  active view content (one tab at a time)                      │
└───────────────────────────────────────────────────────────────┘
```

- **Defaults:** Terminal · Folder · Browser open on first power-mode use; the rail icon still switches the active tab (click active icon → collapse to 0px, chat full-width — never unmount).
- **`+` Add view:** picker lists every not-open view (Code, Office files, Progress, Diff, Audit, Storage, Memory, Research, plugin views). Selecting adds a tab and activates it. This is the I6 dogfood slot (no 10th header tab).
- **Close × / reorder / persist:** tabs close, reorder by drag, and persist per session (`openViews`, `activeView`, `railCollapsed`, `splitRatio` per sessionId — the Cursor layout-reset bug is not copied).
- **Browser = one view, many pages:** the Browse tab hosts its own internal tab strip (page tabs + `+` new tab). Opening a link spawns a page tab inside the browser view — never a new panel tab.
- **Office files = one tab each:** opening `Q3.xlsx` / `exec-summary.docx` / `contract.pdf` / `deck.pptx` (agent or artifact click) adds a tab; the matching engine renders it. Reuses the W-flyout to pick among open office docs.
- **PDF study mode:** a PDF tab can **scope the chat** (`📄 Scoped to contract.pdf` chip in the chat header, ✕ clears). Answers are grounded in that document — side-by-side "explain this paragraph" without leaving the doc.
- **Open-perfectly renderer (LibreOffice/LOKit):** for Word/PPT/PDF and mixed-format fidelity, `everyaios-office` can drive **LibreOffice headless + LOKit tiled rendering** for *both* agentic mutation and normal human reading (read-only mode = same renderer, no mutation path). Sheets stay on IronCalc/calamine (deterministic recalc); PDFs on lopdf/pdf.js; LOKit is the fallback/perfect-fidelity tier for anything the surgical engines don't cover.
- **Google Docs/Sheets:** normal access = open in the authenticated browser view (system Chrome session, no re-login). Agentic access = Drive/Sheets API (gws connector, F14/F15, P18) → export OOXML → office engine → mutate → (optional) write back. Never a bespoke Google renderer.

### 4.1c Full-fidelity tool surfaces (v3.1 — "nothing held back")

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
- **Per-session persistence** (Cursor bug fix): activeViewId, officeDocId, railCollapsed, splitRatio, browseMode (clean | my-chrome), composerMode (agent | plan | research | quick | code) saved per sessionId — switching sessions restores exactly what you left; new session starts rail-collapsed until a tool needs a view

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

### 4.4 Shell View (view.shell)

```
┌───────────────────────────────────────┐
│ Shell                    [▸ History]   │
├───────────────────────────────────────┤
│ $ npm install                          │
│ added 142 packages in 3.2s            │
│                                        │
│ $ npm test                             │
│ PASS src/utils.test.ts                │
│ PASS src/api.test.ts                  │
│ 42 tests passed                        │
│                                        │
│ $ _                                    │
├───────────────────────────────────────┤
│ [Read-only ∨]  Toggle to run commands │
└───────────────────────────────────────┘
```
- Default: read-only (watching agent)
- Toggle → writable (user can type commands)
- Command History panel (expandable sidebar within tab)
- Copy button per command + output
- Time-travel: click past commands to jump in history

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
3. All panels become interactive/editable
4. Shell toggles to writable
5. Code editor accepts input
6. Browser allows clicking/typing

### 5.3 Resume
1. User clicks **▶ Resume** button
2. System prompts: "Describe what you changed" (required text field)
3. User types: "Fixed the formula in B4, updated chart title"
4. Agent receives context and continues
5. Panels return to read-only, "● Live" restores

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
│ ✓ Composio (12 toolkits)│ 47 tools available                       │
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
| Cmd+N | New session |
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
- **Voice I/O:** input bar mic (H15, offline STT options Vosk/sherpa-onnx/whisper.cpp + optional wake word) + speaker read-aloud toggle (H28, offline TTS default) — all local-first, BYOK for cloud voices only
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
- Minimum 4.5:1 contrast ratio on all text
