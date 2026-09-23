# Rollout, hotfix and patch policy (P70.G1 · G2 · G3)

## G1 — Rollout monitoring

**Signals (all local-first, none is telemetry):**

| Signal | Where | Threshold to pause |
|---|---|---|
| Update adoption | the release host's manifest request counts (per channel) | < 40% of the previous release's first-48h curve → pause staging |
| Crash/failure reports | the repository's issue reports flagged `crash` | ≥ 3 independent reports naming the same surface → halt |
| Doctor failure rate | user-pasted `doctor` output in reports (`release-qualify.mjs` shape) | a new ✕ on a subsystem that was green → halt |
| Support reports | issue reports flagged `install`/`update` | any report of a failed upgrade with data loss → halt immediately |

**Owner:** the release driver for the rollout (one name recorded in the release
issue). **Halt mechanism:** the channel's manifest is taken down / the rollout
percentage is driven to zero on the host — no new binary, no client change
(`docs/updating.md` §3). **Resume:** only after the cause is named and the kill
switch is documented in the release issue.

Staged rollout order: **beta channel for a minimum of 48h → stable at 10% → 50%
→ 100%**, each step gated on the table above. A release that has never been
served on beta does not go to stable at 100% in one step.

## G2 — Hotfix process

1. **Report** (issue or advisory) with version + platform + audit ids.
2. **Triage**: is it a security floor, a data-loss/upgrade fault, or a
   functional bug? Security/data-loss takes the hotfix path immediately.
3. **Minimal fix** on a branch from the released tag. Nothing unfinished rides
   along — a patch release contains the fix and its test, not "while we were
   there".
4. **Patch version bump** in `src-tauri/tauri.conf.json` **only**; the lockstep
   gate checks the consumers agree.
5. **Gates**: the section-A checklist in
   [`launch-checklist.md`](launch-checklist.md) must be green, and
   `scripts/release-qualify.mjs` must show no `FAIL`.
6. **Release**: tag `v<x.y.z>`, CI builds and publishes (never hand-built).
7. **Rollout**: beta first, then the same staged ladder as G1 — including for
   security fixes, because a rushed 100% rollout is how a bad patch becomes an
   outage.

## G3 — Patch cadence and deprecation policy

- **Cadence:** no calendar promise at v1. A patch ships when a security or
  data-loss fault is confirmed; otherwise fixes batch into the next release.
  Stating a cadence the project cannot staff would be the same mistake as a
  capability claim without evidence.
- **Support window:** **only the newest release** is supported during v1. There
  is no LTS branch yet; the supported upgrade path is "install the new build"
  (`docs/updating.md` §6). This is stated so nobody assumes otherwise.
- **Deprecation policy for protocols and data:**
  1. **Data schemas are forward-only and never silently rewritten.** A store is
     stamped (`store-schema.json`); a build refuses to open data written by a
     newer schema rather than guessing (`P70.A8`/`C6`). A schema change ships a
     migration in the *reading* build, and pre-stamp data is *adopted* (flagged),
     never claimed migrated.
  2. **The IPC protocol version is `1`.** A breaking change to a Tauri command
     or the sidecar's JSON-RPC surface requires a version bump on both sides in
     the same release; `scripts/ipc-parity.mjs` fails on a UI call with no
     registered command.
  3. **Removals are announced one release ahead** in the changelog's
     `Category:` line and in the release notes generated for that tag, so a user
     can see the deprecation before the surface disappears.
  4. **Deprecated surfaces keep an honest in-place marker** until removal — the
     same rule that governs unavailable features (`P70.E11`).
