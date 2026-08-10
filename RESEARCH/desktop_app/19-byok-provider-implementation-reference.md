# 19 — BYOK Provider Implementation Reference (the copy-this doc)

> Compiled 2026-08-06. Goal: **we don't build multi-provider/BYOK from scratch** — we copy the provider abstractions that pi, LiteLLM, LibreChat, AnythingLLM, and Reasonix already ship.
> For each: URL, how providers are structured (classes/packages), how BYOK keys are handled, and the exact file paths to copy from.

---

## 1. pi — `earendil-works/pi` → `@earendil-works/pi-ai` (84K⭐, TS)
- **Repo:** https://github.com/earendil-works/pi | **Package:** https://github.com/earendil-works/pi/tree/main/packages/ai
- **Structure (`packages/ai/src/`):**
  - `providers/` — per-provider adapters (each exposes the same interface)
  - `api/` — unified API surface
  - `auth/` — **`env-api-keys.ts`** (auto env-key resolution), `oauth.ts`, `bun-oauth.ts` (OAuth flows)
  - `bedrock-provider.ts` — AWS Bedrock as a peer provider
  - `model-catalog.ts` + `models.generated.ts` / `image-models.generated.ts` — **generated model catalogs** (scripts `generate-models`, `generate-image-models`)
  - `types.ts`, `index.ts`, `cli.ts`, `compat.ts`
- **Package.json exports:** main `.`, `./compat`, **`./providers/*`** (per-provider subpath imports), `./api/*`, `./oauth`, `./bedrock`.
- **Key mechanisms:** automatic model discovery + provider config; token & cost tracking (`cacheRead/cacheWrite/cost`); only tool-calling-capable models; mid-session model hand-off.
- **Copy from:** `packages/ai/src/providers/`, `auth/env-api-keys.ts`, `model-catalog.ts`.

---

## 2. LiteLLM — `BerriAI/litellm` (the gold standard, Python)
- **Repo:** https://github.com/BerriAI/litellm
- **Scale:** **132 provider dirs** in `litellm/llms/` (live dir-count as of 2026-08-06: openai, anthropic, azure, bedrock, gemini, deepseek, groq, mistral, ollama, …). Single OpenAI-format interface.
- **Entrypoint (`litellm/main.py`):** `completion()`, `embedding()`, `streaming()`, `moderation()` — one call dispatches to the right provider; uses httpx, openai, tiktoken, pydantic; internal helpers `get_litellm_params()`, `get_optional_params()`.
- **Provider layer (`litellm/llms/`):** `base.py` (base class), `custom_llm.py` (bring-your-own), one dir per provider. Each provider handles auth, request mapping, response parsing, streaming.
- **BYOK:** per-provider API keys via env vars or key params; LiteLLM Proxy exposes `/chat/completions` with `api_key` per call.
- **Copy from:** `litellm/llms/base.py`, `custom_llm.py`, and one full provider dir (e.g. `anthropic/`) as the template; `main.py` dispatch pattern.

---

## 3. LibreChat — `danny-avila/LibreChat` (provider-richest chat app)
- **Repo:** https://github.com/danny-avila/LibreChat | **Docs:** docs.librechat.ai
- **Providers (README-verified):** OpenAI, Azure OpenAI, Anthropic, Google (Gemini), Vertex AI, AWS Bedrock, OpenAI Responses API (incl. Azure), **Custom Endpoints** (any OpenAI-compatible API), Ollama, Groq, Cohere, Mistral, Apple MLX, Koboldcpp, Together.ai, OpenRouter, Helicone, Perplexity, ShuttleAI, DeepSeek, Qwen.
- **Client layer (`api/app/clients/`):** `BaseClient.js` (abstract base), `OllamaClient.js`, `TextStream.js`, `index.js`, `prompts/`, `specs/`, `tools/`.
- **BYOK:** per-user API keys managed in the UI (Users → keys), stored in MongoDB per user; global env keys as fallback. Custom endpoints need no proxy — direct OpenAI-compatible.
- **Agents (`@librechat/agents`):** packages/ = `api/`, `client/`, `data-provider/`, `data-schemas/` — no-code assistants, marketplace, MCP servers, tools, file search, code execution; **skills** (`SKILL.md` bundles, manual/automatic/always-on); **subagents** (delegate to isolated child runs).
- **Other:** Code Interpreter API (sandboxed Python/Node/Go/C++/Java/PHP/Rust/Fortran, ClickHouse-backed), image gen, STT/TTS, MongoDB + Redis scaling.
- **Copy from:** `api/app/clients/BaseClient.js` (client abstraction), `packages/data-provider/` (provider schemas), per-user key model.

---

## 4. AnythingLLM — `Mintplex-Labs/anything-llm` (64K⭐, TS)
- **Repo:** https://github.com/Mintplex-Labs/anything-llm
- **Provider dirs (`server/utils/AiProviders/` — verified ~30):** anthropic, apipie, azureOpenAi, bedrock, cerebras, cohere, cometapi, deepseek, dockerModelRunner, fireworksAi, foundry, gemini, genericOpenAi, giteeai, groq, koboldCPP, lemonade, liteLLM, lmStudio, localAi, minimax, mistral, modelMap, modelRouter, moonshotAi, novita, nvidiaNim, ollama, omlx, openAi (+ likely openRouter etc.).
- **Pattern:** one folder per provider, each implementing the same interface (chat/embed); `modelMap/` maps model ids; `modelRouter/` = the router (calculated + LLM-classified rules, doc 16). (Directory listing truncated at 30 entries this pass — possibly more providers; names past `openAi` not confirmed.)
- **Embedders mirror LLMs:** `server/utils/embedder/` has the same one-folder-per-provider shape (14 embedders).
- **Copy from:** `server/utils/AiProviders/<one provider>/` as the TS template + `modelRouter/` for routing.

---

## 5. DeepSeek-Reasonix — `esengine/DeepSeek-Reasonix` (31.4K⭐, Go, main-v2)
- **Repo:** https://github.com/esengine/DeepSeek-Reasonix
- **Provider layer (`internal/provider/`):** `provider.go` (interface), `resolver.go` (registry resolution), `retry.go`, `request_budget.go` (per-call budget), `schema_canonicalize.go`/`schema_dialect.go`/`schema_validate.go` (schema normalization across dialects), dirs `anthropic/`, `openai/`, `responses/`.
- **Registration:** blank imports + `init()` self-registration (doc 16) — adding a provider = new dir + blank import.
- **Config-driven:** TOML `[[providers]]` with `api_key_env` (env-var indirection — keys never in config file).
- **Copy from:** `internal/provider/provider.go` + `resolver.go` + one provider dir; the `api_key_env` indirection pattern.

---

## 6. cc-switch — `farion1231/cc-switch` (provider switcher across agent tools)
- **Repo:** https://github.com/farion1231/cc-switch
- **What:** "All-in-One Manager for Claude Code, Claude Desktop, Codex, Gemini CLI, Grok Build, OpenCode, OpenClaw & Hermes Agent" — a GUI to switch provider API keys/config across many agent CLIs at once.
- **Why it matters:** it knows exactly where each agent tool stores its provider config (env files, config.json locations) — a ready-made map for our BYOK onboarding UX. Windows/macOS/Linux.
- **Copy from:** the per-tool config-location map + key-switching UX.

---

## 7. Synthesis — the provider abstraction we should copy

```
ProviderAdapter (interface, one per provider)          ← pi / litellm / anythingllm shape
├── name, kind, base_url, models[]
├── chat(messages, opts) → stream/text
├── embed(texts) → vectors            (for embedding providers)
├── resolveApiKey()                   ← env key (pi env-api-keys / reasonix api_key_env)
│     → user key → project key → env var → local provider (no key)
├── requestBudget / retry             ← reasonix request_budget.go + retry.go
└── modelCatalog (generated)          ← pi models.generated.ts
Registry (self-register via init)     ← reasonix blank-import pattern
Router (calculated + LLM-classified)  ← anythingllm modelRouter
Per-user key store                    ← librechat per-user keys (vault)
```

- **TS sidecar:** copy pi's `providers/` + `auth/env-api-keys.ts` structure.
- **If we want Python later:** copy litellm's `llms/base.py` + one provider dir.
- **Provider switching UX:** copy cc-switch's per-tool config map.
- **Routing:** anythingllm `modelRouter` (calculated rules first, LLM-classified fallback).

> See also doc 16 §3–4 (pi/Reasonix code-level), doc 17 §8 (Jan providers), and the spec's P5 Connector Hub (doc 13).
