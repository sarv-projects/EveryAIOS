# ARCH/13 — Prompt Anatomy

> **Derived from [`CORE.md`](CORE.md) — the root authority; this document specializes, never restates, it.**
> **ABSORBED — see [`CONTEXT.md`](CONTEXT.md).** The prompt assembler is the *serializer* of Context; it does
> not own Context policy (`ContextSelector` does). The anatomy of the assembled prompt remains accurate as
> implementation detail. **Absorbed `P69.A24` (done 2026-09-20).**

---


> **Full-Stack Module:** Module 3 — Unified Cockpit Shell & Context Compaction Engine (12-segment cache-affine prompt assembler).
>
> **Implementation status (2026-09-22, `P71.2c`):** the TS assembler (`packages/coordinator/src/prompt.ts`) was
> **archived** with the built-in engine at `ARCH/archive/coordinator-loop/prompt.ts`. The **contract below still
> holds** — it is what EveryAIOS projects into an agent's context — and its live implementation is the Rust
> context passport (`src-tauri/src/acp_cmds.rs`, `build_acp_prompt_with_passport`): warm-memory set, the
> honest governance block, the compacted handoff bundle and labelled documents, in that order.

The desktop prompt is assembled for the bound agent's context.
Identity/persona content is scanned before insertion; third-party retrieval is
wrapped as data-only content; user documents are separately delimited. The
stable prefix ends at `CACHE_BOUNDARY` and must remain byte-identical when only
history, retrieval, or the current message changes.

Prompt content is not a permission boundary. Tool authorization, vault access,
Guard-2 decisions, and audit recording remain Rust-owned. Prompt instructions
must never be used to infer approval.

## Authority and direction (`P69.A24`)

Policy lives in [`CONTEXT.md`](CONTEXT.md): `ContextSelector` decides what enters a turn, `CacheBoundary`
owns the stable-prefix line, and the 7-step optimization order (CONTEXT.md §3) binds every reduction. The
12-segment assembler here — `buildDesktopSystemPrompt` and its segments — is **historical as of 2026-09-22**:
its source (`packages/coordinator/src/prompt.ts`) was archived with the built-in engine (`P71.2c`) at
`ARCH/archive/coordinator-loop/prompt.ts`, where it **serializes** nothing today; it owns no selection,
budget, or compaction policy (I22), and on its post-v1 return (`P71.7`) it stays a serializer under the same
rule. The **live** projection of this contract is the Rust context passport
(`src-tauri/src/acp_cmds.rs`, `build_acp_prompt_with_passport`) — warm-memory set, honest governance block,
compacted handoff bundle, labelled documents (2026-09-22). `assertAllLogged()` / `ContextTrace`
presence and the `CacheBoundary` byte-stability rule are stated normatively in `CONTEXT.md` §§4–5; this
document keeps the segment anatomy below as **archived** implementation detail.

## Segment schema and cache invariants

The authoritative segment table now lives in [`CONTEXT.md`](CONTEXT.md) (the assembler serializes,
the selector decides); [`archive/17-NATIVE-AGENT.md`](archive/17-NATIVE-AGENT.md) §17.7 is the historical source (split landed — `P69.A26`; archived 2026-09-22 — `P71.5a`).
**Historical vs live (2026-09-22):** the 12-segment anatomy below describes the **archived** assembler
(`buildDesktopSystemPrompt`, `ARCH/archive/coordinator-loop/prompt.ts`, `P71.2c`) — it is retained as the
contract's historical anatomy, **not a live spec**; the **live** pipeline is the Rust context passport
(`src-tauri/src/acp_cmds.rs`, `build_acp_prompt_with_passport`), whose block order (warm-memory set →
governance block → handoff bundle → labelled documents) preserves the same three invariants below.
Segments **1–7**
above the boundary (SOUL.md identity scanned before insertion · shipped
instructions · persona tone · style memory · **tool definitions**) must stay
byte-identical across turns; segments **8–12** below it
(`<memory_warm_set>` · `<tool_index>` · `<untrusted>` · `<user_document>` ·
`<user>`). Three invariants bind any change to this pipeline:

1. **Cache:** mutating a 1–7 segment, the tool list, or the tool order breaks
provider prompt caching — tool definitions are **stable-sorted** and the
mounted set is **capped** (≤ 20 active tools).
2. **Honesty:** `assertAllLogged()` fails the turn closed (`context_not_logged`)
if any model-visible block is missing from the `ContextTrace`.
3. **Data-only boundaries:** third-party retrieval stays inside `<untrusted>`;
user documents are angle-sanitized (`<` → `‹`, `> ` → `›`) inside
`<user_document>` so an attached file cannot forge a system tag.

## Live Rust Context Passport & Tool Affinity Steering (`src-tauri/src/acp_cmds.rs`)

In the live external-agent architecture, the prompt passed to an external agent is constructed by `build_acp_prompt_with_passport`:

```
1. <memory_passport>
   - Core facts, user preferences, and workspace constraints from MemoryService.
2. ## Governance
   - Honest statement of session governance mode (Channel B / Governed-mediated / Self-contained).
3. ## Shared Cowork Capabilities (Tool Affinity Steering)
   - Explicit instructions guiding model attention to EveryAIOS native facades (preferring `office.*` over python scripts, `browser.*` over curl, and `delegate.spawn` over local fork bombs).
4. ## Installed subagent delegation mix
   - Advisory list of installed subagents available for `delegate.spawn` with B3 concurrency limits.
5. User Turn Message
```

