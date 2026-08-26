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
  aggregator tabs. The P6.7 server now has guarded stdio and authenticated
  loopback-HTTP transport contracts; external server/client installs remain
  user-configured.
- **Orchestration seams are live** — the coordinator consumes the APP connector
  registry and MCP search client lazily, and task text dynamically selects a
  routing tier when the user has not locked a model. P6's local transport and
  routing contracts are tested; OAuth, external binaries, and live provider
  connections remain explicitly gated.
- **Open source** — dual-licensed MIT OR Apache-2.0 (see `LICENSE`). Bundled
  engines keep their own licenses.

## Repository layout

| Path | What lives there |
|---|---|
| `DESKTOP-APP-SPEC.md` | Complete product specification (capability matrix, build phases, K-Pillar) |
| `TODO.md` | Master implementation checklist (Stage 0 + HARDENING + P0.1 → P12, **1129 = 1042 done + 87 open** (2026-08-26 reconciliation); **P10.1–P10.5 all landed 2026-08-25/26** — 12 E2E suites + 10 security suites + 14 perf/stress benches (Rust workspace 1901 passed / 18 ignored) + CI matrix/nightly E2E/perf regression/pre-commit + cross-platform detect/portable-vault tests; **P13–P26 batch queues closed 2026-08-24/25** (P14.5 sync loop deferred); **P28/P29/P37/P16/P30/P32/P33/P38–P41 landed 2026-08-24** — P38 Dynamic Chief 7/7 end-to-end, P39 5/5, P40 3/3 (incl. `deploy/` BYO-host pack), P41 4/4; **P42 3/3 + P43 4/4 crate-done 2026-08-26** (UI wiring follow-ons); **v3.56 adds A11 Provider Record + alias layer + H34 Autonomy Level (spec + ARCH/09 + new P44 queue, 9 open)** — Hermes/OpenCode provider-overlay/alias pattern + Sandbox/Ask/Auto/Max chatbar presets, source-verified 2026-08-26; P5 = 71 done + 1 open (LadybugDB FFI deferred); P11.6 UX research + P35 animations landed 2026-08-25; remaining open = P9.2–P9.9 post-v1 (20) + P12 GTM (47) + Office hold (P33.5/6, P34.2-5/7) + P30.16 pixel-pet + P14.5 + P44 (9); spec v3.56 contract (status lives in TODO/SPEC-CHANGELOG) |
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
