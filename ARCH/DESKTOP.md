# ARCH/DESKTOP — computer use: driving the real OS

> **Status:** Subsystem contract, derived from [`CORE.md`](CORE.md). Covers **OS computer use** — a different
> environment from the browser and deliberately never merged with it. Invariants it must not weaken:
> **I7, I12, I13, I14, I15**.
>
> **v1 scope clarification (2026-09-24):** [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md)
> makes real Windows WGC/UIA/ConPTY behavior, OS-enforced child containment, and x64/ARM64 acceptance v1
> release obligations. Code, cross-compilation, and supervisor cleanup are not runtime qualification.
> Voice/STT/TTS/wake-word/audio remain post-v1.
>
> **Projection/lease amendment (2026-09-24):** [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md)
> adds target identity/generation, observation-versus-action leases, foreground takeover, and stale-ref rules.
> A Desktop target remains physically engine-owned; a Session projection only references it.

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

### 3.1 Target identity, observation/action leases, and takeover

A Desktop `ResourceRef` identifies the host plus window/app/target, with process birth identity where the host
can prove it and a target generation. A window title, coordinate, screenshot id, or stale element ref is not a
lease. The canonical owner context is `SessionId → WorkId → RunId → AgentBindingId`; the Session projection
stores only that reference, generation, and safe status.

- **Observation lease:** permits a bounded snapshot/accessibility observation. Multiple observers may coexist
  only under the Desktop resource policy, and an observation never grants permission to act.
- **Action/control lease:** exclusive for the physical target. A click, keystroke, foreground activation, or
  other action requires a current Work/Run lease and Guard authorization.
- **Foreground takeover:** a user takeover is an explicit native gesture. The old holder is paused/checkpointed,
  its lease is revoked and fenced, and the new user-controlled lease is issued before the next action. The
  agent is notified and must re-observe; prior refs are invalid.
- **Pause/resume:** pausing freezes the action path without releasing canonical Work history. Resuming
  revalidates the target generation/fence and either reuses a still-valid lease or reports a conflict/stale
  target. A binding switch changes only the actor, not the Work/Run lease owner.
- **Cross-Session contention:** another Session cannot use a target because it can see the same window title,
  screenshot, or UI ref. It receives a typed conflict and must wait or explicitly take over; it never steals
  the physical target or silently retargets coordinates.

The full lease contract and the pending physical-target, stale-generation, crash, and takeover acceptance rows
are normative in [`ADR/0008`](ADR/0008-session-workbench-projection-and-resource-leases.md). This section does
not make Desktop control Windows-qualified.

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

### 6.1 v1 platform scope (decided 2026-09-22)

**v1 ships for Windows, and the Linux half ships as WSL.** macOS and native Linux desktop are **out of v1
scope** — not "unsupported as a claim", but out of the qualification matrix, so no v1 artifact is published
for them and no v1 acceptance pass is claimed. `SUPPORT-MATRIX.md` at the repository root is the published
form of this decision; this section is its architectural half.

The reason is evidence, not preference. Desktop control is the one capability whose correctness depends on
the host OS, and the only host this project can verify is Linux — the platform v1 is not shipping. Windows is
where the product will actually run, so Windows is where the acceptance work belongs; WSL is the supported
way to run Linux-native agents (and the Linux ACP binaries) from that same machine, which is what makes the
Linux tooling reachable without shipping a Linux desktop build.

| Platform | v1 artifact | Desktop control | Notes |
|---|---|---|---|
| Windows 10 22H2 / 11 (x64, arm64) | **v1 target** (`.msi` WiX + `.exe` NSIS; both architectures) | UIA (invoke-first), Graphics Capture, and ConPTY — **acceptance pass required before qualification** | The v1 target. `shipped` is not a support claim until a real Windows install and acceptance record exist. |
| Windows via WSL2 (Ubuntu 22.04/24.04) | **supported host for agents**, no separate cockpit artifact | n/a — WSL runs *agents*, not the cockpit | Linux-native agent binaries + their ACP entrypoints run here; paths resolve through the named distro and never enter a native Windows spawn (`P66.1`). |
| macOS | **out of v1** | not claimed | Blocked by the same evidence rule; no signing/notarization work is in v1 scope. |
| Native Linux desktop | **out of v1** | verified on this host, and that is the point — the verified platform is not the shipped one | The verification runs here; the artifact is not published. |

### 6.2 Recorded gaps

| Platform | Status |
|---|---|
| Linux | verified on this host — the acceptance host, not a v1 artifact (§6.1) |
| Windows capture (Graphics Capture) | **not implemented/verified — never run on a Windows host** |
| Windows UI Automation (invoke/hit-testing halves) | **not verified on Windows** |
| Windows ConPTY (terminal plane) | **not verified on Windows** (`P68.7`) |

These are recorded gaps, not hidden ones. A document may not describe Windows desktop control as working
until a real Windows acceptance pass exists (I15). The see-pane contract — show the user what the agent
sees, with an escape hatch — applies whenever desktop control is active. Shipping a Windows-first v1 with
these open is allowed only because `SUPPORT-MATRIX.md` and the installer state them, never because they were
quietly dropped (`P70.D6`).

### 6.3 v1 Windows runtime enforcement

The v1 release obligation is stronger than “the code contains a Windows API.” The actual ACP/MCP/child
launch path must attach an OS-enforced policy: AppContainer or restricted-token isolation as appropriate,
Job-Object process/resource containment, an explicit environment/credential boundary, and a fail-closed
result when the requested backend is unavailable. Job-Object orphan prevention in the supervisor is a
lifecycle safeguard, not by itself proof that an agent or tool ran confined. A capability string,
`Ambient` fallback, or Windows cross-compile cannot satisfy this section.

WGC must return real pixels for an occluded target, UIA must prove invoke/hit-testing and accessibility
truth, and ConPTY must run a real interactive shell and profile on the shipped host. These are v1
acceptance surfaces under [`ADR/0007`](ADR/0007-windows-first-v1-qualification.md), not post-v1
enhancements. No Windows acceptance record exists at the time of this amendment.

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
computer-use DAG live in the existing implementation; this contract bounds them. The v1 expansion in
[`ADR/0007`](ADR/0007-windows-first-v1-qualification.md) makes the missing native enforcement and live
Windows evidence release-blocking; it does not change desktop ownership or create a second executor.

---

## Repo-comparison additions (briefs 01–19)

> Delta group: *"ARCH/08-BROWSER-LAYER.md + ARCH/DESKTOP.md (+ E9)"* (`REPO-COMPARE/DELTA-ANALYSIS.md` §3).
> Evidence paths are repo-relative under `/home/sarvesh/business_Dev/REPO-COMPARE/clone2/`.
> Dispositions are the briefs' tags; arrows into files not owned here carry `→ <file> §…` and are
> cross-domain deferred. Readiness wording below follows the frozen contract: Windows-first and
> **evidence-gated** — a mock, unit-only run, or browser-preview result is never acceptance evidence.

- **15-4/7/8** · `add` — SOURCE: open-computer-use (Apache-2.0), open-codex-computer-use (MIT) · evidence: `open-computer-use/os_computer_use/grounding.py`; `open-codex-computer-use/ComputerUseService.swift` (semantic → process-directed → gated-global click ladder, no silent fallback), `AppDiscovery.swift:555-563` (credential-manager denylist), `MCPServer.swift` + `ToolDefinitions.swift` (`turn-ended` clears overlays and requires `get_app_state` before the next action) — LOGIC: the desktop action discipline hardens into four rules — dedicated grounding-model fallback when the a11y tree is empty, credential-manager app class hard-deny, fail-closed escalation ladder (semantic → targeted → gated global; the ladder *proposes*, Guard *decides*), and a turn-ended session lifecycle that forces re-observe/invalidate. → target §3 (turn-ended re-observe), §4 (escalation + hard-deny classes), §5 (grounding fallback); disposable-sandbox backend as a Guard-selected posture → SECURITY.md (sandbox-is-mechanism) + 06-SECURITY-GUARDRAILS §6.1 cross-domain deferred; E9 rows → 09-FEATURE-MATRIX (not owned here).
- **15-4/7/8** · `add` (acceptance harness) — SOURCE: open-codex-computer-use (MIT) · evidence: `open-codex-computer-use/apps/OpenComputerUseFixture`, `apps/OpenComputerUseSmokeSuite` (`docs/ARCHITECTURE.md:147-160`) — LOGIC: a deterministic fixture app + headless smoke suite driving the real tool surface end-to-end is the repeatable **Windows acceptance harness** whose records are the only thing that closes a §6.2 recorded-gap row (fixture + smoke = harness; the acceptance pass on a real Windows host = evidence). → target §6 (evidence gating per SUPPORT-MATRIX; I15); SUPPORT-MATRIX/00-INDEX publication notes not owned here.
- **15-2/6/10/11** · `improve` — SOURCE: UI-TARS-desktop (Apache-2.0), open-computer-use (Apache-2.0), open-codex-computer-use (MIT) · evidence: `UI-TARS-desktop/packages/ui-tars/sdk/src/GUIAgent.ts` (typed `GUIAgentError`/`ErrorStatusEnum` taxonomy, per-stage retry budgets, token/time totals in `finally`), `open-computer-use/main.py` + `logging.py` (per-run output dirs with screenshots), `open-codex-computer-use/docs/ARCHITECTURE.md` (snapshot budgets 1200 nodes / depth 64 / 500-char text, ≤900 KB/≤1280 px bounded screenshots, `:76,:94` px→window→global mapping with explicit scaleFactor) — LOGIC: the desktop loop adopts a typed retry/error taxonomy with per-stage budgets and token/time accounting, per-run evidence capture (timestamped screenshots + structured action log per run id), hard snapshot/screenshot budgets, and explicit coordinate-space mapping so pixel fallbacks stay verifiable. → target §3 (budgets + coordinate discipline on the observation contract), §6 (per-run evidence); accounting half → 05-TOKEN-ECONOMY, audit/evidence half → SECURITY.md (audit), result shape → 08-BROWSER-LAYER §8.11 (TC-4.1) — cross-domain deferred except §8.11 (owned here).
- **11-1** · `improve` — SOURCE: eliza (MIT) · evidence: `eliza/contracts/computer-use.ts`, `eliza/packages/core/README.md` ("Computer-use adapter contract": leases, host-issued grants, confirmation previews bound to a SHA-256 digest, `UNCERTAIN_EFFECT`, canonical `EffectReceipt`) — LOGIC: the CUA effect vocabulary gains `UNCERTAIN_EFFECT` for unprovable mutations, a lease-conflict vs stale-observation split, and digest-bound confirmation previews so §2's Effect → Receipt path stays honest when an effect cannot be proven. → target §2–§3 (receipt vocabulary + invalidate loop); ticket-lifecycle half → SECURITY.md §3 cross-domain deferred; see-pane half cross-noted in 12-UI-SPEC (the brief's `08 §8.3` arrow names the browser loop, whose non-goal rule keeps desktop effects out of that façade — one rule, two surfaces, this document owns the CUA wording).
- **11-15** · `improve` — SOURCE: raya (MIT) · evidence: `raya/raya/tree/` (UI Automation tree walker), `raya/raya/agent/service.py` (a11y-first initial observation) — LOGIC: the OS accessibility tree becomes the primary CUA observation with `interactive`/`informative`/`scrollable` classification, visibility/enabled filters and per-app scoping, screenshot as the secondary channel — the direct OS analogue of snapshot→act. → target §3 (observation contract) + §5 (structure first, pixels when the tree is empty); brief also names 08-BROWSER-LAYER §8.3 (same non-goal routing as 11-1) + → CAPABILITIES.md §7 cross-domain deferred.

## 9. Windows 4-Tier Click Ladder & Fallback Hierarchy (Open-Codex Pattern)

To operate with maximum speed and minimum disruption to the human user, desktop input dispatches through an escalating 4-tier ladder:

| Tier | Mechanism | Cursor Theft? | Focus Required? | Escalation Gate |
|---|---|---|---|---|
| **Tier 1: UIA Invoke** | `IUIAutomationInvokePattern::Invoke` or `SetValue` | **No** (0ms) | No | Automatic (Default) |
| **Tier 2: Win32 Message** | `PostMessage(hwnd, WM_LBUTTONDOWN/UP)` to specific PID | **No** | No | Automatic on Tier 1 failure |
| **Tier 3: Direct Composition** | Window-scoped injection via Graphics Capture bounds | **No** | No | Automatic on Tier 2 failure |
| **Tier 4: Gated SendInput** | Win32 `SendInput` physical mouse/keyboard events | **Yes** (moves mouse) | **Yes** (foreground) | **Requires Guard-2 Approval Card** |

- The system *proposes* escalation; Guard *decides* whether Tier 4 cursor hijacking is authorized.

## 10. Patch-Aligned Coordinate Quantization & VLM Formatting (UI-TARS Pattern)

When falling back to vision-based VLM grounding:
- **Patch Alignment (`IMAGE_FACTOR = 28`):** Screenshot dimensions and bounding boxes are quantized to multiples of 28 pixels, matching visual encoder patch tokens (UI-TARS / Qwen2-VL) to prevent visual aliasing and sub-pixel coordinate misalignments.
- **Scale Factor Normalization:** High-DPI Windows displays (`scaleFactor = 1.25, 1.5, 2.0`) are normalized to physical pixel coordinates before `SendInput` execution.
- **Bounding Box Budgets:** Screenshots are clamped to `<= 1280px` max dimension and `<= 900KB` payload size before entering context.

---

## 11. External Agent Execution Flow via Shared Facade (`computer_use.*`)

External agents (running via ACP in child processes) discover and invoke desktop capabilities via the host-bound Channel B MCP server (`http://127.0.0.1:<port>/mcp`):

1. **Discovery:** The agent calls `tools/list` on Channel B and receives `computer_use.snapshot`, `computer_use.interact`, `computer_use.launch_app`.
2. **Observation (`computer_use.snapshot`):**
   - Captures active window hierarchy and accessibility tree via UI Automation / AT-SPI.
   - Elements are indexed with deterministic ref IDs (`e1`, `e2`, `e3`).
   - If payload exceeds 2,000 tokens or 900 KB, the raw tree / screenshot is spooled to `~/.everyaios/spool/{sha256}.blob`, returning a compact text preview and disk handle.
3. **Execution (`computer_use.interact`):**
   - The agent supplies `ref: "e2"` and `action: "click" | "set_value"`.
   - Dispatch flows through the 4-tier click ladder (§9).
   - **Mandatory Invalidation Rule:** Execution immediately invalidates all prior element refs, forcing the agent to re-observe before issuing subsequent acts.
4. **Guard-1/2 Interception:**
   - Attempts by external agents to run raw OS automation scripts (e.g. `pyautogui`, `xdotool`, `powershell SendKeys`) in bash/python are intercepted by Guard-1 AST inspection and deflected to `computer_use.interact` (`ARCH/RECOVERY.md` §13).
   - Sensitive window targets (credential vaults, system settings, payment gateways) trigger Guard-2 interactive approval cards.

