# ARCH/13 — Prompt Anatomy

The desktop prompt is assembled in `packages/coordinator/src/prompt.ts`.
Identity/persona content is scanned before insertion; third-party retrieval is
wrapped as data-only content; user documents are separately delimited. The
stable prefix ends at `CACHE_BOUNDARY` and must remain byte-identical when only
history, retrieval, or the current message changes.

Prompt content is not a permission boundary. Tool authorization, vault access,
Guard-2 decisions, and audit recording remain Rust-owned. Prompt instructions
must never be used to infer approval.

## Segment schema and cache invariants

`17-NATIVE-AGENT.md` §17.7 is the authoritative segment table: segments **1–7**
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
