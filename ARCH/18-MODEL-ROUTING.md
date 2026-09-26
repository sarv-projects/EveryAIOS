# 18 — Model Plane (registry · routing · adapters)

> **Status:** Draft P2 (early — harness evidence integrated). Must pass the `ARCH/00-INDEX.md` §5 checklist at freeze.
> **Role:** every model — cloud or local — behind **one registry and one router**. No module hard-codes a vendor (P-03, DEC-004).
> **Dependencies:** `10-KERNEL` · `12-TRUST` (vault) · `16-CONTEXT` (window/tokenization feeds budgets) · `30-EVENTS` (usage). **Consumers:** `15-AGENT-X` · `20-WORKFLOW` (agent nodes) · `17-MEMORY` (extractor) · `24-COMPUTER-USE` (vision).
> **Evidence:** product-owner brief (ModelAdapter surface, local discovery UX, “never hard-code Claude”) · `ARCHIVE/v1-research/agent-harness-verification.md` §A1 (resolved window + feasibility check, `codex-rs/core/src/session/mod.rs:4560-4587`), §C1 (budget vocabulary) · `ARCH/06-DATA-MODEL.md` DM-025 · `ARCH/07-CONTRACTS.md` CTR-014 · `ARCHIVE/v1-research/memory.md` §7 (extraction disclosure boundary).

## 1. Purpose & responsibilities

**Owns:** the model registry (DM-025) · model adapters (implementation of CTR-014) · the router · capability normalization (context window · tool calling · reasoning · vision · streaming · structured output) · local discovery (Ollama · LM Studio · vLLM · llama.cpp · OpenAI-compatible endpoints) · reasoning-effort mapping · usage/cost accounting hooks.
**Never owns:** agent logic (`15`) · credentials (`12` owns; adapters `use` them via the vault).

## 2. ModelDescriptor (DM-025)

| Field | Meaning |
|---|---|
| `id` | `provider/model` (stable registry identity) |
| `provider` | serving provider (cloud endpoint or local server) |
| `context_window` / `max_output` | resolved limits feeding `16` budget arithmetic |
| `tool_calling` | none · basic · parallel |
| `reasoning_modes[]` | which normalized effort levels the model supports |
| `vision` | image input support (feeds `24`) |
| `streaming` · `structured_output` | transport/normalization flags |
| `cost {in, out}` | catalog values; estimates only |
| `latency_class` | local · fast · standard · slow (ranking input) |
| `locality` | `local` · `cloud` (privacy-relevant flag) |
| `tokenizer` | tokenizer ref used for budget estimation |

**Catalog sources:** cloud catalog data (models.dev-class; *data, not runtime*) + local discovery + manual entries. Offline behavior: vendored snapshot + local scan; no model available ⇒ typed `Unavailable` with guidance.

## 3. Router (CTR-014)

```
resolve(preferences, constraints) → ModelSelection
```

Inputs: agent-profile default · session override · task requirements (vision? tools? reasoning? context size?) · policy (models/providers allowed per scope, `12`) · availability/health · preference weights (cost · latency · locality). Ranking is deterministic and audited; a fallback chain is declared per selection. Degrade rules are explicit: if a requirement cannot be met (e.g. vision needed, none available), the result is `GuidanceRequired`/`RequiresUserAction` — never a silent capability downgrade.

The resolved window feeds the `16` pre-turn feasibility check (`window − reserves`); router and context share the same constants.

## 4. Adapters & auth

- **Adapter kinds:** cloud-native shapes + OpenAI-compatible; local servers (probe + list); embedded runtimes later.
- **Auth:** vault `use`-style references only (CTR-013, INV-02); endpoint config carries secret *refs*; keys never appear in logs, prompts, or telemetry.
- **Streaming:** one typed chunk vocabulary shared with `15` §4 (message deltas · tool-call deltas · usage · errors); cancellation and backpressure are mandatory adapter behaviors.
- **Retries:** bounded, typed (`10` §3); non-stream requests carry idempotency keys.

## 5. Reasoning mapping

Normalized dial: `auto · minimal · low · medium · high · extra_high` → provider-specific parameters (e.g. `reasoning_effort`; a local model's thinking budget). The model's descriptor declares which levels exist; the UI renders only supported levels (composer capability negotiation, `AGENTCOWORK-UI.md`). Raw chain-of-thought is **never** placed in the transcript — the user sees plan/status/tool activity (UI policy).

## 6. Local discovery & first-class locality

- Probe common local endpoints (Ollama, LM Studio, vLLM, llama.cpp, generic OpenAI-compatible), list models, health-check, and register them like any other provider.
- The common path requires no manual configuration (“pick a model and run”); manual entry exists as a fallback.
- `locality: local` models carry a privacy guarantee: no egress leaves the machine (enforced by `12`).

## 7. Accounting

Usage events → `30`: tokens in/out · cost estimate · latency · model id · work/session refs. Per-work ceilings are enforced by `11` §5. **No prompt or completion content in telemetry.**

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Provider/model down | Router failover per chain; backoff; typed `Unavailable`. |
| Window mismatch vs estimate | `16` feasibility path (compact/refuse before send). |
| Tool calling unsupported | Capability subsetting / agent adaptation (never silent tool emulation). |
| Rate limits | Backoff + queue; surfaced; per-work budget protects cost. |
| Local server version drift | Health re-probe; descriptor refresh; degraded marking. |
| Cost surprise | Ceilings pause work and surface (no silent overrun). |
| Reasoning param unsupported | Descriptor declares support; unsupported levels are not offered. |

## 9. Interop

**Depends on:** `10` · `12` (vault/policy) · `16` (constants/tokenization) · `30` (events).
**Exposes to:** `15` · `17` (extractor selection) · `20` · `24` (vision models) · UI (model picker via `32`).
**DAG check:** the model plane never calls agents; it serves them.

## 10. Open questions (`OQ-MODEL-*`)

1. Catalog sync policy: fetch cadence, offline snapshot strategy, staleness tolerance.
2. Reasoning-param behavior on models that partially support levels (ignore vs map vs error).
3. Tokenizer strategy details (shared with OQ-CTX-03): per-provider tokenizers vs conservative estimates.
4. Which local models qualify for the vision rung (`24` decision).
5. Embedding-model support: register now for future memory retrieval (U1) or later?
6. Multi-modal input scope for v1 (images for vision; audio/video later).

## 11. Evidence

Product-owner brief (ModelAdapter surface, local model UX, model independence) · `agent-harness-verification.md` §A1 (resolved window; pre-turn feasibility; anchors `codex-rs/core/src/session/mod.rs:4560-4587`), §C1 (keep/buffer/reserve vocabulary) · `ARCH/06-DATA-MODEL.md` DM-025 · `ARCH/07-CONTRACTS.md` CTR-014 · `ARCH/16-CONTEXT.md` §3 · `ARCHIVE/v1-research/memory.md` §7 (extraction model = disclosure boundary).
