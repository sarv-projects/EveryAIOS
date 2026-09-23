# ARCH/archive/core-engine — `@everyaios/core-engine` (ARCHIVED)

> ⛔ **ARCHIVED 2026-09-22 (`P71.2c`) — the package is no longer a workspace member.**
> `packages/core-engine/` is gone; this directory holds its source, tests, `package.json` and
> `tsconfig.json` for the post-v1 return. Nothing in the live tree depends on it.

## What it was

The engine class the coordinator drove for a turn:

| Path | Contents |
|---|---|
| `src/engine.ts` | `ConversationEngine` — the turn loop (streaming, tool rounds, length guard, budget step) |
| `src/stages/` | tool/retrieval planners + the permission stage |
| `src/policy/` | `TrustLadder` · `PermissionGate` — **advisory** classifiers (Guard remains the only decider) |
| `src/prompt-compiler/` | the prompt compiler |
| `src/context/manager.ts` | `ContextManager` (context assembly) |
| `src/trajectory.ts` · `src/automation-engine.ts` · `src/risk-compass.ts` · `src/surface-contract.ts` · `src/types.ts` | trajectory logging, the automation-lite engine, the risk compass, the surface contract |

## Why it moved

[`ADR-0005`](../ADR/0005-external-agents-are-the-v1-engines.md) §2: the built-in engine is deferred to
post-v1. The class existed to reason, plan and call models; in v1 that belongs to the **bound external
agent** (`ARCH/AGENT.md` §1 — the agent owns its loop, model, authentication and provider fallback).
Keeping the package in the workspace would leave a second owner of model selection, which is exactly the
**I4** failure the ADR removes.

Its live ideas did not disappear: the prompt/segment schema is [`CONTEXT.md`](../CONTEXT.md) (the
`P69.A24` absorption — the assembler *serializes* Context, it does not own policy) and the live
context projection for an external agent is the Rust passport in `src-tauri/src/acp_cmds.rs`.

## Recovering it

Only as part of `P71.7` (governed baseline binding), under `I23`/`I24` — one binding, switchable,
non-owning — exactly as an external agent is bound. `P71.6b` forbids any feature depending on it being
present. The `LAYER-1` CI invariant fails the build if `packages/core-engine/src` reappears.
