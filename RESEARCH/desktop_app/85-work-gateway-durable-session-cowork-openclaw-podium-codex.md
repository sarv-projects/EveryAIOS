# 85 — Work Gateway / Durable Session Layer (Claude Cowork · OpenClaw · Podium · Codex)

> **Added 2026-08-30** — the cross-surface durable-session research that drove **spec v3.64 (Work Gateway / Session Runtime) + v3.65 (hardening) + v3.66 (final reconciliation)**. This is the last major architectural research batch; the architecture is frozen as of v3.66. **0 new repos — ledger unchanged 282** (all four sources were already tracked: OpenClaw doc 03/14, Codex doc 05/38/63, Claude Cowork doc 75/80; Podium is a competitor surface, not a repo).

---

## 1. The question

Four independent 2026 products converged on the same missing abstraction for EveryAIOS:

> a **durable Work/session runtime** that makes the same Work remotely addressable from any client, keeps execution alive independently of the UI, and projects one canonical state into desktop/web/mobile/CLI/ACP.

EveryAIOS already had the control plane (ticket → executor → verify → receipt → audit, all landed P47/P48). What it lacked was the **durable-session / addressability layer** on top.

## 2. Claude Cowork — the commercial reference

Anthropic describes **two execution environments**:

- **Cloud Cowork** — agent loop + code execution in an isolated temporary sandbox on Anthropic infra: per-session isolation, no private-network reachability by default, mandatory egress proxying, allow-listed destinations, short-lived credentials, tenant-scoped persisted state. The critical property is **not "cloud"** — it is that **Session owns Execution owns State owns Artifacts owns Access-context**, and **UI is not the execution owner**. That is why you can close the laptop.
- **Local Cowork** — agent loop on device, code execution in a dedicated Linux VM, host access via controlled application-level permissions. Execution is an actual runtime object here too.

**Cross-surface continuity:** same sessions and files available on desktop/web/mobile; a task started on one surface resumes on another. That is a **session-architecture feature**, not a UI feature.

Capability set to match: start from desktop/web/mobile ✅ · resume same task elsewhere ✅ · continue while laptop closed (cloud) ✅ · scheduled tasks while device offline ✅ · connectors/skills on every cloud surface ✅ · remote file preview ✅ · projects ✅ · browser use (desktop bridge) ✅ · computer use ✅ · local file access via desktop bridge ✅ · per-app computer-use permission ✅.

## 3. OpenClaw — the Gateway blueprint (the closest peer)

OpenClaw's docs state the pattern directly:

> The Gateway owns session rows, transcript history, routing metadata, and active runs. Clients select a session key and read/update that same state. Control UI, mobile clients, ACP, TUI and attach all project Gateway-owned state.

Useful primitives:

- **Canonical session key** — `agent:<agent-id>:<session-key>`; session routing made explicit. EveryAIOS equivalent: `WorkAddress` (work_id · project_id · session_id · owner_id).
- **Clients don't own sessions** — browser closed → session survives; mobile opened → same session. EveryAIOS equivalent: client disconnect never terminates Work.
- **Attach** — `openclaw attach <target>` with a temporary session-scoped MCP grant (view/steer/detach). Cleaner than "copy the session to another device".
- **Remote auth + scope** — handshake roles/scopes; trusted runtime context derived server-side from the session, never from caller-provided context. EveryAIOS equivalent: the Gateway resolves `authenticated client → session → work → capability → pending effect → policy → trusted interaction`; a remote client claiming `authorization=human_gesture` is inert (anti-impersonation).
- **Attachment rules** — opt-in, total byte limit, per-file limit, max files, redaction from transcript persistence, materialization manifests, controlled permissions, cleanup policy → `AttachmentRef` (content-addressed, scoped, retention-aware).
- **Delivery ≠ execution** — execution succeeded vs completion/delivery blocked/retrying → `BackgroundTaskRecord` (already in the spec; promoted to architecture).
- **Session-specific mode in durable session state** — thinking/verbose settings persist in the session store → per-Run snapshot in `RuntimeManifest` (chief/model/autonomy/capabilities/network/scope/node — intersected with current trusted policy on restore).
- **Stale-session recovery ownership** — refuses unsafe local execution if restart-recovery is pending (an independent process cannot safely coordinate the recovery owner) → `RunAuthority` (run_id · node_id · lease · fencing_token · recovery_state); only current authority may advance a Run.

**Trust-model caution:** OpenClaw is powerful but its default design can allow broad host-level capabilities depending on config. EveryAIOS steals the **topology** (centralized session state, client projection, node execution) but keeps its own stricter control plane (Policy · Authorization · Executor · Verify · Receipt · Audit).

## 4. Podium — persistent PTYs for coding agents

- Real agent CLIs in **persistent PTYs**; kept alive across browser disconnect/restart.
- PWA that can control from phone; sessions grouped by Git worktree; multiple machines.
- Lesson: **Work lifetime > UI lifetime > agent-process lifetime**. Do not tie Work to Tauri window, coordinator process, terminal tab, browser tab, agent process, or any UI connection.

→ `PtySession` (persistent PTY for external agent CLIs) + `AgentSession` (ephemeral-child vs persistent-attached-session lifecycle; PTY dies → AgentSession may survive; AgentSession dies → PTY normally dies except deliberate recovery).

## 5. Codex — project → thread → worktree → review

- Project-organized agent threads, parallel agents, isolated worktrees, in-thread review, diff commenting, editor handoff, CLI/IDE continuity, background **Automations** whose results land in a review queue.
- Generalization (not feature-cloning): parallel agents = multiple Runs; projects = Project → Works; worktrees = `WorktreeBinding` (Run-owned, not agent-owned); skills = SkillBundles; automations = Scheduled Works; manual diff review = ReviewItems + worktree; editor handoff = client capability; phone control = ClientBinding; persistent agent = AgentSession + PTY.
- Native sandbox evidence: Codex's mature sandbox still has cross-platform filesystem edge cases → **"sandbox configured" ≠ "sandbox proven"** — preflight → enforce → observe → postflight-verify chain (`SandboxReceipt`).

## 6. The synthesis — spec v3.64/v3.65/v3.66

**Work Gateway / Session Runtime (spec §4.4, TODO P49, 20 items):** the authoritative runtime boundary for a Work — owns session addressing, run ownership, client attachments, event streams, execution-node bindings, attachment references, remote-client scopes. **Not a second orchestration engine and performs no effects** — it composes the existing Work/ExecutionKernel/Guard/Ticket/Executor/Receipt/Audit and projects the same state to every authorized client.

**The architectural law:** UI lifetime, client lifetime, agent lifetime, process lifetime, and execution-node lifetime MUST NOT define Work lifetime. H18 = additional **CLIENT** of the Gateway; H33 = **ExecutionNode** with `always_on=true` (laptop/server/VPS/Raspberry Pi/NAS/WSL/remote workstation are all the same abstraction).

**Named contracts (structural types, no new capability-matrix rows):** `WorkAddress` · `ClientSession`/`ClientCapabilities` · `ExecutionNode` · `RunAuthority` (lease + fencing) · `WorkEvent`/`WorkEventEnvelope` (`sequence` = persistence order, `causal_parent` = causal DAG; `subscribe from sequence N` replay) · `WorkPresence` · `SteeringInstruction` · `ReviewItem` · `CapabilityResolution` (effect routing; model routing = separate `ModelResolver`) · `AttachmentRef` · `RuntimeManifest` · `SandboxSpec`/`SandboxBackend` (native-OS-first: bwrap/Seatbelt/Windows-restricted-token; gVisor/Firecracker escalation; fail-closed) · `SandboxReceipt` · `CapabilityBroker` · `ContextReleasePolicy` (model may propose context needs; **model does NOT authorize context release**) · `PtySession` · `WorktreeBinding` · `AgentSession` · `RuntimeEndpoint { ExecutionNode | ExternalRuntime }` (same interface, different trust_class) · `AgentSandbox` vs `ChildExecutionSandbox` (nested authority) · `TrustedGestureAttestation` · `DomainEvent`/`OperationalEvent`/`PresenceEvent`+`Telemetry` split · `ReviewQueue`.

**Durable pre-effect ordering (contractual):** DURABLE INTENT → DURABLE ATTEMPT → EFFECT → OBSERVE → VERIFY → RECEIPT; a ticket-approved-but-attempt-lost crash resolves to `uncertain`, never `failed`/`succeeded`.

**Governance modes (final):** three states — Governed-Mediated / Self-contained / NotGoverned; the ChiefAdapter normalizes dispatch across transports, governance is determined by the declared runtime boundary and mode.

**V1 vs post-v1:** V1 = interfaces + local (local in-process transport; WorkGateway inside everyaios-core; native OS sandbox; persistent PTY; worktrees; review queue; secure remote-attach architecture). Post-v1 = web/mobile/CLI clients + multi-node failover + gVisor/Firecracker + public relay + mobile apps. Design V1 around the interfaces so post-v1 is implementation, not architectural surgery.

**Competitive positioning:** beat Claude Cowork by being the **portable Work/runtime layer** — same Work across surfaces + user-owned Gateway + user-owned execution nodes + any model/Chief/ACP agent + MCP + native capabilities + browser + desktop CU + Office + coding worktrees + portable memory + universal governance + verified effects + receipts + recovery — without surrendering Work ownership. Beat CC Switch by making provider switching almost invisible (provider health → cost → latency → capability → switch, while Work remains Work).

## 7. Disposition

- **Spec:** §4.4 Work Gateway (v3.64) · §4.4a hardening (v3.65, 11 corrections) · v3.66 reconciliation (invariant purge, three governance states, P39 truth, dual-path diagram).
- **TODO:** P49 queue (20 open items, V1 = interfaces + local, post-v1 = remote clients + multi-node).
- **Census:** TODO **1179 = 1075 done + 104 open** (+ 1 spec-only ADR P47.7); doc-sync green (156 capabilities — P49 contracts are structural types on existing rows, no new matrix IDs).
- **Ledger:** 282 repos unchanged.
