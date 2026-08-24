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
| `TODO.md` | Master implementation checklist (Stage 0 + HARDENING + P0.1 → P12, **1120 = 841 done + 279 open**; P5 = 71 done + 1 open (P5.12 LazyGraphRAG landed; LadybugDB FFI deferred); P36 Kernel Contracts 21/21 + P31 Custom Agent Builder 9/9 landed 2026-08-24; spec v3.48 de-statused (contract-only — status lives in TODO); spec v3.49 — version metadata moved to SPEC-CHANGELOG, +14 use cases, §4.0 subsystem map; spec v3.50 — deep re-audit; spec v3.51 — Algorithm Index 33→34 (FSRS #34), in-repo homes corrected, P5.12 added; spec v3.52 — competitor reconciliation (H33 always-on node · I12 Zed-class IDE · F14/F15 v2 workspace connectors → P40–P42, 151 rows); spec v3.53 — Chat⇄Code IDE mode switch (H20) + gpui Apache-2.0 reuse path (I12) + BackgroundTaskRecord detached-work ledger (B7) → P43; spec v3.54 — de-mishmash pass (G1/G8 distinct, intro example lists → UC pointers, stale 149→151, H18/H33 + P18/P22 + P33/P42 explicit); spec v3.55 — final line-pass (H18/H33 attribution, P10 pillar, micro-fixes) |
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
