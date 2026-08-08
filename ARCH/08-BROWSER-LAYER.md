# 08 — Browser Layer (the agent's real browser)

> **The user requirement, verbatim:** *"don't forget browser. agentic OS means to replace everything — from browser to file editor to coding to basically everything. Can we use something lightweight? It must hold all types of search engines, all types of accounts (stored tokens), allow the agent autonomous permission-gated access via stored accounts, and handle captchas of all types."* Design: **one CDP driver, a tiered engine stack (lightweight by default)** + injected recorder for replay + 17-tool catalog + rquickjs `run` sandbox + **Session Vault** (multi-account, permission-gated) + **challenge-handler tier**. Patterns from BrowserOS source deep-dive (doc 33), browser-automation research (doc 06), and fresh mid-2026 verification of Lightpanda / Obscura / Camoufox / CloakBrowser / Steel (see 8.8).

## 8.1 The browser subsystem (Rust: everyaios-cdp + everyaios-browser)

- **Engine resolution (tiered — see 8.8):** interactive/authenticated tasks run on **system Chrome → Edge → chrome-for-testing** (fallback, doc 34 §2.1); scrape/RAG tasks run on the **lightweight CDP tier** (Obscura default, Lightpanda opt-in) when no pixel rendering or login is needed. Launch with `--remote-debugging-port=0 --user-data-dir=<~/.everyaios/browser-profile>` (+ first-run flags); read the real port from `DevToolsActivePort` (never trust a fixed port). All CDP over loopback, token-gated.
- **Profile = the user's logins**: user signs in once in the agent browser (or one-click Chrome profile import — we reuse the browser's own profile picker + note the BrowserOS native importer exists but requires a fork, doc 33 §3.2 — our path is "sign in here", zero magic).
- **Ownership isolation (BrowserOS model):** every tab has an owner: `mine | user | other-agent`. User tabs are never touched unless the user asks; agent tabs grouped per agent; closing an agent session closes its tab group; per-page claims recorded in the audit DB (`tab_claims`).
- **Lifecycle:** on-demand spawn; idle sweep (session retention 60min default, configurable); explicit kill; browser crash → per-tab recovery hooks (doc 03 resume).

## 8.2 The 17-tool catalog (everyaios-mcp)

`tabs · tab_groups · history · navigate · snapshot · diff · act · download · upload · read · grep · screenshot · pdf · wait · windows · evaluate · run`
- **snapshot**: page → indented **accessibility tree** (a11y, via CDP Accessibility domain) with stable `[ref=eN]`, `interactive` (actionables+headings) vs `full` modes, depth caps 1..=100, **iframes stitched inline**.
- **act**: click/click_at/type/type_at/fill(whole-form-in-one-call)/press/hover/hover_at/focus/check/uncheck/select/scroll/drag/drag_at/dialog_accept/dialog_dismiss; returns **post-settle diff** (no follow-up snapshot needed).
- **diff**: line-diff of two snapshots with `+n/-n` and **URL-change short-circuit** (navigation → return full new snapshot, don't diff garbage).
- **read/grep**: page → clean markdown via in-process DOM walker (our own `content-markdown.js` equivalent); grep line matches; large pages truncate → saved file (OutputFileAccess).
- **wait**: `{for: text|selector}` or ms; **evaluate**: CDP Runtime.evaluate with return value; **download/upload/pdf**: with temp-file routing; **tab_groups/windows/history**: management.
- **run**: see 8.4.
- Annotations: read-only on read tools (clients like Claude Code honor `readOnlyHint`); `run`/`evaluate` = open-world + always permission-checked.

## 8.3 The snapshot→act loop (token-efficient by construction)

`snapshot → act → (act returns diff) → re-snapshot only for fresh refs`. Refs scoped to (document_id, url) — never stale across navigation. Interactive mode default = ~90% token cut vs raw DOM (doc 06). Browser instructions embedded in the system prompt tell the model: batch actions, `Promise.all` in run, close your own tabs, respect ownership (BrowserOS prompt block, doc 33 §6.3 — adapted, not copied).

## 8.4 `run` — Think-in-Code scripting (Rust everyaios-script)

- rquickjs/QuickJS-NG async runtime; **64MB heap / 512KB stack / 30s / 1K log lines / 2MB return**.
- Exposes the `browser` SDK: `pages.newPage/close/list/getInfo`, `observe().snapshot()/diff()/resolveRef`, `input().click/fill/type/...`, `nav().goto/back/forward/reload`, `read/grep/wait/screenshot/evaluate/pdf/download/upload`, `tabGroups/windows`, raw `browser.cdp(method, params)` escape hatch.
- **InnerCallHook (audit guarantee):** every primitive inside a script is (a) authorized against ownership + permissions, (b) recorded as a child audit row, (c) page-creations claimed/grouped like `tabs new`. Scripts **cannot** bypass the audit trail or touch foreign tabs.
- Ownership filtering: `pages.list()` returns `ownership: mine|user|other-agent` so scripts clean up only their own tabs.
- Fallback for trivial cases: `evaluate` (single expression, no SDK).

## 8.5 Session replay (Rust everyaios-audit + injected recorder)

- **Recorder**: an injected content-script (CDP `Page.addScriptToEvaluateOnNewDocument`) streams DOM/mutation/scroll/click events → **NDJSON batches** POSTed to everyaios-audit ingest with `x-recording-tab-id/document-id/batch-id` + gap header (BrowserOS contract, doc 33 §9.2 — we implement capture via CDP+injected script, not fork-native; honest ceiling noted in doc 34).
- **Ingest**: validate chrome document ids; **sticky `has_gap`** on malformed/dropped lines (no fake-complete replays); one-transaction commit of stream metadata + payload + dedupe identity.
- **Storage**: `~/.everyaios/replays/` NDJSON files + `~/.everyaios/screenshots/` JPEGs (one per step) + SQLite index (per-tab → per-document segments with event counts, timestamps).
- **Playback**: scrubber + synced action timeline, per-tab recordings with independent time origins; **Watch** (live view of an agent's current tab) + **Stop** on the cockpit cards.
- Retention: 7 days default, configurable; wipe = delete files.

## 8.6 Browser-integrated capabilities (replaces the standalone apps)

- **Authenticated scraping** (AnythingLLM pattern, doc 01/06): user logged-in sessions → tiered scrape cascade (static extract → agent browser render → OCR) → RAG ingest.
- **Reader + chat overlay** on any open tab: "summarize this page", "extract the table".
- **The browser IS the connector hub's first path** (v2.0 §P5, doc 13): the agent drives your logged-in Gmail/Notion/Linear directly — no API keys (the 80% solution).
- **Form automation + workflow execution** across multi-step sites (scheduled tasks re-drive the same tabs headlessly).

## 8.7 Failure handling (no-failures)

- CDP disconnect/reconnect (WebSocket drop → re-resolve target, re-attach sessions, epoch-guard stale commands).
- Page nav mid-action → wait/settle + snapshot freshness check; refs invalidated → surfaced "re-snapshot" error instead of acting on stale refs.
- Recorder gaps → `has_gap` honest flag; never fabricate.
- Timeouts: per-tool (browser tool 120s default, run 30s, wait bounded); watchdog re-arms on every byte (GenOffice 60s/180s lesson, doc 28).
- Blocked/error sites: structured error objects (status, cloudflare/captcha detection) → routed to the **challenge handler (8.10)** instead of dying; suggestion to retry later or via search.

## 8.8 Tiered engine stack — "can we use something lightweight?" → **yes: three engines, one CDP protocol**

All lightweight engines expose CDP, so `everyaios-cdp` stays the single driver; the **task tier picks the engine**. Verified mid-2026 (fresh web research + docs 34/06):

| Tier | Engine | Footprint | Protocol | Fit | Notes |
|---|---|---|---|---|---|
| 0 | **Static extraction** — no browser (reqwest + markitdown-class parser) | ~0 | none | public pages, feeds, sitemaps, RAG harvest | always tried first |
| 1 | **Lightpanda** (Zig, AGPL, beta) | ~123MB peak / 100 pages (**16× less** than headless Chrome), 9–11× faster | CDP :9222 + native MCP | crawling, form-fill, structured extraction | no WebGL/canvas/audio; no native Windows (WSL2); **AGPL → spawn-only, never link**; opt-in |
| 1b | **Obscura** (Rust, Apache-2.0, 10K+★) | ~70MB binary / **~30MB RSS** | full CDP + custom `LP` (markdown) domain | production scraping, built-in stealth-lite (`--stealth`, 3.5K tracker block), parallel workers | **default Tier-1** |
| 2 | **System Chrome/Edge via CDP** (+ chrome-for-testing fallback) | normal browser | CDP | interactive/authenticated sessions, pixel rendering, WebGL, login flows | **default for interactive** |
| 3 | **Camoufox** (Firefox fork, C++-level stealth, ~200MB) | ~200MB | **Juggler/Playwright — NOT CDP** | hard bot defenses (Cloudflare/Akamai) | needs a Playwright driver path; user opt-in daemon |
| 3b | **CloakBrowser** (Chromium, 71+ C++ patches) | Chromium-class | **CDP** (Playwright/Puppeteer drop-in) | same hard defenses, **CDP-native → zero extra driver work** | ⚠️ **Binary is proprietary/closed-source** (Python wrapper MIT but Chromium binary is a black box — security audit confirms unknown code); free stable tags; latest builds = license key; user opt-in **with documented risk** |
| 3c | **Fortress** (Chromium, C++ source-level patches, `tiliondev/fortress`) | Chromium-class | **CDP** (drop-in) | stealth equivalent to CloakBrowser, potentially more transparent build process | newer (mid-2026); evaluate as open alternative to CloakBrowser |
| — | **User-visible webview** (Tauri) | native webview | none | the human sees the page, solves logins/challenges | always available |

Rules:
- **Tier 0 → 1 → 2 escalation**: cheapest tier first per task; escalate on failure or explicit need (JS-render required / login / WebGL).
- **License discipline**: none of these are linked into our MIT/Apache core — all spawned child processes speaking CDP (Playwright for Camoufox), exactly like Chrome today. Lightpanda stays opt-in because AGPL.
- **Rejected**: `undetected-chromedriver` / `playwright-stealth` / `puppeteer-extra-stealth` — verified **stale & ineffective in 2026** (JS-injection shims get fingerprinted; superseded by native-patched binaries).
- **⚠️ CloakBrowser trust caveat**: security audit (`pim97/cloakbrowser-analyze`) confirmed the Chromium binary is proprietary/closed-source. Users running it are executing an opaque binary. Document this risk clearly in the UI when user enables the stealth tier. Prefer **Fortress** (`tiliondev/fortress`) or **Camoufox** as more transparent alternatives where possible.
- **Steel browser** (session-orchestration over Chromium, Apache-2.0) is a *reference pattern* for 8.9 — we implement session persistence ourselves in everyaios-vault, not a dependency.

## 8.9 Session Vault — every account in one place, permission-gated access

> *"Hold all types of accounts… store tokens… based on permission level, allow the agent to access websites autonomously via the stored account."* — the user's explicit requirement.

- **Stored (encrypted, SQLCipher, everyaios-vault):** per-site cookie jars (host-keyed), localStorage, sessionStorage, auth headers — captured from any tier. **Multiple accounts per site** (personal / work / test) = separate `Session` records with name, site, role tag.
- **Capture paths:**
  1. **Sign-in-in-browser** (default): user logs into a site in the visible webview → `Page.getCookies` → sealed into the vault. Works with everything incl. MFA/SAML.
  2. **Session inheritance** (no re-login): attach to the user's own daily Chrome profile via `--remote-debugging-port` on a *copy* of their profile dir → inherit live sessions; store only what's needed (BrowserOS chrome-importer pattern, doc 33 §3.2 — ours is read-on-attach, zero magic).
  3. **Import** (optional, user-initiated): Chrome passwords / autofill / `Local State`.
- **Permission-gated access (the trust model):**
  - Every site+account pair carries a **Trust Ladder requirement** (read-only = low · form-fill = medium · drive-autonomously = high; default = ask-first-time, then remember per site).
  - Agent request → **Guard-2 card**: *"Use Gmail / work account / read-only?"* → approve/deny once → rule cached.
  - **The agent never sees raw cookies** — the vault injects them into the browser context at request time and revokes at session end (CES-executor pattern, doc 08).
  - Per-site/per-account usage metering → `session_uses` audit rows → replay/scrubber shows which account touched what.
- **Rotation**: multiple accounts per site → on 429 / blocked / expired, rotate to the next authorized account (mirrors key-ring rotation A3).
- **Expiry & hygiene**: cookie-TTL tracking, re-auth nudge card (*"Gmail session expired — re-login?"*), per-site wipe, encrypted export.

## 8.10 Challenge handler — the working engineering layers for captchas of all types

Ordered by cost/effectiveness. Defense-in-depth, not one magic bypass; the user stays the final unlock.

1. **Prevention (best ROI)** — most sites never challenge a real user session:
   - **Session inheritance** (8.9 path 2) = the user's own high-reputation profile.
   - **Real engines, zero automation flags**: actual Chrome/Obscura binaries, never headless-flagged shims; fingerprint coherence (UA ↔ JS runtime ↔ canvas) is an engine property, not a patch.
   - **Behavioral realism** (optional per-site): humanized input on `act`/`run` — Bézier mouse curves, per-key typing cadence, natural click targets (CloakBrowser/Fortress `humanize=True` pattern).
   - **Rate-limit discipline**: exponential backoff + jitter on 429/503, concurrency caps, persistent HTTP/2 keep-alive (doc 06).
   - **Proxy consistency** (optional, user-provided): residential/geo-matched proxies; location ↔ timezone ↔ language coherence.
2. **Human-in-the-loop pass-through (the universal answer, default)** — any challenge surfaces the tab in the visible webview; the user solves it once (seconds); cookies captured to the vault → future runs of that site flow free until expiry. Works for reCAPTCHA v2/v3, Turnstile/Managed, hCaptcha, MFA — everything. Cost ≈ 0, fully local.
3. **Local solvers (free, on-device):**
   - **Proof-of-Work captchas** (Altcha, Friendly Captcha, Turnstile hidden mode): pure crypto puzzles — solved in everyaios-core, no external calls (verified: PoW is the self-hostable class).
   - **LLM visual grounding**: the snapshot→act loop already gives eyes on simple challenges — click-hold, image-select, checkbox — solved via `act` (browser-use pattern, doc 06).
4. **BYO solver APIs (optional, user's own account/credit)** — CapSolver / CapMonster / 2Captcha as a pluggable `ChallengeSolver`, permission-gated like any F-series connector; returned token injected via CDP. Never a default, never bundled credit.
5. **Explicitly not in scope**: anything that doesn't route through the user's own authorized accounts + vault.
