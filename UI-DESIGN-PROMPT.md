# EveryAIOS — Production UI Design Specification

> **Canonical UI spec.** `ui/src` implements this document (ARCH/12 §2.1: when ARCH/12 and this file disagree on pixels, **this file wins**). The `ui/` tree is the **mock of the finished product** — explorable in a plain browser (`npm run dev`) with demo fallbacks, and live-wired inside Tauri. This file describes that mock as it should look at the end state (spec v3.58), not a wishlist of unbuilt chrome.
> **v3.57 (2026-08-26):** composer is **three independent controls** — **Agent ▾ (WHO)** · **Work Mode ▾ (WHAT: 🤖 Auto · 📐 Plan · 🔨 Build · 🔎 Research)** · **Autonomy ▾ (HOW MUCH: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum)**. Default chips `[🤖 Auto] [🛡 Ask]`. Code/browser/Office/terminal are capabilities *inside Build*, never extra modes (OpenCode Plan/Build + Cowork Chat/Cowork + Hermes sandbox/ask — we did not copy their chrome). Office views are **honest engines** (block list / formula bar / slides+notes / pdf.js+ops), not Microsoft ribbon clones. Guard-2 v1 = webview + nonce. P42 Graph/Workspace rows stay **not attached**. Version badge in the title/status bars is `v3.57`.

---

## 1. What the app is

EveryAIOS is a single-window **agent workspace cockpit**. One session, one ticket, one event log, one timeline: you describe work in the center chat, and the right viewport is the *live window into the real tool* — a browser navigating, a spreadsheet recalculating, code being diffed, a PDF being signed. Multiple agent runtimes (Claude Code, Codex CLI, Grok Build, Gemini CLI, Aider, OpenCode, and the inbuilt EveryAIOS orchestrator) share the same session, the same approval model, and the same viewport. The user never chases tabs across apps; the cockpit is one surface that shows whatever is happening right now.

Two modes serve two audiences (progressive disclosure, B9/P31):
- **Casual (default)** — a 240px **work** sidebar (Search · New work · Home · Activity · Projects · Files · Automations · Recent-as-work-state). Home is a launchpad (“What would you like to get done?”), not a metrics dashboard. Guard/Memory/Connectors/Skills/Marketplace live in Settings (Control Center) or the title-bar Guard chip. Right rail stays hidden until Pro.
- **Power** — the same work sidebar + the right activity rail and tool viewports. The monster architecture stays in **Settings → Control Center** groups (Workspace · Intelligence · Connections · Runtime · Security · Developer).

Everything below is what a power user sees; the casual differences are called out inline.

---

## 2. Design language

### 2.1 Palette (light-first, warm cream)

| Token | Value | Use |
|---|---|---|
| Surface 0 (canvas) | `#F7F7F4` | window background |
| Surface 1 (sidebar/panels) | `#FFFFFF` | sidebar, cards |
| Surface 3 (hover) | `#F0EFEB` | hover, active washes |
| Ink (primary) | `#26251E` | warm near-black text |
| Ink (secondary) | `#6B6860` | secondary text |
| Ink (tertiary) | `#9C9A94` | timestamps, meta |
| **Brand (sole accent)** | `#F54E00` | CTAs, active indicators, brand mark |
| Success | `#16A34A` | completed, connected |
| Running/Live | `#2563EB` | streaming, active jobs |
| Warning/Ask | `#CA8A04` | approval needed |
| Error | `#DC2626` | Guard-1 blocks, failures |
| Border | `#E8E5E0` | warm hairline |

Dark mode is a user toggle (`Sun/Moon` in the title bar) — same orange accent, surface base `#1A1917`.

### 2.2 Typography

- UI: **Inter** (400/500/600) · Code + status bar: **JetBrains Mono** (ligatures on)
- Base 14px; AI reply text 15px; panel headers 16px; page titles 24px; status bar 11px mono

### 2.3 Motion philosophy

Purposeful, swift, never bouncy. **No horizontal slides** — surfaces replace with a 150ms crossfade. Approval cards spring in from below (250ms overdamped). Streaming shows a blinking orange caret. No loading spinners — partial results grow in place. Reduced-motion (`prefers-reduced-motion`) collapses everything to instant swaps. The full animation inventory lives in §9.

---

## 3. Layout — four columns

```
┌────────────────┬──────────────────────┬──┬────────────────────────────┐
│ LEFT           │ CENTER               │R │ RIGHT VIEWPORT (tabbed)    │
│ sidebar        │ chat · panels        │A │ Folder · Terminal · Browse │
│ 248px / 56px   │                      │I │ + Code/Office/Progress/…   │
│                │                      │L │ drag-resizable, collapsible│
├────────────────┴──────────────────────┴──┴────────────────────────────┤
│ STATUS BAR — casual pill or dev telemetry strip                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Title bar (36px, native-drag)

Traffic lights → **brand mark** (orange sparkles tile) + `EveryAIOS` + `v3.57` badge → workspace breadcrumb (`everyaios / work ∨`, hover-dropdown) → active session title + status dot + label → center **command-palette launcher** (`Search sessions, files, commands… ⌘K · ⌘/ help`) → right cluster: Guard chip (`🛡 Guard · Standard` — click opens Guard control center; **not** a sidebar item) · spend chip (`$1.84 / $5.00`, power only) · token chip (`184K tok`, power only) · theme toggle · 🔔 notifications popover (badge = unread) · sidebar toggle (⌘B) · avatar.

### 3.2 Left sidebar

**Work-first (240px; collapse to 48px):** Search · **＋ New work** · Home · Activity · Projects · Files · Automations · Recent as a **work queue** (waiting / running / completed / scheduled — not a transcript dump) · Settings · Help · Account. **Not** in the sidebar: Memory, Guard, Connectors, Skills, Marketplace, Analytics.
**Pro** adds the right activity rail only. Architecture lives in Settings (Control Center groups).
Session list status: 🟠 waiting for approval · 🔵 running · 🟢 completed · 🔴 failed · ⚪ paused · 🟣 scheduled · ★ pinned.

### 3.3 Center column

**Home** (default) is a calm launchpad: greeting + “What would you like to get done?” + one composer + **outcome examples** (Clean up Downloads, get ready for a meeting, research + deck, organize files) — **not** Code / Research / Browse / Work-mode chips. Continue working lists live jobs. Chat empty state is the same question + outcome prompts; folder attach is Pro-only. Other center screens: Chat (a piece of work) · Activity · Projects · Files · Automations · Settings · Guard (title chip).

### 3.4 Right rail + viewport

**Rail (48px):** Folder ⌘⇧E · Shell Ctrl+` · Browse ⌘⇧B (live dot) · Code ⌘⇧C · `─` · **W** office flyout ⌘⇧O (open documents: `Q3-Financials.xlsx ●`, `exec-summary.docx`, `quarterly-deck.pptx`, `invoice-8402.pdf`, `Open another…`) · `─` · Progress ⌘⇧P (live) · Trajectory ⌘⇧T · `+` add-view (Timeline · Diff · Audit · Storage) · spacer · viewport collapse (⌘\\). Every icon shows its routed agent in the tooltip.

**Viewport** — VS Code-style **multi-view tab strip** (ARCH/12 v3.0). Default open tabs: Folder · Terminal · Browse (+ active Office tab). `+` dropdown adds any view; tabs close ×, activate on click; the active tab header shows context actions (per-view, see §6) + ⤢ fullscreen. Drag-resizable (28–70%, double-click resets), collapsible to 0. **Browser is one tab with internal page tabs; each Office document is its own tab.**

### 3.5 Status bar (24px)

**Casual:** one discreet pill — `● Preview · demo data` (amber, plain-browser) / `● Ready · Local` or `● Processing…` (emerald/orange live-dot) + `🛡 100% Private (On-Device)` + `EveryAIOS v3.57`.
**Dev mode (Settings → General → Developer Mode):** the full 12-badge telemetry strip — agent health (mark + latency + model + `auto` routing badge, hover = uptime/tasks/error-rate tooltip) · `sidecar online` · `core rust` · `db 3/14MB` · `mcp 127.0.0.1:9200` · `browser chrome (system)` · `cache 94%` · `guard · L2` · `vault · 7 keys` · `audit · append` · version.

---

## 4. Chat

### 4.1 Header

Agent mark (selected runtime) + session title + pinned marker + **agent·model chip** (`{mark} {runtime} · {model}`, hover-tinted) + folder path → status badge (`Running / Action needed / Paused / Done / Failed / Scheduled / Idle`) → **study-mode scope chip** (`📄 Scoped to contract.pdf`, ✕ clears) → actions: ⌘F search-in-conversation (animated slide-down bar with match count) · ⏸/▶ pause-resume agent · 🔔 · `⋯` session menu (Rename · Pin · Bookmark · Fork · Copy transcript · Export · Archive · Clear messages).

### 4.2 Now-doing strip

`⚡ {step i/N} {label} · {detail} · {elapsed}s elapsed · {tokens}K tokens this turn` + a live **Autonomy chip** (`🛡 Sandbox` / `👀 Ask` / `⚡ Auto` / `🚀 Maximum`) so the H34 level is visible while the agent runs. Never-unmounting live banner under the header; live elapsed ticker (1s), breathing orange icon, click → opens Progress view. **Never unmounts** when the viewport collapses.

### 4.3 Messages

- **User:** right-aligned bubble (secondary fill), avatar right.
- **Assistant:** left-aligned card on canvas, orange sparkles avatar, markdown-rendered (inline code, block code with copy header, lists, links). Streaming = blinking orange caret. Optional collapsible **Reasoning** (violet, `›` chevron). Hover actions: copy · 👍/👎 vote · regenerate.
- **System:** centered pill.
- Entry animation: 280ms rise+fade (`fade-up`); code blocks in a `#0d0d0f` frame with mono header.
- **In-chat search:** filters the transcript, shows `N match(es)` counter.

### 4.4 Progress steps

Vertical list under the assistant message, staggered `enter-step` (100ms each). Status: ✓ green done (label struck through) · ● orange spinner active · ○ pending · ✗ red failed (row shakes once). Each row shows the step-type icon + the **agent mark** that handles that kind (file→native, edit→Claude Code, browser→Grok, shell→Codex, office→native, …). Optional detail line + live output block for the active step.

### 4.5 Artifact cards

Message-width cards with a per-type **rendered preview**: xlsx → mini grid with the edited cell highlighted · docx → skeleton text · pptx → mini slide with chart bars · pdf → paper with highlighted value · code → syntax block · image → gradient. Header: type icon + filename + `● Live` badge (pulsing) when that artifact is the active viewport tab. Footer: `Source · Copy · Save · Open →` (Open switches the viewport to that file's tab).

### 4.6 MCQ / approval cards (Guard-2)

`enter-approval` card: orange-tinted, `⚠ Action required` badge, 4px orange left border, collapsible **diff preview** (red − / green + lines per file), `Remember choice` checkbox, footer buttons:
- **permission / diff:** `Approve` (orange fill) · `Reject` (ghost red) · `⋯`
- **mcq (plan interrupt):** option radio rows → `Continue` (sends the chosen value) · `Stop` (takeover)
- **budget:** spend progress bar + `$used / $cap` + % text.

### 4.7 Composer

- **Empty state:** centered card (`glow-pulse` sparkles mark, headline, contextual example prompts — developer phrases in power mode, consumer outcomes in casual — plus **nudge chips** from P6.4 scheduler sentinels: `Make “Morning brief” a recurring task · 0 8 * * *`).
- Once chat starts, the composer **bottom-pins**.
- **Power row (v3.57 — three independent controls, replacing the old `Normal · Plan · Research · Quick · Code` pills):** **Work Mode ▾** (`🤖 Auto` · `📐 Plan` · `🔨 Build` · `🔎 Research` — Auto lets the agent pick and transition modes; Code/browser/Office/terminal are capabilities *inside* Build, not modes) · **Agent ▾** (H32 picker, EveryAIOS default, Auto = router) · **Autonomy ▾** (H34: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum — authority policy, separate from mode). Collapsed composer shows `[🤖 Auto] [🛡 Ask]`; expanding reveals all three. Right mono cluster: `$spent / $cap` · `tokensK tok` · **context gauge** `{pct}% ctx` (amber ≥75%, red ≥90% with tooltip).
- **Input row:** `+` attach · auto-expanding textarea · 🎙 voice (toast "coming soon") · 🔊 TTS toggle · orange **send** arrow (disabled when empty; Enter sends, Shift+Enter newline).
- **Helper row (power):** `Enter to send · Shift+Enter newline · Esc clear` + `@ mention · / slash · !macro`.
- **Live hint popovers:** typing `/` lists slash commands, `!` lists macros, `@` lists mentions (blueprints · skills · files · packages) — filtered as you type, orange mono commands.

### 4.8 Agent / model picker

Bottom-anchored popover (`scale-in`, 680px two-column):
- **Left — runtimes:** every agent (logo, name, status dot: installed/updating/available, vendor + version, tagline, `orchestrator` badge on EveryAIOS native, checkmark on active). Selecting switches the runtime and snaps the model to its default.
- **Right — models for the active runtime:** capability chips, model rows (initial tile, name, recommended-for, context window, `$in/$out` per 1M, `gated` badge when unavailable), **auto-route toggle**, selected summary, and the **F8 install / J17 connect panel**: `Install` (ACP registry, Guard-2 ticket in preview) or `Connect / sign in` (launches the agent; surfaces its auth methods + "I finished sign-in — retry" when waiting on a URL).

---

## 5. Panels (center column)

### 5.1 Automations (H14/B7)

Header: `⚡ Automations` + `N active` badge + orange `+ Create automation` (jumps to Templates tab) + subtitle. **Three real tabs** (content crossfades, 180ms):
- **Active** — job cards (trigger icon, name, Paused/Running/Retrying badges, mono trigger label, `N step(s) · session s-…`, Run now ▶ / Pause ⏸ / Delete ✕ / enable switch, `Runs: n ✓ x ✗ y` + last-run time). Click a card → inline **AutomationEditor** (trigger kind select, cron input, condition, action select, blueprint select, budget slider, network policy select; right: 30-day activity chart, cost/success/network tiles, Save/Cancel — Save closes with a toast).
- **Templates** — 8 preset cards (CI Fixer · Weekly Deps · Security Scan · Release Notes · Slack Digest · Standup Bot · Invoice Batch · Log Rotator), each with description + trigger + run count + `Use template`.
- **History** — last-7-days run table (When · Job · Result ✓/✗ · Detail · Cost · Duration).

Footer: **natural-language composer** (`NL Describe an automation… ▶`) — in preview this parses nothing and prepends a new enabled daily job.

### 5.2 Memory (C1–C13)

Header: `🧠 Memory` + `N items` + `+ Add knowledge`. **Five real tabs** (content crossfades):
- **Knowledge** — left rail (Categories with counts · Stores: Episodic 47 / Semantic 128 / Graph 14 nodes); right: orange-dashed **Suggestions** (Accept 👍 / Dismiss 👎) + **Knowledge cards** (title, source badge manual/learned/suggested, trigger/macro/scope chips, edit / delete / enable switch).
- **Episodic** — time-stamped episode list (title, detail, `today 09:12`, token count).
- **Semantic** — extracted facts with confidence % (green ≥90, amber below) + source.
- **Knowledge Graph** — SVG edge map (nodes draggable-clickable, orange ring on selection, edge labels) with node/edge counts.
- **Skills** — installed + suggested skill cards (name, desc, version, status).

### 5.3 Guard (H8/J1–J21)

Header + `Trust Ladder` badge + `Guard-1 regex · Guard-2 cleanup`. Sections:
- **Honesty badge:** `v1: webview + nonce` (no OS-native dialog). Preview rows tagged `preview`.
- **Pending approvals** (live from `guardTickets` bridge, polls 3s; preview = demo tickets): operation + risk badge + paths + goal, `Approve` / `Reject` buttons.
- **Profile / estop strip:** `profile {profile} · auto ≥ {min}%` + `Pull estop` (red, toggles to `Estop is pulled — reset`).
- **Trust meter:** `75/100` + 4 zones (Read ✓ · Write **current** · Execute · Autonomous) + gradient fill bar.
- **Recent actions** (last 24h): time · action · target · scope badge · result (✓/⚠/✗) + `Allow`/`Deny` on the pending row (wired to toasts).
- **Permissions matrix:** scopes (Workspace · Home · Shell · External API · Browser) × capabilities (Read · Write · Execute · Network · Browser), allow/ask/block/off color cells + legend.
- **Vault cards:** `Key-ring · 7 keys · Rotate now` and `Session Vault · 12 sessions · View sessions` — both CTAs wired.

### 5.4 Connectors (F1–F15)

Header + stats strip (Connected 5 · Available 12 · Tools 94 · MCP servers 3). **Three real tabs**:
- **Native** — live vault OAuth accounts when the shell is up (`oauth_accounts`); empty vault shows an honest empty state (no fake “connected” rows). Plain-browser preview uses `NATIVE_SAMPLES` only.
- **Planned (P42)** — Google Workspace + Microsoft 365/Graph cards, status `disconnected` / badge `not attached`. Crate engines exist; live OAuth attach is the follow-on.
- **MCP Servers** — server rows (GitHub · Filesystem · Slack · Postgres: transport HTTP/stdio, desc, tools) — `Connect` flips the row to connected live.
- **Tool Catalog** — the real `everyaios-mcp` registry (total/browser/storage/read-only stats; every tool: name, kind badge, profile, args, `ro`/`open` flags).
Footer: `OAuth tokens stored in your local vault (SQLCipher). The agent never sees raw tokens.`

### 5.5 Analytics (H9)

Header + range pills (`Today · 7d · 30d · All time`) — switching crossfades the whole dashboard. KPI cards ($5.42 · 1.2M tokens · 12 sessions · $0.45 avg) · **Daily spend** area chart (orange, 5% gradient fill) · **Tokens by model** bars · **Cost by category** donut with legend · **Recent sessions** table (sortable-looking, status badges) · **Model leaderboard** (usage bars + $/1K) · **Agent cost breakdown** (per-runtime: sessions, tokens, cost, latency, success %). Footer: pricing-synced note + `Export CSV` (wired toast).

### 5.6 Settings

Left nav is **grouped + searchable** (Ctrl+F). Groups:

- **Workspace** — General (proxy, tray, archive, keymap, markdown open) · Appearance · Notifications (chat/task/wiki, banner, sound, per-event preview) · Voice (device, external-mic auto-send, noise, terms, history, realtime, speed, voiceprint) · Mobile (QR, install, device control, keep awake) · Keyboard · Privacy
- **Agents & models** — Agents & Models · Local models · Providers/BYOK (`vault_keys_list`/`add`/`remove`) + custom provider form · Experts/subagents · Launch CLI copy-cards · Chat & Auto-run (**H34: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum** + local ctx)
- **Permissions & tools** — Permissions · Browser & Network (Browse tab, protection, local/web links, HTTP/2, proxy, required domains, diagnostic) · Indexing & LSP (grep index, hierarchical ignore, symlink skip, LSP + worktree caps) · MCP directory + empty attach · Marketplace categories · Skills search · Commands · Hooks (PreToolUse deny-only) · Worktree disk cap · Rules (AGENTS.md / CLAUDE.md) · Cloud env
- **System** — Import & migrate · Usage zeros · Resources · Beta · Advanced · About

Section content **crossfades**. Prefs persist in `localStorage`. Honest amber notes where the executor/Tauri is not wired. **Do not clone competitor product names** (Quest, Trae, Qoder, CUE as a brand) — EveryAIOS chrome only.

Composer: permission chip + Agent / Experts / Spec (with hints) + runtime picker (Auto when auto-route). Empty chat: Work/Code/Design intent, Desktop/Documents/Open folder/WSL/No project chips. Spec Q&A uses lettered MCQ cards. Right **Summary** view = progress timeline + empty Artifacts/References. Memory has a **Repo wiki** tab. Automations templates include Daily Brief / Weekly Review / Project Monitor. MCP disconnect uses a destructive toast.

**Local models** (LM Studio 0.4.21 interaction, EveryAIOS chrome): three tabs.
- **Discover** — live Hugging Face Hub GGUF search (no hardcoded model list). Sort: Most downloads / Most likes / Recently updated. Left list = Hub `id` + downloads/likes + Vision/Tool/Reasoning from Hub tags. Right = Hub row + live `/tree/main` GGUF files. **Your first model** = first Hub hit, not a baked name. Download control visible; weight fetch is P27 (not wired). Footer: installed count from `local_models`.
- **My models** — installed ollama/llamafile + registry rows; click loads into the native picker.
- **Hardware** — CPU name/cores; RAM + VRAM; GPU; Offload KV cache; resource monitor (disk free, recommended quant); model-loading guardrails; start local LLM on login.

Composer agent picker: **Local** group (fits / too big / &lt;15K ctx) + **Discover · download · hardware** jump into this settings section.

---

## 6. Viewport views (right panel)

Every view is a full-fidelity surface with per-view header actions (wired — see §3.4):

1. **Folder** — file tree (expandable, modified-file orange dot, sizes) + Storage panel: used/free donut bars, squarified **treemap** (extension-hashed colors), duplicate groups (copy count, −saved, `keep` marker), large files. Header actions: `+ New file` · `Diff`.
2. **Shell** — dark terminal with scanlines; `$` prompts + PASS/compile output + blinking caret; **Read-only ⇄ Interactive** toggle (orange when writable, "▸ Toggle active" hint); collapsible command History sidebar. Actions: `+ New terminal` · `History`.
3. **Browse** — full Chrome-style chrome: internal page tabs (+ new tab), bookmarks bar, back/forward/reload, padlock+URL pill, extension tiles, **AI Mode** toggle (Gemini-style sidebar: key takeaway + grounded query box), star, extensions menu, `● Live` badge, DOM **Inspector** sidebar (accessibility snapshot). Body: scraped product grid with prices; footer: `Lightpanda → Chrome escalation · 23/47 crawled · cookies from vault`. Actions: `+ New tab` · `Inspector`.
4. **Code** — file tabs (modified dot), branch bar (`main +5 −0 · Refactor: extract getUsers()`), diff-gutter syntax table (green add rows), blinking caret, footer `Ln 4, Col 1 · TypeScript · UTF-8 · Modified`. Actions: `+ New file` · `Diff`.
5. **Office · Excel (honest viewer)** — compact ribbon groups that call the **IronCalc / surgical-patch engine** (not a Microsoft ribbon clone, not Copilot). Formula bar, windowed grid, sheet tabs, **Avg/Count/Sum** status, Guard-2 ticketed cell + bulk fill/sort/shift + pivot. Read-only while the agent is running; pause to take over. `Open in LibreOffice` + error-banner LO fallback. File switcher for a second workbook of the same kind.
6. **Office · Word (honest viewer)** — block list + selected-block `docx_patch` + track-changes display (`docx_tracks`). Not ruler/print/read/Copilot panes. Same lock + LO fallback + file switcher.
7. **Office · PowerPoint (honest viewer)** — live slide rail from `pptx_open` + speaker notes from `pptx_notes`. Demo rail only when no deck is open. Same lock + LO fallback + file switcher.
8. **Office · PDF (honest viewer)** — pdf.js canvas, find-in-text, text-snippet thumbs, `pdf_page_op` Annotate / Redact / Fill-form / Rotate, study-mode chat scope. Same lock + LO fallback + file switcher.
9. **Progress** — unified action timeline (timestamps, colored type icons, expandable detail with +/− diff lines), filter pills (All · File · Edit · Browser · Shell · Code · Office · Export), `N/8 done` counter, live-pulsing active dot. Actions: `Timeline` · `Export log`.
10. **Diff** — side-by-side old/new columns (red − / green +), line numbers, **minimap** with accept/revert chips. Actions: `Accept all` · `Revert all`.
11. **Audit & Replay** — append-only event table (timestamp · actor agent/user/system · action · target · status), **scrubber** (draggable, orange gradient fill), play/pause/skip transport, `Frame 7/10 · Speed 1.0× · Buffered 100%`, `Watch live` toggle, tamper-evident footer. Actions: `Live`.
12. **Storage** — full treemap + duplicate groups + large-file finder + Guard-2 **Cleanup Plan** card (`Review diff` / `Keep all`). Actions: `Clean up`.
13. **Trajectory (J5)** — per-session context-injection log grouped by source (Persona · User docs · Memory · Tool results · Blueprint), ref IDs + token counts + timestamps, refresh button, live-from-bridge in the shell.
14. **Timeline** — session message timeline (see §7).

---

## 7. Overlays & popovers

- **Command palette (⌘K)** — `scale-in-palette` dialog, grouped results (Actions · Sessions · Views · Navigate · Settings) with hints + shortcuts, ↑↓/↵/esc navigation, orange selection bar, footer key hints. Includes new-session, theme toggle, every session, every view, all six panels, agent switching (⌘⇧1–3), model switching, auto-route toggle.
- **Notifications (🔔)** — `fade-up slide-in-right` popover: seeded 8-item activity feed (cost / guard / success / agent / warning / git / info / error kinds, each with tinted icon tile + source chip + relative time), unread orange highlight, `Mark all read`, `Notification settings`, `View all activity`.
- **Agent picker, office flyout, add-view dropdown** — §3.4 / §4.8.
- **Keyboard shortcuts overlay (⌘?)** — full-screen, categorized key-pill grid, closes on esc/outside. Chat: `⌥ M` cycles Work Mode (Auto · Plan · Build · Research); `⌥ U` cycles Autonomy (Sandbox · Ask · Auto · Maximum). We do **not** steal OpenCode’s Tab-for-Plan/Build — Tab stays focus.

---

## 8. Mock data

Everything is explorable in a plain browser (`npm run dev` — `inTauri()` is false, so every bridge call falls back to its demo set):

| Surface | Mock data |
|---|---|
| Sessions | 5 seeded (Q3 report · price scraper · router refactor · invoice batch · standup digest) with messages, steps, artifacts, an open MCQ card |
| Automations | 3 demo jobs + 8 templates + 7-run history; NL create prepends a job |
| Memory | 5 knowledge items (2 suggestions) + 6 episodes + 5 facts + 5-node graph + 6 skills |
| Guard | 7 recent actions + 5×5 permission matrix + demo tickets + profile `balanced` |
| Connectors | 10 native + 4 MCP servers + full 42-tool catalog |
| Analytics | 30-day spend curve, tokens-by-model, cost donut, 10-session table, leaderboards |
| Notifications | 8 seeded items across 8 kinds |
| Browse | 6 products, 2 tabs, bookmarks, extensions, AI-mode summary, inspector DOM |
| Office | Q3-Financials.xlsx grid + recalc + Avg/Count/Sum, exec-summary.docx blocks/tracks, quarterly-deck.pptx slides+notes, invoice-8402.pdf (pdf.js + annotate/redact/fill) |
| Agent picker | 7 runtimes × their model sets, install + connect flows |

---

## 9. Animation inventory (all live in code)

| Action | Animation | Class / impl |
|---|---|---|
| Streaming text | ~80 tok/s + blinking orange caret 500ms | `caret-blink` |
| Message enter | 280ms rise+fade | framer `fade-up` |
| Viewport switch | 150ms crossfade (no slide) | `enter-surface` + framer |
| Panel/section switch | 180–220ms fade+6px rise | framer `AnimatePresence` |
| Progress step add | slide-left 100ms, staggered 60ms | `enter-step` |
| Step complete/failed | ✓/✗ morph; failed row shakes once | `step-shake` |
| Approval card | slide-up 250ms spring | `enter-approval` |
| Cell edit (Excel) | 200ms warm flash | `cell-flash` |
| Chart regen | 400ms crossfade | `chart-crossfade` |
| Command palette | scale 97→100% + fade 120ms | `scale-in-palette` |
| Popovers | 120ms scale-in | `scale-in` |
| Treemap | hover morph | `treemap-morph` |
| Toasts | top-right slide + 5px drop, 200ms | `toast-enter` |
| Agent switch | avatar pulse 200ms | `agent-switch-pulse` |
| Live badge | opacity 50→100%, 1s | `live-dot` / `live-pulse` |
| Typing dots | 3-dot bounce 1.1s | `typing-dot` |
| Processing | 2s breathe | `breathe` |
| Skeleton | 1.6s shimmer | `shimmer` |
| Trust ladder | 300ms roll | `score-roll` |
| Sparklines | draw left→right 300ms | `spark-draw` |
| Hover | 1px lift + glow | `hover-lift` / `border-glow` |
| Reduced motion | everything → instant | media query |

---

## 10. Keyboard shortcuts

⌘K palette · ⌘N new work · ⌘Enter send · ⌘⇧P progress/pause · ⌘⇧E folder · Ctrl+` shell · ⌘⇧B browse · ⌘⇧C code · ⌘⇧O office flyout · ⌘⇧D diff · ⌘\\ viewport toggle · ⌘⇧F fullscreen · ⌘B sidebar · ⌘. power toggle · ⌘⇧1/2/3 agent switch · ⌘F search-in-chat · Esc stop/close · ⌘? shortcuts overlay · **⌥M cycle Work Mode** · **⌥U cycle Autonomy**.

---

## 13. Competitive lineage (what we steal as *behavior*, never as chrome)

Researched 2026-08-26 against live docs (OpenCode, OpenChamber, Claude Cowork, Hermes Desktop, OpenClaw task-ledger). **Do not clone competitor product names or ribbons.**

| Product | What they do | What we show |
|---|---|---|
| **OpenCode** | Two primary agents **Plan / Build** (Tab to cycle). Desktop tabs for parallel sessions. Agent picker + permissions. | **Work Mode** Auto/Plan/Build/Research as an independent WHAT control. Tab stays focus; **⌥M** cycles. Sessions live in the left work queue. |
| **Claude Cowork** | Home \| Code top toggle; Chat and Cowork share one home; composer **Ask for approvals** dropdown; task view is chat + Progress rail. | Casual Home launchpad (“What would you like to get done?”). Autonomy **Ask** is the default, not a hidden setting. Now-doing + Progress view is the task rail. |
| **Hermes Desktop** | Chat + file browser + preview rail; provider/model settings; sandbox backends (local/docker/ssh…); skills store. | Agent ▾ is H32 (inbuilt + ACP). Autonomy Sandbox is *policy*, not a Docker picker (backends stay Settings). Skills live in Memory / Settings, not a cloned store. |
| **OpenClaw** | Detached task ledger: queued → running → terminal; push completion. | Automations + Tasks rail (`task_ledger`). Status dots on the work queue. |
| **Cursor / Claude Code desktop** | Parallel sessions sidebar, drag-drop panes, verbose/normal/summary. | Left recents-as-work-queue + right multi-view tabs. We do **not** rebuild an IDE (I12 is the Code rail). |

The mock must always be able to answer: **who** is running (Agent), **what** kind of work (Mode), **how much** they may do without asking (Autonomy) — three questions, three controls, never mixed into one pill row.

---

## 11. Accessibility

Tab-focusable everywhere · ARIA labels on icon-only buttons · 4.5:1 contrast floor · `prefers-reduced-motion` collapses all animation · focus-visible orange ring (30%) · status conveyed by icon + label (never color alone).

---

## 12. The feeling

Warm, dense, alive. You open it and it's just a chat. You describe work, and the right panel comes to life — a spreadsheet filling cell by cell, a browser crawling, a diff appearing — all visible, all auditable, all stoppable with one button. The agent can switch runtimes mid-task without you noticing; the cost ticks; the steps tick green; the file lands as a card; you click it and the full tool opens. It's your work — the agent just did it.
