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
- `cooldown_until`: set on **429 only**; exponential backoff (`Retry-After` or `COOLDOWN_BASE_SECS × 2^failures`, cap 5min). Generic 5xx does **not** set cooldown. 401/403 suspends the key.
- `fail_count / success_count / tokens_day / cost_day`: rolling usage (used for least-used routing + the token-economy telemetry, 05)
- `last_used_at`: LRU ordering

**Resolver order on a call (all in Rust everyaios-vault — coordinator asks, vault returns one resolved key):**
1. Drop keys in cooldown / suspended / past daily user-set cap.
2. Choose by policy: `priority` (status order then weight) · `round-robin` (LRU last_used) · `least-used` (tokens_day). Default: priority with weight.
3. If a model_filter excludes the requested model, skip.
4. Return `(key_id, redacted_key)` — the coordinator sees only the key id + a sealed handle; the raw key is injected into the HTTP request by the vault's own fetch layer (CES-style, v2.0 §P8) so the sidecar never holds it in memory longer than the request.
5. **On failure — honest taxonomy (user-locked 2026-09-10; live broker already matches 429 vs 5xx):**
   - **429:** mark failure → cooldown (`Retry-After` if present, else `COOLDOWN_BASE_SECS × 2^failures`, cap 5 min) → **immediately retry with the next key**. After cooldown the **first (priority) key is eligible again**. Max switches per call: `max_429_switches` (default 3).
   - **401/403:** suspend that key (likely revoked), alert the user, try the next key if one exists.
   - **Generic 5xx:** do **not** rotate. Retry the same key with bounded backoff, then surface. The origin is down; other keys hit the same host.
   - **408/timeout:** retry the same key once; not a 429.
6. **On success**: success_count++, update usage; if the previous key was mid-cooldown from earlier, keep its cooldown (don't promote mid-call).

## 3.2 What the user sees (UI)

- **Providers page (Settings → Providers / BYOK):** searchable catalog list (logo + name + **+**). **+ opens a Provider activate screen** (new screen): models.dev **name / package (`npm`) / API (`api`) / docs (`doc`)**; then a key bar (Enter → MetadataOnly verify → **green tick**); **on tick, a + below that bar** for the next key (A2). Below: default-model **dropdown** + **full models.dev model table** (name, id, context, output, price, reasoning, tool_call, images, …). Custom inference is an **Add custom** form (OpenCode-shaped) then the same screen shape. **OpenCode is three list rows:** Zen · Go · Free. NVIDIA sits on the same list.
- **Per-key live status**: health (last 429/OK), tokens/day, est. cost/day, cooldown countdown, verified tick. One glance shows which account is doing the work.
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
- **OpenCode Zen free path (keyless):** on `opencode.ai/zen/v1` for `*-free` / `big-pickle`, send **no Authorization**. Gate is **`x-opencode-session`** (stable per conversation) plus `x-opencode-request` / `x-opencode-client` / `User-Agent: EveryAIOS/<version>`. Missing session → 400 `MissingSessionID`. Paid Zen still uses a vault key. Live broker today injects `traceparent` only.

## 3.5 Provider inventory (from doc 19 + ledger)

**Provider set (user-locked 2026-09-10):** **all models.dev providers** (catalog data, 4h scheduled refresh from `https://models.dev/api.json`) **+ OpenCode-shaped custom inference** (format dropdown + optional key + headers/body/temp/models) **+ NVIDIA / NIM + three OpenCode rows (Zen `opencode` / Go `opencode-go` / Free `opencode-free`)** **+ OAuth ids when flagged + Ollama/llamafile/LM Studio/llama.cpp**. Adding a models.dev provider is a catalog refresh, not a crate. Custom inference is a `ProviderProfile` write, not a new broker branch. Live choke point until P55.5/P55.6: `Broker::DEFAULT_BASE_URLS` is still a handful of URLs — that is a bug vs this inventory, not a reduced product. Catalog 4h job + Providers +/verify/tick UI = P56.

## 3.6 Failure taxonomy (no-failures goal, edge cases)

| Error | Meaning | Action |
|---|---|---|
| 429 | rate-limited (this key/account) | cooldown (`Retry-After` or 5s×2^n cap 5min) + immediate next key; after cooldown **retry the first (priority) key**; if all keys 429 → exponential backoff, retry same call |
| 401/403 | bad/revoked key | suspend key, alert user (UI banner "Key X rejected by provider — check it"), next key if any |
| generic 5xx / 520 | origin down (not this key) | **do not rotate.** backoff + retry **same** key, then surface. Live `broker.rs` already: HTTP 500 counts failure, no cooldown, no next-key |
| 408 / timeout / EOF mid-stream | connection drop | retry **same** key once; if partial stream: resumable-streams UI + retry idempotent calls only (never retry a mutating tool) |
| context_length_exceeded | wrong model for payload | compaction (05) + retry once with snip |
| max switches exhausted | all keys 429/suspended | surface aggregated error, offer "retry in Ns" |
| network down | offline | queue intent, notify, resume on reconnect (doc 03 resume) |

## 3.7 Routing vocabulary + catalog long-tail (doc 58/59 — OmniRoute deep-dive)

OmniRoute (46.9K⭐, MIT) is the production reference for the *dynamic* selection layer our A3/A7 key-ring lacks. **Reimplement in the Rust broker; do not vendor.**

- **Failover upgrades (A3):** `lkgp` (sticky to last-good key — we currently rotate on 429 but don't *prefer* the last-good), `reset-aware`/`headroom` (pick the key whose quota window is most favorable, not just "not rate-limited"), `cache-optimized` (route to the key holding the prompt-cache prefix → A9 cache_read hits). Circuit-breaker health = 3-state CLOSED/HALF_OPEN/OPEN.
- **Dynamic scorer (A7):** 13-factor `DEFAULT_WEIGHTS` (health 0.20 / quota 0.15 / costInv 0.15 / latencyInv 0.12 / taskFit 0.08 / …) + 4 mode packs (ship-fast / cost-saver / quality-first / offline-friendly) + `auto/category:tier` model-id DSL — the *static* planner/subagent/writers roles gain a dynamic picker. **Honesty (v3.39 → v3.55):** `tier.rs` holds only the strategy vocabulary (`lkgp` parse exists) and the 13-factor OmniRoute scorer stays vocabulary-only — never a public strategy. The *consensus* scorer is live: `everyaios-core::routing::Scorer::score` (ARCH/03 weights) + `RouteDecision`/`ProviderObservation` landed, and coordinator `router.ts` ports the exact algorithm (`scorerScore`/`routeDecision`); `observations.ts` records one observation per completed/errored turn and `chat.ts` feeds `currentObservations()` into `selectModelForTask` — the live loop is `ProviderObservation` history → scorer → `RouteDecision`. **Durable (v3.55+):** the ring survives restarts — vault `recent_usage()` (`token_usage` ledger) → core `usage/recent` request → `hydrateObservations()` at coordinator boot (durable rows = successes with measured cost; live this-process keys never overwritten). Without any observations the router falls back to capability-filter + cost-sort (honest floor). Extra OmniRoute modes (round-robin/p2c/fusion/pipeline) stay internal scoring factors, not public architecture.
- **Per-request budget (J11):** `X-OmniRoute-Budget` + `-Fallback: cheapest|strict→402` = the per-request USD ceiling our session-$-cap lacks.
- **Catalog long-tail (A6):** ingest the MIT `PROVIDER_REFERENCE.md` (339 providers) as *data* — import API-key + local + keyless allow-list only. The 34 cookie + 25 OAuth-CLI classes are the **doc-57 reject list** (Claude Code/Codex/Copilot drive via F12/ACP, not the vault). New A4 *candidates* (each doc-57-checked): Amazon Q, GitLab Duo, Kiro ⚠️-ToS, Trae, Windsurf, Zed-hosted, Kimi Code.
