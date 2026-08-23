# ARCH — The Desktop Agentic-OS Architecture (Hybrid)

> **Status:** v1.0 (architecture design, 2026-08-06; re-verified 2026-08-21; **agent control plane frozen v3.47 — 2026-08-23**) · Works alongside the **master spec `../DESKTOP-APP-SPEC.md` (now v3.49 — see `SPEC-CHANGELOG.md`)** — this ARCH series adds the research-derived Rust layer; the two stay in sync (09 mirrors spec §0).
> **Docs:** 00-INDEX + 01–12 (12 = UI/UX specification and layout design — **v3.1, 2026-08-17: activity-rail work cockpit → multi-view tabbed panel (§4.1b) + full-fidelity tool surfaces (§4.1c)**, doc 67 §6) + research docs 49–83 (storage intelligence, generative-UI/image/voice/email gaps, aider recheck, gap-pass-2 hierarchy/search-stack, formalization, dep+catalog audit, agent-browser ecosystem, agentic dev-environments + closed-source agents, ACP registry + subscription auth, repo batch 2 — OmniRoute provider/routing goldmine, OmniRoute deep-dive, TencentDB Agent Memory, capability deltas — Sites/heartbeat + UI finalization, final all-rounder market research — H30/H31/H32 + two-channel injection; doc 69 = ACP ecosystem/harness → P17, doc 70 = MCP-directory → P18, docs 71–79 = batches 4–9 + local-model core → P19–P27, docs 80–82 = benchmark/moat/priority reviews → §9.1/§10/P28, doc 83 = competitor batch openworker/cc-switch/skales/deepseek-harness → P30).
> **Decision (user-confirmed):** **Hybrid** — the existing `@personal-ai/core-*` TypeScript engine (≈100 test files in `APP/packages/`) stays as a supervised Bun-compiled sidecar; a **Rust layer owns the paths where research proved Rust wins**: browser/CDP control, script-eval sandbox (rquickjs), security guards, audit/replay ingest, **storage intelligence** (new `everyaios-storage` crate, doc 49). **No scope compromise**: every capability in the research corpus (docs 01–84, **282 repos**) is derived in `09-FEATURE-MATRIX.md` (149 rows).
> **Working name:** "EveryAIOS" (from the v2.0 spec's `~/.everyaios/`) — canonical across code + docs. Final branding is a **P12.6 GTM item**, not an open build dependency.

## The two specs reconciled

> Historical reconciliation (columns describe earlier spec generations; the **live master spec is `desktop_app/DESKTOP-APP-SPEC.md` v3.49 — hybrid**, in sync with this ARCH).

| | Earlier v2.0 spec | All-Rust research spec (`RESEARCH/desktop_app/DESKTOP-APP-SPEC.md` — **superseded** draft) | This architecture |
|---|---|---|---|
| Engine | TS sidecar only | All-Rust | **Hybrid (both)** |
| Browser | a11y-snapshot tool | CDP over system Chrome | **CDP child-process (Rust) + injected recorder** |
| Office | block-patch (TS, superseded) | surgical OOXML | **Surgical OOXML part-patching + IronCalc + pdf-lib/lopdf** |
| BYOK | provider clients built | ProviderAdapter | **Multi-key rings per provider + fallback rotation + OAuth** |
| Connectors | MCP-first (decision 2026-08-16): MCP Servers + Native + Tool Catalog + Local Auth Bridge | local-first hub, no cloud proxy | **MCP is the platform; Composio/Zapier/Nango aggregator tabs removed (cloud SaaS holding OAuth tokens server-side)** |
| Memory | built algos (TS) | 7 algorithms + SOTA | **Built algos kept + SOTA retrieval layer (mem0/Letta patterns)** |
| Guardrails | dual-guard (regex + diff cards) | Trust Ladder + interceptors | **Dual-guard in Rust + Trust Ladder in TS engine (kept)** |

## Reading order

> **Product invariants (from SPEC §1 — every ARCH doc must preserve them):** one project = one folder + one session tree · one ticket model (ARCH/06 §6.10) as the only mutation path · one append-only event log (doc 53's 10 event types) · one Progress timeline that tabs/panels disclose rather than duplicate.

1. **01-SYSTEM-ARCHITECTURE.md** — processes, layers, IPC, lifecycle (the map)
2. **02-MODULE-LAYOUT.md** — Rust crates + TS packages, ownership, what's new vs exists
3. **03-BYOK-KEYRINGS.md** — multi-key per provider, fallback/rotation, routing, OAuth subscriptions
4. **04-OFFICE-ENGINE.md** — open + edit Word/Excel/PPT/PDF (surgical, byte-preserving)
5. **05-TOKEN-ECONOMY.md** — input control: prefix-cache, compaction, snip, budgets, crystallization
6. **06-SECURITY-GUARDRAILS.md** — trust ladder, dual-guard, sandboxes, ownership, audit, injection defense
7. **07-MEMORY-CONTEXT.md** — 5-tier memory, 7 algorithms, multi-scope, SOTA retrieval
8. **08-BROWSER-LAYER.md** — CDP, 37 tools, a11y snapshot/refs/diff, script-eval, replay
9. **09-FEATURE-MATRIX.md** — the complete capability→feature→module→status derivation
10. **10-BUILD-PLAN.md** — phases with exit criteria
11. **11-AI-CHAT-FEATURES.md** — AI chat derivation: copy (from APP engine + Hermes/etc.), convert, reject
12. **12-UI-SPEC.md** — UI/UX specification **v3.3**: 48px activity rail + multi-view tabbed viewport (Folder/Shell/Browse/Code + ONE Office flyout + session views + plugin slot), views contract, takeover/resume, per-session tab/layout persistence (2026 work-cockpit pattern — Claude Views/Cursor/ChatGPT Work/Devin, doc 67 §6)
13. **research docs 49–51** — storage intelligence (49: eDirStat/UltraSearch/WinDirStat/fclones → `everyaios-storage` + matrix D9–D11/G7), generative UI/image/voice/email gaps (50: AG-UI → H25, A10, F14–F15, H26–H28, H15 ext), aider recheck (51: doc 46 corrections — edit formats ~9, providers 100+, "4.2×/71%" flagged third-party)
14. **research doc 52** — gap pass 2 (Aider-in-F12 + surgical hierarchy, J21 escalation rules & decision packages, D12 storage health, G8 tiered search cascade + Algorithm #33, E9/J14 refs; 26 repos live-verified, 8 hallucinated flagged → ledger 218)
15. **research doc 53** — formalization of 4 review gaps (credential broker, ticket contract, durable events + idempotency, shortest-path routing) → SPEC v3.10 + ARCH/06 §6.9–6.11
16. **research doc 54** — third-party dependency + catalog audit (LadybugDB confirmed → ledger 219; xxhash-rust BSL → twox-hash; `focus_window` verified rename-safe)
17. **research doc 55** — agent-browser ecosystem (Obscura source-verified 21K★, Lightpanda/Steel/CloakBrowser honesty passes) → P2.4/P2.5 refs, 3 repos → ledger
18. **research doc 56** — agentic dev-environments + closed-source agents (aider/opencode/Copilot CLI patterns) → P11.5.9/P12, 4 repos → ledger
19. **research doc 57** — ACP registry + subscription-auth boundary (official Claude ACP wrapper allowed; token harvest blocked) → F12/J17, 1 repo → ledger
20. **research doc 58** — repo batch 2 (OmniRoute provider/routing goldmine, taste-skill (I2≠C9), ppt-master/guizang, univer, codebase-memory-mcp, llmfit, GenericAgent, better-harness, holaOS competitor, worldmonitor, MAF, DeepSeek-TUI→CodeWhale correction) → A1–A7/I2/I5/I7/D3/H5/F12, 19 repos → ledger
21. **research doc 59** — OmniRoute source-level deep-dive (13-factor scoring + mode packs + budget headers + 19 strategies + provider taxonomy) → steal-spec for A2/A3/A6/A7/A9/P6.10/J11
22. **research doc 60** — TencentDB Agent Memory deep-dive (4-asset taxonomy + L0→L3 distillation + governance + agent-loadout) → C1/C2/C3/C7/C8/I2/I7 + F12/J17, 1 repo → ledger

## Grounding

All decisions trace to `RESEARCH/desktop_app/` docs 01–84 and the 282-repo ledger (doc 27 + doc 46 additions + docs 49–50: +22 + doc 52: +26 + doc 54: +1 + doc 55: +3 + doc 56: +4 + doc 57: +1 + doc 58: +19 + doc 60: +1 + doc 61: +8 + doc 62: +0 + doc 63: +0 + doc 64: +0 + doc 65: +19 + doc 66: +4 + doc 67: +3 + doc 83: +1 repos — doc 63 is the 37-repo steal ledger, doc 64 the giants code-level deep-dive (rustdesk/ladybird/serenity/brave/chromium cloned + source-read; pattern-sources only), doc 67 the capability-delta batch (bolt.diy/hatchet/durable-execution-the-hard-way cloned + source-read; Sites + heartbeat steals + UI/UX finalization). Key source deep-dives: 19 (BYOK providers), 28/29 (office), 32/31 (token economy), 33 (BrowserOS — browser + audit + compaction), 05/16 (agentic coding: pi/Hermes/Reasonix/opencode), 03 (vision + security + memory), 13 (connector hub), 06/09 (browser/agentic OS), 46 (Aider + Devin Cloud — UI/UX, RepoMap, edit strategies, automations), 63 (37-repo steal ledger: harness/browser/office/user-capability clusters), 64 (giants code-level: sandbox profiles, syscall broker, adblock crate, NAT traversal), 67 (Sites/heartbeat/proactivity/inline-edit/kanban deltas + activity-rail UI finalization). Final-pass SOTA: doc 34.
