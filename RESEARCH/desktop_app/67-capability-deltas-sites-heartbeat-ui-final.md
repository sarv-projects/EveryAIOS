# Doc 67 — Capability Deltas: Sites / Heartbeat / Proactivity / Inline-Edit / Kanban-ACP + UI/UX Finalization (2026-08-15)

**Scope:** the 5 capability deltas flagged from competitor research (ChatGPT Work / Claude Cowork / Devin Desktop / Cursor 3) → checked against the 278-repo ledger → **bolt.diy + Hatchet + durable-execution-the-hard-way cloned + source-read** → verdicts + landing map. **Second half:** the UI/UX finalization (activity-rail work cockpit) applied to ARCH/12 + matrix H20.
**Method:** GitHub API live-verified; bolt.diy (stackblitz-labs) + hatchet-dev/hatchet + hatchet-dev/durable-execution-the-hard-way cloned + source-read at code level; competitor capability claims cross-checked against official docs (support.claude.com, learn.chatgpt.com, latent.space reconstructions).
**Headline:** 2 of the 5 deltas are **real steal candidates** (bolt.diy → local-first "Sites"; Hatchet → heartbeat/durable-execution for B7). The other 3 are **wiring/UI nuances already covered by existing rows**. UI/UX: the 9-tab workspace strip is replaced by a **48px activity rail + views contract** — matching where Claude/ChatGPT/Cursor/Devin actually landed in 2026.

---

## §0 — Verdict summary

| Delta | Competitor source | Verdict | Maps to |
|-------|------------------|---------|---------|
| **Sites** (hosted mini web-apps/dashboards) | ChatGPT Work (Akshay Nathan: "Sites may replace decks") | 🔴 **STEAL: bolt.diy** (stackblitz-labs, MIT, cloned+source-read) | NEW — localhost-served dashboard artifacts |
| **Heartbeat automations** (reawaken conversation with context) | ChatGPT Work (heartbeat-type automations) | 🔴 **STEAL pattern: Hatchet** (hatchet-dev, cloned) + 🟦 durable-execution-the-hard-way (blueprint) | B7 extended |
| **Proactivity** (pre-authored task suggestions) | ChatGPT Work (personalized suggestions) | 🟢 already covered — OpenClaw/Leon (ledger) + B7 nudge sentinels + F14/F15 + memory | B7 + session-open hook (UI wiring) |
| **In-place highlight-edit** | Claude Cowork ("Edit with Claude") | 🟢 UI nuance on existing P4.7/H21 — no new repo | H5/views-rail work |
| **Kanban agent command center + ACP hosting** | Devin Desktop | 🟢 already tracked — H2 cockpit + F12 ACP (docs 45/56/57) | H2, F12 |

**Ledger:** 278 → **281** (+3: bolt.diy, hatchet, durable-execution-the-hard-way).

---

## §1 — bolt.diy: the "Sites" steal (cloned + source-read)

`stackblitz-labs/bolt.diy` = **the official open-source Bolt.new** (MIT). Prompt → full-stack web app, run it, edit it, deploy it — **self-hosted with your own LLM** (19+ providers incl. DeepSeek/Gemini/Anthropic/OpenAI). This is the open, local-first shape of ChatGPT Work's **Sites** primitive.

### 1.1 Architecture (source-read)

- **Remix/Vite web app + Electron wrapper** (`electron/main` + `electron/preload`) — desktop packaging on the same codebase. Validates our Tauri choice (same shape, different shell).
- **WebContainer runtime** (`app/lib/runtime/action-runner.ts`): an in-browser Node runtime where the agent's generated code actually runs — `ActionRunner` executes shell/file actions against a WebContainer, with per-action state (`pending | running | complete | aborted | failed`), abort signals, and error objects carrying formatted shell output. **This is the artifact-execution core**: agent emits actions → runner executes → Preview renders live.
- **Action stream from the model** (`app/lib/runtime/message-parser.ts` + `app/types/actions.ts`): the model's stream is parsed into typed `BoltAction`s (file writes, shell commands, start/complete markers) — a structured agent→runtime action protocol.
- **Workbench preview** (`app/components/workbench/Preview.tsx`): live preview pane with **device frames** (iPhone SE→large laptop), port dropdown, screenshot selector, Expo QR modal — the "watch your artifact" surface.
- **Artifact in chat** (`app/components/chat/Artifact.tsx`): action checklist rendered inline (auto-expands while running), diff view, deploy button.
- **DiffView** (`app/components/workbench/DiffView.tsx`) — file diff inspection before/after agent edits.
- **Deploy** (`app/components/deploy/DeployButton.tsx`) — artifact → hosted deployment (Cloudflare Pages path in `functions/[[path]].ts`).
- BYOK: `app/routes/api.configured-providers.ts`, env-key check, provider config — the model is a choice, not a lock-in.

### 1.2 What to steal (not the stack)

| Steal | For our app |
|-------|-------------|
| **Typed agent→runtime action stream** (`BoltAction` parse → runner) | our `everyaios-blueprint` automation steps + `everyaios-script` exec — a clean artifact-generation contract |
| **WebContainer-style artifact execution → localhost preview** | **NEW: localhost-served dashboard artifacts** — agent generates a mini web-app into a guarded folder, `everyaios-script` sandbox serves it on `127.0.0.1:<port>`, the Office/views rail previews it (the Work "Sites" answer, local-first) |
| **Preview device frames + port dropdown + screenshot** | the new artifact view in the views rail |
| **Inline action checklist w/ auto-expand + diff** | chat artifact cards (H1/H25 upgrade) |
| Electron-on-remix pattern | N/A (we're Tauri) — architecture validation only |

**Not stolen:** WebContainer itself (in-browser Node is a different runtime than our native sandbox; our `everyaios-script` rquickjs + tiered engine is the right local primitive).

---

## §2 — Hatchet + durable-execution-the-hard-way: the heartbeat steal (cloned + source-read)

`hatchet-dev/hatchet` = **orchestration engine for background tasks, AI agents, durable workflows** — Go engine, gRPC dispatch, **Rust-core friendly** (our stack). `durable-execution-the-hard-way` = its companion guide: build a durable-execution engine from scratch on Postgres.

### 2.1 Hatchet engine (source-read)

- **Dispatcher heartbeat lease model** (`internal/services/dispatcher/dispatcher.go:502-512`): the dispatcher maintains per-worker heartbeats; a missed heartbeat → task **reassignment** (`internal/services/controllers/task/process_reassignments.go` — lists step-runs to reassign, retries them). This is the *reawaken/resume-with-context* mechanism at engine level: state is checkpointed, work is re-grabbed, nothing is lost.
- **Durable execution v1** (`pkg/v1/`: `task`, `worker`, `workflow`, `features`, `client.go`) — steps are replayed/retried from persisted state after crashes.
- **gRPC dispatch + msgqueue** (`internal/services/dispatcher`, `internal/msgqueue`) — worker registration, lease-based work distribution.
- **Telemetry built-in** (`pkg/telemetry`, OTel) — our J14 pattern, validated.

### 2.2 durable-execution-the-hard-way (the blueprint)

7+ lessons (`lessons/01-prerequisites` → `07-durable-tasks`): simple task queue → concurrency limits → **durable event log** → **non-determinism** → durable tasks. Explicitly: *"implementing your own workflow engine? start here."* Go+Postgres+sqlc only.

### 2.3 What to steal

| Steal | For our app |
|-------|-------------|
| **Heartbeat lease + missed-heartbeat reassignment** | **B7 heartbeat automation**: scheduled task reawakens the *same conversation* with context intact; if the worker died, the lease is re-grabbed and the task resumes from checkpoint (extends our B7 + resume-after-reboot B2) |
| **Durable event log + replay-from-checkpoint** | our `everyaios-audit` event log is the checkpoint source — wire task-resume to the last emitted event (doc 53 durable events + idempotency) |
| **The-hard-way lesson structure** | the exact incremental build path for our own `everyaios-core` scheduler — we don't need Hatchet as a dep; we port the *principles* (lease, event log, non-determinism guard) into Rust |
| OTel + engine-level telemetry | J14 (already landed) |

**Not adopted:** Hatchet the server (Go+Postgres+gRPC infra is heavier than our local-first needs; our scheduler is in-process). The steal is the **lease/heartbeat/reassignment pattern**, not the dependency.

---

## §3 — Proactivity (already covered — wiring note)

ChatGPT Work's session-open "here's a task I generated for you" = calendar/Gmail context + memory profile + intent classifier + a suggestion surface. Our pieces (all tracked):
- **OpenClaw** (385K⭐, ledger §1) + **Leon** (17.4K⭐, "proactive pulse system", ledger §3) — the OSS references, already ⬛
- **B7 nudge sentinels** (`suggest_schedule`) + **F14 email / F15 calendar** connectors (P6.11) + **memory profile** (C9 taste, P5.x) + **Vane-pattern intent classifier** (landed)

**The delta is a UI hook, not a capability:** at session open, run the intent classifier over recent memory + connector state → surface 1–3 pre-authored task suggestions in the composer (reuse the nudge-card H14 pattern). No new repo. Recorded as a TODO wiring note.

---

## §4 — In-place highlight-edit (UI nuance, no repo)

Cowork's "Edit with Claude" (highlight → inline edit) and Cursor's "Edit with AI" are closed-product UI patterns. Our substrate exists: P4.7 viewers + ChatOverlay (scoped chat), code view w/ diff strip (H5/H20), takeover/resume (H21). The feature = selection → prompt → patch call over existing crates. **Lands in the views-rail work** (see §6) as the Code/Office view interaction. No new repo.

---

## §5 — Kanban command center + ACP hosting (already tracked)

Devin Desktop's Kanban-of-agents + ACP-hosting is exactly our **H2 cockpit** + **F12 harness-driving** (ACP client → official wrappers, docs 45/56/57, agentclientprotocol/registry in ledger §26). Devin is code-only; we add office/memory/guards. Nothing new — validation only.

---

## §6 — UI/UX FINALIZATION (the 2026 work cockpit — applied this pass)

**Input:** the earlier external UI/UX analysis (Claude/ChatGPT/Cursor/Devin pattern study) + market verification (web-searched: Claude Desktop Chat/Cowork/Code split ✅, ChatGPT Work/Codex split ✅, Gartner 40%-cancel ✅).

### 6.1 The decision

Replace the ARCH/12 **9-tab workspace strip** (§4.1, matrix **H20**) with a **48px right activity rail + one open surface**:

- **Core rail (4 verbs):** 📁 Folder · >_ Shell · 🌐 Browse · </> Code
- **Office = ONE button** (W) → flyout (Sheets/Word/Slides/PDF) — never 4 peer tabs; `.xlsx` opened → rail auto-selects Office→Excel
- **Session views** (▢ Progress, Diff, Audit/Replay, Storage) + **+ Add view** (plugin slot = the I6 dogfood rule)
- **Views contract** (`ViewDefinition { id, icon, label, group: core|office|session|plugin, when, open }`) — plugin views register identically; no 10th header tab
- **Per-session layout persistence** (activeViewId, railCollapsed, splitRatio, browseMode, composerMode) — the Cursor-layout-reset fix
- **First-run rule stays** (ARCH/12 §4.0 non-negotiable): no module wall; a view opens only when a tool needs it
- **Composer modes stay** (Normal/Plan/Research/Quick/Code = policy on one session, not new apps)

### 6.2 What this changes in the docs

| File | Change |
|------|--------|
| ARCH/12-UI-SPEC.md | §1 core layout: 3-column → left-sessions / center-chat / right-rail + viewport; §4 tab bar → activity rail + Office flyout + views contract; keyboard shortcuts updated; per-session state persistence |
| ARCH/09 row H20 | "Workspace tabs (9-tab live view)" → **"Activity rail + one-surface views (work cockpit)"** — the 4 verbs + Office family + views contract |
| SPEC | H20 row text + §6 progress note (views rail finalized) |
| TODO | UI work item: views-rail implementation + per-session persistence + Office flyout auto-switch |

---

## §7 — Landing map (new rows / extensions)

| Steal / delta | Row | Status |
|---------------|-----|--------|
| **bolt.diy artifact→localhost-preview pattern** | **NEW H29 (local dashboard artifacts)** — agent-built mini web-apps served on 127.0.0.1 via `everyaios-script`, previewed in the views rail (the local-first Sites) | NEW row |
| **Hatchet heartbeat-lease + reassignment** | **B7 extended** — heartbeat automations reawaken the same conversation with context; resume from audit-event checkpoint | extension |
| **durable-execution-the-hard-way lessons** | B7/B2 — the incremental Rust port path for the scheduler | reference |
| **Session-open proactivity hook** | B7 + H14 | wiring note |
| **Inline highlight-edit** | H5/H20 views work | UI nuance |
| **Views rail + contract + persistence** | H20 redefined + ARCH/12 rewrite | finalized |

---

## §8 — Honest status

- **bolt.diy (MIT)** and **hatchet (MIT)** are real, code-verified steals — but this pass records verdicts + landing map; **implementation is queued** (TODO: H29 artifact view + B7 heartbeat extension), not done.
- Proactivity / inline-edit / kanban-ACP are **already covered** — recorded as wiring notes, no new work items beyond the existing queues.
- UI/UX finalization is **applied to the docs** (ARCH/12 + matrix H20) — the actual React implementation is the existing UI-phase work.
- No Rust/TS code touched this pass.
