# ARCH/13 — Prompt Anatomy

The desktop prompt is assembled in `packages/coordinator/src/prompt.ts`.
Identity/persona content is scanned before insertion; third-party retrieval is
wrapped as data-only content; user documents are separately delimited. The
stable prefix ends at `CACHE_BOUNDARY` and must remain byte-identical when only
history, retrieval, or the current message changes.

Prompt content is not a permission boundary. Tool authorization, vault access,
Guard-2 decisions, and audit recording remain Rust-owned. Prompt instructions
must never be used to infer approval.
