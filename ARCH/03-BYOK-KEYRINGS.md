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
