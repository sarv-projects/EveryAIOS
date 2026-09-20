# Decisions

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
- **Status:** in-flight per its plan doc — the sidecar (`packages/coordinator`)
  still runs the turn loop today. Current boundary: sidecar executes; engine
  crate owns ported slices.

## D4 — Thin Tauri shell, fat kernel

- **Decision:** `src-tauri/` validates and delegates only; business logic lives
  in crates.
- **Provenance:** structure itself — 339 registered commands across ~46
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

## Unproven / open rationale (stated)

- **Why SQLCipher over OS keychains** for the vault (ARCH/03 is referenced by
  module docs but the trade-off argument is not restated anywhere current).
- **Why Bun over Node for the sidecar** beyond doc assertion (no ADR found).
- Numbering gap `ARCH/14-*` does not exist; whether a doc was planned or
  retired is not recorded.
