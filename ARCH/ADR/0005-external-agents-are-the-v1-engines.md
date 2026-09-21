# ADR-0005 — External agents are the v1 engines; the built-in engine defers to post-v1

- **Status:** accepted
- **Date:** 2026-09-21
- **Applies to:** `CORE.md` §7.1 and §11 · `AGENT.md` §2 · `ROUTING.md` · `EXTERNAL-AGENTS.md` §3 ·
  `17-NATIVE-AGENT.md` · `05-TOKEN-ECONOMY.md` · `03-BYOK-KEYRINGS.md` · `11-AI-CHAT-FEATURES.md` · `TODO.md`
- **Amends:** [`0003-architecture-thaw-core-authority.md`](0003-architecture-thaw-core-authority.md) — which
  kept a built-in engine as *"one option among equals"*. This ADR narrows that for v1: the built-in engine is
  **deferred**, not equal. ADR-0003's decision text is left intact.

## Context

The built-in engine exists today and is the **default**, not a stub:

- `everyaios-acp/src/registry.rs:161` seeds `default_agent: "everyaios"` with a row at `:164` carrying
  `HarnessProtocol::Inbuilt` (`:170`); `registry.rs:304` asserts that default in a test.
- `ui/src/lib/bridge.ts:87` force-shows that agent as installed in the picker.
- The sidecar carries a full loop (`packages/core-engine/src/engine.ts`), a ~50-tool native catalogue
  (`packages/coordinator/src/tools.ts`, including first-class `ask` · `plan` · `todo` · `subagent`), and an
  in-process provider broker (`everyaios-core/src/chat.rs` `ChatRelay` → the `provider/stream` arm at `:1248`).
- `everyaios-core/src/native_loop.rs` collapses the stdio framing for that path (P29, landed 2026-08-24).

Three problems follow.

**One — it is a second owner of model selection.** The contracts already say the opposite: *"every external
agent owns its own auth/model/routing"* (`CORE.md` §11), and `AGENT.md` §1 gives the agent the loop including
its model. A built-in engine that routes providers means model selection has two owners. That is the **I4**
failure ("no subsystem may create a second source of truth for state another subsystem owns") applied to
routing, and `ROUTING.md:3` admitted it in its own status line at decision time: *"Owns model selection and provider access."* (that document has since been re-scoped by this ADR's §5).

**Two — it is a capability race we should not run.** The leading coding agents lead because of frontier model
co-training and inference compute, not because of their harness. A harness built here can credibly reach the
top open-source tier; it cannot win the frontier race — and the agents it would race are already hostable
*inside* EveryAIOS, so the same capability is reachable without owning it.

**Three — but two things it uniquely provides must not be deleted by accident.**

1. **Zero-install first run.** Today the first-run experience is: add one API key → chat works.
2. **Fully-governed effects.** An external agent's own tools never cross Guard — that is **I14** ("authority
   does not leak across the seam"), and it is why `EXTERNAL-AGENTS.md` §5 states honestly that no audit trail
   is claimed for them. A built-in engine's tools all cross the capability plane, so every effect is ticketed,
   receipted and replayable. **It is the only path to a fully-governed agent experience.**

**Removal is gated, and this is the load-bearing fact.** Delegation exists **only** on the built-in path:

- `packages/coordinator/src/tools.ts:188` — the `subagent` tool (*"inbuilt or external ACP agent"*).
- `everyaios-core/src/chat.rs:572` — the `subagent/spawn` handler, reached over the sidecar seam.
- The shared plane has **no** delegation: `SHARED_FACADES` in `everyaios-mcp/src/lib.rs` carries ≥14 façades
  (office · browser · computer_use · memory · work/context · workspace/artifact · search/connector) and
  **zero** `delegate*` entries.

So removing the built-in engine *before* a delegation façade exists removes multiagent from the chat entirely.

## Decision

1. **External agents are the only first-class main engines in v1.** The agent picker, onboarding, defaults,
   docs and tests must not depend on a built-in engine being present.
2. **The built-in engine is deferred to post-v1**, not deleted from the architecture. On return it is a
   **governed baseline binding** whose stated value is (a) full effect governance through the capability plane
   and (b) zero-install first run. It is explicitly **not** an attempt to out-model the frontier.
3. **`ARCH/17-NATIVE-AGENT.md` is archived** as historical context. Content that is still live already moved
   to `AGENT.md` §2/§5, `EXTERNAL-AGENTS.md` §1–§4 and `CONTEXT.md` (the `P69.A26` split). Its native-plane
   capability rows **B10 · B11 · C14 · C15 · F16 · I14–I17** are capability *identity* and are **unaffected**.
4. **`native_loop.rs` (`NativeLoop` · `DirectGuard`) is archived with the engine.** `DirectGuard` is a Guard
   mechanism, not an agent mechanism: when the governed binding returns it may be re-homed to
   `everyaios-guard`, and it must never carry an agent identity.
5. **`ROUTING.md` is re-scoped.** It answers *which external agent receives this Work*, plus credential and
   usage/cost **observability**. It no longer owns model selection or provider transport.
6. **Credentials: EveryAIOS-managed stay in the vault; external-agent credentials stay agent-owned.** This
   clarifies **I10** rather than weakening it. EveryAIOS may initiate or facilitate an agent's authentication;
   it must never extract an agent's native credential store.
7. **Guard principals named `everyaios` are actor identity, not agent identity.** The host performing an effect
   (`xlsx_cmds.rs:224`, `fs_cmds.rs:181`, `artifact_cmds.rs:74`, `mcp_cmds.rs:337`) keeps that name. Only agent
   identity is retired. Conflating the two would corrupt audit provenance.
8. **Landing order is normative.** Item 9 must exist before items 1–7 take effect.
9. **A delegation façade family joins the shared plane:** `delegate.spawn` · `delegate.status` ·
   `delegate.cancel`, under `EXTERNAL-AGENTS.md` §3's existing rules — task-shaped, stable, and part of the
   cache-stable prefix (**I16**). This is what makes delegation a platform feature rather than a built-in
   engine's private ability: *the primary agent chooses, EveryAIOS validates.*
10. **No new invariant is added.** This ADR records a **scope decision**, not an invariant. Any future return
    of the built-in engine must obey **I23**/**I24** (one binding, switchable, non-owning) exactly as an
    external agent does.

Implementation is tracked as **P71** in `TODO.md`.

## Consequences

- v1 ships **one class of engine**. The picker, onboarding and defaults lose their privileged entry.
- The governance promise narrows to what it can actually support, which **I14**/**I15** already require and
  the README already states: *every effect crossing EveryAIOS's capability plane is authorized, recorded and
  replayable; an external agent's own tools are governed by that agent's permissions plus the OS sandbox.*
- **Multiagent survives only if re-homed.** The delegation façade is therefore a prerequisite, not a
  nice-to-have. Missing it silently deletes a shipped, documented feature.
- **Zero-install first run becomes a post-v1 item**, so v1 onboarding must lead with agent discovery and
  installation. This affects `P70.D2`.
- ~50 native tools and the sidecar loop become dead code, reclaimed under `P69.F2`/`P69.F8`.
- **Four `TODO.md` rows currently marked `[DONE]` are reversed** and must be re-homed rather than deleted:
  P29's `NativeLoop`/`DirectGuard` (2026-08-24), `automation_runtime`'s runtime seam, `SubAgentRuntime` and
  `SwarmSession`. **I8**/**I9** already require the re-homing, so the kernel is the destination, not a rebuild.

## Alternatives rejected

- **Build a world-class native engine instead.** Rejected: the ceiling is set by the model and by co-training
  and inference compute, not by the loop. A harness can reach the top open-source tier; it cannot win the
  frontier race — and the agents it would race are already hostable here.
- **Delete the built-in engine outright.** Rejected: it discards the only fully-governed binding *and* the
  zero-install path. Deferral keeps both as a post-v1 option at no v1 cost.
- **Keep it as the default (status quo).** Rejected: two owners of model selection is the I4 failure applied
  to routing, and it contradicts what the contracts already promise.
- **Remove the built-in path first and add delegation later.** Rejected: delegation exists only on that path,
  so this deletes multiagent without anyone noticing until a user tries it.
- **Fold `DirectGuard` into the agent.** Rejected: it is a Guard mechanism; attaching it to an agent identity
  recreates the privileged binding this ADR removes.


