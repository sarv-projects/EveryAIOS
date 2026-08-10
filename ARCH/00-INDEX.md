# ARCH — The Desktop Agentic-OS Architecture (Hybrid)

> **Status:** v1.0 (architecture design, 2026-08-06; re-verified 2026-08-09) · Works alongside the **master spec `../DESKTOP-APP-SPEC.md` (now v3.10)** — this ARCH series adds the research-derived Rust layer; the two stay in sync (09 mirrors spec §0).
> **Docs:** 00-INDEX + 01–12 (12 = UI/UX specification and layout design) + research docs 49–52 (storage intelligence, generative-UI/image/voice/email gaps, aider recheck, gap-pass-2 hierarchy/search-stack).
> **Decision (user-confirmed):** **Hybrid** — the existing `@personal-ai/core-*` TypeScript engine (≈100 test files in `APP/packages/`) stays as a supervised Bun-compiled sidecar; a **Rust layer owns the paths where research proved Rust wins**: browser/CDP control, script-eval sandbox (rquickjs), security guards, audit/replay ingest, **storage intelligence** (new `everyaios-storage` crate, doc 49). **No scope compromise**: every capability in the research corpus (docs 01–54, **219 repos**) is derived in `09-FEATURE-MATRIX.md` (138 rows).
> **Working name:** "EveryAIOS" (from the v2.0 spec's `~/.everyaios/`). Final name TBD.

## The two specs reconciled

> Historical reconciliation (columns describe earlier spec generations; the **live master spec is `desktop_app/DESKTOP-APP-SPEC.md` v3.10 — hybrid**, in sync with this ARCH).

| | Earlier v2.0 spec | All-Rust research spec (`RESEARCH/desktop_app/DESKTOP-APP-SPEC.md` — **superseded** draft) | This architecture |
|---|---|---|---|
| Engine | TS sidecar only | All-Rust | **Hybrid (both)** |
| Browser | a11y-snapshot tool | CDP over system Chrome | **CDP child-process (Rust) + injected recorder** |
| Office | block-patch (TS, later) | surgical OOXML | **Surgical OOXML part-patching + IronCalc + pdf-lib/lopdf** |
| BYOK | provider clients built | ProviderAdapter | **Multi-key rings per provider + fallback rotation + OAuth** |
| Connectors | Composio/Zapier/Nango/Local Auth Bridge | local-first hub, no cloud proxy | **Same 5-engine hub; cloud engines optional/self-hosted** |
| Memory | built algos (TS) | 7 algorithms + SOTA | **Built algos kept + SOTA retrieval layer (mem0/Letta patterns)** |
| Guardrails | dual-guard (regex + diff cards) | Trust Ladder + interceptors | **Dual-guard in Rust + Trust Ladder in TS engine (kept)** |

## Reading order

1. **01-SYSTEM-ARCHITECTURE.md** — processes, layers, IPC, lifecycle (the map)
2. **02-MODULE-LAYOUT.md** — Rust crates + TS packages, ownership, what's new vs exists
3. **03-BYOK-KEYRINGS.md** — multi-key per provider, fallback/rotation, routing, OAuth subscriptions
4. **04-OFFICE-ENGINE.md** — open + edit Word/Excel/PPT/PDF (surgical, byte-preserving)
5. **05-TOKEN-ECONOMY.md** — input control: prefix-cache, compaction, snip, budgets, crystallization
6. **06-SECURITY-GUARDRAILS.md** — trust ladder, dual-guard, sandboxes, ownership, audit, injection defense
7. **07-MEMORY-CONTEXT.md** — 5-tier memory, 7 algorithms, multi-scope, SOTA retrieval
8. **08-BROWSER-LAYER.md** — CDP, 34 tools, a11y snapshot/refs/diff, script-eval, replay
9. **09-FEATURE-MATRIX.md** — the complete capability→feature→module→status derivation
10. **10-BUILD-PLAN.md** — phases with exit criteria
11. **11-AI-CHAT-FEATURES.md** — AI chat derivation: copy (from APP engine + Hermes/etc.), convert, reject
12. **12-UI-SPEC.md** — UI/UX specification: 3-column layout (sidebar/chat/workspace), 9 workspace tabs, takeover/resume flow, automation builder, memory browser, design tokens (derived from Devin Cloud screenshots + research doc 46)
13. **research docs 49–51** — storage intelligence (49: eDirStat/UltraSearch/WinDirStat/fclones → `everyaios-storage` + matrix D9–D11/G7), generative UI/image/voice/email gaps (50: AG-UI → H25, A10, F14–F15, H26–H28, H15 ext), aider recheck (51: doc 46 corrections — edit formats ~9, providers 100+, "4.2×/71%" flagged third-party)
14. **research doc 52** — gap pass 2 (Aider-in-F12 + surgical hierarchy, J21 escalation rules & decision packages, D12 storage health, G8 tiered search cascade + Algorithm #33, E9/J14 refs; 26 repos live-verified, 8 hallucinated flagged → ledger 218)
15. **research doc 53** — formalization of 4 review gaps (credential broker, ticket contract, durable events + idempotency, shortest-path routing) → SPEC v3.10 + ARCH/06 §6.9–6.11
16. **research doc 54** — third-party dependency + catalog audit (LadybugDB confirmed → ledger 219; xxhash-rust BSL → twox-hash; `focus_window` verified rename-safe)

## Grounding

All decisions trace to `RESEARCH/desktop_app/` docs 01–54 and the 219-repo ledger (doc 27 + doc 46 additions + docs 49–50: +22 + doc 52: +26 repos). Key source deep-dives: 19 (BYOK providers), 28/29 (office), 32/31 (token economy), 33 (BrowserOS — browser + audit + compaction), 05/16 (agentic coding: pi/Hermes/Reasonix/opencode), 03 (vision + security + memory), 13 (connector hub), 06/09 (browser/agentic OS), 46 (Aider + Devin Cloud — UI/UX, RepoMap, edit strategies, automations). Final-pass SOTA: doc 34.
