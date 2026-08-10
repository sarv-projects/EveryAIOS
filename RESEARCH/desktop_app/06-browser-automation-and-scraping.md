# 06 — Browser Automation & Web Scraping for the Desktop App

> Verified 2026-08-05 via GitHub API + docs. Stars are live.
> **This is the "powerful free web search + scrape, no API dependency" pillar.**

## The landscape (verified)

| Repo | Stars | Lang | What it is |
|---|---|---|---|
| firecrawl/firecrawl | **161.6K** | TS | Search + scrape + crawl + extract API → clean markdown/JSON. Self-hostable (AGPL) but managed infra (proxies, bypass) is SaaS. Free tier ~500–1000 credits/mo |
| browser-use/browser-use | **108K** | Python | LLM drives a real browser via DOM/a11y-text perception (not pixels): click(e12), type(e15,…), multi-tab, persistent sessions, structured extraction, @tools.action injection |
| unclecode/crawl4ai | **76.2K** | Python | Fully local, LLM-friendly crawler: Playwright pool, markdown filters (Pruning, BM25), CSS/XPath + LLM extraction (Ollama), deep crawl w/ crash recovery, FastAPI server |
| adbar/trafilatura | **6,415** (API 2026-08-06) | Python | Pure-HTML text extraction, no browser, wins precision/recall benchmarks, markdown out. Dies on JS SPAs |
| jo-inc/camofox-browser | ~2.5K | TS/C++ | Stealth headless browser server built on **Camoufox** (Firefox fork patched at C++ level — WebGL/audio/WebRTC/hardwareConcurrency spoofed before JS runs). REST API + OpenClaw plugin, a11y snapshots (~90% smaller than raw HTML), session isolation, cookie import, proxy/GeoIP |
| Microsoft @playwright/mcp | — | — | MCP server wrapping Playwright: navigate/click/type/snapshot over JSON-RPC |

## Key mechanisms worth stealing

1. **Accessibility-snapshot perception (browser-use & Camofox):** don't feed raw HTML or pixels — serialize the DOM into a token-efficient text snapshot with stable element refs (`e1`, `e2`). ~90% token reduction vs raw HTML, and no vision-model cost. When snapshots fail (shadow DOM, canvas), fall back to vision coordinates.
2. **AnythingLLM's Authenticated Scraping (desktop-only v1.8.3+):** embedded isolated Chromium profile; user logs into gated sites once; cookies persist on disk; agent scrapes and ingests text into RAG. Not RPA — just authenticated fetch. **This is the pattern for "scrape behind login" with user consent.**
3. **Stealth is a C++-level problem:** JS-injected stealth scripts get fingerprinted; Camoufox patches the browser binary. Only needed for hard bot defenses (Cloudflare/Akamai) — keep as an *optional daemon*, not the default.
4. **Firecrawl's `/map` (sitemap/URL discovery) + `/crawl` (recursive w/ limits)** — cheap route inventory before deep scraping.

## Recommended architecture for our local-first app

**Tiered local scraping engine — free by default, no API keys:**

```
Tier 1  Trafilatura-class static extraction   (blogs, docs, news — instant, zero browser)
Tier 2  crawl4ai local (Playwright+Chromium)  (SPAs, JS-heavy, cookies, LLM extraction w/ Ollama)
Tier 3  Camofox stealth daemon (optional)     (hard bot defenses — user opt-in, separate process)
Tier 4  BYOK boost (optional)                 (Firecrawl/Jina keys users can add; never required)
```

- Default search = searxng pool (already built in `core-search`) + tier-1/tier-2 scrape → BM25 re-rank → markdown into context. Free.
- All scraped pages go through the **existing** `core-files` pipeline (extract → chunk → embed → store) so anything read is immediately RAG-queryable.
- Browser *automation* (clicking/forms/sessions) is a separate opt-in tool gated behind the dual-guard — it's RPA, not scraping.
- Run the Chromium-based tiers as **supervised child processes** (doc 03 supervisor) so a crash never takes down the app; kill & restart with backoff.

## Why not just bundle a browser?

Memory math: a headless Chromium ≈ 150–400MB; the whole Tauri app is 20–40MB. Spinning Chromium only on demand (tier 2/3) keeps idle footprint near zero — this is what keeps the "lightweight, very fast" positioning honest.
