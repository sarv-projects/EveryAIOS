# ARCH/archive/coordinator-loop — the built-in engine's turn loop (ARCHIVED)

> ⛔ **ARCHIVED 2026-09-22 (`P71.2c`) — not compiled, not part of any package, not a
> workspace member.** Nothing in the live tree imports anything here.

## Why these files moved

[`ADR-0005`](../ADR/0005-external-agents-are-the-v1-engines.md) §2 defers the **built-in engine** to
post-v1 and makes external agents the only first-class v1 engines. The coordinator's turn loop was that
engine's front end: it decided the model, assembled the prompt, ran the tool round, and drove the Rust
provider broker. All four are now the **bound agent's** job (`ARCH/AGENT.md` §1), so the loop is deferred
rather than deleted — `P71.7` returns it as a **governed baseline binding** whose value is fully-governed
effects plus zero-install first run.

`ARCH/ROUTING.md` §10 records the same decision from the routing side: the chain
`ModelCatalog → ModelRouter → Vault → ProviderTransport → model execution` is retired.

## What is here

| File | Was |
|---|---|
| `chat.ts` | `runChatStream` / `runInbuiltTurn` / `runToolRetry`, the `ChatAdapter` dispatch, `FrameProviderBridge` (the request half of the Rust broker), `injectBelowBoundary` |
| `chat.test.ts`, `chief-dispatch.test.ts` | its suites |
| `plan.ts`, `plan.test.ts` | `runPlanExecution` — the plan **executor** (its LLM turns ran on the broker) |
| `tools.ts`, `tools.test.ts` | the native ~50-tool catalogue (`resolveActiveTools`, `ToolExecutor`, the edit ladder mirror) — `P71.2f` |
| `first-class-tools.ts`, `first-class-tools.test.ts` | the native-plane `ask`/`plan`/`subagent`/`todo` specs |
| `prompt.ts`, `prompt.test.ts` | the 12-segment prompt assembler (J6) |
| `context-providers.ts` | `resolveMentions` / `@Codebase` resolvers feeding the prompt |
| `mention.ts`, `mention.test.ts` | `@` mention parsing for the loop |
| `intent.ts` | intent classification + `handlerFor` |
| `edit-strategies.ts` | `applyEditLadder` / `applyExactEdit` / `applyEditBatch` (the shadow-preflight producers) |
| `chunking.ts`, `chunking.test.ts` | prompt chunking helpers |
| `citations.ts`, `citations.test.ts` | turn-scoped citation extraction |
| `p64-lane.test.ts`, `p64-ladder-diff.test.ts`, `cowork-swarm-verification.test.ts`, `real-tasks-benchmark.test.ts` | loop lane/benchmark suites |
| `agent-patterns.ts`, `agent-patterns.test.ts` | the loop's pattern fixtures |

## What is **not** here, and why

- **`chief.ts`** stays in the coordinator — it is the delegation/subagent **policy** owner, not part of the
  loop (`P71.5b` retires the vocabulary, not the policy).
- **`scheduler.ts`** stays — it is the trigger-plane webhook ingress (`ARCH/AUTOMATION.md` §9).
- **`observations.ts`, `router.ts`, `scorer.ts`, `catalog.ts`** stay — they are the *observability* half that
  `P71.4` re-homes onto agent reports or retires explicitly. Their headers say so.
- **The Rust `chat/*` receive plane** (`ChatWireEvent` → `on_event`) stays in `everyaios-core`: its producer
  is gone, and `P71.9c` decides whether the ACP live updates feed it or it is removed. Declared, not stale.

### The loop's *environment* — orphaned, declared, not yet moved

These modules were reachable only **through** the archived loop (each one's sole importer was `chat.ts`,
`plan.ts`, `tools.ts` or `prompt.ts`). They are not in this directory yet because `P71.2c`'s narrowing pass
runs as its own step — but they are dead in the v1 tree and the codebase map's §11.5 lists them as
*test-only*. Nothing here should be treated as a v1 capability:

`budget.ts` · `context-trace.ts` · `stream-session.ts` · `waterfall.ts` · `guard.ts` (the loop's chat-side
permission gate — the live gate is `everyaios-guard`) · `skill-warm.ts` · `work-events.ts` · `run-identity.ts` ·
`combo-pick.ts` · `fabric.ts` · `spend-split.ts` · `runtime-bind.ts` · `cua-brief.ts` · `cua-perceive.ts` ·
`cua-replan.ts` · `cua-route.ts` · `cua-skill.ts` · `cua-stop.ts` · `cua-verify.ts` · `capability-seams.ts` ·
`surfaces.ts` · `goal.ts` · `fleet.ts` · `channel-a.ts` · `h32.ts` · `companion.ts` · `dream-diary.ts` ·
`external-inbox.ts` · `migration-import.ts` · `patch-overlay.ts` · `persona-registry.ts` · `reflection.ts` ·
`resumable.ts` · `mcp-manager.ts` · `mcp-install.ts` · `mcp-catalog.ts` · `scorer.ts` · `router.ts` ·
`catalog.ts` · `observations.ts` — each with its `*.test.ts`.

Two exceptions in that list are **not** loop environment and must be re-homed rather than archived when the
pass runs: `run-identity.ts` (event attribution, `P71.9c`) and `work-events.ts` (durable Work transitions,
`P71.9e`). The MCP trio (`mcp-manager`/`mcp-install`/`mcp-catalog`) is the shared-plane *client* surface and
is re-homed or retired with `P71.1`, never silently dropped.

## Recovering it

Add the directory back to a build only as part of `P71.7` (the governed baseline binding), and satisfy
`P71.6b` first: no feature may depend on this binding being present (`ARCH/AGENT.md` §2). The
`LAYER-1` CI invariant (`scripts/check-arch-invariants.mjs`) fails the build if `ConversationEngine` or
`runChatStream` reappears anywhere outside this directory.
