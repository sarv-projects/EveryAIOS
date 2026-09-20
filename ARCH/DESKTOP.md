# ARCH/DESKTOP — computer use: driving the real OS

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md). Covers **OS computer use** — a different
> environment from the browser and deliberately never merged with it. Invariants it must not weaken:
> **I7, I12, I13, I14, I15**.

---

## 1. Browser and desktop are different environments

| | Browser | Desktop |
|---|---|---|
| Environment | web content in a controlled process | the actual OS: windows, apps, native UI |
| Observe | accessibility tree + DOM, tiered engines | window capture + accessibility tree + OCR/vision |
| Act | CDP input dispatch | native input (invoke/set-value first, then real input events) |
| Failure mode | page changes under you | focus is stolen, a modal blocks, a window moves |

Keeping them separate is a correctness rule, not tidiness: a web abstraction that "also does windows"
acquires a leaking focus model and an unreliable element identity, and both surfaces become worse.

---

## 2. What desktop owns

windows (enumerate, target, activate) · screen capture (per-window, including occluded windows, with a
fallback) · keyboard input · pointer input · the accessibility tree · OCR/vision where the tree is empty ·
desktop-specific verification.

All privileged actions take the canonical path — `Desktop → Guard → AuthorizationTicket → Executor → Effect
→ Receipt` — with no exception for "it's just a click".

---

## 3. The observation contract

```
DesktopSnapshot
├── screenshot_ref
├── window / app identity
├── accessibility tree
├── interactive elements: bounds · labels · roles · states · element refs (e1..eN)
├── OCR/vision hits (when the tree is empty)
└── timestamp
```

> **The model acts by stable element ref, never by raw pixel coordinates.** Coordinates are a fallback for
> the vision path, not the primary interface. A pixel-coordinate action cannot be verified or re-planned.

**Every state-changing action invalidates prior element refs.** The loop is strictly
`observe → act → invalidate → re-observe → verify`. Never snapshot → click → click → click on stale refs.
This is the same invariant the browser layer enforces; two surfaces, one rule.

---

## 4. Background vs foreground

Driving an application **without stealing the user's cursor, keyboard or frontmost window** is the default
contract, not a nicety. Foreground activation is an escalation that must be justified and visible to the
user — a computer-use agent that hijacks the mouse mid-sentence is unusable regardless of its success rate.

Also required: path-launch is **allow-listed**, and risky classes (install, delete, money, credential
prompts) escalate or hard-deny rather than being auto-approved because they were allow-listed earlier.

---

## 5. Vision is required, not optional

A screenshot-only agent cannot verify. A tree-only agent cannot see what the tree omits (canvas, custom
rendering, games, legacy UI). Desktop requires **both**: structure first (UIA/AX/AT-SPI), pixels when the
structure is empty or untrustworthy. Vision-shaped input requires the configured vision-capable route.

---

## 6. Honest platform status

| Platform | Status |
|---|---|
| Linux | verified on this host |
| Windows capture (Graphics Capture) | **not implemented/verified — never run on a Windows host** |
| Windows UI Automation (invoke/hit-testing halves) | **not verified on Windows** |

These are recorded gaps, not hidden ones. A document may not describe Windows desktop control as working
until a real Windows acceptance pass exists (I15). The see-pane contract — show the user what the agent
sees, with an escape hatch — applies whenever desktop control is active.

---

## 7. Invariants this document must not weaken

| Invariant | How |
|---|---|
| I7 — effects with provenance + receipt | §2; every action is an Effect |
| I12 — one authorization model | §2; no desktop bypass of Guard |
| I13 — sandbox is mechanism | §2; the OS boundary is the isolation, Guard is the policy |
| I14 — authority honesty | §6's platform table |
| I15 — no false observability | §3's ref-based verification; §6 |

---

## 8. Migration notes

Policy hardening around allow-lists and risky classes is already partly landed; what this document adds is
the **separation from browser**, the strict observe/act/invalidate loop as a written contract, and the
explicit admission that the Windows halves are unverified. Desktop-as-agent-tool attachment and the
computer-use DAG live in the existing implementation; this contract bounds them.
