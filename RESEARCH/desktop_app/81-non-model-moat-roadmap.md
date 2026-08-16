# 81 — Non-Model Moat Roadmap + Primary-Source Notes (reviewed, corrected, and repo-mapped)

> **Source:** external strategy artifacts provided 2026-08-17: (a) *EveryAIOS — Non-Model Moat Roadmap* (K1–K6 proof-carrying work, reversible change sets, demo compiler, work graph/passports, data-release firewall, trusted supply chain; delivery stages 0–5); (b) *Desktop AI Benchmark — Current Primary-Source Notes* (competitor claim ledger, time-stamped 2026-08-17).
> **Verification:** all primary-source claims in (b) cross-checked live 2026-08-17 against first-party pages/docs; every EveryAIOS claim cross-checked against the actual codebase (`crates/`, `src-tauri/`, `ui/`, `TODO.md` reconciled 2026-08-16: 884 tasks / 438 done · workspace 1052 tests).
> **Repos:** 0 new — **ledger unchanged 281**.
> **Verdict:** the roadmap is the strongest strategy artifact yet — its Stage-0 gate is exactly the repo's live tool-executor seam, and K1–K6 compose already-built machinery more than they invent it. One critical correction: **"teach once" is no longer uncontested** — OpenAI shipped Record & Replay (2026-06-18) and Anthropic shipped "watch → skill" (2026), so K3's moat narrows to *zero-token local governed replay with halt-over-guess* (proven by OpenAdapt). One design correction: K5's firewall must declare two enforcement zones (broker-mediated vs OS-egress) — external ACP agents/MCP/browser have their own network stacks and cannot be governed by the broker alone.

---

## 1. Primary-source notes — verification verdict ✅

Every claimed competitor fact in the notes matches primary sources (all independently re-verified 2026-08-17):

| Notes claim | Verified |
|---|---|
| ChatGPT Work: Chat+Work+Codex in one desktop app, **every plan incl. Free**, global Windows/Mac, 2026-07-09 | ✅ openai.com/index/chatgpt-for-your-most-ambitious-work (2026-07-09) |
| Claude Desktop: Chat/Cowork/Code, parallel code sessions, browser preview, cross-session coordination, external tools, computer control, local/cloud/SSH/WSL, skills/connectors/plugins | ✅ Anthropic help-center + release notes (2026-08-06) |
| Copilot Cowork: M365-grounded plans, checkpoints, approval-before-apply, tenant identity/compliance/audit, cloud sandbox, cross-device (2026-03-09) | ✅ Microsoft Learn + product page + GA 2026-06-16 |
| VS Code: plan→edit→test→self-correct, multi-agent workspace, BYOK + Local + cloud harnesses, skills/MCP/hooks/plugins, per-action approvals + sandboxing + org policy (2026-08-12) | ✅ code.visualstudio.com/docs/agents |
| AnythingLLM / Jan (inline tool-argument approval cards + pre-approve option + explicit security warnings) / Cursor (isolated VMs, PRs, Slack/Linear/API, network controls) / Devin Desktop (VM per session, Kanban Command Center, Spaces) | ✅ docs + READMEs |
| Raycast (Ollama local models 2025-05, BYOK 2025-06, AI Extensions/Commands) / LM Studio Bionic (documents, coding, automations, computer control, voice, 2026-07-16) / Cherry Studio (multimodel, MCP, WebDAV, global search) / Comet (4 platforms) / NotebookLM→Gemini Notebook (renamed 2026-07-16; code exec, source discovery, reports/charts/docs/slides/sheets, AI Ultra + Workspace rollout) | ✅ all match |
| Zed (ACP origin, parallel agents) / Junie (broad edits, approvals+rollback, MCP, debugger MCP tools, AGENTS.md, `.aiignore`) | ✅ |
| **OpenAdapt demo compiler** — demonstrated GUI workflow → deterministic local program; zero model calls healthy runs; identity/effect/refusal gates; repair or halt (openadapt.ai/compare, 2026-07-18) | ✅ GitHub OpenAdaptAI/OpenAdapt + docs.openadapt.ai "identity, effect, and refusal gates" |

**Nits:** (1) the Claude Desktop source URL still reads `docs.anthropic.com/en/docs/claude-code/desktop` — the canonical location moved to `code.claude.com/docs/en/desktop` (same fix as doc 80); (2) the notes omit OpenAI **Atlas** and **Warp** from the browser/terminal rows (both are real 2026 desktop(-adjacent) products; compare doc 80 §2.2); (3) the "time-stamped to 2026-08-17" discipline is correct and should stay.

---

## 2. Roadmap evaluation — what stands

### 2.1 Thesis — correct
"Breadth is not the moat; an execution-quality system is." Identical to doc 80's conclusion. The moat framing (safe/verifiable/reversible/reusable/user-owned work) is the best articulation of the product so far.

### 2.2 Stage 0 — the single most important line in all four artifacts
> "Before any new K row… finish the live `proposal → Guard-1/policy → ticket → executor → event receipt → recovery` path."

That is exactly the **tool-executor seam** (spec §6 "Remaining"; TODO P6/P7 wiring; doc 80 condition 1). The roadmap correctly refuses to build moats on sand. **No K row and no scorecard "ship early" item that implies a write may ship before Stage 0.**

### 2.3 K1–K6 — mostly composition of already-built parts (repo-mapped)

| K | Already built (crates/TODO) | Net-new work | Verdict |
|---|---|---|---|
| K1 Work Receipts | J5 audit trail, P7.7 Merkle chain, GuardReceipt self-hash, EV1 evidence bundles, usage ledger, Trajectory view | Receipt schema/class, renderer, export, reproduction recipe | **Gated on Stage-0 executor; then high leverage** |
| K2 Change sets | J21 tickets, doc-53 durable events + 4 idempotency classes, office Snapshot rollback, E5 replay | Change-set coordinator + effect-class registry + recovery UI | **Gated on Stage-0; K2's effect-class table = doc-53 idempotency made truthful** |
| K3 Demo compiler | B8 crystallization, E5 replay, doc-73/P21 OpenAdapt queue, E9 computer-use (post-v1) | teach→compile pipeline (large) | **Flagship — see §3.1 correction (competitive status)** |
| K4 Work Graph + Passports | C6 graph store, C10 pass-by-reference (HandleRef), C12, blueprints, codeintel SCIP | Passport serializer + scope enforcement | **Post-K1 (receipts make the graph trustworthy); not "vague AI memory"** |
| K5 Data Release Firewall | Rust broker, vault, P7.6 injection defense, 06 §6.15 browser containment, J21 policy | Egress policy engine + release receipts + **OS-egress zone for ACP/MCP/browser (see §3.2)** | **Gated on Stage-0; two-zone design required** |
| K6 Trusted supply chain | I6 ABI design, F8 Installer (sha-pinned), RegistryPolicy allow-list, guard quarantine | Signatures, capability/fixture testing, reputation/rank, revoke | **Gate E for marketplace scale (P22/P23 blockers)** |

### 2.4 Judgment calls already made — no change
- ☑ K2 — "never promise a global ACID; expose truthful semantics" → matches doc-53 idempotency model.
- ☑ K3 — "first release prefers halt over guess" — matches OpenAdapt gates + our eval "no bad" philosophy.
- ☑ K4 — "inspectable/queryable/exportable/correctable/permission-bound — never opaque AI memory" — matches C1–C12 invariants and the no-silent-memory principle (spec §9.7).
- ☑ Team mesh / continuity = "optional, user-operated, never hidden" (roadmap §10/Stage 5) — exactly the founder-server ban (spec §8).
- ☑ The "do not add merely to look complete" list — endorsed wholesale; matches existing anti-features (no recursion, no silent autonomy, estop).

---

## 3. Corrections applied

### 3.1 🔴🔴 K3 competitive status — corrected (2026-08-17 search evidence)
- **OpenAI Record & Replay (2026-06-18, macOS):** demonstrated workflow → reusable Codex/ChatGPT **skill** (ChatGPT "What's new" docs; known limits: UI brittleness/availability).
- **Anthropic:** Claude "watch you work → skill" / "record-a-skill" (2026, Claude web/desktop).

**Consequence:** "teach once" is now a *headline feature at both labs*. The moat is NOT teaching; it is:
1. **zero-model-token deterministic replay** (their replays re-run the model every time; K3's compiled path does not — OpenAdapt-proven),
2. **governed repair with halt-over-guess** (identity/effect/refusal gates),
3. **local + offline + private** (their skills live in cloud accounts).

Reframed claim: *"the only local, zero-token, verify-gated demo compiler"* — still a flagship bet, now unambiguously aimed at a gap the labs choose not to fill. **Start the recording/capture half now** (it feeds 82 "add-now" surfaces and E2/E5/E9 regardless); build compile/replay after Gates A/B/C.

### 3.2 🔴🔴 K5 — two enforcement zones (acceptance test would otherwise fail)
| Zone | What passes through it | Governance |
|---|---|---|
| Mediated (the planned path) | Inbuilt engine → broker → provider (and MCP/connector wrappers routed through the broker) | Broker/policy engine — already designed; K5 layers release-receipts + redaction here |
| Un-mediated (agent-native) | External ACP agents (Claude Code, Codex CLI…), user MCP servers, browser child processes | **OS-level egress proxy (the "iron-proxy" egress credential firewall queued at TODO P17) + ARCH/06 §6.15 browser containment + declared envelope in the policy UI** |

The product must **declare the envelope** (what the App-guarantee covers vs what needs the egress layer) or the K5 acceptance test ("model routing cannot bypass the broker") is false by construction for ACP paths.

### 3.3 ⚠️ Framing
- "Assumes all v3.21 capabilities complete" — drop; replace with "the K-pillar is gated on Stage 0" (the roadmap already contains the gate; the assumption line contradicts it).
- K4 "switching moat" → call it a **switching-state advantage** (the passport is user-owned and portable; lock-in is voluntary by value, not technical).
- K1 `verification` field needs per-domain semantics: office recalc verifier (exists via IronCalc/LibreOffice oracle), code → EV1, **browser-outcome verifier is net-new**.

---

## 4. Final K-pillar contract (what we adopt)

1. **K1 Proof-Carrying Work Receipts** — after Stage 0 + Gate C. Composition only; new = schema/render/export.
2. **K2 Reversible Change Sets** — after Stage 0 + (recovery via E5). Truthful effect classes (doc-53).
3. **K3 Teach → Compile → Governed Replay** — flagship; **recording now, compile post-Gate D**; competitors land first but the zero-token/local/verify niche is open (OpenAdapt-proven).
4. **K4 Work Graph + Context Passports** — H2 post-receipts; overlay on C6/SCIP/C10; never opaque memory.
5. **K5 Data Release Firewall** — two zones (broker + egress); release receipts appended to K1.
6. **K6 Trusted skill/automation supply chain** — Gate E before any big marketplace; partial infrastructure exists (F8 pinning, RegistryPolicy).

Winning sentence (adopted as candidate for product copy):

> **EveryAIOS is the sovereign work runtime: goals → verified, reversible, reusable, user-owned work across any model, agent, file, browser, or tool.**

---

## 📊 Summary

- Primary-source notes: ✅ accurate (2 URL/docs-loc nits; 2 comparators missing vs doc 80).
- Roadmap: adopt with 3 edits — K3 reframe (competitors already ship teach-once; moat = zero-token governed local replay), K5 two-zone design, drop the "assumes complete" line.
- Sequencing that survives: Stage 0 → (1+2+5 foundations) → 3 flagship → 4 passports → 6 marketplace trust → team/continuity optional, never hidden.
- Decision linkage: the same Stage 0 = doc-80 §8 conditions 1+5 = scorecard Gate A/B/D — the four artifacts converge on one gate.