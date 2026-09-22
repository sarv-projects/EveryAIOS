# EveryAIOS — Production UI Design Specification

> **Canonical UI spec.** `ui/src` implements this document (ARCH/12 §2.1: when ARCH/12 and this file disagree on pixels, **this file wins**). `ui/src` is the **production frontend** used by the Tauri desktop application. A plain-browser Vite run (`npm run dev`) is a clearly labelled development preview with isolated fixtures; it is not the production runtime and must never imply real files, accounts, providers, tasks, or side effects. This file describes the shipped product contract (spec **v3.83** — the agent-binding model (two-plane frozen 2026-09-15, **freeze lifted by [`ARCH/ADR/0003`](ARCH/ADR/0003-architecture-thaw-core-authority.md)**; v1 engine scope re-based by [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md)) plus the Settings Control Center and Windows-first runtime/picker contract, H36 terminal profiles, §4.5 backends), reconciled 2026-09-21 for the live catalog picker, not a wishlist of unbuilt chrome.
> **v3.67 / 2026-09-12 reconciliation:** composer remains **three independent controls** — **Agent ▾ (WHO)** · **Work Mode ▾ (WHAT: 🤖 Auto · 📐 Plan · 🔨 Build · 🔎 Research)** · **Autonomy ▾ (HOW MUCH: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum)**. The **Agent ▾** list is installed-only selectable (a registry row with no binary renders `not installed` and routes to Settings rather than becoming a selection that cannot launch). Model ownership follows the agent: **EveryAIOS Native** shows the EveryAIOS provider/model surface (live catalog rows carried provider-qualified into routing, curated seed labelled fallback); an **external ACP agent** shows only its own ACP `configOptions` (`Model · <agent>`) or “managed by &lt;agent&gt;”. Settings has **one** agent surface — Agent runtimes — where the Native model catalog is a collapsed disclosure on the EveryAIOS Native card rather than a peer Models tab. Version badges are build-injected; do not hardcode a historical version string.
> **v3.75 / 2026-09-15 reconciliation (two-plane model — historically `ARCH/17`, **archived 2026-09-22** under [`ARCH/archive/`](ARCH/archive/) — `P71.5a`; its "frozen" status was lifted by [`ARCH/ADR/0003`](ARCH/ADR/0003-architecture-thaw-core-authority.md) and its live content is [`ARCH/AGENT.md`](ARCH/AGENT.md) + [`ARCH/EXTERNAL-AGENTS.md`](ARCH/EXTERNAL-AGENTS.md)):** this UI renders the **ownership split between the selected agent's plane and EveryAIOS's shared plane**. When the **built-in engine binding** is selected *(post-v1 — the built-in engine is deferred and is not a v1 picker entry, [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md))* the cockpit shows the EveryAIOS provider/model surface **and** the shared EveryAIOS cowork capabilities (Office · Browser · Computer use · connectors · workspace map · artifacts); when an **external ACP agent** is selected the cockpit must present the agent's **own native** capabilities as the agent's (`Model · <agent>`, its own session/auth) and the EveryAIOS additions as **shared augmentation** — a user must be able to tell which layer a capability comes from without reading docs (ARCH/17 §17.5, `UX-TESTING-PLAN.md`). This is a labeling/ownership rule over surfaces already described below, not new chrome; the picker's ownership split is unchanged. *(No binding is privileged — the built-in one is one binding among equals, [`ARCH/AGENT.md`](ARCH/AGENT.md) §2.)*
> **v3.78 / 2026-09-15 reconciliation (Windows-first runtime and cowork UI):** Settings is a searchable, two-pane control-center target over the existing provider/catalog, vault, ACP, MCP, connector, scheduler, Work Gateway, skill/plugin, Guard, and audit registries. Providers show Configured/Popular/All plus activation detail and metadata-only verification; Agent settings visibly separates Native capabilities from EveryAIOS shared capabilities; Channels & Connectors show discovered/installed/connected/degraded truth; Schedules show the frozen Work/Run contract; Installed and Marketplace are separate. Windows runtime rows must show exact path/provenance and distinguish WSL. The chat picker must select an agent-owned model, not a global model; capabilities are a separate loadout pane. The target shell uses cool-blue semantic theming with light/dark and selectable accents; the current orange legacy styling remains an explicit P66.5 implementation gap. Every mutation is backend-authoritative (`validate → persist → apply → reread`) and reports `appliedLive`/`restartRequired`/error. No subscription credential copying, flat 51-tool wall, silent external config writes, or catalog-to-occupancy inference. Office/browser/computer-use/memory readiness remains evidence-gated.
> **v3.68 / 2026-09-13 reconciliation (casual surface — spec "What EveryAIOS is" + §0/H34 + §4.1 composer, P61):** casual mode asks **one** question, not three. **Agent ▾ / Work Mode ▾** are **power-only**; the autonomy control renders as one plain dial — **Look only · Ask me first · Balanced · Just do it** — with its meaning stated in a sentence. This is a **display layer over the same four `PermissionMode` values** (Look only=Sandbox, Ask me first=Ask, Balanced=Auto, Just do it=Maximum): the per-task `config_hash` freeze, `syncAutonomyFromRust()`, the Rust preset and every guard decision are unchanged, and the status bar names the running agent·model in both modes so the collapse hides nothing. Casual vocabulary is translated at render (`PLAIN_NOUNS`/`toPlainNoun`: Guard→Safety, Trust Ladder→how much it may do on its own, vault→your keys, …). **Empty state:** pre-scoped task cards each state what will happen and where the boundary is (“nothing moves until you approve”), not example phrases that only fill the box; a once-only 24 h nudge (`shouldNudgeFirstTask`) offers a single starter and never fires once the user has work. **Failure cards carry the exit:** Try again safer · Try differently · Undo (Undo only when a tool completed). **Interrupts are tiered:** `Needs you` for high-blast effects, and those require typing the resource name to approve; routine effects keep one click. **Artifact figures are never invented** — the badge renders only `Artifact.figures` (what the run reported) and is absent otherwise.

---

## 1. What the app is

EveryAIOS is a single-window **agent workspace cockpit**. One durable Work, one session, one effect-authorization model, one event log, one timeline: you describe work in the center chat, and the right viewport is the *live window into the real tool* — a browser navigating, a spreadsheet recalculating, code being diffed, a PDF being signed. Multiple agent runtimes (Claude Code, Codex CLI, Grok Build, Gemini CLI, Aider, OpenCode, and, post-v1, the built-in EveryAIOS engine) share the same session, the same approval model, and the same viewport. The user never chases tabs across apps; the cockpit is one surface that shows whatever is happening right now.

Two modes serve two audiences (progressive disclosure, B9/P31):
- **Casual (default)** — a 240px **work** sidebar (Search · New work · Home · Activity · Projects · Files · Automations · Recent-as-work-state). Home is a launchpad (“What would you like to get done?”), not a metrics dashboard, and its empty state is **pre-scoped starter task cards** (what will happen + where the boundary is), not bare example phrases. Guard/Memory/Connectors/Skills/Marketplace live in Settings (Control Center) or the title-bar Guard chip, which reads plainly (`Safety · on`). Right rail stays hidden until Pro. **Casual asks one question, not three:** the composer shows one plain autonomy dial (`Look only · Ask me first · Balanced · Just do it`) instead of Agent ▾ / Work Mode ▾ / Autonomy ▾, and the Guard panel states one true sentence instead of the Trust Ladder meter and the 5×5 matrix (pending approvals still render in both modes).
- **Power** — the same work sidebar + the right activity rail and tool viewports. The monster architecture stays in **Settings → Control Center** groups (Workspace · Intelligence · Connections · Runtime · Security · Developer).

Everything below is what a power user sees; the casual differences are called out inline.

---

## 2. Design language

### 2.1 Palette (light-first, cool-blue semantic; selectable accents)

| Token | Light | Use |
|---|---|---|
| Surface 0 (canvas) | `#F6F8FB` | window background |
| Surface 1 (sidebar/panels) | `#FFFFFF` | sidebar, cards |
| Surface 3 (hover) | `#EDF1F7` | hover, active washes |
| Ink (primary) | `#16202C` | near-black text |
| Ink (secondary) | `#5A6675` | secondary text |
| Ink (tertiary) | `#8A94A3` | timestamps, meta |
| **Brand (selection + actions)** | `#2563EB` | CTAs, active indicators, brand mark, focus ring |
| Success | `#117E39` | completed, connected |
| Running/Live | `#0EA5E9` | streaming, active jobs |
| Warning/Ask | `#966703` | approval needed |
| Error | `#D72323` | Guard-1 blocks, failures |
| Border | `#DCE3EC` | cool hairline |

> **P66.5 contrast pass (2026-09-17).** `Success`, `Warning/Ask` and `Error` were
darkened above because the previous values (`#16A34A` / `#CA8A04` / `#DC2626`)
did not clear WCAG 2.2 AA as the small text they carry: measured **3.35:1**,
**2.96:1** and **4.43:1** respectively against a white card, worst-case. The
hues are unchanged and the roles are unchanged — only lightness moved. Now
5.18 / 4.94 / 5.06 on white and 4.79 / 4.57 / 4.68 on the canvas.
>
> **`Brand` is unchanged at `#2563EB`** (4.82:1 on canvas — already AA), because
> dark mode needs the *opposite* adjustment: AA for text on a dark card requires
a **brighter** accent, not a darker one. The dark accent is therefore `#5E99F7`
> and, being bright, its **label flips to the dark ink** — a white label on it
> could only reach 2.84:1. Selectable `sky` / `emerald` / `amber` accents were
> retuned the same way; `violet` needed no light change. Measured by
> `ui/src/lib/design-tokens.test.ts`, which fails if any of this regresses.

Dark mode is a user toggle (`Sun/Moon` in the title bar) — the same semantic roles on a `#0F141B` surface base. Brand is a **semantic accent token**, not a fixed hue, so Settings can offer selectable accent themes (cool blue default) without redefining status meanings. Orange is **not** the brand or selection state; it may remain only where an existing status meaning explicitly requires it.

> **Landed (P66.5):** the legacy `orange-*` / `amber-*` / `yellow-*` utilities are gone from `ui/src` — every occurrence now names the token it means (`bg-brand`, `text-warning`, `border-success`, …), and the retired families are mapped in the `@theme inline` table in `globals.css` so the old palette is unreachable even if an old class name reappears. Some per-surface descriptions further down this file still name orange for selection or decoration; read those as **historical wording**, not the contract — the tokens above are the contract. Status meanings keep their own semantic color (success/live/warning/error); selection and brand use the accent token, so a change in Settings → Appearance recolours every surface. Do not add new orange brand/selection styling.

### 2.2 Typography

- UI: **Inter** (400/500/600) · Code + status bar: **JetBrains Mono** (ligatures on)
- Base 14px; AI reply text 15px; panel headers 16px; page titles 24px; status bar 11px mono

### 2.3 Motion philosophy

Purposeful, swift, never bouncy. **No horizontal slides** — surfaces replace with a 150ms crossfade. Approval cards spring in from below (250ms overdamped). Streaming shows a blinking brand-accent caret. No loading spinners — partial results grow in place. Reduced-motion (`prefers-reduced-motion`) collapses everything to instant swaps. The full animation inventory lives in §9.

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

Traffic lights → **brand mark** (accent sparkles tile) + `EveryAIOS` + **build-injected version badge** (rendered from `ui/src/lib/version.ts` at build time — never a hardcoded historical string) → workspace breadcrumb (`everyaios / work ∨`, hover-dropdown) → active chat title + status dot + label → center **command-palette launcher** (`Search chats, files, commands… ⌘K · ⌘/ help`) → right cluster: Guard chip (`🛡 Guard · Standard` — click opens Guard control center; **not** a sidebar item) · spend chip (`$1.84 / $5.00`, power only) · token chip (`184K tok`, power only) · theme toggle · 🔔 notifications popover (badge = unread) · sidebar toggle (⌘B) · avatar.

### 3.2 Left sidebar

**Work-first (240px; collapse to 48px):** Search · **＋ New work** · Home · Activity · Projects · Files · Automations · Recent as a **work queue** (waiting / running / completed / scheduled — not a transcript dump) · Settings · Help · Account. **Not** in the sidebar: Memory, Guard, Connectors, Skills, Marketplace, Analytics.
**Pro** adds the right activity rail only. Architecture lives in Settings (Control Center groups).
Chat list status: 🟠 waiting for approval · 🔵 running · 🟢 completed · 🔴 failed · ⚪ paused · 🟣 scheduled · ★ pinned.

### 3.3 Center column

**Home** (default) is a calm launchpad: greeting + “What would you like to get done?” + one composer + **outcome examples** (Clean up Downloads, get ready for a meeting, research + deck, organize files) — **not** Code / Research / Browse / Work-mode chips. Continue working lists live jobs. Chat empty state is the same question + outcome prompts; folder attach is Pro-only. Other center screens: Chat (a piece of work) · Activity · Projects · Files · Automations · Settings · Guard (title chip).

### 3.4 Right rail + viewport

**Rail (48px):** Folder ⌘⇧E · Shell Ctrl+` · Browse ⌘⇧B (live dot) · Code ⌘⇧C · `─` · **W** office flyout ⌘⇧O (open documents: `Q3-Financials.xlsx ●`, `exec-summary.docx`, `quarterly-deck.pptx`, `invoice-8402.pdf`, `Open another…`) · `─` · Progress ⌘⇧P (live) · Trajectory ⌘⇧T · `+` add-view (Timeline · Diff · Audit · Storage) · spacer · viewport collapse (⌘\\). Every icon shows its routed agent in the tooltip.

**Viewport** — VS Code-style **multi-view tab strip** (ARCH/12 v3.0). Default open tabs: Folder · Terminal · Browse (+ active Office tab). `+` dropdown adds any view; tabs close ×, activate on click; the active tab header shows context actions (per-view, see §6) + ⤢ fullscreen. Drag-resizable (28–70%, double-click resets), collapsible to 0. **Browser is one tab with internal page tabs; each Office document is its own tab.**

### 3.5 Status bar (24px)

**Casual:** one discreet runtime pill — `● Development Preview` (amber, plain-browser) / `● Starting…` · `● Vault setup` · `● Vault locked` · `● Coordinator offline` · `● Live runtime` · `● Degraded` — plus privacy/provider details computed from live state. Never show `Ready`, `Local`, or `100% Private (On-Device)` without runtime evidence.
**Dev mode (Settings → General → Developer Mode):** the full 12-badge telemetry strip — agent health (mark + latency + model + `auto` routing badge, hover = uptime/tasks/error-rate tooltip) · `sidecar online` · `core rust` · `db 3/14MB` · `mcp 127.0.0.1:9200` · `browser chrome (system)` · `cache 94%` · `guard · L2` · `vault · 7 keys` · `audit · append` · version.

---

## 4. Chat

### 4.1 Header

Agent mark (selected runtime) + chat title + pinned marker + **agent·model chip** (`{mark} {runtime} · {model}`, hover-tinted) + folder path → status badge (`Running / Action needed / Paused / Done / Failed / Scheduled / Idle`) → **study-mode scope chip** (`📄 Scoped to contract.pdf`, ✕ clears) → actions: ⌘F search-in-conversation (animated slide-down bar with match count) · ⏸/▶ pause-resume agent · 🔔 · `⋯` chat menu (Rename · Pin · Bookmark · Fork · Copy transcript · Export · Archive · Clear messages).

### 4.2 Now-doing strip

`⚡ {step i/N} {label} · {detail} · {elapsed}s elapsed · {tokens}K tokens this turn` + a live **Autonomy chip** (power: `🛡 Sandbox` / `👀 Ask` / `⚡ Auto` / `🚀 Maximum`; casual: the same level in plain words) so the H34 level is visible while the agent runs. `{label}` is always a sentence — settled and coordinator-prefixed stages (tool done/failed, `routed:`, `cache:`, `context:`, `chief:`) are translated by `toPlainStage`, so the strip never shows a raw id. Never-unmounting live banner under the header; live elapsed ticker (1s), breathing orange icon, click → opens Progress view. **Never unmounts** when the viewport collapses.

### 4.3 Messages

- **User:** right-aligned bubble (secondary fill), avatar right.
- **Assistant:** left-aligned card on canvas, accent sparkles avatar, markdown-rendered (inline code, block code with copy header, lists, links). Streaming = blinking brand-accent caret. Optional collapsible **Reasoning** (violet, `›` chevron). Hover actions: copy · 👍/👎 vote · regenerate.
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

**Interrupt tiers (v3.68):** an interrupt is classified by what it is asking (`ui/src/lib/interrupts.ts`) and shown as either **Needs you** (high-blast: delete · send · pay · transfer · install · overwrite · revoke · grant · wipe · deploy · publish) or **Your call** (routine). The tier is visual, not functional — a high-blast card **requires the user to type the name of the resource being changed** before Approve enables, so it cannot be cleared with the same reflex click as a routine one. Routine cards are deliberately unaffected: a gate that fires on everything is just another reflex. The classification is a helper over the risk already carried per tool call, not a second policy engine.

### 4.7 Composer

- **Empty state:** centered card (`glow-pulse` sparkles mark, headline, contextual example prompts — developer phrases in power mode, consumer outcomes in casual — plus **nudge chips** from P6.4 scheduler sentinels: `Make “Morning brief” a recurring task · 0 8 * * *`).
- Once chat starts, the composer **bottom-pins**.
- **Power row (v3.57 — three independent controls, replacing the old `Normal · Plan · Research · Quick · Code` pills):** **Work Mode ▾** (`🤖 Auto` · `📐 Plan` · `🔨 Build` · `🔎 Research` — Auto lets the agent pick and transition modes; Code/browser/Office/terminal are capabilities *inside* Build, not modes) · **Agent ▾** (H32 picker — installed agents only, `Auto` routes; the built-in engine is post-v1, [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md)) · **Autonomy ▾** (H34: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum — authority policy, separate from mode). Collapsed composer shows `[🤖 Auto] [🛡 Ask]`; expanding reveals all three. Right mono cluster: `$spent / $cap` · `tokensK tok` · **context gauge** `{pct}% ctx` (amber ≥75%, red ≥90% with tooltip). **Casual (v3.68):** Work Mode and Agent are not rendered and the row is **one plain dial** (`Look only · Ask me first · Balanced · Just do it`) with a one-line meaning — display-only over the same `PermissionMode`, so the frozen per-task policy and every guard decision are identical in both modes.
- **Input row:** `+` attach · auto-expanding textarea · 🎙 voice (toast "coming soon") · 🔊 TTS toggle · brand **send** arrow (disabled when empty; Enter sends, Shift+Enter newline).
- **Helper row (power):** `Enter to send · Shift+Enter newline · Esc clear` + `@ mention · / slash · !macro`.
- **Live hint popovers:** typing `/` lists **the pinned agent's** slash commands (v1: ACP = live `available_commands_update` — `/name` submitted as `session/prompt` text, never intercepted as EveryAIOS control while an external agent is pinned; the built-in EveryAIOS catalogue returns with the post-v1 engine, [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md)), `!` lists macros (EveryAIOS-owned), `@` lists workspace file refs — filtered as you type, orange mono commands.

### 4.8 Agent / model picker

Bottom-anchored popover (`scale-in`, 680px two-column):
- **Left — runtimes:** installed agents only (logo, name, status dot: installed/updating/available, vendor + version, tagline, checkmark on active; the built-in engine is not a v1 picker entry — [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md)). Selecting switches the runtime and snaps the model to its default.
- **Right — models for the active runtime:** capability chips, model rows (initial tile, name, recommended-for, context window, `$in/$out` per 1M, `gated` badge when unavailable), **auto-route toggle**, selected summary, and the **F8 install / J17 connect panel**: `Install` (ACP registry, Guard-2 ticket in preview) or `Connect / sign in` (launches the agent; surfaces its auth methods + "I finished sign-in — retry" when waiting on a URL).

### 4.9 Failure / recovery cards

A failed turn ends on a card that names the failing layer in plain words and **never dead-ends** — the research is unambiguous that one failure with no visible way back causes abandonment, not a lower setting. Always shown: the honest failure sentence + technical detail behind expand. Exits (v3.68, `ui/src/lib/recovery.ts`):
- **Try again safer** — steps the autonomy dial down one notch (`saferMode`) and re-asks the same request, so the fix is reachable exactly where the user hit the wall.
- **Try differently** — re-sends the same ask with a tighter/different instruction, via `regenerateTurn`'s prompt transform.
- **Undo** — shown only when a tool actually completed in the turn.

---

## 5. Panels (center column)

### 5.1 Automations (H14/B7)

Header: `⚡ Automations` + `N active` badge + orange `+ Create automation` (jumps to Templates tab) + subtitle. **Three real tabs** (content crossfades, 180ms):
- **Active** — job cards (trigger icon, name, Paused/Running/Retrying badges, mono trigger label, `N step(s) · chat s-…`, Run now ▶ / Pause ⏸ / Delete ✕ / enable switch, `Runs: n ✓ x ✗ y` + last-run time). Click a card → inline **AutomationEditor** (trigger kind select, cron input, condition, action select, blueprint select, budget slider, network policy select; right: 30-day activity chart, cost/success/network tiles, Save/Cancel — Save closes with a toast).
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
- **MCP Servers** — server rows (GitHub · Filesystem · Slack · Postgres: transport HTTP/stdio, desc, tools) — `Connect`/`Attach` runs the two-phase flow: the shell mints a Guard-2 ticket over the exact command line, the user approves the card in the guard window, and the commit half spawns — consent is enforced in Rust, not just UI copy. Disconnect persists; detached rows restore as `disconnected` after restart.
- **Tool Catalog** — the real `everyaios-mcp` registry (total/browser/storage/read-only stats; every tool: name, kind badge, profile, args, `ro`/`open` flags).
Footer: `OAuth tokens stored in your local vault (SQLCipher). The agent never sees raw tokens.`

### 5.5 Analytics (H9)

Header + range pills (`Today · 7d · 30d · All time`) — switching crossfades the whole dashboard. KPI cards ($5.42 · 1.2M tokens · 12 chats · $0.45 avg) · **Daily spend** area chart (orange, 5% gradient fill) · **Tokens by model** bars · **Cost by category** donut with legend · **Recent chats** table (sortable-looking, status badges) · **Model leaderboard** (usage bars + $/1K) · **Agent cost breakdown** (per-runtime: chats, tokens, cost, latency, success %). Footer: pricing-synced note + `Export CSV` (wired toast).

### 5.6 Settings

Left nav is **grouped + searchable** (Ctrl+F). Groups:

- **Workspace** — General (proxy, tray, archive, keymap, markdown open) · Appearance · Notifications (chat/task/wiki, banner, sound, per-event preview) · Voice (device, external-mic auto-send, noise, terms, history, realtime, speed, voiceprint) · Mobile (QR, install, device control, keep awake) · Keyboard · Privacy
- **Agents & models** — Agents & Models · Local models · **Capabilities** (live availability matrix — every advertised surface maps to `live | partial | unavailable | v1-planned | post-v1` with the reason, P50.4.8) · **Providers / BYOK — list.** Search (all-character). Rows: 24px logo · name · tick if verified · **+**. Three OpenCode rows. Add custom at top.

**Providers — activate screen (new panel, Back).** Header: name / package (`npm` mono) / API URL / docs link. Key bar (password, Enter). Spinner while MetadataOnly `GET {api}/models`. Green tick + `aria-label="verified"` then **+ under the bar** for key N+1. Keyless: “Use without key”. Below: default-model dropdown + table (Model, id, context, output, price in/out, reasoning, tool call, images, …). Images column = CUA eligible. Density: same Settings tokens; one column on mobile width.

**CUA vision modal.** Title “Computer use needs a vision model”. Picker = `images?` only. Cancel unmounts CUA.

**CUA Progress:** DAG nodes with pre/postcondition chips (pass/fail). Replan marks. HITL cards stay Guard-2. Do not show a fake “100% accurate” banner.

**Rail.** Folder · Shell · Browse · Computer use · Code. Computer use = see-pane, not a fake OS. Progress = DAG. **Occupancy badge = currently pinned agent**, never `DEFAULT_ROUTING` (no “Browse is Grok, Shell is Codex” while the picker says Claude). · **Subagents** (B3: **+** installed CLIs only, editable when-to-use description; not a catalog of uninstalled names) · Launch CLI copy-cards · Chat & Auto-run (**H34: 🛡 Sandbox · 👀 Ask · ⚡ Auto · 🚀 Maximum** + local ctx)
- **Computer use (real OS)** — **primary right-rail icon** next to Browse (not only +/palette). Rail view = **see-pane** (screenshot + overlay + Esc), not a fake desktop. Settings: path allow-list + H4 readiness chip (**built** — P57.8: `AppPolicy::allow_paths` in `<data_dir>/desktop.json`, installed-app picker + Add by path, enforced Background default; P57.4: a Background coordinate click is delivered as an invoke/message/synthetic event, so it never moves the user's cursor, and the chip's sentence says so when the host has no non-moving click path). **Vision gate modal:** if the user starts CUA on a text-only model, show **“Computer use needs a vision model”** and a picker filtered to models.dev `images?` or local VL — backend `cua_requires_vision`, never silent screenshot-to-text. Progress/Kanban: **DAG nodes + replan markers**.
- **Browse (inbuilt CDP)** — Globe rail. DOM/a11y; screenshot extra. No vision required.
- **Office (inbuilt engines)** — flyout. Structured blocks. No vision required.
- **Stale chrome — resolved (P58, 2026-09-11/12):** keyboard cheat sheet reads the live `keyboard-shortcuts.tsx` map; About is build-injected; Office flyout badges derive from attach state; status bar / picker read live occupancy and the live catalog (P58.7); composer `/` is ACP `available_commands` for an ACP-bound agent. **Resolved (P58.4):** the inbuilt table has one owner (`ui/src/lib/slash-commands.ts`) that the composer intercepts and Settings → Commands switches — never a second hand-typed list.
- **Permissions & tools** — Permissions · Browser & Network (Browse tab — tiered read names the engine that served it, P55.7 — protection, local/web links, HTTP/2, proxy, required domains, diagnostic) · Search (local-first SearXNG + opt-in `searx.space` public instances, P55.8) · Indexing & LSP (grep index, hierarchical ignore, symlink skip, LSP + worktree caps) · MCP directory + attach with a real handshake (P55.11) · Marketplace categories · Skills search · Commands (drives the composer `/` table, P58.4) · Hooks (PreToolUse deny-only) · Worktree disk cap · Rules (AGENTS.md / CLAUDE.md) · Computer use (P57.8 — H4 readiness chip, allow-list of exact paths with installed-app search + Add by path, Background/foreground default) · Sync (H33 node attach — there is no Cloud-env dropdown)
- **System** — Import & migrate · Usage zeros · Resources · Beta · Advanced · About

Section content **crossfades**. Prefs persist in `localStorage`. Honest amber notes where the executor/Tauri is not wired. **Do not clone competitor product names** (Quest, Trae, Qoder, CUE as a brand) — EveryAIOS chrome only.

Composer: Agent ▾ (installed agents only) / Work Mode / Autonomy (H34) + agent-dependent `/` `@`. Empty chat: Work/Code/Design intent, Desktop/Documents/Open folder/WSL/No project chips. Spec Q&A uses lettered MCQ cards. Right **Summary** view = progress timeline + empty Artifacts/References. Memory has a **Repo wiki** tab. Automations templates include Daily Brief / Weekly Review / Project Monitor. MCP disconnect uses a destructive toast.

**First-run / no-provider** (P50.4.1/4.9): no vault keys AND no local runtime → the empty chat shows an amber `NoProviderCard` (Set up a provider · Download a local model · Check again) and the send path opens the `SetupGate` instead of a generic agent error. The gate states privacy + network destinations explicitly per path: BYOK keys are encrypted in the local SQLCipher vault and sent only to the chosen provider's API (no EveryAIOS server); local model downloads come from huggingface.co (the only download destination) and inference runs on-device.

**Local models** (compete with LM Studio / AnythingLLM / Jan / Ollama; EveryAIOS chrome): three tabs. A served runtime registers as a keyless provider on the A1 list (green tick = `/v1/models` reachable). Document RAG stays the C-series memory plane — do not clone AnythingLLM workspaces as a second store.
- **Discover** — live Hugging Face Hub GGUF search (no hardcoded model list). Sort: Most downloads / Most likes / Recently updated. Left list = Hub `id` + downloads/likes + Vision/Tool/Reasoning from Hub tags. Right = Hub row + live `/tree/main` GGUF files. **Your first model** = first Hub hit, not a baked name. **Download is wired** (P50.4.2, 2026-09-02): `model_download_start` on the chosen file (quant chips selectable), live progress rows with Cancel (pauses — `.part` kept) / Resume (also offered for orphaned `.part` files after a restart), sha256-verified install into the canonical registry (`local://hf/…`, shown under My models with Use→serve and Remove), and a hardware-fit recommendation line from live RAM ("Recommended for your hardware: q4_k_m · fits in X free RAM"). Downloads require the Tauri shell — the browser preview shows the honest note. Footer: installed count from `local_models` + registry.
- **My models** — installed ollama/llamafile rows + downloaded registry rows (id, quant, size, ctx, `local://hf/…`, Use→llamafile serve, Remove); click loads into the native picker.
- **Hardware** — CPU name/cores; RAM + VRAM; GPU; Offload KV cache; resource monitor (disk free, recommended quant); model-loading guardrails; start local LLM on login.

Composer agent picker: **Local** group (fits / too big / &lt;15K ctx) + **Discover · download · hardware** jump into this settings section.

---

## 6. Viewport views (right panel)

Every view is a full-fidelity surface with per-view header actions (wired — see §3.4):

1. **Folder** — file tree (expandable, modified-file orange dot, sizes) + Storage panel: used/free donut bars, squarified **treemap** (extension-hashed colors), duplicate groups (copy count, −saved, `keep` marker), large files. Header actions: `+ New file` · `Diff`.
2. **Shell (H36)** — dark terminal with scanlines + xterm renderer; **`+ ▾` profile dropdown** (PowerShell, cmd, Git Bash, each WSL distro, bash/zsh/fish — detected, not hardcoded); Select Default Profile at the bottom; tabs + splits; live chip `profile · backend (Local|Wsl|Remote)`. `$`/`PS>` prompts + blinking caret; **Read-only ⇄ Interactive** toggle (orange when writable); collapsible command History. **One PTY plane (v3.80):** OSC 633 provenance (human/agent/task origin chips), cwd header, exit decorations, find, links, history picker; agent/task commands run in the same PTY host as labelled read-only tabs. Remote profile = user-owned ExecutionNode, not a founder host.
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
14. **Timeline** — chat message timeline (see §7).

---

## 7. Overlays & popovers

- **Command palette (⌘K)** — `scale-in-palette` dialog, grouped results (Actions · Chats · Views · Navigate · Settings) with hints + shortcuts, ↑↓/↵/esc navigation, semantic selection bar, footer key hints. Includes new-chat, theme toggle, every chat, every view, all six panels, agent switching (⌘⇧1–3), model switching, auto-route toggle.
- **Notifications (🔔)** — `fade-up slide-in-right` popover: seeded 8-item activity feed (cost / guard / success / agent / warning / git / info / error kinds, each with tinted icon tile + source chip + relative time), unread accent highlight, `Mark all read`, `Notification settings`, `View all activity`.
- **Agent picker, office flyout, add-view dropdown** — §3.4 / §4.8.
- **Keyboard shortcuts overlay (⌘?)** — full-screen, categorized key-pill grid, closes on esc/outside. Chat: `⌥ M` cycles Work Mode (Auto · Plan · Build · Research); `⌥ U` cycles Autonomy (Sandbox · Ask · Auto · Maximum). We do **not** steal OpenCode’s Tab-for-Plan/Build — Tab stays focus.

---

## 8. Mock data

The visual surface is explorable in a plain browser (`npm run dev`) using explicitly labelled development fixtures. In the Tauri shell, every capability panel reads native state or shows loading, empty, unavailable, or error state; native failures never fall back to preview data:

| Surface | Mock data |
|---|---|
| Sessions | Development-preview fixtures only; the Tauri shell loads encrypted-vault sessions and shows an empty state when none exist |
| Automations | 3 demo jobs + 8 templates + 7-run history; NL create prepends a job |
| Memory | 5 knowledge items (2 suggestions) + 6 episodes + 5 facts + 5-node graph + 6 skills |
| Guard | 7 recent actions + 5×5 permission matrix + demo tickets + profile `balanced` |
| Connectors | 10 native + 4 MCP servers + full 51-tool catalog |
| Analytics | 30-day spend curve, tokens-by-model, cost donut, 10-session table, leaderboards |
| Notifications | 8 seeded items across 8 kinds |
| Browse | 6 products, 2 tabs, bookmarks, extensions, AI-mode summary, inspector DOM |
| Office | Q3-Financials.xlsx grid + recalc + Avg/Count/Sum, exec-summary.docx blocks/tracks, quarterly-deck.pptx slides+notes, invoice-8402.pdf (pdf.js + annotate/redact/fill) |
| Agent picker | Development-preview fixtures only; the Windows shell must use live discovery, exact path provenance, agent-owned model/config options, and explicit install/connect states (P66.1–P66.4) |

---

## 9. Animation inventory (all live in code)

| Action | Animation | Class / impl |
|---|---|---|
| Streaming text | ~80 tok/s + blinking brand-accent caret 500ms | `caret-blink` |
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

## 11. Competitive lineage (what we steal as *behavior*, never as chrome)

Researched 2026-08-26 against live docs (OpenCode, OpenChamber, Claude Cowork, Hermes Desktop, OpenClaw task-ledger). **Do not clone competitor product names or ribbons.**

| Product | What they do | What we show |
|---|---|---|
| **OpenCode** | Two primary agents **Plan / Build** (Tab to cycle). Desktop tabs for parallel sessions. Agent picker + permissions. | **Work Mode** Auto/Plan/Build/Research as an independent WHAT control. Tab stays focus; **⌥M** cycles. Sessions live in the left work queue. |
| **Claude Cowork** | Home \| Code top toggle; Chat and Cowork share one home; composer **Ask for approvals** dropdown; task view is chat + Progress rail. | Casual Home launchpad (“What would you like to get done?”). Autonomy **Ask** is the default, not a hidden setting. Now-doing + Progress view is the task rail. |
| **Hermes Desktop** | Chat + file browser + preview rail; provider/model settings; sandbox backends (local/docker/ssh…); skills store. | Agent ▾ is H32 (installed ACP agents; the built-in engine is deferred — [`ARCH/ADR/0005`](ARCH/ADR/0005-external-agents-are-the-v1-engines.md)). Autonomy Sandbox is *policy*, not a Docker picker (backends stay Settings). Skills live in Memory / Settings, not a cloned store. |
| **OpenClaw** | Detached task ledger: queued → running → terminal; push completion. | Automations + Tasks rail (`task_ledger`) + a cost carrier on every row (tokens+cost — OpenClaw lacks it, known gap doc 86). Status dots on the work queue. |
| **Cursor / Claude Code desktop** | Parallel sessions sidebar, drag-drop panes, verbose/normal/summary. | Left recents-as-work-queue + right multi-view tabs. We do **not** rebuild an IDE (I12 is the Code rail). |

The production UI must always be able to answer: **who** is running (Agent), **what** kind of work (Mode), **how much** they may do without asking (Autonomy) — three questions, three controls, never mixed into one pill row.

---

## 12. Accessibility

WCAG 2.2 AA target: keyboard-operable and focus-visible controls, focus not obscured, dialog focus trap/restore, adequate target size, status conveyed by icon + label (never color alone), and `prefers-reduced-motion` support. Use native semantics before ARIA; conformance requires tested evidence.

---

## 13. The feeling

Warm, dense, alive. You open it and it's just a chat. You describe work, and the right panel comes to life — a spreadsheet filling cell by cell, a browser crawling, a diff appearing — all visible, all auditable, all stoppable with one button. The agent can switch runtimes mid-task without you noticing; the cost ticks; the steps tick green; the file lands as a card; you click it and the full tool opens. It's your work — the agent just did it.
