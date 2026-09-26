# 41 — Edge Cases

> **Status:** Draft P4. The consolidated edge-case catalog. Each row names the scenario and the **required behavior**; the owning module doc carries detail. New edge cases discovered during review get a row here + a reference in the owning doc — no silent fixes.
> **Rule:** an edge case is resolved when the owning doc states the behavior; deferred cases carry an explicit trigger.

## A. Work & scheduling (`11`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-001 | Crash mid-run; queue lost | Queue is a projection — rebuild from log + checkpoints; runs resume per matrix. |
| EDGE-002 | App closed with detached work | Policy decision recorded (keep/suspend/stop); on start: rehydrate, adopt/monitor, reconcile strays. |
| EDGE-003 | Budget exhausted mid-run | Pause + surface; never silently kill or overrun (DEC-031). |
| EDGE-004 | Cancel during approval wait | `cancel_requested` honored at next boundary; approval records the cancellation. |
| EDGE-005 | Worker limits exceeded | Admission rejected with named limit; no silent trimming. |
| EDGE-006 | Two sessions write the same workspace | Leases (`25` §6): queue / rebase / ask — never silent overwrite. |
| EDGE-007 | Background load starves foreground | Priority + starvation guard (DEC-031). |
| EDGE-008 | Interrupt mid-tool | Cooperative stop at boundary; tool finishes or aborts per environment contract; state consistent. |

## B. Capability & providers (`13`/`14`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-010 | Provider restarted mid-session | Epoch bump ⇒ handles `InvalidState` ⇒ re-resolve (no silent retry on a changed runtime). |
| EDGE-011 | All providers for a capability unhealthy | `Unavailable` + retryable; `guidance` if setup could enable one. |
| EDGE-012 | Capability version deprecated mid-run | Run continues on its pinned version; new calls warn with migration path. |
| EDGE-013 | Ambiguous provider resolution | Deterministic tie-break + audit entry; never random. |
| EDGE-014 | MCP era mismatch | One retry in the other era; permanent mismatch ⇒ provider incompatible with reason (DEC-030). |
| EDGE-015 | MCP capability drift (tool removed) | Discovery diff updates descriptors; calls to removed capabilities fail typed. |
| EDGE-016 | Capability returns `guidance` mid-plan | Agent relays `next_action`; plan continues or pauses for user action — not a failure. |
| EDGE-017 | Effect retried after timeout | Idempotency key dedupe; no key ⇒ `needs_attention` (never blind re-fire). |

## C. Context & memory (`16`/`17`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-020 | Overflow recovery loops | Bounded retries → escalate with reason; never infinity, never “new conversation”. |
| EDGE-021 | Pruned item needed later | `reconstructable` flag prevents loss; non-reconstructable items are never pruned. |
| EDGE-022 | Recall serves stale/conflicting memory | `superseded_by` filters superseded; staleness annotation + verify-against-live-state framing. |
| EDGE-023 | Secret enters memory pipeline | Rejected at validate + logged; if slipped: forget + suppression + corpus test. |
| EDGE-024 | Forgotten item re-extracted | Suppression hash blocks re-extraction (TEPA revocation). |
| EDGE-025 | Pinned context exceeds ceiling | Ceiling enforced with warning; pins are bounded, not absolute. |
| EDGE-026 | Model switch changes tokenizer | Conservative re-estimate + feasibility recheck; degrade gracefully. |
| EDGE-027 | Zero relevant memory | Zero injected tokens (INV-22) — abstention is correct behavior. |

## D. Trust & security (`12`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-030 | Policy engine error | **Fail closed** — DENY with reason; audited. |
| EDGE-031 | Vault unavailable | Credentialed call fails typed `Unavailable`; no plaintext fallback, ever. |
| EDGE-032 | Egress engine down | Outbound fails closed; offline capabilities unaffected. |
| EDGE-033 | Ticket replay / stale epoch | `InvalidState` + audit; re-authorize through the normal path. |
| EDGE-034 | Approval times out | Per-class policy (default deny); escalation field respected. |
| EDGE-035 | External agent requests out-of-scope path | Interception + deny + audit (not un-discovery). |
| EDGE-036 | Catastrophic op requested in Full Access | Irreducible gate still applies (`12` §3). |
| EDGE-037 | Policy scopes disagree | Innermost decision unless an outer ceiling forbids; conflicts logged. |

## E. World & files (`21`/`25`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-040 | Windows `dev/ino` zeroed (current bug) | Code-phase fix to MFT identity; until fixed, identity degrades to guarded path-hash with warnings. |
| EDGE-041 | File deleted then recreated | Incarnation change ⇒ new identity; dedup/lease checks re-key. |
| EDGE-042 | Watcher overflow (`IN_Q_OVERFLOW` etc.) | Scoped rescan + freshness anomaly event — never a silent gap. |
| EDGE-043 | USN journal deleted/truncated | Cursor discarded; rescan that volume; epoch reset recorded. |
| EDGE-044 | Elevated UI unreachable (no UIAccess) | Mark regions unknown; guidance; no blind input. |
| EDGE-045 | UIA provider hangs | Per-call budget + worker isolation; partial tree marked partial. |
| EDGE-046 | Symlink/junction swap (TOCTOU) | Canonical path re-validated at use; deny on mismatch. |
| EDGE-047 | Cross-origin iframe blocks AX | Partial snapshot + skip; escalate to vision only if critical. |
| EDGE-048 | CAPTCHA / bot check | Surface to the user; **no evasion tooling** (DEC-016). |
| EDGE-049 | Permission denied during scan | Scoped skip + surfaced count (metadata-mode honesty). |

## F. Domains (`22`–`24`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-050 | Crash mid-Office-write | Staging → fsync → atomic swap → op-log replay; original intact until swap. |
| EDGE-051 | Engine cannot represent an edit (fidelity) | Typed `guidance` naming the limitation; never a silent lossy path. |
| EDGE-052 | Attach to user browser fails | Fall back to managed Chromium with a surfaced note. |
| EDGE-053 | PDF redact “completes” but text remains | Required: post-op extraction check proving removal; current code annotates (code-phase P0 fix). |
| EDGE-054 | Vision mislocates an element | Verify after action; bounded retries; `needs_attention` on repeat failure. |
| EDGE-055 | Studio model unavailable when vision scheduled | Degrade with recorded gap; dangerous classes require human confirmation instead. |

## G. Workflow (`20`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-060 | Wake missed (OS sleep/reboot) | Misfire policy: skip+record default; latest-missed optional; bounded grace. |
| EDGE-061 | Crash mid-node | Resume matrix: reuse settled; idempotent retry same key; keyless ⇒ `needs_attention`. |
| EDGE-062 | Keyless side effect interrupted | `needs_attention` with evidence; never fabricated completion. |
| EDGE-063 | Version upgrade while run in flight | Impossible — runs pinned; explicit audited upgrade only. |
| EDGE-064 | Trigger storm | Per-workflow concurrency (default Skip) + queue depth backpressure. |
| EDGE-065 | DST/clock jump | IANA zone resolution; `wake_at` is “not before”; late wakes governed by misfire. |
| EDGE-066 | Parent cancels with nested runs | Parent-close policy (terminate/cancel/abandon) explicit per edge. |
| EDGE-067 | Approval rejected | Condition edge (reject branch) or run fails with reason; recorded. |

## H. Events & channels (`30`/`32`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-070 | Poison event | Quarantine + reconciliation entry; stream continues. |
| EDGE-071 | Consumer lag | Lag marker; pull-based catch-up from store. |
| EDGE-072 | Duplicate delivery | Consumers idempotent by event id. |
| EDGE-073 | Channel disconnects mid-approval | Request waits durably; re-surfaces on attach. |
| EDGE-074 | Send outcome uncertain | `needs_attention` + receipt of the attempt; **never duplicate sends**. |
| EDGE-075 | Surface crash | Isolated; Core and other surfaces unaffected. |

## I. Extensions (`31`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-090 | Plugin crash loop | Auto-disable + audit; Core unaffected. |
| EDGE-091 | Skill’s capability requirement missing | `guidance` mode; activation never grants permissions. |
| EDGE-092 | Plugin vs Core contract skew | Rejected with compat-window explanation. |
| EDGE-093 | Skill instructions contain injection | Treated as untrusted content: review gate + provenance + injection hygiene. |

## J. Data integrity (`29`/`30`)

| ID | Scenario | Required behavior |
|---|---|---|
| EDGE-100 | GC meets receipt pin | Receipt-pinned versions are never collected. |
| EDGE-101 | Artifact location moved/deleted | `unresolved` + digest retained; receipts keep the digest; re-link path. |
| EDGE-102 | Audit chain gap detected | Report + reconcile; never silent. |
| EDGE-103 | Import collides with existing hashes | Import validated (hash re-check + secret scan); conflicts surfaced, not auto-merged. |

## Extension rule

New edge cases are appended with the next free ID in their family, with: scenario · required behavior · owning doc. A case that changes an authority doc escalates to a `DEC`.
