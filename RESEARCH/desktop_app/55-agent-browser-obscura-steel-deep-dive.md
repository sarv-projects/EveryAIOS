# 55 — Agent Browser Ecosystem Deep-Dive: agent-browser / Obscura / Steel (source-verified) + the 2026 Market Map

> **Date:** 2026-08-10 · **Status:** ⬛/🟦 — all three repos **cloned and key files source-read** (not README-paraphrased); star counts **live-verified via GitHub API 2026-08-10**; the Medium article read via Wayback (Medium blocks direct fetch).
> **Purpose:** verify/revert the browser-layer decisions (ARCH/08) against the three most relevant live projects, and close the market-positioning gap with the "Best Agent Browsers 2026" article.
> **Cross-refs:** ARCH/08 (browser layer — this doc patches §8.2/§8.8/§8.9), ARCH/06 (security — adds §6.15), ARCH/09 (E10/F11 rows), doc 33 (BrowserOS), doc 34 (§2.1 chrome-for-testing), doc 06 (browser automation), ledger doc 27.

---

## 0. TL;DR

| Fact | Value |
|---|---|
| **`vercel-labs/agent-browser`** | **40,295★** · Apache-2.0 · Rust · pushed 2026-08-08 — the exploding standard for *coding agents driving a browser* (Claude Code/Cursor/Codex/Gemini CLI/Windsurf/Goose). Rust CLI + persistent daemon over CDP. Source-read. |
| **`h4ckf0r0day/obscura`** | **20,995★** (ARCH/08 said "10K+" — **stale, now 2×**) · Apache-2.0 · Rust · pushed 2026-08-09 — the from-scratch lightweight headless browser we already chose as Tier-1. Source-read. Confirmed every ARCH/08 claim + more. |
| **`steel-dev/steel-browser`** | **7,458★** · Apache-2.0 · TypeScript · pushed 2026-08-05 — the steel.dev *API service* (Fastify + puppeteer-core). **⚠️ `steel-dev/steel` (the Rust lib ARCH/08 referenced) is GONE (404)** — absorbed into this + steel.dev cloud. Source-read. |
| **Medium "Best Agent Browsers 2026"** | 7-player market map (agent-browser / Bright Data / Browser Use / Browserbase / Perplexity Comet / Skyvern / Steel); market $4.5B→$76.8B by 2034. Read via Wayback. |
| **Ledger impact** | +3 repos → **222** (section 24) |
| **Verdict** | Obscura confirmed **Tier-1** (verified in depth; `tiers.rs` ships Lightpanda as the default until the Obscura binary lands — ARCH/08 §8.8); agent-browser is our **biggest steal source** (snapshot/ref/find/read/batch/a11y/security containment); Steel contributes the **Session-Vault full-storage-context** pattern. All three validate our ref-based snapshot + MCP-annotation designs. |

---

## 1. `vercel-labs/agent-browser` (40,295★, Apache-2.0, Rust) ⬛ — the biggest steal source

**What it is:** a Rust **CLI + persistent native daemon** (client-daemon over local sockets) that drives Chrome via CDP with zero Node/Puppeteer/Playwright dependency. Built specifically so *AI coding assistants* can use a browser from a shell. 84KB README, 69KB CHANGELOG, 94 contributors, ~60+ releases — the highest-velocity project in the category.

### 1.1 Source-verified architecture (`cli/src/`)
- `main.rs` — CLI parser (kebab-case flags) + JSON output contract; `connection.rs` — daemon discovery (`walk_daemons`, stale-file cleanup, PID-alive checks); `daemon.rs` — persistent session; `install.rs` + `doctor/` — Chrome-for-Testing install + environment diagnostics (chrome/daemon/network/providers/security/webgpu); `mcp.rs` — MCP server with **tool profiles**; `read.rs` — the markdown/lLms.txt reader; `skills.rs` + `skill-data/` — the SKILL.md skills system.
- `native/snapshot.rs` — **the a11y snapshot engine**: role taxonomy (`INTERACTIVE_ROLES`: button/link/textbox/checkbox/radio/combobox/listbox/menuitem/option/slider/switch/tab/treeitem/Iframe; `CONTENT_ROLES`; `STRUCTURAL_ROLES`), **zero-width-char filtering** (`\u{FEFF}`, `\u{200B}`…), compact `@eN` refs via `RefMap`/`resolve_ax_session`, interactive/compact/depth/selector options → **~200–400 tokens per page**.
- `native/cdp/` — Chrome (launch flags) + **`lightpanda.rs`** (a Lightpanda driver!) + `discovery.rs`; `native/diff.rs` — snapshot line-diff (`similar` crate) + **pixel screenshot diff** (threshold %); `native/react/` — **React fiber-tree introspection** (tree/renders/suspense, installed hook); `native/a11y/` — **embedded axe-core** (offline WCAG audits, no CSP interference); `native/recording.rs`; `native/webdriver/` — **Appium/iOS/Safari** mobile-web driving; `native/stream/` — dashboard/chat/http/websocket streaming.

### 1.2 The distinctive surface (steal list)
| Capability | What it does | Source-verified in |
|---|---|---|
| **Snapshot-ref workflow** | `snapshot -i` → a11y tree with `@eN` refs; act on refs; refs stale the moment the page changes | `snapshot.rs`, SKILL.md core loop |
| **`find` semantic locators** | target by ARIA role + name/label/placeholder — no CSS guessing | SKILL.md |
| **`read` with markdown negotiation** | `Accept: text/markdown`, `.md` retry, **nearest-ancestor `llms.txt`/`llms-full.txt` walk**, `--filter`/`--outline`/`--raw`, and a **no-browser HTTP path** (`read.rs` — reqwest directly, 2MB body cap) | `read.rs` |
| **`batch` mode** | multi-step workflows piped as JSON in one invocation (kills per-command process overhead) | README |
| **MCP tool profiles** | `core/network/state/debug/tabs/react/mobile/all` + paginated tool discovery + read-only/open-world annotations + typed args + `extraArgs` — exactly our ARCH/08 annotation model, productionized | `mcp.rs`, AGENTS.md |
| **Security containment** | `--allowed-domains` = browser-level containment incl. **RTCPeerConnection/WebRTC disable**, dedicated/shared worker bootstrap guards that **fail closed**, `--content-boundaries`, `--max-output`; trust-boundaries reference doc | SKILL.md, `policy.rs` |
| **Embedded axe-core a11y audit** | offline WCAG audits, axe.min.js embedded in the binary | `native/a11y/` |
| **Annotated screenshots** | numbered labels tied to `@eN` refs for visual+text reasoning | README |
| **React/Web-Vitals introspection** | fiber tree, hooks state, render profiling, Suspense, LCP/CLS/TTFB/FCP/INP | `native/react/`, `react/renders.rs` |
| **SKILL.md skills system** | thin `skills/agent-browser/SKILL.md` discovery stub → `agent-browser skills get core` pulls `skill-data/core/SKILL.md` (`name/description/allowed-tools` frontmatter + `references/`) — the emerging ecosystem skill format | `skills/`, `skill-data/` |
| **`@agent-browser/eve` + cloud providers** | browser-as-AI-SDK-model integration (eve sandbox; Browserbase/Browser-Use-Cloud/Kernel) — same pattern as acpx-ai-provider (doc 45) | packages/ |
| **AGENTS.md discipline** | CLI/MCP parity rule (any CLI change ⇒ MCP tool + tests), docs-sync checklist — contributor-convention reference | AGENTS.md |

---

## 2. `h4ckf0r0day/obscura` (20,995★, Apache-2.0, Rust) ⬛ — Tier-1 confirmed, claims verified

**What it is:** a headless browser **engine written from scratch in Rust** — real V8 JS, html5ever DOM, its own layout/paint — that speaks CDP as a *server*, so Puppeteer/Playwright/our `everyaios-cdp` talk to it as a drop-in headless Chrome. **30MB RSS / 70MB binary / ~85ms page load / instant startup** (README, and consistent with the source's design constraints).

### 2.1 Source-verified crate map (9 crates)
| Crate | Role | Key files |
|---|---|---|
| `obscura` | high-level `Browser`/`Page` API, config | `browser.rs`, `page.rs`, `config.rs`, `cookie.rs` |
| `obscura-browser` | contexts, profiles, lifecycle, PDF | `context.rs`, `profiles.rs`, `lifecycle.rs`, `pdf.rs` |
| `obscura-dom` | html5ever tree, selectors, serialization | `tree.rs`, `tree_sink.rs`, `selector.rs`, `serialize.rs` |
| `obscura-js` | V8 bindings | (embedded V8) |
| `obscura-cdp` | **the CDP server** — 14 domains + custom `LP` | `server.rs`, `dispatch.rs`, `domains/{target,page,runtime,dom,network,fetch,io,storage,input,accessibility,domsnapshot,emulation,pdf,browser,lp}.rs` |
| `obscura-net` | own client, RFC-6265 `CookieJar`, interceptor, blocklist, robots | `client.rs`, `cookies.rs`, `interceptor.rs`, `blocklist.rs`, `robots.rs` |
| `obscura-render` | taffy layout + tiny-skia paint + ab_glyph text (**native rendering, no Chromium**) | `css.rs`, `border.rs`, `dom.rs` |
| `obscura-mcp` | **embedded MCP server** (stdio + HTTP), 32 tool defs, ref-based | `lib.rs`, `http.rs` |
| `obscura-cli` | `serve` / `fetch` / `scrape` / `mcp` / `worker` | `main.rs`, `worker.rs` |

### 2.2 The verified specifics
- **CDP server**: `LP.getMarkdown` (the custom markdown domain, `lp.rs` — one-line eval of `HTML_TO_MARKDOWN_JS`); bounded deferral queue (256) + bounded WS handoff (128) + `DEFAULT_MAX_CONNECTIONS=128` — explicit **anti-OOM engineering** with the arithmetic documented; `panic=unwind` + `catch_unwind` op wrappers so a panicking op can't unwind into V8's FFI frame.
- **Security defaults to copy**: SSRF guard (**loopback/RFC1918/link-local blocked by default**; `--allow-private-network` opt-in, `OBSCURA_ALLOW_PRIVATE_NETWORK=1`); **`file://` CDP navigation blocked by default** (`--allow-file-access` opt-in); `obey_robots` flag.
- **Cookies**: RFC 6265 §5.3 `CookieJar` (domain → (name,path) map, `host_only`, `secure`, `http_only`, `expires`, **SameSite normalization** to Strict/None/Lax) — a reference-quality jar for our Session Vault semantics.
- **MCP**: `BrowserState` with stable tab ordering (BTreeMap), `interactive_refs: HashMap<String, NodeId>` wiped on navigation, and a **4000-char default text limit** (opt-in `max_chars`) to protect agent context — token-economy, matching our ARCH/05 snip rules.
- **CLI**: `obscura serve --port 9222` (loopback default), `obscura scrape` + **`obscura-worker`** parallel workers (`--concurrency 25`, shared proxy), `obscura mcp` (stdio/HTTP), `--stealth` (fingerprint randomization + 3.5K tracker blocklist), `--v8-flags`, `--max-connections`.
- **Status**: 21K★, pushed daily, Apache-2.0 "no feature gating", Obscura Cloud as the paid hosted layer (never a dependency for us).

---

## 3. `steel-dev/steel-browser` (7,458★, Apache-2.0, TypeScript) 🟦 — the Session-Vault pattern

**What it is:** the steel.dev **API service** — a Fastify REST/WebSocket server wrapping puppeteer-core → Chrome, with a React UI (`ui/`), a REPL, and a **bundled chromedriver2** (Selenium path). ⚠️ **Correction to ARCH/08 §8.8:** the Rust "Steel" library we cited is **gone (404)**; this TS service is the live project (and steel.dev's hosted cloud the commercial layer).

### 3.1 Source-verified steals
| Pattern | Evidence | Take |
|---|---|---|
| **Full storage-context sessions** | `startSession` accepts `sessionContext { cookies, localStorage, sessionStorage, indexedDB }` + `persist`; `BrowserLaunchExtra` carries it into launch | **Session Vault upgrade** — cookies alone is not enough (ARCH/08 §8.9 edit) |
| **Chrome leveldb decoding** | `services/leveldb/localstorage.ts` — Chrome raw storage encoding: `0x00` prefix = UTF-16-LE, `0x01` = ISO-8859-1 (iconv-lite) | the exact decode rules for importing real Chrome storage |
| **Casting WebSocket** | `casting.handler.ts` — live view + mouse/keyboard/selection input, desktop/mobile dims (1920×1080 / 508×1074) | our ARCH/12 "Watch" cockpit (live view + control) |
| **Recorder extension** | `extensions/recorder` (background.js + inject.js) + `recording.handler.ts` WS stream | an *extension-based* alternative to our injected-recorder replay |
| **Instrumentation taxonomy** | `instrumentation/`: browser-interaction events + sanitize, network-events, worker-events, page-console, target-manager, browser-logger | the event taxonomy for our audit/observability (doc 43 §2.3) |
| **DuckDB log store** | `storage/duckdb-storage.ts` — `logs.duckdb`, write-buffer flush | optional audit/replay store at scale (default stays NDJSON+SQLite) |
| **Scrape pipeline utils** | `utils/scrape/`: readability (defuddle), `jsonToMarkdown`, `pdfToHtml` (mupdf), `cleanHtml`, **`stripBase64Images`**, `safeGoTo` + eval corpus tests | token-economy page-read pipeline (feeds our `read` tool) |
| **Fingerprint injection** | `fingerprint-generator` + `fingerprint-injector` (`src/scripts/fingerprint.js`) | JS-level stealth — secondary to Obscura's native `--stealth` |
| **`optimizeBandwidth`** | block images/media/stylesheets/hosts per session | bandwidth/token economy toggle |

---

## 4. The market map — "Best Agent Browsers for 2026" (Medium, read via Wayback)

**7 players:** **1) Vercel agent-browser** — the developer/CLI winner (snapshot-ref workflow, batch, multi-session, security features, annotated screenshots, iOS via Appium; free OSS). **2) Bright Data Agent Browser** — enterprise autonomous unlocking (400M+ IPs, 1M+ concurrent, MCP server, SOC2/HIPAA, $8/GB) — cloud, never a dependency. **3) Browser Use** — the open-source framework leader (**89.1% WebVoyager**, DOM distillation, LiteLLM). **4) Browserbase** — serverless browser infra (session recordings, stealth mode, Stagehand). **5) Perplexity Comet** — the consumer Chromium browser (⚠️ article notes prompt-injection vulnerability — validates our Guard-1/Guard-2 stance). **6) Skyvern** — vision+LLM (**85.85% WebVoyager**, no-code form automation). **7) Steel** — self-hosted browser API for privacy/compliance teams.

**Positioning take:** agent-browser owns the *coding-agent CLI* niche; Browser Use the *Python framework* niche; Bright Data/Browserbase the *cloud infra* niche. **Nobody owns the local-first desktop agent OS with guard/vault/audit/cockpit** — that is EveryAIOS's lane. agent-browser is both our co-tenant (agents already know its CLI) and an F12 harness candidate; our MCP server should stay the single tool surface.

---

## 5. vs our current design — confirmed / stale / missing

**Confirmed (our ARCH/08 designs were right):**
- Obscura as Tier-1 engine ✅ (opt-in escalate path; source-verified: CDP server, 30MB, `--stealth`, LP.getMarkdown, workers; Lightpanda is the shipped `tiers.rs` default)
- Ref-based a11y snapshots + post-settle diff + URL short-circuit ✅ (agent-browser's snapshot.rs = same model, independently derived)
- MCP read-only/open-world annotations ✅ (agent-browser ships them in production)
- chrome-for-testing fallback + tier escalation ✅ (agent-browser's `install.rs`/`doctor/` = same machinery)
- Injected-recorder replay + Session Vault + challenge handler ✅ (validated by Steel's recorder/casting and the article's ecosystem)

**Stale / wrong:**
- ARCH/08 §8.8 Obscura star count "10K+" → **21K** (and the row can now cite source-verified internals)
- ARCH/08 §8.8 "Steel browser (session-orchestration over Chromium)" → Rust repo **404**; live project = `steel-browser` TS API service
- ARCH/08 §8.9 Session Vault = cookie-jars only → should be **full storage context** (localStorage/sessionStorage/IndexedDB)

**Missing from our spec (now added, §7):** a11y audit tool, annotated screenshots, `find` semantic locators, batch mode, `read` markdown-negotiation + llms.txt, MCP tool profiles, WebRTC/worker containment, SSRF/file:// defaults, SKILL.md format alignment, full-storage-context session persistence.

---

## 6. Verdict tables

### STEAL (implement ourselves, Apache-2.0)
| # | What | From | Maps to |
|---|---|---|---|
| S1 | Full session context persistence (cookies + localStorage + sessionStorage + **IndexedDB**, Chrome leveldb decode) | Steel | Session Vault ARCH/08 §8.9 |
| S2 | `read` markdown negotiation + llms.txt/llms-full.txt walk + filter/outline, no-browser path | agent-browser | `read` tool + G8 docs research |
| S3 | `find` semantic locators (role+name/label/placeholder) | agent-browser | `act` tool |
| S4 | Batch JSON command mode | agent-browser | tool-loop batching |
| S5 | Annotated screenshots (numbered labels ↔ `@eN`) | agent-browser | `screenshot` tool + cockpit |
| S6 | Embedded axe-core a11y audit (offline) | agent-browser | new `a11y_audit` tool (post-v1 expansion) |
| S7 | MCP tool profiles + paginated discovery | agent-browser | `everyaios-mcp` |
| S8 | WebRTC containment + worker-guard fail-closed + content boundaries + max-output | agent-browser | ARCH/06 §6.15, J21 network policy |
| S9 | SSRF defaults (block loopback/RFC1918) + `file://` blocked + bounded queues | Obscura | ARCH/06 §6.15, Guard path-floor |
| S10 | 4000-char default tool-output cap (opt-in override) | Obscura-MCP | ARCH/05 snip rules |
| S11 | SKILL.md format (frontmatter + references/) | agent-browser | I2 skill registry / P10 Forge |
| S12 | `doctor/` environment diagnostics | agent-browser | our `everyaios doctor` |
| S13 | Casting WS (live view + input, mobile/desktop dims) | Steel | ARCH/12 Watch cockpit |
| S14 | DuckDB log-store option | Steel | audit/replay store |

### ADAPT
| # | What | From | Notes |
|---|---|---|---|
| A1 | **Obscura as our real Tier-1 engine** | Obscura | don't build our own engine — spawn `obscura serve` via ProcessSupervisor; `everyaios-cdp` stays the single driver; bundle obscura-mcp as a ready-made server |
| A2 | Lightpanda driver pattern (`native/cdp/lightpanda.rs`) | agent-browser | our Lightpanda (default) tier |
| A3 | React fiber-tree introspection | agent-browser | web-app debug tool (post-v1) |
| A4 | Fingerprint injection (fingerprint-generator/injector) | Steel | stealth tier (after Obscura native `--stealth`) |
| A5 | `obscura scrape` worker fan-out | Obscura | parallel scrape tier-1, shared proxy |
| A6 | stripBase64Images + pdfToHtml(mupdf) | Steel | page-read token economy |

### REFERENCE
| # | What | From | Why |
|---|---|---|---|
| R1 | agent-browser as a whole | — | the CLI coding agents already use; F12 harness candidate; our lane = the desktop OS around the same CDP world |
| R2 | Bright Data / Browserbase / Browser Use / Skyvern / Comet | Medium | market landscape; BYO-optional, never dependencies; validates our no-cloud stance |
| R3 | `@agent-browser/eve` + cloud-provider integration | agent-browser | browser-as-AI-SDK-model pattern (acpx-ai-provider, doc 45) |
| R4 | agent-browser AGENTS.md conventions | agent-browser | contributor-doc reference |
| R5 | Steel's Fastify server architecture | Steel | cloud-deployable server pattern — we're local-first, patterns only |

---

## 7. Spec impact (applied 2026-08-10)

1. **ARCH/08 §8.8** — Obscura row: 21K★ + verified internals (embedded MCP 32 tools, `obscura scrape` workers, SSRF/file:// defaults, LP.getMarkdown); Steel row corrected (Rust repo 404 → `steel-browser` TS API service).
2. **ARCH/08 §8.9** — Session Vault extended to full storage context (cookies + localStorage + sessionStorage + IndexedDB, Chrome leveldb decode, persist/restore).
3. **ARCH/08 §8.2** — post-v1 tool expansion list gains `a11y_audit` (axe-core), annotated screenshots, `find` semantic locators, batch mode; `read` gains markdown negotiation + llms.txt.
4. **ARCH/06 §6.15** — browser network containment: WebRTC disable, worker fail-closed guards, SSRF-defaults, file:// block.
5. **ARCH/09** — E10 row source += doc 55; F11 (network hooks) += WebRTC containment.
6. **Ledger (doc 27)** — section 24: agent-browser 40,295 · obscura 20,995 · steel-browser 7,458 → **222 repos**.

**Ledger: 219 → 222 repos.** Reading-order: docs 01–54 → **55** (this doc) → **spec v3.11** (2026-08-10 — this doc's patches applied: E2/E10/E11 rows, §6 item 5, ARCH/06 §6.15, ARCH/09 E10/E11/F11, TODO P2 enrichment; no matrix rows added; steals map onto existing rows).
