# v1 retrospective evidence pack (P70.G5)

The record of what v1 actually was — kept so a later claim can be checked
against evidence rather than memory.

## Contents

| # | Artefact | Where it comes from |
|---|---|---|
| 1 | **Release commit** | the tag `v<x.y.z>` and the `github.sha` recorded in the release body (`P70.A6`) |
| 2 | **Gate results** | the CI run attached to that commit, plus `node scripts/release-qualify.mjs` output — including every `BLOCKED` item and its blocker, unevaluated |
| 3 | **Sign-off record** | `docs/release/qualification-<version>.json`, written only by a fully-passing run (`P70.E12`) |
| 4 | **Platform evidence** | the acceptance transcript for the clean-machine install and upgrade drill (`P70.E8`/`E9`) — or the explicit statement that it is missing |
| 5 | **Size + performance measurements** | the first measured release's numbers against `docs/packaging/budgets.json` (`P70.A5`/`E10`) |
| 6 | **SBOM + licence notices + checksums** | the release assets (`P70.B5`/`B6`/`F1`) |
| 7 | **Known gaps** | [`docs/release/post-v1.md`](post-v1.md) (deferrals) + the unsupported list from [`SUPPORT-MATRIX.md`](../../SUPPORT-MATRIX.md) |
| 8 | **Changelog entry** | the `SPEC-CHANGELOG.md` entry for the release revision, unchanged |

## The rule that keeps it honest

Items 1–3 and 5–8 are machine-produced or machine-checked. Item 4 is the only
one a human fills in — and when it is missing, the pack records **"not
executed"**, because `release-qualify.mjs` reports `BLOCKED` for those items and
never upgrades a blocker into a pass. A retrospective that quietly dropped the
missing acceptance transcript would defeat the point of keeping one.

## Template

```markdown
# v<x.y.z> — retrospective

- Commit: <sha>            (tag: v<x.y.z>)
- CI run: <url>            (all green / red items: …)
- Qualification: docs/release/qualification-<x.y.z>.json — qualified: true|false
- Platform acceptance: executed on <host build> / NOT EXECUTED (P70.E8/E9)
- Measurements: installer <MB>, installed <MB>, idle RSS <MB> (first measured release)
- Assets: SHA256SUMS, SBOM, notices, latest.json + .sig
- Deferrals: docs/release/post-v1.md
- Changelog: v<x.yz> entry, verbatim
- What we would not repeat: …
- What surprised us: …
```

## Status

No retrospective exists yet: no release candidate has passed E12, and today's
harness correctly refuses to write a sign-off (3 PASS / 4 RUNNABLE / 5 BLOCKED).
This file defines the pack; it does not claim the pack.
