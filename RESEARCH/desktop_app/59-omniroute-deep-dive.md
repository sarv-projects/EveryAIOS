# 59 — OmniRoute Deep-Dive (routing + scoring business logic)

> Added 2026-08-13. Source-level read of OmniRoute's routing internals (`docs/routing/AUTO-COMBO.md`, `PROVIDER_REFERENCE.md`, README) — extracted for **steal/reimplement**, not vendor. 46,937⭐, MIT, pushed 2026-08-13.
> **This is the business-logic spec for our A2/A3/A6/A7/A9/P6.10/J11.** Every weight below is a *reimplementable* number, not a copy-paste of their code.

---

## 1. What it is (architecture)

A local, single-tenant Next.js gateway + dashboard exposing **one OpenAI-compatible endpoint** (`/v1/*`) in front of 339 providers / 1200+ models. Key structural facts:

| Fact | Detail | Our analogue |
|---|---|---|
| Endpoint | `http://localhost:20128/v1` — one base URL for every client | our broker (vault) owns the single HTTP socket (ARCH/06 §6.9) |
| Tenant model | **single-tenant, no `users` table** — `apiKeyId` is the per-caller identity | our per-key identity (A2) |
| Catalog | `src/shared/constants/providers.ts` → auto-gen `PROVIDER_REFERENCE.md` | our A6 catalog (needs the long tail) |
| Router | `src/sse/handlers/chat.ts` detects `auto/` → virtual combo | our A7 tier router |
| Scoring | `open-sse/services/autoCombo/scoring.ts` (`DEFAULT_WEIGHTS`) | our A7 selection |
| Strategies | `src/shared/constants/routingStrategies.ts` (19) | our A3/P6.10 failover |
| Per-request steering | `requestControls.ts` (pure fn) → mode/budget headers | our J11 hard $ cap |

**File map to read if we ever fork the idea** (all under `open-sse/services/autoCombo/`): `autoPrefix.ts` (parse `auto/coding:fast`), `virtualFactory.ts` (in-memory combo, **zero DB writes**), `modePacks.ts` (4 weight profiles), `scoring.ts` (13-factor), `requestControls.ts` (headers), `candidateOverrides.ts` (per-key exclusions, fail-open).

---

## 2. The 13-factor scoring — STEAL the numbers (A7)

`DEFAULT_WEIGHTS` in `scoring.ts`, validated to sum 1.0 by `validateWeights()`:

| Factor | Weight | What it measures |
|---|---|---|
| `health` | **0.20** | Circuit-breaker state: CLOSED=1.0, HALF_OPEN=0.5, OPEN=0.0 |
| `quota` | **0.15** | Remaining quota / rate-limit headroom [0..1] |
| `costInv` | **0.15** | Inverse **blended** cost = 60% input + 40% output token price, normalized |
| `latencyInv` | **0.12** | Inverse p95 latency, normalized to pool |
| `taskFit` | **0.08** | Task-type fitness (coding/review/planning/analysis/debugging/docs) |
| `stability` | **0.05** | Latency stdDev / error rate (variance) |
| `tierPriority` | **0.05** | Account tier: Ultra=1.0, Pro=0.67, Standard=0.33, Free=0.0 |
| `tierAffinity` | **0.05** | Candidate tier ↔ manifest-recommended tier affinity |
| `specificityMatch` | **0.05** | Request specificity ↔ model tier match |
| `contextAffinity` | **0.05** | Request context-window need ↔ model context window |
| `connectionDensity` | **0.05** | Spread load across connections of same provider (anti-concentration) |
| `cacheAffinity` | 0.00 | Rendezvous-hash toward the connection likeliest to hold this prompt-cache prefix — **disabled by default** (#8008) |
| `resetWindowAffinity` | 0.00 | Bias toward connections whose quota reset is favorable |

**Steal for A7 asymmetric tiering:** our current A7 is planner_model/subagent_models/depth=2/concurrency=6/writers=3 — *static*. This 13-factor weighted scorer is the **dynamic** selection we're missing. We don't need all 13: **health + quota + costInv + latencyInv + taskFit** (0.70 of the weight) is already an excellent A7 default. `health` = exactly our A3 cooldown state; `contextAffinity` = our P1.9 ctx-window warning turned into a *routing* signal.

---

## 3. Mode packs — STEAL the weight tables (A7 / P6.10)

Four pre-set profiles in `modePacks.ts` — each overrides `DEFAULT_WEIGHTS`:

| Factor | ship-fast | cost-saver | quality-first | offline-friendly |
|---|---|---|---|---|
| quota | 0.14 | 0.14 | 0.10 | **0.37** |
| health | 0.28 | 0.19 | 0.18 | 0.28 |
| costInv | 0.05 | **0.37** | 0.05 | 0.10 |
| latencyInv | **0.32** | 0.05 | 0.05 | 0.05 |
| taskFit | 0.10 | 0.10 | **0.37** | 0.00 |
| stability | 0.00 | 0.05 | 0.15 | 0.10 |
| tierPriority | 0.05 | 0.05 | 0.05 | 0.05 |

(absent factors are `?? 0`.) **Steal directly as our A7 "mode" enum** — this maps 1:1 onto our P6.10 shortest-path + "auto/coding vs auto/fast vs auto/cheap" idea. ship-fast ↔ our "latency first", cost-saver ↔ A9 budget, quality-first ↔ coding, offline-friendly ↔ local models.

---

## 4. Category × tier composition — STEAL the model-ID DSL (A7)

`auto/<category>:<tier>` resolves on demand (`parseAutoPrefix`):
- **Categories** (filter pool): `coding` · `reasoning` · `vision` · `chat` · `multimodal`
- **Tiers** (pick weights/pool): `fast` · `cheap`(=`floor`) · `reliable` · `free` · `pro`
- **Fail-open:** if a constraint matches nothing, use the full pool (routing never breaks).

Examples: `auto/coding:fast`, `auto/reasoning:pro`, `auto/multimodal:free`. A curated subset is advertised in `/v1/models` (`AUTO_SUFFIX_VARIANTS` in `builtinCatalog.ts`); **live Arena-ELO + models.dev tier data** inform fitness when `ARENA_ELO_SYNC_ENABLED`.

**Steal for A7:** a `model:` string that encodes *capability* and *optimization goal* — this is a cleaner model-selection UX than our flat "planner/subagent/writers" roles. One-line addition to the A6 catalog hints.

---

## 5. Per-request steering headers — STEAL for A9/J11 (budget)

Three headers steer an `auto` combo per request (pure fn `requestControls.ts`, no config mutation):

| Header | Effect |
|---|---|
| `X-OmniRoute-Mode` | override scoring pack (fast/balanced/quality/cheap/reliable/offline) |
| `X-OmniRoute-Budget` | hard USD ceiling per request — over-budget candidates filtered before selection |
| `X-OmniRoute-Budget-Fallback` | `cheapest` (fall back to global cheapest, legacy) vs `strict` (refuse → **HTTP 402**, no silent overspend) |

**Steal for J11 (hard $ budget):** our J11 kills the sidecar on budget exceed. OmniRoute's finer-grained contract — *per-request* USD cap + a **cheapest-vs-strict fallback** — is the missing middle layer: a $2/session budget should *also* be able to say "this one request must stay under $0.05, else 402". `X-OmniRoute-Decision` (strategy/provider/latency per response) is the matching observability header.

---

## 6. 19 routing strategies — the full vocabulary (A3/P6.10)

`routingStrategies.ts` → `ROUTING_STRATEGY_VALUES`:

`priority` · `weighted` · `round-robin` · `context-relay` (hand off context across targets) · `fill-first` · `p2c` (power-of-two) · `random` · `least-used` · `cost-optimized` · `reset-aware` (⭐ short reset windows ranked higher) · `reset-window` · `headroom` (most remaining quota) · `strict-random` · `auto` (13-factor scoring, recommended) · `lkgp` (last-known-good-path, sticky) · `context-optimized` · `cache-optimized` (reorder by prompt-cache affinity) · `fusion` (panel + judge) · `pipeline` (chain steps).

**Steal for A3:** our failover today = "429 → cooldown → next key". Three upgrades from this list:
1. **`lkgp`** — default-sticky to last successful key (we don't do this).
2. **`reset-aware` / `headroom`** — pick the key whose *quota window* is most favorable, not just "not currently rate-limited".
3. **`cache-optimized`** — route to the key holding the cached prefix (→ A9 cache_read hits).

---

## 7. Provider catalog + taxonomy — STEAL the list (A1/A4/A6)

339-provider machine-readable catalog (`PROVIDER_REFERENCE.md`, v3.8.50, generated, MIT). Categories with per-provider **auth flow + tool-calling mode** (native / emulated-regex / none):

- **OAuth (23):** antigravity, amazon-q, claude, cline/clinepass, codex, cursor, devin-cli, github/ghe-copilot, gitlab-duo, grok-cli, kilocode, kimi-coding, kiro ⚠️-ToS, qoder, trae, windsurf, xai-oauth, zed, zed-hosted, codebuddy-cn, antigravity-cli
- **Web cookie (31):** chatgpt-web, claude-web, gemini-web, grok-web, kimi-web, qwen-web, perplexity, poe, v0, notion-ai, meta-ai, huggingchat, lmarena, … — ⚠️ **same ToS class as doc 57 (subscription session harvest)**
- **API key (195):** the long tail (360 AI, Aion, Ant Ling, b.ai, Baichuan, Bailian, BytePlus Ark, Cerebras, Charm Hyper, ClinePass, …)
- **Local / Search / Audio / Upstream-proxy / Cloud-agent / System**

**Action (the user's "add all from here"):** ingest this catalog as the **A6 long tail + A4 candidate list**. We keep only our auth policy: import providers freely; treat the "web cookie" class under the doc-57 subscription-auth rule (user-driven, flag-gated, ToS-noted — never a default).

---

## 8. What we deliberately do NOT copy

1. **The single-tenant hosted-gateway trust model** — OmniRoute centralizes keys into one endpoint. Ours is the opposite: BYOK key-ring where the Rust vault resolves the key and the sidecar never holds it (ARCH/06 §6.9). We steal the *routing/scoring*, keep our *key-handling*.
2. **Web-cookie provider harvest** — doc 57 §3 boundary unchanged.
3. **The dashboard's "free tiers aggregated" number** — marketing, not architecture.

---

## 9. Steal → code mapping (concrete, ready to implement)

| OmniRoute internals | → our capability | Concrete change |
|---|---|---|
| 13-factor `DEFAULT_WEIGHTS` | A7 | add a weighted scorer (health/quota/cost/latency/taskFit) to the A7 router |
| 4 mode packs + weight tables | A7/P6.10 | add `mode` enum to tier routing (fast/cheap/quality/offline) |
| `auto/category:tier` DSL | A7/A6 | extend model catalog hints with category+tier resolution |
| `X-OmniRoute-Budget[-Fallback]` | J11/A9 | per-request USD cap + cheapest-vs-strict (402) fallback |
| `lkgp` / `reset-aware` / `headroom` / `cache-optimized` | A3/A9 | upgrade failover from "429→next" to sticky + quota-aware + prefix-pinned |
| `cacheAffinity` rendezvous-hash | A9 | route to the connection holding the prompt-cache prefix (cache_read hits) |
| circuit-breaker health scoring (CLOSED/HALF_OPEN/OPEN) | A3 | formalize our cooldown as a 3-state breaker |
| `X-OmniRoute-Decision` header | broker | emit routing decision metadata per response (cheap observability) |
| provider taxonomy + 339-provider catalog | A6/A4/A1 | ingest as A6 long tail + A4 OAuth candidates (keep auth policy) |

All of it is **reimplement-in-Rust** (our broker/router is Rust; OmniRoute is Next.js) — no code import, pure logic extraction.
