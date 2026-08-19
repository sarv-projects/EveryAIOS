# EveryAIOS Desktop

A local-first, BYOK, open-source desktop workspace where your **chat, browser,
files, documents, code, automations, agents, and connected accounts** live in
one safe continuity. The LLM is the CPU; every real effect (file, browser,
shell, provider, connector, office, agent) crosses **one ticket model → one
executor → one event log → one progress timeline**, verified by a deterministic
dual-guard (Guard-1/Guard-2) + evidence evaluation — never by trust in the model.

> Full product contract: [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md) (the
> canonical spec, §0 matrix, §6 build phases, §7 build order, §10 K-Pillar).
> Live task state: [`TODO.md`](TODO.md). Architecture: [`ARCH/`](ARCH/00-INDEX.md).
> Research provenance: [`RESEARCH/desktop_app/`](RESEARCH/desktop_app/00-INDEX.md).
> UI spec: [`UI-DESIGN-PROMPT.md`](UI-DESIGN-PROMPT.md).

## What it is

- **Local-first, BYOK** — your own keys (OpenAI/Anthropic/DeepSeek/OpenRouter),
  local Ollama/llamafile, or OAuth subscriptions; no required founder cloud.
- **One governed runtime** — tickets → executor → audit → recovery for every
  mutation across files, browser (CDP), shell, office (OOXML/IronCalc/lopdf),
  connectors (MCP-first), and agents (ACP harnesses).
- **MCP is the connector platform** (decision 2026-08-16) — user-supplied MCP
  servers + native BYO OAuth/API-key + the live tool catalog; no third-party
  aggregator tabs.
- **Open source** — dual-licensed MIT OR Apache-2.0 (see `LICENSE`). Bundled
  engines keep their own licenses.

## Repository layout

| Path | What lives there |
|---|---|
| `DESKTOP-APP-SPEC.md` | Complete product specification (capability matrix, build phases, K-Pillar) |
| `TODO.md` | Master implementation checklist (Stage 0 + HARDENING + P0.1 → P12, 1005 tasks) |
| `ARCH/` | Architecture docs 00–12 + diagrams |
| `RESEARCH/desktop_app/` | Source research notes (docs 01–84, 282 repos) |
| `crates/` | Rust core: `everyaios-core`, `guard`, `audit`, `vault`, `browser`, `office`, `memory`, `eval`, `blueprint`, `acp`, … |
| `packages/coordinator/` | TS sidecar — the supervised agent-loop engine (Bun) |
| `ui/` | Tauri webview UI (React + Tailwind v4 + framer-motion) |
| `src-tauri/` | Tauri shell (Rust), commands, tray |

## Development

```bash
npm run tauri:dev        # from desktop_app/ — runs ui (vite :1420) + cargo
cd crates && cargo test  # Rust workspace tests
cd packages/coordinator && bun test   # coordinator tests
cd ui && npm run type-check && npm run build
```

## Honesty contract

This project refuses to claim what it cannot show. Every capability in the
spec maps to a TODO phase with an explicit verification gate; statuses are
corrected in place when they drift (see `SPEC-CHANGELOG.md` header notes and
the `ARCH/09` landing annotations).
