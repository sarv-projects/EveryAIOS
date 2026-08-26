# 03 — BYOK Key-Rings: Multiple Keys per Provider, Fallback Rotation

> **The user requirement, verbatim:** *"for BYOK, under each provider, add an option that multiple keys under each provider can be added. Each acts as a fallback — as soon as one rate-limits, switch. Technically users can have multiple accounts without ever changing keys."*
> This doc is the design. Patterns sourced from: LiteLLM key management (web, 2026), OpenRouter multi-BYOK (web), pi + `pi-keyrouter` (doc 19 §1), Reasonix cost discipline (doc 05 §6), BrowserOS OAuth token store (doc 33 §7.4), vault/CES (doc 19 §7, v2.0 §P8).

## 3.1 The model: provider → key pool → routing

```
everyaios-vault (SQLCipher)
└── providers.toml
    ├── anthropic
    │   ├── keys: [ {id: k1, status: primary, weight: 1.0, used_today: 12.4M tok, cooldown_until: null},
    │   │           {id: k2, status: standby, weight: 0.5, ...},
    │   │           {id: k3, status: backup, ...} ]
    │   └── policy: { failover: "auto", order: "priority|round-robin|least-used", cooldown_s: 60, max_429_switches: 3 }
    ├── openai            (same shape; + model filter per key)
    ├── openrouter        (same shape)
    ├── deepseek          (same shape)
    ├── gemini / azure / bedrock / openai-compatible×N   (base_url per provider entry)
    └── oauth: { chatgpt-pro: {tokens: [...], provider: openai}, copilot: {...}, qwen: {...} }
```

**Key semantics (per key, stored in vault):**
- `status`: `primary | standby | backup | suspended` (manual or auto)
- `weight`: routing weight (default 1.0; user can down-weight a key)
- `model_filter`: optional — restrict key to certain models (OpenRouter model-filter pattern)
- `cooldown_until`: set on 429/401/5xx; exponential backoff (cooldown_s × 2^failures, cap 5min)
- `fail_count / success_count / tokens_day / cost_day`: rolling usage (used for least-used routing + the token-economy telemetry, 05)
- `last_used_at`: LRU ordering

**Resolver order on a call (all in Rust everyaios-vault — coordinator asks, vault returns one resolved key):**
1. Drop keys in cooldown / suspended / past daily user-set cap.
2. Choose by policy: `priority` (status order then weight) · `round-robin` (LRU last_used) · `least-used` (tokens_day). Default: priority with weight.
3. If a model_filter excludes the requested model, skip.
4. Return `(key_id, redacted_key)` — the coordinator sees only the key id + a sealed handle; the raw key is injected into the HTTP request by the vault's own fetch layer (CES-style, v2.0 §P8) so the sidecar never holds it in memory longer than the request.
5. **On failure** (`429 Too Many Requests`, `401/403` invalid, `5xx`): mark failure → set cooldown (429: cooldown_s; 401: suspend until user re-enters key — likely revoked) → **immediately retry with the next key** (not after the full timeout — LiteLLM failover + OpenRouter fallthrough pattern). Max switches per call: `max_429_switches` (default 3) then surface the best error.
6. **On success**: success_count++, update usage; if the previous key was mid-cooldown from earlier, keep its cooldown (don't promote mid-call).

## 3.2 What the user sees (UI)

- **Providers page**: for each provider, an **add-key list** (name the account, e.g. "Work OpenAI", "Personal OpenAI"), paste key, optional model filter, optional monthly budget, test button.
- **Per-key live status**: health (last 429/OK), tokens/day, est. cost/day, cooldown countdown. One glance shows which account is doing the work.
- **Reorder/drag**: drag keys to change priority; toggle a key to standby/suspend.
- **Auto-pause on budget**: per-key daily/monthly cap → automatically suspended until reset (LiteLLM budgets, adapted locally).
- **OAuth subscriptions** (chatgpt-pro/copilot/qwen) live in the same list as "subscription keys" — same fallback semantics (BrowserOS pattern, doc 33 §7.4), with encrypted refresh tokens in the vault.
- **ChatGPT Pro backend note (2026-08-13):** the `chatgpt-pro` provider calls `https://chatgpt.com/backend-api/codex/v1` — the unofficial web-app backend (`broker.rs` `DEFAULT_BASE_URLS`), same ToS class as the Claude-harvest boundary doc 57 blocks. **Kept** (the user's own subscription, driven like Hermes/OpenCode treat it — no extra machinery), flag-gated by `EVERYAIOS_OAUTH`; the risk is documented, not hidden (SPEC A4, ARCH/09 A4, doc 57 §3).

## 3.3 Multi-account reality (the user's actual ask)

- User has 2 OpenAI accounts with keys → two entries under `openai` → both active, weighted round-robin/priority → **no manual switching ever**.
- Rate limits are per-account, so a 429 on account A immediately rolls to B; if B also 429s, backoff + retry after the max switches.
- The same works for Anthropic, OpenRouter (including OpenRouter's own BYOK multi-key with Prioritized/Fallback sections), DeepSeek, and any OpenAI-compatible endpoint (Ollama keys are effectively unlimited → always primary for local models).

## 3.4 Consistency with the rest of the system

- **Cache discipline note (Reasonix):** rolling keys must not break prefix-cache economics. The **same model + same provider must reuse the same key for the same session** unless that key is unhealthy — otherwise provider-side prompt caching fragments across accounts. Rule: key affinity = `(provider, model, session_id)`; a key change mid-session is allowed only on hard failure, and the compaction layer treats a key change as a cache-break event (05 §5.5).
- **Cost ledger:** every call records `provider, model, key_id, in_tok, out_tok, cache_read, cache_write, cost, ttl` → the token-economy dashboard (05 §6) and the per-key budgets above share this one table (Reasonix `cacheRead/cacheWrite/cost`, pi EMPTY_USAGE pattern, doc 05).
- **Vault:** SQLCipher, single write owner (everyaios-vault), keys never logged, masked in UI, export/import encrypted (doc 19 §7, v2.0 §P8 env vault).

## 3.5 Provider inventory (from doc 19 + ledger)

Core at launch: `anthropic · openai · openai-responses · azure · bedrock · google/gemini · openrouter · deepseek · openai-compatible (any base_url) · ollama · llamafile/llama.cpp`. Stretch: `groq · cohere · mistral · together · fireworks · perplexity · qwen · glm/z.ai · kimi · minimax · novita · nvidia-nim · huggingface · localai` (all OpenAI-compatible → a config entry, not code — the Reasonix lesson: *"adding another OpenAI-compatible model is a config edit, not a code change"*, doc 05 §6).

## 3.6 Failure taxonomy (no-failures goal, edge cases)

| Error | Meaning | Action |
|---|---|---|
| 429 | rate-limited (this key/account) | cooldown + immediate next key; if all keys 429 → exponential backoff, retry same call |
| 401/403 | bad/revoked key | suspend key, alert user (UI banner "Key X rejected by provider — check it"), next key |
| 408/5xx/520 | transient provider | backoff + retry, then next key |
| timeout/EOF mid-stream | connection drop | if partial stream: resumable-streams UI + retry idempotent calls only (never retry a mutating tool); watchdog re-arm (GenOffice 60s/180s, doc 28 §3) |
| context_length_exceeded | wrong model for payload | compaction (05) + retry once with snip |
| max switches exhausted | all keys failing | surface aggregated error, offer "retry in Ns" |
| network down | offline | queue intent, notify, resume on reconnect (doc 03 resume) |

## 3.7 Routing vocabulary + catalog long-tail (doc 58/59 — OmniRoute deep-dive)

OmniRoute (46.9K⭐, MIT) is the production reference for the *dynamic* selection layer our A3/A7 key-ring lacks. **Reimplement in the Rust broker; do not vendor.**

- **Failover upgrades (A3):** `lkgp` (sticky to last-good key — we currently rotate on 429 but don't *prefer* the last-good), `reset-aware`/`headroom` (pick the key whose quota window is most favorable, not just "not rate-limited"), `cache-optimized` (route to the key holding the prompt-cache prefix → A9 cache_read hits). Circuit-breaker health = 3-state CLOSED/HALF_OPEN/OPEN.
- **Dynamic scorer (A7):** 13-factor `DEFAULT_WEIGHTS` (health 0.20 / quota 0.15 / costInv 0.15 / latencyInv 0.12 / taskFit 0.08 / …) + 4 mode packs (ship-fast / cost-saver / quality-first / offline-friendly) + `auto/category:tier` model-id DSL — the *static* planner/subagent/writers roles gain a dynamic picker. **Honesty (v3.39 → v3.55):** `tier.rs` holds only the strategy vocabulary (`lkgp` parse exists) and the 13-factor OmniRoute scorer stays vocabulary-only — never a public strategy. The *consensus* scorer is live: `everyaios-core::routing::Scorer::score` (ARCH/03 weights) + `RouteDecision`/`ProviderObservation` landed, and coordinator `router.ts` ports the exact algorithm (`scorerScore`/`routeDecision`); `observations.ts` records one observation per completed/errored turn and `chat.ts` feeds `currentObservations()` into `selectModelForTask` — the live loop is `ProviderObservation` history → scorer → `RouteDecision`. **Durable (v3.55+):** the ring survives restarts — vault `recent_usage()` (`token_usage` ledger) → core `usage/recent` request → `hydrateObservations()` at coordinator boot (durable rows = successes with measured cost; live this-process keys never overwritten). Without any observations the router falls back to capability-filter + cost-sort (honest floor). Extra OmniRoute modes (round-robin/p2c/fusion/pipeline) stay internal scoring factors, not public architecture.
- **Per-request budget (J11):** `X-OmniRoute-Budget` + `-Fallback: cheapest|strict→402` = the per-request USD ceiling our session-$-cap lacks.
- **Catalog long-tail (A6):** ingest the MIT `PROVIDER_REFERENCE.md` (339 providers) as *data* — import API-key + local + keyless allow-list only. The 34 cookie + 25 OAuth-CLI classes are the **doc-57 reject list** (Claude Code/Codex/Copilot drive via F12/ACP, not the vault). New A4 *candidates* (each doc-57-checked): Amazon Q, GitLab Duo, Kiro ⚠️-ToS, Trae, Windsurf, Zed-hosted, Kimi Code.
