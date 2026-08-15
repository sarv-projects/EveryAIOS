# Doc 66 — anomalyco Org Deep-Dive: models.dev Catalog + opencode + opentui (2026-08-15)

**Scope:** the anomalyco org's main repos — **opencode** (197,724★), **models.dev** (6,413★), **opentui** (13,015★), **sst** (26,234★) + **openauth** (7,339★, bonus REF).
**Method:** GitHub API live-verified; **models.dev + opentui cloned + source-read**; opencode re-verified (already ⬛ source-read, doc 38); sst/openauth README-level.
**Headline:** `models.dev` is a **direct MIT-licensed steal** for our A6 model catalog + A9 cost engine — an open database of AI model capabilities, pricing (incl. cache-read/write), and limits with a two-tier **lab-vs-provider** schema that is *exactly* our model-family-adapter vs transport-provider-adapter split.

---

## §0 — Verdict summary

| Repo | ⭐ | License | Verdict | Maps to |
|------|----|---------|---------|---------|
| anomalyco/models.dev | 6,413 | MIT | **STEAL (direct data source + schema)** | A6, A9, A2/A3, A7, J11 |
| anomalyco/opencode | 197,724 | MIT | already tracked (⭐ refresh 194K→197.7K; re-read doc 38) | F12, P6, A9 |
| anomalyco/opentui | 13,015 | MIT | REF | P11.5 terminal panel |
| anomalyco/sst | 26,234 | MIT | SKIP (cloud infra IaaC — out of scope) | — |
| anomalyco/openauth | 7,339 | MIT | REF | A2/A4 OAuth + key-ring |

**Ledger:** 274 → **278** (+4: models.dev, opentui, sst, openauth; opencode already tracked).

---

## §1 — models.dev: the steal (cloned + source-read)

`models.dev` = "an open database of AI model capabilities, pricing, and limits" — the catalog behind opencode's model picker. **MIT**, catalog-only repo (`AGENTS.md`: "Catalog-only. This file is how to add and maintain models and providers. Nothing else."). Exactly what our A6 row needs — and far richer than the current pi.dev catalog (15 prov / 280 models).

### 1.1 The two-tier schema (the architectural gold)

The repo splits model data into **two concepts** — this is the concrete data model for our model-family vs provider separation:

| | Lab model metadata | Provider model |
|---|---|---|
| **What** | provider-agnostic facts about a model the lab built | how a specific API host serves that model |
| **Where** | `models/<lab-id>/<model-id>.toml` | `providers/<provider-id>/models/.../<id>.toml` |
| **Contains** | name, description, capabilities, modalities, limits, weights, knowledge cutoff | `cost`, `reasoning_options`, `status`, request shape, **and only real overrides** |

**`base_model` inheritance (blocker rule):** *"If the provider did not create the model, the provider entry must use `base_model`."* → `base_model = "anthropic/claude-opus-4-6"`, provider file stays **override-only** (cost/reasoning/status). This is the exact "canonical model layer + per-host overrides" design our earlier model-agnostic architecture discussion called for — now with a production schema to copy.

### 1.2 Provider model TOML (the shape)

```toml
name = "Claude Haiku 4.5"
family = "claude-haiku"
release_date = "2025-10-15"
last_updated = "2025-10-15"
attachment = true          # multimodal input
reasoning = true
temperature = true
tool_call = true
structured_output = true
knowledge = "2025-02-28"
open_weights = false
base_model = "anthropic/claude-haiku-4-5"

[[reasoning_options]]
type = "effort"            # or budget_tokens / min = 1024
values = ["low", "medium", "high", "xhigh", "max"]

[cost]
input = 1                  # $/MTok
output = 5
cache_read = 0.1
cache_write = 1.25

[limit]
context = 200_000
output = 64_000

[modalities]
input = ["text", "image", "pdf"]
output = ["text"]
```

Strict schema — unknown keys fail `bun validate`.

### 1.3 The compiled catalog (`models.json` — 432KB, 364 entries)

Per entry: `id` (`provider/model`), `canonical_slug`, `hugging_face_id`, `name`, `description`, `context_length`, `architecture` (`modality` `text+image+file->text`, `input_modalities`, `output_modalities`, `tokenizer`, `instruct_type`), **`pricing`** (`prompt`, `completion`, `web_search`, `input_cache_read`, `input_cache_write` — per-token strings), `top_provider` (`context_length`, `max_completion_tokens`, `is_moderated`), `per_request_limits`, **`supported_parameters`** (`include_reasoning`, `max_tokens`, `reasoning`, `response_format`, `stop`, `structured_outputs`, `tool_choice`, `tools`, `verbosity` — the capability proxy), `default_parameters` (`temperature`, `top_p`, `top_k`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`), `supported_voices`, `knowledge_cutoff`, `expiration_date`, `links`.

**186 providers** (openai, anthropic, google, deepseek, alibaba, xai, mistral, openrouter, perplexity, novita-ai, siliconflow, zhipuai, minimax, stepfun, … — full eastern-model coverage), **364 model entries**.

### 1.4 The sync automation (the "live registry" pattern)

`packages/core/src/sync/` — **30 per-provider sync modules** (`anthropic.ts`, `openai.ts`, `openrouter.ts`, `google.ts`, `xai.ts`, `deepinfra.ts`, `cloudflare-workers-ai.ts`, …). `bun models:sync <provider>`:
- runner reads existing TOML, resolves `base_model`/`base_model_omit`, fetches provider source data, **translates each source model into the catalog schema**, validates (`AuthoredModel`), formats, writes
- `--dry-run` / `--new-only` flags; **CI syncs each provider separately → each gets its own reusable automation PR** (`automation/sync-models-*` branch naming seen in workflows); opens GitHub issues for missing models; writes `.sync/model-sync-report.md` as the PR body
- `bun validate` gates every PR; `close-stale-pull-requests` + `publish-sdk` cron workflows keep the catalog + `@opencode-ai/models` SDK fresh

This is the "live capability-and-cost registry, updated continuously, quality-gated" pattern our routing layer needs — with the automation machinery spelled out.

### 1.5 The SDK

`@opencode-ai/models` — typed client for the models.dev API (MIT). We'd write the Rust equivalent (`everyaios-catalog`) that parses the vendored `models.json` (or a slimmer derived subset) into our canonical `ModelEntry` struct.

---

## §2 — opencode re-verify (already tracked)

197,724★ (⭐ refresh from 194,005). Already ⬛ source-read (doc 38: task-tool subagents, per-message token schema, compaction PRUNE_PROTECT, stats aggregation). No new steals this pass — the models.dev two-tier schema it consumes is the actual new takeaway.

---

## §3 — opentui (REF)

**Zig-native terminal UI core, C ABI, TypeScript bindings** — powers opencode's TUI in production. Packages: `@opentui/core` (Zig core + imperative API), `@opentui/react`/`@opentui/solid` (reconcilers), `@opentui/three` (WebGPU renderer), `@opentui/keymap` (command/keybinding/sequence engine). For our Tauri desktop app the TUI itself is not a fit (we render in the webview), but:
- **`@opentui/keymap`** — shared command/keybinding/sequence engine is a small steal for our keyboard-shortcut system
- Native-core-with-language-bindings architecture = validation of our Rust-core + TS-sidecar split (same shape, different boundary)

---

## §4 — sst (SKIP)

26,234★ full-stack cloud-infra framework (IaaC on AWS) — out of scope for a local-first desktop agent. Noted, not stolen.

---

## §5 — openauth (REF)

7,339★ MIT auth framework (universal OAuth/OIDC, issuer-per-app). Confirms our A2/A4 key-ring/OAuth design (PKCE/device-code); the issuer-per-app model is a useful reference for our credential broker (doc 53). No code steal.

---

## §6 — Landing map

| Steal | Row | Note |
|-------|-----|------|
| **models.dev catalog (186 prov / 364 models, MIT, `models.json`)** | **A6 extended** | vendored baseline catalog → `everyaios-catalog`; replaces pi.dev as the default; BYOK providers added as overrides |
| **two-tier lab/provider schema + `base_model` inheritance** | A6 + A7 | canonical model layer + per-host override-only — concretizes the model-family vs transport-provider adapter split |
| **pricing incl. `input_cache_read`/`input_cache_write`** | **A9 extended** | per-model cache economics for the 3-layer cache stack + routing |
| **`supported_parameters` / `architecture` capability flags** | A7 | routing filter matrix (tools/structured_outputs/reasoning/modalities/context) |
| **30-provider sync automation + `bun validate` gate** | A6 + J11 | per-provider CI PRs + validation gate = our live-registry maintenance loop |
| `@opentui/keymap` | P11.5 | keybinding/sequence engine for the desktop UI |
| openauth issuer-per-app | A2/A4 | credential-broker reference |

---

## §7 — Honest status

- **STEAL is direct**: `models.json` is MIT, data-as-product, designed for embedding (SDK exists). We can vendor it as the baseline catalog and keep the two-tier schema for BYOK/provider overrides.
- **Implementation queued**: TODO P14 (catalog ingest + two-tier schema + pricing → A6/A9/A7/J11 wiring). The `everyaios-catalog` crate is the target; sync automation = a maintenance loop, not a v1 blocker.
- opencode ⭐ refresh noted in the ledger; no code changes this pass.
