# 36 — Composio-community batch: Open ChatGPT Atlas · Secure OpenClaw · Awesome Claude Plugins · Awesome Codex Skills

> Added 2026-08-06 on user request. All four live-verified this pass (GitHub API + READMEs + API tree listings; atlas tree read via `git/trees` API, secure-openclaw tree via shallow sparse clone).

> 🔗 **Repos:** https://github.com/composio-community/open-chatgpt-atlas (447⭐) · https://github.com/composio-community/secure-openclaw (1,194⭐, MIT) · https://github.com/composio-community/awesome-claude-plugins (1.9K⭐) · https://github.com/composio-community/awesome-codex-skills (15.7K⭐)

---

## A. Open ChatGPT Atlas — `composio-community/open-chatgpt-atlas` (447★, TypeScript, Electron + Chrome extension, license none listed, active 2026-07)

**What it is:** open-source, free alternative to ChatGPT Atlas — an AI browser assistant with a sidebar chat UI.

**Architecture (tree via API):**
- **Chrome extension** (Manifest V3): `background.ts`, `content.ts`, `sidepanel.tsx`, `tools.ts` — sidebar chat accessible from any tab.
- **Electron companion** (`electron-browser/`): `main/browser-manager.ts` (browser lifecycle), `main/computer-use-service.ts` + `renderer/services/computer-use-service.ts` (visual automation), `main/ipc-handlers.ts`, `main/window-manager.ts`, `constants/systemPrompts.ts`.
- **Two tool paths:**
  1. **Tool Router Mode** — Composio's tool router: Gmail/Slack/GitHub + 500+ integrations (mirrors our F5).
  2. **Browser Tools Mode** — **Gemini 2.5 Computer Use for visual browser automation**: screenshots → clicks/typing/scrolling/navigation, blue click indicators + element highlighting.
- **No backend**: all API calls direct from the client (Google key for Gemini; Composio key optional) — validates our zero-server stance.
- **Safety**: confirmation dialogs for sensitive actions (checkout, payment, etc.).

**Steal for us:**
- **Sensitive-action confirmation dialogs during browser automation** → concrete precedent for our Guard-2 diff-cards on web flows (J3/E-series).
- **Visual computer-use service** (`computer-use-service.ts` pattern — screenshot → model vision → coordinate click; **README-verified**, file names + feature list, not source-read) → validates our E9 computer-use design (still ⚪ post-v1, but now pattern-validated).
- **Direct-from-client architecture** (no backend) → matches our no-founder-server promise.
- Tool Router integration pattern → F5 connector work.
- **Don't copy**: Electron shell (we're Tauri), the Gemini-2.5-only vision lock (we're model-agnostic), no licensing listed (avoid code copy).

## B. Secure OpenClaw — `composio-community/secure-openclaw` (1,194★, JavaScript, **MIT**, active 2026-07)

**What it is:** a thin, personal **24×7 messaging assistant** — OpenClaw + Claude (Agent SDK / Claude Code) + Composio Tool Router + persistent memory + scheduled reminders, reachable from **WhatsApp / Telegram / Signal / iMessage**.

**Codebase (shallow sparse clone):** tiny — `cli.js`, `gateway.js`, `config.js`, `package.json`. It's a *starter/gateway*, not a deep platform: a single `gateway.js` routes incoming messages → Claude agent loop → tool execution (Composio) → reply. The "secure" angle is inherited from OpenClaw's own security model (docs only — no custom sandbox code in this repo).

**Steal for us:**
- **Messaging-platform bridges** (WhatsApp/Telegram/Signal/iMessage) → **NEW matrix F13** — a genuinely new connector surface our app doesn't have yet: the same agent engine, reached from your phone's chat apps; scheduled reminders (B7) + memory already exist in our stack.
- The **thin-gateway pattern** (`gateway.js` = one message-in/agent-loop/response-out path) — a clean mental model for our own messaging adapter layer.
- Validation: OpenClaw + Composio + Claude stack works in production as a 24×7 assistant → our F5 connector hub + B7 scheduling + memory layer is the right shape.
- **Don't copy**: depends on the OpenClaw runtime (different from ours); WhatsApp/iMessage bridges are ToS-fraught and rate-limited — gate behind user's own accounts (matches our F-series policy).

## C. Awesome Claude Code Plugins — `composio-community/awesome-claude-plugins` (1,859★, curated list, MIT badge)

**What it is:** curated catalog of Claude Code plugins — custom **commands, agents, hooks, MCP servers** via the plugin system. Sections: Integrations · Frontend & Design · Git & Version Control · Code Quality & Testing · Backend & Architecture · DevOps & Performance · Documentation & Security · Developer Productivity · Companion & Personality · Image/Video Generation. Includes "Plugin Structure" + "Using Plugins" how-tos.

**Steal for us:**
- **Plugin taxonomy** (commands / agents / hooks / MCP) → the shape for our I2 skill registry + F8 harness-installer manifest design.
- **Catalog as reference** — when our F8 installs into Claude Code, this list is the ecosystem map of what users expect plugins to do.

## D. Awesome Codex Skills — `composio-community/awesome-codex-skills` (15,651★, curated list)

**What it is:** large curated catalog of Codex skills (Codex CLI + API). Sections: Development & Code Tools · Productivity & Collaboration · Communication & Writing · Data & Analysis · Meta & Utilities. Documents the skill format + install convention: **skills install into `$CODEX_HOME/skills` (default `~/.codex/skills`)**.

**Steal for us:**
- **Skill-manifest + install-path convention** (`~/.codex/skills/`, SKILL.md-style) → directly applicable to our `~/.pai/skills/` design (I2). We can adopt the same folder convention so skills written for Codex/Claude work in ours with minimal translation.
- **15.6K★ catalog = ecosystem evidence** for the skill-registry feature (I2/F8 demand signal).
- Skills are prompt/instruction files (portable, MIT-ish) → a seed library for our registry.

---

## E. Delta vs our locked matrix

| New row | What | Source | Status |
|---|---|---|---|
| **F13** | Messaging bridges — WhatsApp/Telegram/Signal/iMessage adapters to the same agent engine (24×7 assistant, user's own accounts, scheduled reminders + memory reuse) | Secure OpenClaw | 🟡 |

Already-covered steals (no new rows): sensitive-action confirm dialogs → J3 · visual computer-use → E9 (validated) · Composio tool router → F5 · plugin taxonomy → I2/F8 · skill-dir convention → I2 · direct-from-client → architecture (01).

**Ledger 143 → 147 (4 new), matrix 98 → 99.**
