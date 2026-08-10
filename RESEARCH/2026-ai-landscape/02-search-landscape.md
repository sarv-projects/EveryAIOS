# 02 · Search Landscape — Keyless Options + BYOK APIs

> Research goal: **extremely powerful web search + deep research, with ZERO mandatory API keys.**
> Optional API keys (BYOK) just add more/richer results. Research date: Aug 2026.

---

## Part 1 — The 2026 Keyless Reality

| Option | Status in 2026 | Notes |
|---|---|---|
| **Self-hosted SearXNG** (Docker) | ✅ **Gold standard** | Unlimited, keyless, aggregates 70+ engines (Google/Bing/DDG/Brave/Mojeek). JSON API at `/search?q=...&format=json`. Queries localhost:8080. |
| **Public SearXNG JSON instances** | ⚠️ Mostly 403-blocked / Cloudflare-challenged | Our existing pool handles this with 12 instances + health tracking + circuit breaker + 2-way race. Refresh script: `scripts/refresh-searx-pool.mjs` (fetches from searx.space, filters HTTPS + generator='searxng', probes). |
| **Whoogle** | ❌ **Dead** — archived April 2026 | Google shut all the doors. Do not build on it. |
| **DuckDuckGo Lite/HTML scraping** | ⚠️ Works but rate-limits aggressively | We have native DDG parsers (Lite + HTML + Instant Answer) in the cascade. DDG HTML = default keyless engine in AnythingLLM too. |
| **Wikipedia / Wikidata API** | ✅ Free, but **new 10 RPM global cap** | Needs polite UA + throttling. Add to cascade but never as sole source. |
| **Hacker News Firebase API** | ✅ Rock-solid, generous limits | Good for tech news research. |
| **Google News RSS** | ✅ Keyless news search | Brittle but free. |
| **Marginalia** | ✅ Indie/small-web index | Free `public` key (public-api.marginalia.nu). Good diversity signal. |
| **Jina Reader OSS** (`ghcr.io/jina-ai/reader:oss`) | ✅ **Self-hostable Docker** | Converts any URL/PDF → clean markdown. Zero keys, zero limits. Replaces r.jina.ai locally. |
| **Reddit .json scraping** | ❌ Dead for keyless | Heavily throttled in 2026. Use Reddit's official API (BYOK) or Composio REDDIT toolkit instead. |
| **Common Crawl** | ✅ Free index | Bulk/offline oriented, not low-latency SERP. |

**Bottom line:** a public-instance pool alone can't be the "inbuilt powerful search" — too unreliable.
But the **desktop app unlocks the real answer**: ship one-click local infrastructure.

---

## Part 2 — The Desktop Unlock (local infra you can ship)

1. **Local SearXNG** — bundle a one-click "start local search engine" (Docker, or embedded node/python
   subprocess, or tiny helper). Local instance → zero rate limits, zero keys, all 70+ upstream engines.
   App queries `http://localhost:8080/search?q=...&format=json`.
2. **Jina Reader OSS container** — local `r.jina.ai` replacement for deep-reads. Any URL/PDF → clean
   markdown straight into LLM context.

---

## Part 3 — BYOK Search APIs (optional keys, augments free search)

| API | Free tier | Key differentiator |
|---|---|---|
| **Tavily** | 1,000 credits/mo | AI-optimized search; `research` mode does multi-step; extract API. First choice for deep research BYOK. |
| **Exa** | 1,000 credits/mo | **Neural search** (semantic over keywords) + web search + content. Best for "find me content about X concept". |
| **Brave Search API** | 2,000 queries/mo free | Independent index, good SERP quality. |
| **SerpAPI / Serper.dev** | 100–2,500/mo | Raw Google SERP scraping as API (legal-ish wrapper). |
| **Google Custom Search JSON API** | 100 queries/day free | Official Google, but CSE-limited. |
| **Bing Web Search API** | 1,000 tx/mo free (F1/F5 tier) | Official Microsoft. |
| **Kagi** | paid | High-quality human-curated index. |
| **Mojeek API** | free `public` key | Independent crawler, small but clean. |
| **SearchAPI.io / Zenserp / ScrapingDog / Bocha / Valyu / Linkup / Parallel / Context7** | mixed | Context7 is doc-specific; Parallel is LLM-optimized; Valyu is pay-per-result. |
| **You.com keyless** | **No key needed** (optional for more) | `api.you.com/v1/agents/search` — works keyless. AnythingLLM ships this as one of its 3 keyless engines. **We're missing this — add it.** |
| **Perplexity Sonar** | paid | LLM-generated answers with citations. |

**Shortlist to support as BYOK:** Tavily, Exa, Brave, Perplexity Sonar (+ maybe Google CSE, Bing).

---

## Part 4 — What We Already Have (verified in codebase)

### Existing keyless cascade (`packages/core-search/src/build-cascade-providers.ts`)
> Cache → DDG Instant Answer → DDG HTML → Tavily → **SearXNG Pool** (12 instances, health-tracking,
> circuit breaker, 2-way race) → DDG Lite → Wikipedia → HF Rotator → Parallel

### Existing BYOK tier
Exa, Tavily, Firecrawl, Jina — already in cascade + in the 114-provider registry
(Brave, SerpAPI too). When user has a key → key goes to top of cascade. When not → keyless cascade.
**That's exactly the requested design.**

### Existing deep research v2 (`packages/cloudflare-server/src/deep-research.ts`)
> PLAN (7 template facets) → RETRIEVE (multi-provider parallel) → DIVERSIFY (host dedupe + authority
> scoring) → READ (deep-fetch 8 pages) → CLUSTER → REPORT (exec summary, sections, open questions, ranked citations)

All pure TypeScript, Node-compatible → **desktop app imports it directly**, no Cloudflare Worker.

### Existing infra
- `scripts/refresh-searx-pool.mjs` — SearXNG pool refresh + health
- `packages/core-search/src/providers/searxng-pool.ts` — pool with health + circuit breaker
- `WebSearchCascade` (Node) with 61 tests, BM25, cache

---

## Part 5 — AnythingLLM's Search Pattern (what they do differently)

- **One** `web-browsing` tool; LLM decides when to call it (tool-calling, not always-on).
- `switch(provider)` over **14 engines**: SerpAPI, SearchAPI, Serper, Bing, Baidu, Serply,
  **SearXNG**, Tavily, **DuckDuckGo**, Exa, Perplexity Sonar, Brave, fastCRW, **You.com**.
- **3 genuinely keyless:** DDG HTML scrape (default), You.com keyless, SearXNG self-hosted.
- 🔥 **`introspect()` narration** — announces *"Using DuckDuckGo to search for..."* then
  *"I found 6 results — reviewing now (~1,400 tokens)"* — token-counted step streaming.
- 🔥 **`reportSearchResultsCitations()`** — every result pushed to a citation list surfaced in the UI.
- `web-scraping` plugin → CollectorApi (Firecrawl-backed) fetch, summarize if over token budget.

**Honest comparison:** our `WebSearchCascade` is **already more advanced** (true cascade + pool +
circuit breakers + races vs. their single-provider switch). What they beat us on: **You.com keyless
provider, token-counted introspect narration, first-class citations UI.**

---

## Part 6 — Deep Research v3 Plan (from this research)

| Step | Work | Est. |
|---|---|---|
| Desktop launcher for local SearXNG + Jina Reader OSS | Docker/subprocess one-click | 1 day |
| You.com keyless provider + DDG-lite improvements | pure TS in core-search | 1 day |
| Token-counted search narration + citations UI | core-search + UI | 1–2 days |
| Keyless verticals (HN, Google News RSS, Marginalia, ArXiv, Wikipedia) | cascade additions | 1 day |
| LLM-driven facet planner (replace template) + iterate loop | deep research v3 | 3–4 days |
| Research → memory/KG compounding pipeline | memory integration | 2–3 days |
| Search engines settings UI (BYOK + toggles + health) | settings screen | 2 days |

**~2 weeks** → genuinely best-in-class search + research with zero mandatory API keys.
