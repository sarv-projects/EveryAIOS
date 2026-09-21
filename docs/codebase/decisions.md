# Decisions

> **Post-thaw authority: [`../../ARCH/CORE.md`](../../ARCH/CORE.md)** (27 invariants I1–I27) **+ the subsystem contracts** (`WORK` · `SESSION` · `AGENT` · `EXTERNAL-AGENTS` · `CONTEXT` · `CAPABILITIES` · `MEMORY` · `SECURITY` · `RECOVERY` · `ROUTING` · `UI` · `DESKTOP`). Refreshed post-thaw (TODO **P69.A35**); entries D1–D9 below are preserved as recorded. This artifact remains what it was built to be: accurate about the **code and tests** it indexes — that is its value. Where quoted code wording predates the thaw (legacy `Chief` identifiers, "token economy" module docs), quotations are verbatim and marked as such.

---


Architectural rationale with provenance. Where rationale cannot be proven from
docs, code, or Git history, that is stated explicitly.

## D1 — Connectors are MCP-first

- **Decision:** third-party connectors attach through MCP rather than bespoke
  per-service adapters.
- **Provenance:** `ARCH/ADR/0001-connector-platform-mcp-first.md` (2026-08-30);
  `crates/everyaios-mcp` implements the surface with tool-hijack validation.
- **Status:** recorded ADR. Trade-offs are in the ADR itself.

## D2 — UI v2 cockpit replaces v1 router pages

- **Decision:** single-window cockpit (TitleBar / LeftSidebar / CenterColumn /
  ActivityRail / RightViewport / StatusBar) instead of peer tabs or routed
  pages.
- **Provenance:** `ARCH/ADR/0002-ui-v2-cockpit-replaces-v1-router-pages.md`
  (2026-08-30); implementation in `ui/src/App.tsx`; layout contract in
  `ui/DESIGN-SYSTEM.md` §2 ("Never 9 peer tabs").

## D3 — Chat loop is being ported from TS to Rust

- **Decision:** the conversation engine's authority moves from the Bun sidecar
  into `crates/everyaios-engine` ("Rust port slice of the TS
  `ConversationEngine`").
- **Provenance:** engine module doc; `ARCH/16-CHAT-LOOP-RUST-PORT.md`.
- **Status (amended 2026-09-21 by [`ADR/0005`](../../ARCH/ADR/0005-external-agents-are-the-v1-engines.md)):**
  **superseded in purpose.** The loop belongs to the bound agent, and v1 ships no built-in engine, so there is
  no EveryAIOS turn loop to port. What remains ported-worthy is turn **coordination** — state, context
  projection, tool dispatch, persistence, events (`ARCH/16-CHAT-LOOP-RUST-PORT.md`'s superseded banner;
  `D10`'s post-thaw deltas). Ported slices that only ever served the built-in loop are removed under `P71.2c`.

## D4 — Thin Tauri shell, fat kernel

- **Decision:** `src-tauri/` validates and delegates only; business logic lives
  in crates.
- **Provenance:** structure itself — 351 registered commands across 40
  `*_cmds.rs` modules delegating into 22 crates; `AGENTS.md` §10/§12. Git
  history: `docs/ipc-parity` CI checks keep the two sides aligned.

## D5 — Bun sidecar for the LLM loop

- **Decision:** the LLM turn loop runs in a Bun process (`packages/coordinator`)
  isolated from the Rust kernel, over stdio JSON-RPC 2.0 with explicit framing.
- **Provenance:** `crates/everyaios-ipc` framing code + `PROTOCOL_VERSION = 1`
  (`lib.rs:40`); supervisor spawns it (`everyaios-core/src/supervisor.rs`).
- **Rationale recorded:** `AGENTS.md` §10 (ecosystem velocity of TS AI tooling
  vs kernel trust boundary). The *original* trade-off discussion is not in an
  ADR — this is doc-stated, not ADR-proven.

## D6 — Agent-agnostic agent kit (`.agents/`)

- **Decision:** repo tooling assumes no specific AI vendor; the code
  intelligence kit ships a portable indexer with documented divergences from
  its upstream.
- **Provenance:** `.agents/README.md` "Provenance and local divergences"
  section (2026-09-19); commit `e0ed4ff`.

## D7 — Codegraph resolver was completed, not rewritten

- **Decision:** fix the half-finished resolver in the existing indexer rather
  than replace it: define the missing `_resolve_rust_module`, consume recorded
  import `kind`, add config-declared mappings (workspace crates from
  `Cargo.toml`, tsconfig `paths`, workspace packages from `package.json`) — all
  config-declared, none heuristic-guessed.
- **Provenance:** Git `3803cb6` (fix refactor completion) and `8323120`
  (workspace package resolution); measured results in both commit messages
  (41 → 2,087 → 2,203 edges).

## D8 — Research material is frozen, living docs are not

- **Decision:** `RESEARCH/` (104 files) is point-in-time competitive research;
  it is never updated with code changes.
- **Provenance:** convention recorded in this doc set (`docs/codebase/README.md`);
  evidenced by file dates clustering on research-session dates vs code dates.

## D9 — The architecture was thawed; `ARCH/CORE.md` became the root authority

- **Decision:** re-open an architecture that had been declared frozen at spec v3.64, and re-freeze it with a
  single root authority: `ARCH/CORE.md` (16 primitives, a 9-question ownership matrix, 27 invariants — the
  set was extended by ADR-0004, which adds I27). Every
  subsystem document derives from it and none may weaken it; the term **“Chief” is retired as a concept**
  (the loop belongs to the selected agent — an `AgentBinding`), and the obsolete “every mutation is
  ticketed” slogan is corrected to the **authorization-provenance** rule.
- **Why:** three things made the freeze untenable — a context-engineering practice the architecture had only
  partially absorbed, external agent runtimes exposing deep enough extension surfaces to make “host, do not
  own” precise,  and **four defects verified in source** (a permission path that granted approval without
  Guard, unhandled ACP file/terminal mediation, mediated mode not being the default, and a TypeScript package
  holding provider credentials against the vault rule). *(All four are repaired in code as of 2026-09-21 —
  `P69.C1`–`C4`, implemented-not-verified; the verification is still owed.)*
- **Provenance:** [`ADR/0003`](../../ARCH/ADR/0003-architecture-thaw-core-authority.md) (2026-09-20); work
  tracked as **P69** (consolidation, defects, CI checks, migration) and **P70** (v1 release) in `../../TODO.md`.
- **Status:** accepted. A further expansion now requires a new ADR, not a document edit.
- **What did *not* change:** the four inherited non-negotiables, the capability identity triple
  (`capabilities.yaml` == `ARCH/09` == spec §0 — **166** ids), the spec/TODO ownership split, and the `RESEARCH/` freeze —
  and the spec already carried much of the control-plane contract (§4.3/§4.4/§9), which is why this is a
  *sharpening* rather than a rebuild.
## D10 — Post-thaw status deltas on D3/D5 (no new decision)

- **Decision:** none — this entry records how the thaw (D9) changes the *status* of two earlier entries.
  D1–D9 above are preserved as recorded; nothing above this line was edited by the thaw refresh.
- **D3 (chat-loop port):** superseded as a direction. The loop is owned by the selected agent
  (`AgentBinding`); the coordinator owns turn coordination, not reasoning; `everyaios-engine`'s target
  is pure policies/helpers (`ARCH/AGENT.md`, `ARCH/CORE.md` §7.1, TODO P69.A25/P69.D8). That the sidecar
  still runs the turn loop today is current behavior, not the target.
- **D5 (Bun sidecar):** rationale sharpened — TypeScript keeps ecosystem velocity for orchestration while
  the kernel trust boundary is structural (the sidecar has no effect-execution surface and holds no
  credentials). Nine defects qualify the present state (CORE §11 V1–V9, TODO P69.C): the original four, plus five found later in the ACP-registry adapter path (auth-from-license, discarded env, bare binary launch, schema gaps, split wire contract).
- **Vocabulary (no behavior change):** "token economy" → context engineering (`ARCH/CONTEXT.md`, with the
  normative 7-step optimization order); five-tier memory → four classes with episodic derived from the
  event log (`ARCH/MEMORY.md`); user-facing **Chat** vs internal **Session** (`ARCH/SESSION.md`);
  "every mutation is ticketed" → authorization provenance (CORE §5.1); behavioural policy → one
  agent-agnostic `AgentBehaviorProfile` compiled per adapter, with uncompilable clauses reported
  `unenforceable` for that binding (CORE I27, `ARCH/AGENT.md` §5.2).
- **Provenance:** `ARCH/CORE.md` + subsystem contracts (2026-09-20); work tracked as TODO P69 (defects,
  consolidation, CI checks) and P70 (v1 release).
- **Status:** accepted as a status note. A further expansion requires a new ADR, not a document edit.
## Unproven / open rationale (stated)

- **Why SQLCipher over OS keychains** for the vault (ARCH/03 is referenced by
  module docs but the trade-off argument is not restated anywhere current).
- **Why Bun over Node for the sidecar** beyond doc assertion (no ADR found).
- Numbering gap `ARCH/14-*` does not exist; whether a doc was planned or
  retired is not recorded.
