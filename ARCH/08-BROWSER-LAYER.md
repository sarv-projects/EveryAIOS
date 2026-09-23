# 08 — Browser Layer (the agent's real browser)

> **DERIVED DOCUMENT — see [`CORE.md`](CORE.md) §2 and [`CAPABILITIES.md`](CAPABILITIES.md) first.** Browser is
> one capability pack behind one `BrowserService` façade with replaceable strategies underneath (lightweight
> HTTP · CDP · headed · future). **Desktop computer use is a separate capability, never merged into the
> browser abstraction.** The tier and engine tables remain useful implementation detail.
> **Rewritten `P69.A19` (done 2026-09-20).**

---

> **The user requirement, verbatim:** *"don't forget browser. agentic OS means to replace everything — from browser to file editor to coding to basically everything. Can we use something lightweight? It must hold all types of search engines, all types of accounts (stored tokens), allow the agent autonomous permission-gated access via stored accounts, and handle captchas of all types."*
> **Full-Stack Module:** Module 5 — Work-Native Primitives (Office, Browser, CUA) (`crates/everyaios-browser`, `crates/everyaios-cdp`, 37 CDP tools).
> **Ownership ([`CORE.md`](CORE.md) §4, §9):** this crate is the **shared plane** — one `BrowserService` façade ([`CAPABILITIES.md`](CAPABILITIES.md)). No agent, including the built-in runtime, holds a private browser: a navigation's destination floor, session vault, ownership and audit are identical regardless of who asked. An external agent's *own* browser capability (where its integrated CLI exposes one) stays native-first per the resolution policy; the EveryAIOS browser is the fallback, not a replacement.

## 8.0 The façade — one `BrowserService`, replaceable strategies underneath

Agents see one stable façade (tabs · snapshot · act · read · session vault · challenge handling). Everything behind it is a strategy the engine picks per task — **the engine's choice, never the model's**:

| Strategy | Engine | When the engine picks it |
|---|---|---|
| Lightweight HTTP (no browser: reqwest + markitdown-class parser) | static extraction | public pages, feeds, sitemaps, RAG harvest — always tried first |
| Lightweight CDP (**Lightpanda default** per `tiers.rs`; Obscura opt-in — both spawn-only, never linked) | tier 1 | crawling, form-fill, structured extraction without pixel rendering or login |
| Full CDP (**system Chrome → Edge → chrome-for-testing** fallback) | tier 2 | interactive/authenticated sessions, pixel rendering, WebGL, login flows |
| Future / opt-in stealth (Camoufox via a Playwright driver path — Juggler, not CDP; CloakBrowser/Fortress CDP-native — proprietary-binary risk documented at enable time) | tier 3 | hard bot defenses only, user opt-in daemon |

Rules: **tier 0 → 1 → 2 escalation** (cheapest first; escalate on failure or explicit need). **License discipline:** none of the engines are linked into the core — all are spawned child processes speaking CDP (Playwright for Camoufox), exactly like Chrome today; Lightpanda stays spawn-only (never linked) because AGPL. **Rejected:** `undetected-chromedriver` / `playwright-stealth` / `puppeteer-extra-stealth` — stale and fingerprinted in 2026 (JS-injection shims; superseded by native-patched binaries). **Steel:** the Rust repo is gone (404); the live `steel-dev/steel-browser` is a TypeScript API service whose *patterns* (full storage-context sessions, casting WebSocket, DuckDB log store) inform §8.9 — never a dependency. Cloud browser is not bundled.

Launch: `--remote-debugging-port=0 --user-data-dir=<~/.everyaios/browser-profile>` (+ first-run flags); read the real port from `DevToolsActivePort`, never trust a fixed port. All CDP over loopback, token-gated. On-demand spawn; idle sweep (session retention 60min default, configurable); explicit kill; crash → per-tab recovery hooks. The child is a **`ManagedResource`** (install ≠ enable ≠ running ≠ healthy). Learned helpers persist as skills under `agent-workspace/`, not one-shot scripts.

**Explicit non-goal — desktop computer use stays OUT.** Driving real OS windows (HWND capture, UIA invoke, SendInput, OCR/vision, see-pane, Guard-2 allow-list) lives in [`DESKTOP.md`](DESKTOP.md) and is never merged into this façade. Do not drive the user's Chrome via this CDP child unless they opted into session inheritance (E13).

## 8.1 The browser subsystem (Rust: everyaios-cdp + everyaios-browser)

- **Profile = the user's logins**: sign in once in the agent browser (or one-click Chrome profile import — "sign in here", zero magic).
- **Ownership isolation:** every tab has an owner: `mine | user | other-agent`. User tabs are never touched unless the user asks; agent tabs grouped per agent; closing an agent session closes its tab group; per-page claims recorded in the audit DB (`tab_claims` — `TabRegistry` + sync/claim/release, P2.6).

## 8.2 The 37-tool catalog (everyaios-mcp)

`tabs · tab_groups · history · navigate · snapshot · enhanced_snapshot · diff · act · download · upload · read · grep · screenshot · pdf · wait · windows · evaluate · run · bookmarks · create_bookmark · remove_bookmark · update_bookmark · move_bookmark · search_bookmarks · list_tab_groups · group_tabs · update_tab_group · ungroup_tabs · close_tab_group · list_windows · create_window · create_hidden_window · close_window · activate_window`

> **Composition (v1.1):** 17 core interaction tools + 6 bookmark tools + 5 tab-group tools + 5 window tools + enhanced_snapshot = **34 tools**; + `file_ops`×3 workspace extension → **37 total** (bookmarks/tab-groups require the Chrome extensions API or a session-vault surface, not raw CDP — P2.3). **Read-only diagnostics** (console/network/perf) ride the same CDP session. **Post-v1 candidates:** `a11y_audit` (embedded axe-core), annotated screenshots (numbered labels tied to refs), `find` semantic locators, batch mode, `read` upgrade (markdown negotiation + llms.txt ancestor walk + filter/outline, no-browser HTTP path).

- **snapshot**: page → indented **accessibility tree** via CDP Accessibility domain with stable `[ref=eN]`, `interactive` vs `full` modes, depth caps 1..=100, **iframes stitched inline** (P2.2); `slim: true` drops non-actionables (~90% token cut).
- **act**: click/click_at/type/type_at/fill/press/hover/focus/check/uncheck/select/scroll/drag/dialog_accept/dialog_dismiss; returns **post-settle diff** (no follow-up snapshot needed).
- **diff**: line-diff of two snapshots with `+n/-n` and **URL-change short-circuit**.
- **read/grep**: page → clean markdown via in-process DOM walker; grep line matches; large pages truncate → saved file. **Ref-invalidation invariant:** every state-changing action invalidates prior refs — re-observe before the next action, never act on stale refs.
- **wait** (`{for: text|selector}` or ms); **evaluate** (CDP Runtime.evaluate); **download/upload/pdf** (temp-file routing); **tab_groups/windows/history** management.
- Annotations: read-only on read tools (`readOnlyHint`); `run`/`evaluate` = open-world + always permission-checked.

## 8.3 The snapshot→act loop (token-efficient by construction)

`snapshot → act → (act returns diff) → re-snapshot only for fresh refs`. Refs scoped to (document_id, url) — never stale across navigation. Interactive mode default = ~90% token cut. Browser instructions embedded in the system prompt: batch actions, `Promise.all` in run, close your own tabs, respect ownership.

## 8.4 `run` — Think-in-Code scripting (Rust everyaios-script)

- rquickjs/QuickJS-NG async runtime; **64MB heap / 512KB stack / 30s / 1K log lines / 2MB return** (P2.5).
- Exposes the `browser` SDK (`pages.*`, `observe().snapshot()/diff()/resolveRef`, `input().*`, `nav().*`, `read/grep/wait/screenshot/evaluate/pdf/download/upload`, `tabGroups/windows`, raw `browser.cdp(method, params)` escape hatch).
- **InnerCallHook (audit guarantee):** every primitive inside a script is authorized against ownership + permissions, recorded as a child audit row, and page-creations claimed/grouped like `tabs new`. Scripts **cannot** bypass the audit trail or touch foreign tabs. `pages.list()` returns `ownership: mine|user|other-agent`. Fallback: `evaluate` for single expressions. FS syscall brokering via `everyaios-guard::fs_broker` (P7.8).

## 8.5 Session replay (Rust everyaios-audit + injected recorder)

- **Recorder**: injected content-script (CDP `Page.addScriptToEvaluateOnNewDocument`) streams DOM/mutation/scroll/click events → **NDJSON batches** with `x-recording-tab-id/document-id/batch-id` + gap header (P2.10).
- **Ingest**: chrome document-id validation; **sticky `has_gap`** on malformed/dropped lines (no fake-complete replays); one-transaction commit; durable event log + idempotency classes + `recovery_plan`.
- **Storage**: `~/.everyaios/replays/` NDJSON + `~/.everyaios/screenshots/` JPEGs + SQLite index. **Playback**: scrubber + synced action timeline; **Watch** + **Stop** on cockpit cards. Optional HAR beside NDJSON. Retention 7 days default; wipe = delete files.

## 8.6 Browser-integrated capabilities

- **Authenticated scraping**: logged-in sessions → tiered scrape cascade (static extract → agent browser render → OCR) → RAG ingest.
- **Reader + chat overlay** on any open tab ("summarize this page", "extract the table").
- **The browser IS the connector hub's first path**: the agent drives logged-in Gmail/Notion/Linear directly — no API keys (the 80% solution).
- **Form automation + workflow execution** across multi-step sites (scheduled tasks re-drive the same tabs headlessly).

## 8.7 Failure handling

- CDP disconnect/reconnect (re-resolve target, re-attach, epoch-guard stale commands).
- Nav mid-action → wait/settle + freshness check; stale refs surface a "re-snapshot" error.
- Recorder gaps → honest `has_gap`; timeouts per tool (browser 120s, run 30s, wait bounded; watchdog re-arms per byte).
- Blocked/error sites → structured errors (status, cloudflare/captcha detection) → **challenge handler (§8.10)**; suggest retry later or via search.

## 8.8 Engine detail (strategies behind the façade — verified mid-2026)

Tier 1: **Lightpanda** (Zig, AGPL, beta — ~123MB peak/100 pages, 9–11× faster; no WebGL/canvas/audio; no native Windows) is the **default**; **Obscura** (Rust, Apache-2.0 — full CDP *server* with 14 domains + custom `LP.getMarkdown`, embedded MCP server, `obscura serve/scrape` + parallel workers, SSRF guard + `file://` blocked by default, bounded queues, ~30MB RSS) is the opt-in escalation path (adapt: spawn `obscura serve` via ProcessSupervisor). The one shared classifier `everyaios-guard::netfloor` backs `urlfloor`/`egress`/TOCTOU and the tier engine, so a navigation's destination floor cannot drift from the tool path's. Tier 2 is system Chrome/Edge (+ chrome-for-testing fallback) for interactive/authenticated/pixel/WebGL/login work. Tier 3 (Camoufox/Fortress/CloakBrowser) is user opt-in for hard defenses.

## 8.9 Session Vault — every account in one place, permission-gated access

- **Stored (encrypted, SQLCipher, everyaios-vault):** per-site **full storage context** — cookie jars (host-keyed) + localStorage + sessionStorage + IndexedDB + auth headers (persist/restore per session). **Multiple accounts per site** = separate `Session` records (P2.7: `SessionVault` schema v5 — capture/grant/inject/rotate/expiry/audit; cookie glue in `everyaios-browser/src/session.rs`).
- **Capture paths:** (1) sign-in-in-browser → `Network.getCookies` → sealed into the vault (MFA/SAML-safe); (2) session inheritance — attach to the user's Chrome profile (Chrome 136+ ignores remote-debugging switches on the *default* profile: non-default `--user-data-dir` or explicit pairing; `inherit_cookies_from_chrome`); (3) user-initiated import (passwords/autofill/`Local State`).
- **Permission-gated access:** every site+account pair carries a Trust-Ladder requirement; agent request → Guard-2 card → rule cached. **The agent never sees raw cookies** — the vault injects them at request time and revokes at session end. Per-site/per-account usage metering → `session_uses` audit rows. **Rotation** on 429/blocked/expired; **expiry hygiene** (TTL tracking, re-auth nudge, per-site wipe, encrypted export).

## 8.10 Challenge handler — captchas of all types, ordered by cost/effectiveness

1. **Prevention** — session inheritance (user's own high-reputation profile); real engines, zero automation flags; optional behavioral realism (`everyaios-browser/src/humanize.rs` — Bézier mouse paths, typing cadence, host allow-list, off by default, P2.9); rate-limit discipline; optional user-provided proxies.
2. **Human-in-the-loop pass-through (default)** — the tab surfaces in the visible webview; the user solves once; cookies captured to the vault. Covers reCAPTCHA v2/v3, Turnstile/Managed, hCaptcha, MFA.
3. **Local solvers** — proof-of-work captchas (Altcha/Friendly Captcha: pure SHA-256 puzzles, solved in everyaios-core — P2.8 `solve_pow`/`verify_pow`); LLM visual grounding via the snapshot→act loop (`route_visual` contract). **Turnstile (including hidden mode) is Cloudflare-managed — human-in-loop or BYO, never claimed locally solvable.**
4. **BYO solver APIs (optional, user's own key)** — CapSolver/CapMonster/2Captcha as a pluggable `ChallengeSolver`, permission-gated; never default, never bundled.
5. **Not in scope:** anything outside the user's own authorized accounts + vault.

## 8.11 Tool Result Contract (TC-4.1)

```
{
  "success": boolean,
  "output": string,        // stdout or primary result (truncated per 05 §5.10 RTK rules)
  "stderr": string | null, // stderr if any (always preserved, never truncated)
  "exit_code": number | null, // for shell/script tools
  "duration_ms": number,   // wall-clock execution time
  "truncated": boolean,    // true if output was truncated by budget
  "ref": string | null     // pass-by-reference handle for large outputs
}
```

**Rules:** `stderr` always preserved in full; `exit_code` always preserved (non-zero triggers reflection); `output` subject to per-command RTK compression; >2MB ⇒ `ref` handle (C10); `duration_ms` feeds budget tracking; results wrapped in `<tool_result>` delimiters.

## Repo-comparison additions (briefs 01–19)

> Delta group: *"ARCH/08-BROWSER-LAYER.md + ARCH/DESKTOP.md (+ E9)"* (`REPO-COMPARE/DELTA-ANALYSIS.md` §3).
> Evidence paths are repo-relative under `/home/sarvesh/business_Dev/REPO-COMPARE/clone2/`.
> Dispositions are the briefs' tags. Items with arrows into files not owned here carry `→ <file> §…`
> and are cross-domain deferred; CUA-bound items in this group live in [`DESKTOP.md`](DESKTOP.md)
> (this document's explicit non-goal rule keeps desktop computer use out of the browser façade), and
> E9 rows live in `09-FEATURE-MATRIX.md` (not owned here).

- **06-agent-browser** · `add` — SOURCE: agent-browser (Rust workspace) · evidence: `agent-browser/cli/src/native/ref_map.rs`, `…/snapshot.rs`, `…/element/interaction/actions.rs` — LOGIC: durable refs keyed by (session, loader/document identity) with explicit invalidation, role+nth ref naming, covering-element fail-early and dialog pending-release turn stale-element races into deterministic failures with never-recycle tests — our ref discipline must meet rustwright's stricter central-invalidation form (wholesale clear on state change). → target §8.2–§8.3 (ref-invalidation invariant).
- **08-rustwright** · `add` — SOURCE: rustwright (MIT) · evidence: `rustwright/agent/src/lib.rs` (FailureMetadata, ActorQueue `COMMAND_QUEUE_CAPACITY=64`, CancelToken), `rustwright/src/lib.rs` — LOGIC: `FailureMetadata{kind, phase, command_written, retryable}` gates every auto-retry (retryable only when no substep committed) over a bounded 64-slot dispatch queue with per-op cancel tokens, so a retry can never double-apply a committed effect. → target §8.7; → WORK.md (Work-side cancellation contract) cross-domain deferred to the WORK lane.
- **06-cc-switch** · `add` — SOURCE: cc-switch (Tauri v2) · evidence: `cc-switch/src-tauri/src/proxy/circuit_breaker.rs`, `…/proxy/provider_router.rs`, `…/services/speedtest.rs` — LOGIC: a Closed/Open/HalfOpen breaker behind netfloor (half-open permit accounting, dual trip on count + error-rate, `app:provider` keying, hot config update preserving state) with official endpoints marked no-failover and warm-up+timed latency probes (2–30s clamp, never sending auth) supplies measured route evidence for Guard-mediated egress failures. → target §8.7 (structured failure handling beside the CDP disconnect ladder); route-selection half → ROUTING.md / everyaios-catalog cross-domain deferred; cc-switch's plaintext key storage is explicitly **not** adopted (I10, vault-only).
- **10-14** · `add` — SOURCE: everything-whole-system-file-search-skill (MIT) · evidence: `everything-whole-system-file-search-skill/scripts/search.py`, `SKILL.md`, `README.md` — LOGIC: the Everything HTTP server (loopback `127.0.0.1:47512`, stdlib-only client, read-only) is a candidate Windows whole-volume file-discovery backend that must ship as a read-only façade with netfloor-safe loopback handling. → everyaios-storage (impl target; ARCH/00-INDEX research 49) + pack surface — cross-domain deferred (storage lane).
- **10-15** · `improve` — SOURCE: everything-whole-system-file-search-skill (MIT) · evidence: same as 10-14 (`scripts/search.py` honest `offset + displayed >= total` pagination; `SKILL.md` literal-query + no-fallback-substitution discipline) — LOGIC: every search façade passes queries literally (no silent wildcard injection, no fallback-tool substitution after empty results) and always reports `total` vs displayed range so callers can detect incomplete pagination. → EXTERNAL-AGENTS.md §3 (search façades); everyaios-storage / core-search — cross-domain deferred.
