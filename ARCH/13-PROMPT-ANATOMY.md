# ARCH/13 — Prompt Anatomy

> **Derived from [`CORE.md`](CORE.md) — the root authority; this document specializes, never restates, it.**
> **ABSORBED — see [`CONTEXT.md`](CONTEXT.md).** The prompt assembler is the *serializer* of Context; it does
> not own Context policy (`ContextSelector` does). The anatomy of the assembled prompt remains accurate as
> implementation detail. **Absorbed `P69.A24` (done 2026-09-20).**

---


> **Full-Stack Module:** Module 3 — Unified Cockpit Shell & Context Compaction Engine (`packages/coordinator/src/prompt.ts`, 12-segment cache-affine prompt assembler).

The desktop prompt is assembled in `packages/coordinator/src/prompt.ts`.
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
assembler here — `buildDesktopSystemPrompt` and its 12 segments — **serializes** that decision into provider
text; it owns no selection, budget, or compaction policy (I22). `assertAllLogged()` / `ContextTrace`
presence and the `CacheBoundary` byte-stability rule are stated normatively in `CONTEXT.md` §§4–5; this
document keeps the segment anatomy below as implementation detail.

## Segment schema and cache invariants

The authoritative segment table now lives in [`CONTEXT.md`](CONTEXT.md) (the assembler serializes,
the selector decides); `17-NATIVE-AGENT.md` §17.7 is the historical source (split landed — `P69.A26`; `ARCH/17` archived, physical move tracked as `P71.5a`).
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
