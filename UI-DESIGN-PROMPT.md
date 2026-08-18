# EveryAIOS Desktop App — Complete Production UI Design Prompt

Design a **premium AI workspace desktop application** — a unified control plane where one persistent context powers multiple AI agents (Claude Code, Codex, Aider, OpenCode, Ollama) through a shared session. The app orchestrates Office editing, live browser automation, code intelligence, and file management under one approval model. Reference interfaces: **Cursor 3** (warm cream canvas, agent-first layout, orange brand), **Claude Cowork** (clean white, sidebar sessions, drag-and-drop parallel panels), **Devin Desktop** (Kanban agent command center, Spaces, Inter font, rounded pill tabs), **ChatGPT Work** (global Chat/Work/Codex switcher, sidebar history, inline artifact cards).

---

## Visual Strategy

**Imagery:** live agent activity surfaces — streaming text, progress timelines, spreadsheet grids being populated, browser pages navigated, code diffs appearing. No photography. All visual weight from real data and state.

**Composition:** three-column persistent layout. Left = sessions + navigation. Center = chat + inline progress + approval cards. Right = 48px activity rail + one-surface viewport (file tree, browser, code, office, terminal — one at a time, never stacked tabs). Chat is the conductor; viewport is the live view of work happening.

**Motion philosophy:** purposeful, swift, never bouncy. Surfaces replace with 150ms crossfade (no horizontal slides). Progress steps slide in from left (100ms). Approval cards enter from bottom with slight spring (250ms, overdamped). Streaming tokens appear smoothly. Cell edits: brief warm highlight flash (200ms) then settle. No loading spinners — show partial results growing.

**Density:** high information density like Linear or Raycast — compact sidebar items, tight spacing, visible at a glance. Not airy like Notion. Not cramped like Bloomberg.

---

## Color Palette (Light Mode Primary)

**Background layers:**
- Surface 0 (canvas/window): `#F7F7F4` (warm cream — Cursor's base, not sterile white)
- Surface 1 (sidebar, panels): `#FFFFFF` (pure white, lifted by border)
- Surface 2 (cards, elevated): `#FFFFFF` with `1px #E8E5E0` border
- Surface 3 (hover, active): `#F0EFEB` (warm grey tint)
- Input fields: `#FFFFFF` with `1px #D4D1CC` border

**Text:**
- Primary: `#26251E` (warm near-black — NOT pure #000)
- Secondary: `#6B6860` (warm grey)
- Tertiary/timestamps: `#9C9A94`
- Placeholder: `#B8B5AF`

**Brand accent (singular — used sparingly on CTAs and identity):**
- Primary: `#F54E00` (orange — send button, active indicators, brand mark)
- Primary hover: `#D94400`
- Primary muted: `#F54E00` at 8% opacity (active state backgrounds)

**Semantic (meaning only, never decoration):**
- Success: `#16A34A` (completed, connected, done)
- Running/Live: `#2563EB` (pulsing, streaming, active)
- Warning/Ask: `#CA8A04` (approval needed, caution)
- Error/Blocked: `#DC2626` (Guard-1 blocks, failures)

**Borders & dividers:**
- Primary border: `#E8E5E0` (warm, not cold grey)
- Divider: `#F0EFEB` (subtler, 1px)
- Focus ring: `#F54E00` at 30%, 2px offset

**Dark mode (secondary — user toggle):**
- Surface 0: `#1A1917` · Surface 1: `#232220` · Surface 2: `#2D2C29` · Text: `#F0EFEB` · Same orange accent

---

## Typography

**Font stack:**
- UI: `Inter` (variable, 400/500/600) — fallback: -apple-system, Segoe UI
- Code: `JetBrains Mono` (ligatures ON) — fallback: Fira Code, SF Mono
- Status bar: `JetBrains Mono` at 11px

**Scale (14px base):**
- 11px: status bar, timestamps, token counters, file sizes
- 12px: badges, sidebar secondary lines, table cells
- 13px: sidebar session titles, navigation items, progress steps
- 14px: body text, chat messages, input fields, buttons (THE base)
- 15px: AI response text (one step up — visual hierarchy)
- 16px: panel headers, section titles
- 18px: active session title in center header
- 24px: page-level titles (Analytics, Memory, Guard)

**Weights:** 400 body · 500 sidebar/emphasized/tabs · 600 headings/buttons/badges

---

## Layout Structure (pixel-precise)

### Title Bar (40px, native Tauri frame)
- Left: traffic lights (macOS) or Windows controls
- Content: App mark (orange "N", 20px) · workspace breadcrumb (dropdown) · session title · Guard chip (colored pill, e.g. "L2" in orange) · `$1.84 / $5.00` cost (orange text)
- Right: Search field (⌘K, 200px pill, `#F0EFEB` fill) · ⚙ settings · 🔔 notifications (badge count) · user avatar (28px circle)

### Left Sidebar (248px ↔ 56px collapsed)
- Background: `#FFFFFF`, right border 1px `#E8E5E0`
- Workspace name + dropdown chevron (16px/500)
- Search field: pill, 32px, `🔍 Search sessions...`
- `+ New session` button: orange fill, white text, full-width, 36px height, 8px radius
- Navigation items (48px each): icon (20px, `#6B6860`) + label (13px/500). Items: Automations (count badge) · Guard · Connectors (count) · Memory · Analytics
- Divider
- "RECENT" header (11px, uppercase, `#9C9A94`, +0.04em tracking)
- Session list items (60px): title (13px/500, truncate) + subtitle (12px/400, grey) + meta (11px: `07:51 AM · $1.84 · 184K`). Status dot 8px. Active = orange left border 3px + orange 5% wash. Hover = `#F0EFEB`
- Status dots: 🟠 action needed · 🟡 running · 🟢 completed · 🔴 failed · ⚪ paused · 🔵 scheduled
- Child sessions indented 16px under parent
- Bottom: Settings · Downloads · Help (icon buttons)

### Center Column (flexible width)
- **Header** (48px): Session title (18px/600) + `⚡ Action needed` badge (orange pill, pulsing) + 📌 + 🔔 + `⋯` menu
- **Now-doing strip** (32px, NEVER unmounts): `⚡ (step 3/8) IronCalc recalc · 1.2s elapsed · 12K tokens this turn` — 12px mono, grey, orange left border 2px when active
- **Chat scroll area**: 16px padding, 8px gap between messages
- **Composer bar** (bottom-pinned, 56px+): see components below

### Right Rail (48px) + Viewport (0% collapsed ↔ 55% expanded)
- Rail: `#FFFFFF` background, left border 1px `#E8E5E0`
- Icons 24px, `#9C9A94` default. Active: `#F54E00` + orange wash (8% circle). Hover: `#F0EFEB` circle
- Badge dot: 6px, top-right — orange or blue
- Rail order: 📁 Folder · `>_` Shell · 🌐 Browse · `</>` Code · ─separator─ · **W** Office (ONE button → flyout) · ─separator─ · ▢ Progress · `+` Add view
- Viewport: `#F7F7F4` background, 40px header (view name + "● Live" badge + ⤢ fullscreen)
- Resize: 4px invisible grip, cursor `col-resize`
- **Multi-view tabbed panel (v3.0 — VS Code logic, ARCH/12 §4.1b):** the viewport is a tab strip + one active tab. **Default open tabs: Terminal · Folder · Browser.** `+` adds any view (Code, Office, Progress, Diff, Audit, Storage, Memory, Research); tabs close ×, reorder, persist per session. **Browser = one tab with internal page tabs** (many pages, one surface). **Office files open as their own tabs** (`Q3.xlsx`, `exec-summary.docx`, `contract.pdf`, `deck.pptx`) via agent or artifact click. **PDF study mode:** scope the chat to a doc (`📄 Scoped to contract.pdf` chip, ✕ clears) for side-by-side explain-this-document. **"Open perfectly" = LibreOffice/LOKit** (tiled, agentic + reading) over IronCalc/calamine/lopdf; **Google Docs/Sheets** via authenticated browser view (reading) or Drive/Sheets API → OOXML → office engine (agentic).
- **Full-fidelity tool surfaces (v3.1 — "nothing held back", ARCH/12 §4.1c):** the right panel is the **live window into the real tool**. **Word/Excel/PowerPoint show the complete Microsoft ribbon** (File·Home·Insert·…·View + **Copilot** on Home) with every group/button — no stripped preview. **PDF shows a full viewer** (page nav, zoom, search, annotations, forms, sign, redact, thumbnails/outline). **Browser shows full Chrome-style chrome** — tabs, omnibox, back/forward/reload, bookmarks bar, extension icons + puzzle-piece menu, profile avatar, and the **built-in AI Mode / Gemini sidebar** (Chrome 141+ parity). Agent drives the same surface the user sees; takeover (H21) makes controls live. Fidelity rule: a control exists iff the real product has it.

### Status Bar (28px, bottom)
- Background: `#F0EFEB`
- All text: 11px mono, `#6B6860`, items separated by ` · `
- Items: `● Live` (green) · `awaiting approval` (orange) · `agent analyst` · `sidecar online` (green) · `core rust` · `db 3/14MB` · `mcp 127.0.0.1:9200` · `browser chrome (system)` · `cache 94%` · `guard L2` (orange) · `vault 7 keys` · `audit append` · `EveryAIOS v3.23`
- Clickable → opens relevant settings

### Progressive Disclosure — Casual ⇄ Power (B9 / P31)

> **User-research basis: doc 84** (casual-vs-power-user UX, 2026-08-17) — Wharton Blueprint frictions (competence/trust/delegation; control = 26% of adoption weight, privacy = 31%, naming → +20% adoption), Nielsen 2026 ("the winning interface asks the fewest unnecessary questions"; UX = the moat), NN/g progressive disclosure, and power-user needs (transparency, fine-grained control, keyboard-first, cost, model freedom). Casual = trust + plain control + outcomes; power = transparency + control + speed. One `⌘.` toggle crosses the line; same engine, different surface. Remaining gaps → TODO P32.
>
> **Status: implemented in `ui/src`** (P31.1 done). Store: `powerMode` (localStorage-persisted `everyaios.settings.ui.powerMode`) + `togglePowerMode` + `devMode` (Developer Mode telemetry). `LeftSidebar` branches `CasualRail` (56px: agent switcher · +New chat · Recents · Settings · power-toggle chevron) vs `PowerSidebar` (full 248px nav). `App.tsx` renders `ActivityRail`/`RightViewport` only in power mode; `⌘.` toggles.
>
> **Casual-mode simplification (anti-cognitive-overload):**
> - **Status bar** → hidden debug telemetry; replaced by a single discreet `● Ready · Local` / `● Processing…` pill + `🛡️ 100% Private (On-Device)` + version. Full 12-badge telemetry returns via **Settings → General → Developer Mode** (`devMode`).
> - **Title bar** → `Guard · L2` becomes `🛡️ Safe & Private`; spend + token chips hidden.
> - **Composer** → mode pills, agent/model picker, `$ / tok / ctx` chips and the `/ ! @` helper row all hidden; placeholder becomes `Ask anything, drop files, or type /…` (intent is auto-detected instead of mode-picked).
> - **Empty-state prompts** → consumer outcomes (`Clean & balance this Excel sheet`, `Compare these two PDF contracts`, `Draft an email from my notes`, `Tidy up my download folder`) instead of developer jargon.
> - **Settings → General** → `Simple ⇄ Pro` mode switch + `Developer Mode` toggle.
> - **Streaming caret** → thin orange blinking caret (500ms/500ms, `caret-blink`) appended to the live-streamed message (`MessageBubble streaming` prop).
> - **Centered composer on empty chat → bottom-pin once chat starts** → a new/empty session shows the composer lifted to the vertical center (empty-state prompts above, clean card container); the moment the first message lands it drops to the bottom-pinned position under the messages (ChatGPT/Claude pattern — `ChatPanel` `isEmpty` branch → `ChatComposer centered`).

- **Casual = the default.** One workspace, four verbs. The first screen shows only what a new user needs; every advanced surface is one toggle away, never in the way.
- **Casual left sidebar (56px collapsed by default):** agent switcher (compact emoji-avatar + name, click → dropdown) · `+ New chat` (icon) · recent sessions (collapsed into a single "Recents" chip) · ⚙ Settings at bottom. **Hidden in casual:** Automations · Guard · Connectors · Memory · Analytics nav items, the 48px activity rail, provider/model picker (shows "Auto"), spend/status-bar detail.
- **Power toggle** (bottom of sidebar, `⌘.` or a `…` "More" chevron): expands the sidebar to the full 248px nav + reveals the right activity rail + advanced panels. State persists per user (`settings.ui.powerMode`).
- **Why:** casual users get "Capture · Ask · Organise · Finish" with zero configuration surface; power users flip one switch and see files/code/guard/memory/connectors/automations/spend/trajectory. This is the same progressive-disclosure the competitive review (doc 80 §8, doc 82 ADD-1..4) and skales (doc 83) demand.

---

## Component Design — Chat Elements

### User Message
- Left-aligned, no bubble/container (text on canvas)
- Avatar: 24px circle (photo/initials, `#F0EFEB` bg), top-aligned
- Text: 14px/400, `#26251E`, max-width 680px
- Attachments: file pills below (icon + name, `#F0EFEB` bg, 6px radius)
- Hover: "⋮" menu (copy, edit, fork)

### AI Message
- Left-aligned, no container
- Avatar: 24px orange circle with white "N" mark
- Text: 15px/400, `#26251E`
- **Inline file references:** orange pills (`Q3-Financials.xlsx`) — `#F54E00` at 10% bg + orange text, clickable → viewport
- **Inline progress steps:** vertical list, 4px left border colored by status
- **Artifact cards:** below message (see below)
- Hover: copy · regenerate · fork icons

### Message Branching (H1)
- Every AI message: subtle "⑂" fork icon on hover (right edge)
- Click → branch: history truncates, "✦ forked — continuing from here" chip appears
- **Version-selector**: artifact cards with multiple versions show `v1 | v2 | v3` pills — clicking switches preview

### Artifact Card (H1/H5)
- Full message-width, `#FFFFFF`, 1px `#E8E5E0` border, 8px radius
- Header (32px): file icon + filename (13px/500) + "● Live" chip (blue pill, pulsing) if agent active
- Body: rendered preview (max 140px, fade-to-transparent bottom). Content = spreadsheet grid, code, document paragraph
- Footer (28px): `</>` · `📋` · `📥` · `🔗` — 14px icons, grey → orange on hover
- Click body → opens in right viewport

### MCQ Interrupt Card (H2/H8 — Guard-2 Approval)
- Full width, `#FFFFFF`, orange left border 4px, subtle orange border all sides at 20%
- Header: `⚠ Action required` orange pill (12px/600 white text) + description (14px)
- Body: collapsible diff preview (code diff or file paths with proposed changes)
- Buttons (right-aligned): `Approve` (green fill) · `Edit` (grey outline) · `Reject` (red outline) · `▾` options
- Buttons: 32px height, 6px radius, 13px/600

### Widget Cards (H17 — inline in chat)
- Weather: temp icon + forecast row
- Stock: ticker + price + % change + mini sparkline
- Math: LaTeX-rendered calculation with steps
- Lookup: dictionary/wiki card with title + snippet + source
- All: 100% width, `#FFFFFF`, subtle border, 8px radius, non-interactive

### Generative UI (H25 — AG-UI live components)
- Agent-emitted React/HTML/Mermaid render in **sandboxed iframes** inline in chat
- Strict CSP + process isolation
- "Make live" button on static artifact cards → upgrades to interactive component
- Device frame options (desktop/tablet/phone preview)

### Progress Steps (inline in messages)
- Vertical list, 4px left border colored by status
- ✓ green + completed · ● blue pulsing + executing · ○ grey + pending · ✗ red + failed
- Each: icon (16px) + description (13px) + optional detail (12px grey)
- Click completed step → viewport jumps to relevant view + position

### Resumable Streams (H27)
- On network drop: "🔄 Reconnecting…" chip appears in message area
- Auto-resumes from last token — reply continues in place, never restarts
- No user action needed

---

## Component Design — Composer (Input Bar)

- Bottom-pinned, `#FFFFFF`, top border 1px + shadow (0 -2px 8px rgba(0,0,0,0.03))
- Left: `[+]` attach (28px circle, `#E8E5E0`) — files, images, screenshots, URLs
- Center: textarea (14px, auto-expands to 5 lines, placeholder "Message the agent — use / for commands, ! for macros, @ to mention")
- Right: 🎙 mic (H15 voice input) · 🔊 speaker (H28 TTS toggle) · `▶` send (36px orange circle, white arrow)
- **Mode selector row** (28px, below textarea): pills `Normal` · `Plan` · `Research` · `Quick` · `Code` — inactive: `#F0EFEB` + grey text. Active: orange 10% fill + orange text + orange border
- **Cost strip** (24px, above textarea when running): `💰 $1.84 / $5.00 cap` (orange) · `✦ 184K tokens` (grey)
- **Helper chips** (below modes): `@mention` · `/slash` · `!macro` — 11px pills, clickable
- Slash commands: `/help` `/mode` `/model` `/undo` `/clear` `/export`
- `!macro` expansion: user-defined knowledge macros (e.g. `!deploy-checklist`)
- `@mention`: blueprints, skills, files, agents

---

## Component Design — Agent/Model Picker (H32)

- Triggered by `@` typing or clicking agent indicator in now-doing strip
- Floating dropdown: 300px, `#FFFFFF`, 8px radius, shadow `0 8px 32px rgba(0,0,0,0.12)`
- Header: "Switch agent" (13px/600) + search input
- Each row (44px): agent icon (20px colored circle) + name (14px/500) + model badge (11px pill) + auth-mode badge (subscription/API-key/local) + status (online green / quota-hit orange / offline grey)
- Active agent: checkmark + orange text
- Switch: one-click → toast "Switched to @claude-code — context preserved" (200ms crossfade on now-doing)
- Footer: "Configure agents →" (12px orange link)
- **Agent-scoped commands**: after switching, composer shows the agent's live `available_commands` as suggestion chips

## Component Design — Custom Agent Builder (B9)

- **Entry:** agent-switcher footer "Configure agents →" opens the Agents panel; a prominent `+ Create agent` button (also in Settings → Agents). "Configure agents" is visible in casual mode too (agents are the one power concept casual users meet early).
- **Three agent sources, one list:** ① **Default** = EveryAIOS (inbuilt engine, follows the chat-bar model) — always present, pinned first; ② **Installed** = ACP registry agents (F8/F12, one-click install already landed) — shown with their auth-mode badge; ③ **Custom** = user-authored bundles (B9) from `~/.everyaios/agents/`.
- **Create-agent flow (wizard, 4 steps):**
  1. **Identity** — name, emoji/avatar, one-line description; start from a template (**General · Coder · Researcher · Email-Triager · Data-Analyst · Writer · Meeting-Notes · Browser-Operator**) that pre-fills the rest.
  2. **Brain** — persona + system prompt (editable textarea + template prompt snippets) · **Engine**: `Inbuilt (EveryAIOS)` | `ACP agent` (pick an installed CLI: Claude Code/Codex/…) | `Model-only` (pick a model/provider directly). · **Model/provider**: optional — "inherit from chat bar" toggle (default ON) vs pin a specific model/provider (A6/A2).
  3. **Capabilities (opt-in, no bloat)** — **MCP servers**: tick the exact servers this agent may use (never "all"); **Connectors**: tick the exact connectors (Gmail/Slack/GitHub/…); **Skills**: tick the skill set; **Tools**: allow/deny list → becomes the agent's Guard capability scope.
  4. **Workflows** — attach blueprints (B2) + scheduled automations (B7) this agent owns; review → **Create** (writes the versioned `agent.toml` bundle under `~/.everyaios/agents/`).
- **Scoping is the point:** an agent's context + tool schema only includes the MCP servers / connectors / tools it declares — running Agent X never loads Agent Y's servers. This is the anti-bloat, user-controlled guarantee (vs "every MCP server on every agent").
- **Edit/duplicate/disable/export:** each custom agent row → `⋯` menu (edit wizard, duplicate, disable, export bundle). Custom agents can also be re-bound later: change engine/model/provider without touching persona or scopes.
- **Runtime:** pick an agent in the composer → the turn runs on that agent's engine + model + scoped capabilities; the chat-bar model selector shows "Using <agent>'s settings" when the agent pins its own provider.

---

## Right Viewport — All Views

### Folder View (H20 — view.folder, ⌘⇧E)
- Split: left file tree (expandable, 14px, type icons, sizes right-aligned grey) + right Storage panel
- Tab bar: `All` · `Recent` · `Modified` · `Large` · `Duplicates`
- **Storage Health (D12):** used/free donut chart + percentage
- **Treemap (D9):** squarified, extension-hashed colors (XLSX=blue, PPTX=orange, CSV=green, PDF=red), hover = tooltip (name+size), click = drill in (300ms morph)
- **Duplicate Groups (D10):** file + count + wasted size + "Clean up" (Guard-2 gated)
- **Large Files (D11):** sorted list, age/size columns + "Review"
- **Instant search (G7):** FTS5 filename search bar at top (<50ms response)

### Shell View (H20 — view.shell, Ctrl+`)
- Terminal output: 13px mono, `#26251E` on `#F7F7F4`
- Commands bold/500, output regular. `$` prompt grey. Green success, red errors.
- Footer: `[Read-only ▾]` toggle — writable for takeover (H21)
- History sidebar (togglable): past commands clickable
- Agent's working directory shown in header

### Browse View (H20 — view.browser, ⌘⇧B)
- Full browser chrome: pill URL bar (`#F0EFEB` fill, padlock) + ◀▶🔄 + "● Live" badge (blue pulsing when agent active)
- Rendered page content fills viewport
- User can interact (help with CAPTCHAs → challenge handler E12 surfaces here)
- Footer: engine tier (`Lightpanda` / `Chrome escalation`) + crawl progress (`23/47`) + session source (`cookies from vault`)
- Toggle: "Clean profile" ↔ "My Chrome" (E13 session inheritance)

### Code View (H20 — view.code, ⌘⇧C)
- Filename tab + modified dot (orange)
- Syntax highlighted editor (14px mono, line numbers, minimap optional)
- Diff gutter: green bar additions, red bar deletions
- Footer: `Ln 4, Col 1` · `TypeScript` · `UTF-8` · `Modified` orange pill
- Read-only default; "Edit" button in header toggles writable (H21 takeover)
- **LSP indicators (I11):** hover shows docs, diagnostics underlines, code actions lightbulb

### Office — Excel (H5/D2 — view.office.xlsx, ⌘⇧O → Sheets)
- Header: filename + "● Live" + "IronCalc" badge
- Formula bar: cell ref (e.g. `B4`) + Σ icon + formula text
- Virtualized grid (100K+ rows): clean `#E8E5E0` lines, header row `#F0EFEB`
- Active cell: 2px orange border
- Modified cells: 200ms warm-yellow flash → orange triangle top-right (persists)
- Charts: below/beside grid, crossfade on regeneration (400ms)
- Sheet tabs bottom: `Sheet1` · `Sheet2` · `Charts` — active = orange underline
- **Deterministic planner indicator:** "Zero-LLM op" badge when regex planner handles without model call

### Office — Word (H5/D1 — view.office.docx)
- WYSIWYG on `#FFFFFF` paper surface with subtle shadow
- Live AI cursor: thin orange caret with trailing glow, typing animation
- Headers/lists/tables rendered properly
- Footer: `Page 1/3` · `Words: 847` · `Modified`
- **Chat overlay (H5):** side panel or bottom drawer for Q&A about the document

### Office — PowerPoint (H5/D3 — view.office.pptx)
- Central slide preview (aspect ratio, `#FFFFFF` + border shadow)
- Elements flash orange outline when modified
- Slide strip bottom: thumbnails, active = orange border, horizontally scrollable
- Footer: `Slide 3/5` · `Editing text box`
- **Presenter notes panel** (toggle): keyed by stable slide IDs

### Office — PDF (H5/D4 — view.office.pdf)
- pdf.js canvas, warm-paper background
- Form fields: blue border when being filled
- Annotations: yellow highlights, orange note markers
- Footer: `◀ 2/8 ▶` + zoom slider
- Redaction mode: black bars on redacted regions

### Office Flyout (from W rail icon)
```
┌─────────────────────────────┐
│ Sheets    Q3-Budget.xlsx  ● │   ● = agent touching now
│ Word      Exec-Summary.docx │
│ Slides    Pitch.pptx        │
│ PDF       Invoice-8402.pdf  │
│ ──                          │
│ Open another…               │
└─────────────────────────────┘
```
- `.xlsx` file opens → auto-selects W → Excel. User never hunts a tab.

### Progress View (H19 — view.progress, ⌘⇧P)
- Unified timeline of all agent actions
- Each entry: timestamp (11px mono) + type icon (16px, colored) + description (13px) + expand chevron + status badge
- Filter tabs: `All` · `File` · `Edit` · `Browser` · `Shell` · `Code` · `Office` · `Export` — 12px pills, active = orange
- Click entry → opens relevant view at relevant position
- Expanded: shows detail (command output, cell values, URLs, token cost)
- Counter: "7/8 done" top-right

### Diff View (under + Add view)
- Unified or split diff toggle
- Files-changed list at top (clickable)
- Green additions / red removals with line numbers
- "Accept all" / "Revert all" buttons (Guard-2 gated)

### Audit/Replay View (H3 — under + Add view)
- Searchable session list (date, agent, status filters)
- Selected → full event timeline + per-step screenshots
- **Scrubber bar:** horizontal timeline, drag to any point → viewport shows state at that moment
- Screenshot strip: thumbnail row of captured states
- Click event → detail panel (tool args, response, tokens, cost)

### Storage View (D9-D12 — under + Add view)
- Storage health dashboard: donut, threshold warnings (90% = red alert)
- Treemap, duplicate groups, large files (same as Folder right panel but fullscreen)
- Agent cleanup suggestions: "Found 3.2GB duplicates. Clean up?" → Guard-2 approval card

### Blueprint Editor (H4 — view.blueprint, opens on .md files)
- Markdown rendered with **live execution overlays**: `- [ ]` items show ✓/●/○ as agent progresses
- Agent-roster tables: colored status badges per agent
- Section headers: live progress bars
- Plan rewrites visible: green flash on edited lines → settle
- Dependency DAG (Mermaid): colored nodes showing status

### Universal Reader (H6 — view.reader)
- PDF: pdf.js, page nav, zoom, search
- EPUB: reflowable text, chapter nav, bookmarks, font size
- Web articles: reader mode (clean, no ads)
- Markdown: rendered with KaTeX, Mermaid, syntax highlighting
- **Chat overlay on all reader surfaces**: "@this" references open document

### Local Sites / Dashboard Artifacts (H29 — view.sites)
- When agent generates a web app:
  - Artifact card: "🌐 Local Site: Q3 Dashboard" with device-frame thumbnail
  - Click → embedded webview at `127.0.0.1:<port>`
  - Header: URL + "● Live" + device toggle (desktop/tablet/phone)
  - Guard-2 required before serving ("Serve on localhost:3847?")
  - Footer: "everyaios-script sandbox · Stop server"
  - Agent iterates → site hot-reloads in preview

### Research Surface (H31 — via Research mode or + Add view)
- **Source picker:** drag files/folders, paste URLs, attach emails → corpus tray
- **Ask panel:** query → grounded answers with inline citations [1][2][3]
- **Artifacts:** mind map (Mermaid), report (docx/md), flashcards, comparison table
- **Audio digest button:** "Generate Audio Overview" (rides H28 TTS; "TTS not configured" when absent)
- Citations: superscript → click scrolls to exact passage in source

---

## Left Sidebar Navigation Panels

### Guard Panel (H8/J1-J21)
- **Trust Ladder:** horizontal track, `#F0EFEB`, filled gradient orange→amber. Thumb 16px white circle. Zones: `Read` · `Write (CURRENT)` · `Execute` · `Autonomous`. Score `75/100` orange.
- Tabs: `Trust Ladder` · `Guard-1 regex` · `Guard-2 cleanup`
- **Recent Actions:** table — timestamp + icon + description + category badge (`workspace read`, `shell restricted`, `Guard-1 regex`) + result (✓ green / ⚠ amber with [Allow] button / ✗ red)
- **Permissions Matrix:** grid — rows: Workspace, Home dir, Shell, External API, Browser. Columns: Read, Write, Execute, Network, Browser. Cells: `ALLOW` (green) · `ASK` (amber) · `BLOCK` (red) · `OFF` (grey)

### Connectors Hub (F1-F15)
- Header stats: Connected `5` · Available `12` · Tools `94` · MCP servers `3` — stat cards
- Tabs: `Native` · `MCP Servers` · `Composio` · `Zapier` · `Nango`
- Native grid (3-col): colored icon (40px) + name + "native" + auth method badge + tool count + last used + status badge or `[Connect]` button
- **MCP Marketplace (H24):** "Browse MCP servers" tab — grid with icon + name + description + category (filesystem/browser/database/API/code) + install count + status. Search/filter. Click → detail + install.
- Footer: "OAuth tokens stored locally (SQLCipher). Agent never sees raw tokens."

### Memory Browser (H23/C1-C13)
- Tabs: `Knowledge` · `Episodic` · `Semantic` · `Knowledge Graph` · `Skills`
- Left: categories (folder icons + counts) + Stores (Episodic 47 · Semantic 128 · KG 14 nodes)
- Right: knowledge cards — title + type badge (manual/suggested/learned) + trigger/macro/scope pills + edit/delete + thumbs up/down for suggestions
- `+ Add knowledge` button (orange outline)
- **FSRS reinforcement (C13):** "Review due" section — cards due for spaced-repetition review with Accept/Dismiss
- **Taste profile (C9):** visible in Settings > Preferences — confidence-scored rules, editable markdown

### Analytics Dashboard (H9)
- Time range pills: `Today` · `7d` · `30d` · `All time` (active = orange border)
- Summary cards (4): Total spent · Tokens used · Sessions · Avg cost/session — label (12px grey) + large number (20px/600 colored)
- Daily spend: line chart, orange line, 5% area fill
- Tokens by model: horizontal bar chart (colored per provider: Claude, Gemini, Ollama, DeepSeek)
- Cost by category: mini donut (Chat · Browser · Office · Code · Research)
- Recent sessions table: SESSION · AGENT · TOKENS · COST · STATUS — sortable
- `Export CSV` button (grey outline)
- **Per-key breakdown:** expandable — shows each BYOK key's usage/budget/health

### Automations Panel (H14/H22/B7)
- Header: "Automations" + count + `+ Create automation` (orange button)
- Subtitle: "Scheduled tasks, webhooks & event triggers that drive headless agent sessions"
- Tabs: `Active` · `Templates` · `History`
- Cards (80px): icon + name (14px/600) + trigger description (12px) + `[Run]` link + sparkline (30d, orange) + stats (`Runs: 28 · ✓ 26 · ✗ 2`) + last run
- Templates: pre-built cards (CI Fixer, Weekly Deps, Security Scan, Release Notes, Daily Standup)
- NL creation: "Describe an automation..." input + orange send
- **Heartbeat indicator (B7):** running automations show "♥" heartbeat icon — missed heartbeat = amber warning
- **Visual workflow builder (H22, post-v1):** node-graph editor (ReactFlow-class) accessed via "Advanced" toggle

---

## Settings Panel (⚙)

### Tabs: General · Models · Routing · Runtimes · Agents · Privacy · Local Server

**General:** Theme (Light/Dark/System) · Language · Data directory · Keyboard shortcuts link

**Models (A6):** Card grid — each: provider icon + model name + context window badge + capability badges (🔧 tools · 👁 vision · 💭 reasoning · 💰 cost tier) + `[Configure]`. Full catalog in power-user drawer (364 models), intent-first default (Fast/Quality/Private/Cheap).

**Routing (A7):** Rule table — task type → model assignment + fallback chain. Tiers: `planner_model` · `subagent_models` · `depth: 2` · `concurrency: 6`

**Runtimes (A5):** Local models section — Ollama status (online/offline + model list) · llamafile (binary path + status) · MLX (Mac only). `Scan models` button. Hardware-fit indicator per model.

**Agents (F12/J17):** List of configured agent CLIs — Claude Code · Codex · OpenCode · Aider · Copilot CLI · custom. Each: auth-mode badge (subscription/API-key/local) · status · model · `[Configure]` · `[Remove]`. `+ Add agent` from ACP registry.

**Privacy (H12):** "Send anonymous usage data" toggle (OFF default) + expandable "What's collected?" list. Clear statement: "Your data, keys, conversations, files NEVER leave your machine."

**Local Server (H13/A8):** Toggle "Expose as OpenAI-compatible API on localhost". Port (default 11434). Status indicator. "Copy for VS Code" / "Copy for Cursor" buttons. Model selector for exposed endpoint.

**Personality (H10):** SOUL.md editor — user-tunable persona. Core rules (inviolable, greyed out). Preset selector (straight-shooter/warm/coach/terse). Preview of how it affects responses.

---

## Overlays & Popovers

### Command Palette (⌘K)
- Centered modal: 560px, `#FFFFFF`, 12px radius, shadow `0 16px 48px rgba(0,0,0,0.15)`
- Entrance: scale 97→100% + fade (120ms)
- Search input: 44px, auto-focused, "Search sessions, files, commands..."
- Sections: ACTIONS · SESSIONS · VIEWS
- Each row (40px): icon + title + subtitle (grey) + shortcut (pill keys right-aligned)
- Selected: orange 5% bg + orange left border 2px
- ↑↓ navigate · ↵ select · esc close

### Notifications Popover (🔔)
- Dropdown: 320px, max 400px, scrollable
- Items: colored dot + title + time ago + dismiss ×
- Types: 🟠 approval · 🟢 completed · 🔴 error · 🔵 info
- "Mark all read" top link
- Click → navigate to session/panel

### Downloads Panel (left sidebar bottom icon)
- Files agent created/exported this session
- Entry: file icon + name + size + timestamp + "Open" / "Show in folder"

### Keyboard Shortcuts Overlay (⌘?)
- Full-screen, categorized columns: Navigation · Chat · Views · Agent Control · Global
- Key combos as styled keyboard pills + description

---

## System Tray (H11)

- Icon: orange "N" mark, 16px
- **Quiet mode:** tooltip = single sentence ("EveryAIOS: Running CI fixer — 3/5 done")
- Right-click: Show EveryAIOS · Recent Sessions (last 3) · Pause All · Quit
- Badge: orange dot (action needed) · blue dot (running) · none (idle)
- Stays active when window closed (automations continue headless)
- OS notification on MCQ interrupt: "Action needed: approve rm -rf build/" with Approve/Deny buttons

---

## Takeover / Resume Flow (H21)

**Agent working:** "● Live" indicators, all panels read-only, user watches.

**Interrupt:** User clicks ⏸ Pause (or agent asks for input).
- "● Live" → "⏸ Paused" everywhere
- All views become editable (shell writable, code accepts input, browser clickable)

**Resume:** User clicks ▶ Resume.
- Mandatory text field: "Describe what you changed"
- User types: "Fixed formula in B4, updated chart title"
- Agent receives context, continues. Views return read-only. "● Live" restores.

---

## Onboarding / First-Run (ARCH/12 §4.0 — non-negotiable)

- **First run = ONLY chat + empty viewport. No module wall. No 9 tabs.**
- Step 1: "Add your first API key" (provider picker → key input → saved to vault)
- Step 2: "Pick a folder" (directory selector → workspace set)
- Step 3: "Ask for something" (pre-filled suggestion: "Summarize what's in this project")
- Views open organically: terminal appears when agent runs a command, browser when it searches, office when it opens a file
- Settings surface only after one task completes
- **No tour, no carousel, no feature showcase.** The app is a chat until it needs to be more.

---

## Interaction Details & Micro-Animations

| Action | Animation |
|--------|-----------|
| Streaming text | Tokens at ~80/sec, thin orange caret blinks 500ms/500ms |
| Message complete | Caret fades 200ms |
| Viewport switch | Current fades 150ms → new fades in 150ms (crossfade, no slide) |
| Session select | Instant swap, viewport restores persisted layout |
| Progress step added | Slide left 100ms + fade in |
| Progress step complete | ○→✓ morph 150ms spring, border colors green |
| Progress step failed | ○→✗, border red, row shakes 3px once (150ms) |
| Approval card entrance | Slide up 250ms spring, orange border 0→4px after 100ms |
| Cell edit (Office) | Warm-yellow flash 200ms → settle, orange corner triangle |
| Chart regeneration | Old 30% opacity → crossfade new 400ms |
| Command palette open | Scale 97→100% + fade 120ms |
| Command palette close | Fade + scale 100→97% (80ms) |
| Treemap drill-down | Morph 300ms (rectangles rearrange) |
| Toast notification | Slide from top-right, 5px drop, 200ms, auto-dismiss 4s |
| Mode pill switch | Instant color swap (setting, not content) |
| Agent switch | Now-doing text crossfade 200ms, orange pulse on avatar |
| Live badge pulse | Opacity 50→100%, 1s cycle |
| Trust ladder drag | Track fills smoothly, zone labels brighten as entered, score rolls |
| Sparkline (automations) | Draws left→right on card mount, 300ms |

> **Status: fully wired in `ui/src` (2026-08-17).** Every row in this table now has a live implementation — the design-doc animation utilities in `globals.css` are all consumed by components: `enter-approval` (Guard-2 card), `enter-step` (progress steps, staggered) + `step-shake` (new `failed` step state), `enter-surface` (viewport crossfade — horizontal slide removed per the no-slide rule), `cell-flash` (Excel recalc diff), `chart-crossfade` (Analytics recharts), `scale-in-palette` (⌘K), `scale-in` (agent picker + office flyout), `treemap-morph` (Storage), `toast-enter` (radix toast keeps its own in/out — no competing animation), `spark-draw` (Automations sparkline, staggered), `score-roll` (Guard trust ladder), `agent-switch-pulse` (agent avatar on switch), `shimmer` (Skeleton), `breathe` (Now-doing processing), plus the pre-existing `live-dot`/`typing-dot`/`caret-blink`/`glow-pulse`/`hover-lift`/`border-glow`/`fade-up`. Reduced-motion (`prefers-reduced-motion`) still collapses all of it.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K | Global search / command palette |
| ⌘N | New session |
| ⌘Enter | Send message |
| ⌘⇧P | Progress view / Pause-Resume agent |
| ⌘⇧E | Folder view |
| Ctrl+` | Shell view |
| ⌘⇧B | Browse view |
| ⌘⇧C | Code view |
| ⌘⇧O | Office flyout |
| ⌘⇧D | Diff view |
| ⌘\ | Collapse/expand right viewport |
| ⌘⇧F | Fullscreen viewport |
| Escape | Stop agent / close modal |
| ⌘? | Keyboard shortcuts overlay |

---

## Accessibility (ARCH/12 §14)

- All interactive elements focusable via Tab
- ARIA labels on icons and status indicators
- High contrast mode support (4.5:1 minimum)
- Screen reader announces progress steps and status changes
- Reduced motion mode: disables live typing animation, crossfades become instant swaps
- Focus-visible ring on all interactive elements (orange at 30%)

---

## Screen Inventory (every distinct screen)

1. **Main Chat + Progress** — home state. Chat center, progress right.
2. **Automations Panel** — cards with sparklines, templates, NL creation
3. **Guard Panel** — trust ladder, permissions matrix, action log
4. **Connectors Hub** — native grid + MCP marketplace + Composio/Zapier/Nango
5. **Memory Browser** — knowledge/episodic/semantic/KG/skills + suggestions
6. **Analytics Dashboard** — spend chart, tokens by model, cost by category
7. **Folder View** — file tree + storage health + treemap + dedup
8. **Browse View** — live browser with URL bar and engine indicator
9. **Code View** — syntax editor with diff gutter and LSP
10. **Shell View** — terminal with read-only/writable toggle
11. **Office: Excel** — grid + formula bar + charts + sheet tabs
12. **Office: Word** — WYSIWYG with live AI cursor
13. **Office: PowerPoint** — slide preview + strip nav
14. **Office: PDF** — canvas + form fill + annotations
15. **Progress View** — full timeline with filters and expandable entries
16. **Diff View** — unified/split diff with accept/revert
17. **Audit/Replay View** — session scrubber + screenshots
18. **Storage View** — health dashboard + cleanup suggestions
19. **Blueprint Editor** — live .md with execution overlays
20. **Reader** — PDF/EPUB/web/markdown with chat overlay
21. **Local Sites** — sandboxed webview with device frames
22. **Research Surface** — source picker + cited answers + artifacts
23. **Command Palette** — ⌘K overlay
24. **Agent Picker** — @-dropdown with status/auth badges
25. **Settings** — General/Models/Routing/Runtimes/Agents/Privacy/Server tabs
26. **Onboarding** — add key → pick folder → first ask (minimal)
27. **Notifications** — popover with action items
28. **Keyboard Shortcuts** — full-screen reference overlay

---

## Overall Vibe

**Warm, professional, purposeful, alive.** The warm cream canvas (`#F7F7F4`) signals "this is a workspace, not a void." Orange says "something is happening — pay attention here." The density of a power-user tool with the polish of a premium product. It's Cursor's visual warmth + Claude's clean session model + Devin's agent-command-center ambition + Linear's information density — unified into one surface.

**The feeling:** you open it, it's just a chat. You describe work. Suddenly the right panel comes alive — a browser navigating, a spreadsheet filling, code being written — all visible, all auditable, all stoppable with one button. The agent switches from Claude to Codex mid-task without you noticing (same context, same approval, same viewport). The cost counter ticks. The progress steps tick green. The file appears as a card. You click it. Full Excel opens. It's your work. The agent just did it.

**Not a dark-mode IDE. Not a minimal chat window. A warm, dense, light workspace cockpit for people who use AI to ship real work — and want to watch it happen.**
