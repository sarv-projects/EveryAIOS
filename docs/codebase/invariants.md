# Invariants

Only rules the implementation or tests actually support. Each entry states its
evidence; "structural" means a violation cannot compile/route, "tested" means a
test enforces it, "doc" means the contract text commits to it (weakest tier).

## I1 — The sidecar proposes; the Rust core disposes

- **Rule:** every mutating effect requires an authorization ticket minted in
  Rust. The sidecar has no effect-execution IPC surface.
- **Evidence:** structural — `packages/` contains no ticket minting and no
  effect command surface; `AuthorizationTicket` lives in
  `crates/everyaios-guard/src/ticket.rs:102` with mint at `:59`, consume at
  `:162`. Doc: `AGENTS.md` §10. (Tier: structural + doc)

## I2 — Provider API keys never leave the vault

- **Rule:** keys live only in `crates/everyaios-vault` (SQLCipher). Streams are
  brokered; sidecar memory and IPC payloads never carry key material.
- **Evidence:** `AGENTS.md` §15; vault module doc; broker files
  (`broker.rs`, `credential_broker.rs`). The relay path itself is not
  symbol-traced at tier A — see [flows.md](flows.md) F3 note. (Tier: doc + B)

## I3 — Tickets are single-use and argument-bound

- **Rule:** a ticket authorizes exactly one effect with exactly the args it was
  minted for.
- **Evidence:** `is_valid()` / `matches_args(args_hash)` / `consume(args_hash)`
  semantics in `ticket.rs:146–162`; TOCTOU checks are part of Guard-1. (Tier: structural)

## I4 — Audit is append-only

- **Rule:** `everyaios-audit` accepts appends and sequence resumes; no update
  or delete path.
- **Evidence:** module doc ("append-only NDJSON event log, ARCH/06 §6.5, J5");
  `appends_and_resumes_sequence` unit test. (Tier: tested + doc)

## I5 — All outbound network crosses netfloor; all writes cross pathfloor

- **Rule:** SSRF policy and path-traversal policy are enforced centrally, not
  per-caller.
- **Evidence:** `AGENTS.md` §15; `crates/everyaios-guard` module doc
  ("deterministic pre-exec scanning of every" effect). (Tier: doc + structural layout)

## I6 — Layers do not import across boundaries

- **Rule:** `ui/`, `packages/`, `crates/` communicate only over the IPC seams
  (Tauri commands; stdio JSON-RPC).
- **Evidence:** codegraph file graph at commit `f99a5d9`: 0 cross-boundary
  import edges among the three trees (2,203 edges total, all intra-layer).
  This is a measured fact at file granularity, re-checkable by re-running the
  index. (Tier: B, machine-verifiable)

## I7 — Protocol version compatibility

- **Rule:** UI and Rust sides must agree on the IPC protocol version.
- **Evidence:** `PROTOCOL_VERSION: u32 = 1` (`crates/everyaios-ipc/src/lib.rs:40`);
  `AGENTS.md` §13 requires both sides match. (Tier: structural constant + doc)

## I8 — Honesty about agent provenance in UI

- **Rule:** content must never be presented as approved/completed before its
  backend receipt exists; external agents' governance status is shown
  explicitly (Governed-Mediated / Self-contained / NotGoverned).
- **Evidence:** `DESKTOP-APP-SPEC.md` (UC-4, effect-authorization model §83);
  `ui/DESIGN-SYSTEM.md` §3 governance badges. (Tier: doc)

## I9 — Generated map coverage is total

- **Rule:** `CODEBASE-MAP.md` must account for every tracked file; drift fails
  CI.
- **Evidence:** `scripts/gen-codebase-map.mjs` diffs its own output against
  `git ls-files` and exits non-zero on a miss; CI `docs-sync` runs
  `--check`. (Tier: tested in CI)
