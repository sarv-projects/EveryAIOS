# 42 — Evidence Map

> **Status:** Frozen v1 (frozen 2026-09-26; drafted P4). How claims get evidence, how the implementation will be accepted, and the consolidated **code-phase fix register**. This doc is the bridge between the frozen docs and the future code phase.
> **P7 pass (2026-09-26):** line-checked; cross-references verified.
> **P9 verification pass (2026-09-26):** read line-by-line; fixes applied where needed (owner-directed; re-freeze follows).
> **Rule:** no claim ships without evidence; a passing unit test proves that behavior only (never “it works”); readiness claims require real platform acceptance records.

## 1. Evidence rules (recap)

- **External claims:** `path:line` for clones, URL for primary docs; confidence H/M/L; `[inference]` labeled; `UNVERIFIED` allowed only temporarily and must say what would verify it.
- **Lost provenance:** the original `/tmp` recon (reports 01–29) was destroyed by a temp cleanup; v0 comparative work survives in `REPO-COMPARE/**` + `BRIEFS/**`. v1 research lanes re-verified key claims from fresh clones with pinned HEADs recorded in each deliverable. Never cite the lost reports.
- **Windows-first acceptance:** a mock, browser preview, static catalog entry, or unit-only result is **not** acceptance evidence for readiness claims (repo policy, carried into v1).

## 2. Evidence index (v1)

| Source | What it proves |
|---|---|
| `ARCHIVE/v1-research/memory.md` (406 lines) | Memory mechanisms + minimal design; mem0/Graphiti/Letta/NOOA/claude-mem/Codex/Claude Code evidence |
| `ARCHIVE/v1-research/agent-harness-verification.md` (717 lines) | Codex/Grok/OpenCode/DeepSeek claims (8 VERIFIED / 3 PARTIAL / 0 WRONG) + corrections; pinned clone HEADs |
| `ARCHIVE/v1-research/ui-architecture-evidence.md` (1,710 lines) | Current theme/UI inventory + competitor chat rendering + shell/composer proposals |
| `ARCHIVE/v1-research/mcp-provider-verification.md` (641 lines) | MCP spec state (2026-07-28), dual-era requirements, clone implementations, SDK state |
| `ARCHIVE/v1-research/world-model-verification.md` (359 lines) | UIA reality, MFT/USN identity, watcher overflow semantics, browser-world patterns |
| `ARCHIVE/v1-research/workflow-engine-verification.md` (690 lines) | Temporal/n8n/Copilot Studio claims, trigger taxonomy, minimal durable design |
| `ARCHIVE/v1-research/office-runtime-verification.md` (448 lines) | OfficeCLI/GenOffice claims, format-engine reality, resident design, op sets |
| `REPO-COMPARE/**` | 190-item register (count corrected in `DISPOSITION.md` §a), dispositions, license ledger, briefs, clone2 (55 clones) · clone3 (2) |
| In-repo code (`crates/**`, `ui/**`, `src-tauri/**`) | Read-only facts about the frozen baseline (bugs, seams, existing primitives) |

## 3. Acceptance mapping (implementation phase)

Each doc’s claims map to a verification class; tests are sized to the claim. (Module docs carry the specific gates; this table is the map.)

| Doc | Primary acceptance evidence |
|---|---|
| `10` Kernel | Unit tests: ids, error taxonomy, config layering, migrations (forward-only/idempotent). |
| `11` Work | Lifecycle tests; kill/restart resume; lane limits; budget pause+surface; queue rebuild from log. |
| `12` Trust | Fail-closed tests; ticket lifecycle (issue/expire/revoke/epoch); vault isolation; denial + audit coverage; rate-limit tests. |
| `13` Capability | Resolver/failover/guidance tests; epoch invalidation; census gate (unique ids, coverage). |
| `14` Providers | Adapter conformance suite per class; MCP dual-era detection tests; egress enforcement; health/epochs. |
| `15` Agent X | Loop tests (no early finish); completion contracts; delegation receipts; crash resume; adapter parity (same guard path as external). |
| `16` Context | Budget/feasibility tests; overflow recovery; cache-stability checks; projection filtering. |
| `17` Memory | The §13 eval suite: write quality, update/conflict, recall golden set, budget honesty, isolation, lifecycle, ops. |
| `18` Models | Router matrix tests; local discovery; reasoning mapping; usage accounting. |
| `19` Runtime | Process/sandbox tests; helper consent; detached rehydration; **Windows sandbox acceptance record**. |
| `20` Workflow | Durability suite: kill/restart, exactly-once occurrences, misfire policies, approval flows, version pinning. |
| `21` World | Collector tests + consent records; overflow/rescan; **Windows acceptance matrix** (real apps: Notepad/Explorer/Office/UWP/Electron). |
| `22` Office | Round-trip/fidelity suite per format; resident crash tests; redact extraction check; op-registry docs-sync gate. |
| `23` Browser | Task suite (snapshot/act/verify); ref invalidation; adapter fallback; no-evasion checks. |
| `24` Computer-Use | Ladder fallback tests; per-call budget/isolation; vision sizing caps; real-app matrices on Windows. |
| `25` Files | Identity tests (incl. incarnation); lease conflicts; watcher overflow; cursor recovery. |
| `26` Code | Incremental index tests; LSP fallback; worktree provision/merge; test-runner wrappers. |
| `27` Search | Scope/abstention tests; freshness flags; p95 targets. |
| `28` Comms | Connector auth/reconnect; send approval + no-duplicate-send; event ingestion. |
| `29` Artifacts | Version immutability; GC vs pin; replay; gateway permissions. |
| `30` Events | Delivery/idempotency/replay; retention; poison isolation. |
| `31` Skills/Plugins | Activation relevance; review gate; crash-loop auto-disable; version skew. |
| `32` Channels | Gateway 7-item projection tests; ACP mapping; approval routing. |
| `34` Verification | Risk→depth matrix tests; unverified-state surfacing; repair paths. |
| `40`/`41` | Flow e2e scripts + edge-case regression tests. |
| `AGENTCOWORK-SPEC` / `AGENTCOWORK-UI` | Product acceptance criteria + UI checks (defined by the product + UI docs). |

## 4. Code-phase fix register (re-verify each before fixing)

**Standing rule:** v1 is frozen; each item is re-verified against the current tree before its fix lands (some v0 findings predate the freeze).

| FIX | Item | Source / evidence |
|---|---|---|
| FIX-01 | Connector OAuth token custody → vault (verified defect in v0 audit) | `MASTER-COMPARISON` SEC-1 |
| FIX-02 | Control-plane rate limiting for `nativeCall`/Guard (verified absent) | SEC-2 |
| FIX-03 | ACP permission bridge: once/always/reject + diff previews, fail-closed | SEC-3 |
| FIX-04 | UI-blob secret scan | SEC-21 |
| FIX-05 | `skills_uninstall` arbitrary recursive deletion (`skill_store.rs:442`) | v0 audit (re-verify path) |
| FIX-06 | Unticketed `fs_*`/`terminal_run` with false `AgentTicket` provenance | v0 audit (re-verify) |
| FIX-07 | Hardcoded governance badge `SelfContained { channel_b: true }` (`acp_cmds.rs:1676`) — the code comment argues it is correct post-ADR-0005; **annotated close pending a `DEC`/evidence note, not a code patch** | v0 audit + `code-state-inventory` §7 item 5 / §8 item 6 |
| FIX-08 | `tool/commit` has no live driver | v0 audit (re-verify) |
| FIX-09 | netfloor bypasses: direct `ureq` calls in `core/src/tools.rs:2414`, `core/src/messaging.rs:35`, `core/src/search_config.rs:98`, `core/src/challenge.rs:177`, `core/src/models/*`, `vault/src/oauth.rs:1022-1067` — whether each site is pre-flighted by `netfloor` is unclear from a static read (trust wave) | v0 audit + `code-state-inventory` §7 item 4 |
| FIX-10 | Windows file identity: `walk.rs:131-157` zeroes dev/ino → corrupts dedup (`dedup.rs:106-118`) | `world-model-verification.md` §3 |
| FIX-11 | `usn_winapi.rs` unwired — wire as W1 delta source | same |
| FIX-12 | MCP remote client sends no `_meta`/modern headers (`remote.rs`) | `mcp-provider-verification.md` |
| FIX-13 | MCP façade missing `server/discover` + `Mcp-Method`/`Mcp-Name` validation | same |
| FIX-14 | Office resident/lease missing (commit/snapshot primitives exist) | `office-runtime-verification.md` §4 |
| FIX-15 | PDF “redact” annotates instead of removing content (P0) | v0 audit + `office-runtime-verification.md` |
| FIX-16 | fsync before atomic swap in the Office commit path — the XLSX save path is the gap (`src-tauri/src/xlsx_cmds.rs:301-312` `atomic_write` = write + rename, no fsync); the docx/PDF paths already use `everyaios_office::write_atomic` (fsync) | `office-runtime-verification.md` §1.A |
| FIX-17 | UIA collector hardening (AutomationId-as-hint, UIAccess limits, CDP for browser) | `world-model-verification.md` §2 |
| FIX-18 | WGC readiness verification for window capture | same §6 |

## 5. Pass gates

- **P6 freeze conditions:** every doc passes `00-INDEX` §5; the interop matrix is updated; the fix register is owned by the code phase; no `UNVERIFIED` claim remains silent.
- **Post-freeze:** the code phase re-verifies FIX-01…18, then implements per `TODO.md` (W0–W4); the register's historical sequencing sketch is `MASTER-COMPARISON §5` (Wave 0 P0 → Wave 1 floors → Wave 2 context/token → Wave 3 engine hosting → Wave 4 work/scheduler → Wave 5 polish).

## 6. Open questions (`OQ-EVID-*`)

1. Where acceptance fixtures live (test corpus ownership) once code starts.
2. Which Windows acceptance matrix defines “ready” per domain (apps + flows list).
3. Whether the fix register becomes `TODO.md` items directly or a separate tracker first.

## 7. Evidence

All v1 lane deliverables (§2) · `REPO-COMPARE/MASTER-COMPARISON.md` §5 (sequencing) · `ARCH/22-OFFICE.md` §10, `ARCH/14-PROVIDERS.md` §4, `ARCH/21-WORLD-MODEL.md` §10, `ARCH/25-FILES.md` §2 (fix items) · repo audit notes as marked (re-verify before fixing).
