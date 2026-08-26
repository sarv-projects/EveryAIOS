# UX Testing Plan — 5 testers × 3 rounds (P11.6.3)

Plan for the alpha → beta → RC user-testing rounds. Smallest viable group: 5
testers per round, 3 rounds. Every round is **moderated** (task-based, not
free-play) with the same skeleton so results are comparable.

## Round structure

| Round | Stage | Gate | Focus |
|---|---|---|---|
| R1 | Alpha | first-run onboarding → first successful chat + tool call | Does a first-time user reach time-to-value unaided? |
| R2 | Beta | 1 week of daily use | Do real workflows survive a week (memory, guard, office, automations)? |
| R3 | RC | release-candidate build, fresh machine | Does the install → BYOK → chat → tool-call journey hold on the target OS? |

## Tester profile (recruit for this mix per round)

- 2× casual: non-technical knowledge workers (Excel/PDF/chat daily)
- 2× power developer: Claude Code / Codex daily users
- 1× privacy-conscious researcher: local-first, BYOK, no cloud

## Skeleton script (same every round)

1. **Cold start (10 min, unassisted).** Install → first launch → add a key →
   first chat. Observer logs where they stall; no help unless stuck > 3 min.
2. **Guided tasks (40 min, scripted).** One per persona:
   - Casual: open a spreadsheet, ask for a sum/status, approve the Guard-2 card.
   - Power: point at a repo, ask for a fix, watch the ticket → commit → receipt.
   - Researcher: connect a provider, run a research task, export + wipe.
3. **Open exploration (10 min).** Anything they want; observer notes friction.
4. **Debrief (10 min).** NPS-style 0–10 + "one thing you'd change".

## What we measure (ties to P11.6.4 local metrics where present)

- Time-to-value: first launch → first successful tool result
- Task completion rate per scripted task (done / attempted)
- Error rate: turns that failed vs completed
- Guard-2 approval clarity: can they explain the card before clicking?
- Friction log: every stall > 15s with the cause

## Cadence & feedback

- One round per milestone (alpha → beta → RC), each 1–2 weeks apart.
- Testers file feedback through the in-app Feedback panel (P11.6.1) during the
  round; the moderator consolidates into the issue tracker.
- Go / no-go per round: R1 blocks beta, R2 blocks RC, R3 blocks release.

## Material needed per round

- Build artifacts (per-OS installer / updater path)
- Consent + data-handling note (local recording is opt-in, content-free)
- This script + a results sheet (one row per task per tester)
