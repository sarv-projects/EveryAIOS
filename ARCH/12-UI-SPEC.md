# 12 — UI/UX Specification: Desktop Layout & Interaction Design

> **Version:** 1.0 (2026-08-08)  
> **Reference:** Devin Cloud UI (Screenshots analysed), Windsurf/Cursor patterns  
> **Principle:** User watches AI work on everything — code, browser, Excel, Word, PPT, PDF — in real-time  
> **Cross-refs:** ARCH/01 (system architecture), ARCH/09 (feature matrix H1-H18), ARCH/DIAGRAMS #7 (MCQ interrupt)

---

## 1. Core Layout: Three-Column Split

```
┌───────────┬─────────────────────────────┬───────────────────────────────────┐
│  SIDEBAR  │      CHAT / PROGRESS        │      WORKSPACE PANEL (tabbed)     │
│  (240px)  │      (flexible)             │      (flexible, min 400px)        │
│           │                             │                                     │
│           │                             │                                     │
│           │                             │                                     │
│           │                             │                                     │
│           │                             │                                     │
│           │                             │                                     │
│           │                             │                                     │
└───────────┴─────────────────────────────┴───────────────────────────────────┘
```

**Responsive behavior:**
- Default split: Sidebar 240px | Chat 40% | Workspace 60%
- Sidebar collapsible to icon-only (48px)
- Workspace panel collapsible (chat goes full-width)
- Workspace expandable to fullscreen (⤢ button)
- Drag-resizable divider between Chat and Workspace

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
- Click any step → Workspace jumps to relevant tab/context

#### MCQ Interrupt (Action Required)
- Orange dot + "Action required: [description]"
- Shows diff-card for destructive actions
- Buttons: Approve / Edit / Reject / More Options
- Maps to ARCH/06 Guard-2 diff-card handshake

### 3.3 Chat Input Bar

| Element | Function |
|---------|----------|
| `+` button | Attach files, images, screenshots, URLs |
| Text input | Main prompt area (multiline, auto-expand) |
| Mode selector | Normal / Plan / Research / Quick / Code |
| 🎙 Microphone | Voice-to-text recording |
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

## 4. Right Panel: Workspace (Tabbed)

### 4.1 Tab Bar

```
┌───────────────────────────────────────────────────────────────────────┐
│ [📋Progress] [💻Shell] [📝Code] [🌐Browser] [📊Excel] [📄Word] [📑PPT] [📄PDF] [+] ⤢ │
└───────────────────────────────────────────────────────────────────────┘
```

- Tabs appear dynamically as agent opens tools
- Active tab is bold/underlined
- `+` adds a new tab (file picker or tool selector)
- `⤢` expands workspace to fullscreen
- Tabs are drag-reorderable
- Right-click tab → Close / Close Others / Pin
- File tabs show filename + modified indicator (●)

### 4.2 Progress Tab

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

### 4.3 Shell Tab

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

### 4.4 Code Tab (Editor)

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

### 4.5 Browser Tab

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

### 4.6 Excel Tab (📊 UNIQUE TO EVERYAIOS)

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

### 4.7 Word Tab (📝 UNIQUE TO EVERYAIOS)

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

### 4.8 PowerPoint Tab (📑 UNIQUE TO EVERYAIOS)

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

### 4.9 PDF Tab (📄)

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
- Workspace tabs show "● Live" indicator
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
| Cmd+Shift+P | Pause/Resume agent |
| Cmd+1-9 | Switch workspace tabs |
| Cmd+B | Toggle sidebar |
| Cmd+\\ | Toggle workspace panel |
| Cmd+Shift+F | Fullscreen workspace |
| Escape | Close modal / cancel |

---

## 12. Mobile / Compact Considerations

Not primary target (desktop app), but for future:
- Sidebar becomes bottom sheet
- Workspace tabs become swipeable
- Chat and Workspace stack vertically
- Progress steps collapse to summary

---

## 13. Accessibility

- All interactive elements focusable via Tab
- ARIA labels on icons and status indicators
- High contrast mode support
- Screen reader announces progress steps and status changes
- Reduced motion mode (disables live typing animation)
- Minimum 4.5:1 contrast ratio on all text
