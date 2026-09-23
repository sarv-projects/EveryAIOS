# Post-v1 backlog (P70.G4)

Everything deferred from v1, collected in one labelled place so it cannot leak
back in as an implicit promise. **Nothing here is a v1 commitment.** The live
status of every row stays in [`TODO.md`](../../TODO.md); this file is the
register that says *which* rows are deferred and *why* they are not v1.

## Deferred by ADR

| Item | Why deferred | Where it returns |
|---|---|---|
| The built-in engine (native agent plane) | [`ADR/0005`](../../ARCH/ADR/0005-external-agents-are-the-v1-engines.md): external agents are the v1 engines; the built-in engine defers to post-v1 and returns as a *governed baseline binding* (`P71.7`) | post-v1 |
| Zero-install first run | Follows the built-in engine — with no engine, first run must discover/bind an external agent (`P71.6a`) | with `P71.7` |

## Deferred `⚪ post-v1` capability rows

The `⚪` rows in `capabilities.yaml` / `ARCH/09-FEATURE-MATRIX.md` are **not**
release-gate items: `P9.2`–`P9.9`, `P12` (GTM), `P45`, `P46`, and the explicit
`⚪` markers listed there. The kernel gate's doc-sync rule already refuses new
capability rows while a *kernel* item is open — these are the rows that were
never in that gate.

## Platform deferrals

| Platform | Status | Register |
|---|---|---|
| macOS desktop | out of v1 | `SUPPORT-MATRIX.md` §1 |
| Native Linux desktop | out of v1 | `SUPPORT-MATRIX.md` §1 |
| WSL2 | **supported**, as a host for Linux-native agents only | `SUPPORT-MATRIX.md` §1 |
| Windows native sandbox backends (`P49.5`) | unbuilt; the host honestly reports `Ambient` | `PACKAGING.md`, `P70.D7` |
| Windows Graphics Capture (`P57.6`), ConPTY (`P68.7`) | not done, never executed | `P70.D6` |

## Deferred autonomy / routing / remote / distributed work

The deferred automation-, routing-, remote- and distributed-execution items are
named in `TODO.md`'s programme table with their `🟡`/`⚪` markers (including the
`P30` competitor-derived batch's remaining rows, `P49.5`/`P49.6`, `P63`'s two
open rows and the `P64`/`P65` live-soak rows). They are collected here as a
category, not re-listed as promises.

## What "collected" means

1. A row deferred from v1 is marked `⚪`, or moved under this file's headings.
2. `SUPPORT-MATRIX.md`, `docs/download.md` and the README must not describe a
   deferred item as "coming soon" — the current wording is "out of v1 scope" /
   "not planned for v1".
3. The release notes generator quotes the changelog, so a deferral recorded in a
   changelog entry travels into the release body.
