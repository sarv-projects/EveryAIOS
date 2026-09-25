# EveryAIOS v1 — support matrix

> **What this file is.** The published statement of which platforms v1 ships for, what is verified on each, and
> what is explicitly **not** in v1. It is the product-facing half of the decision recorded in
> [`ARCH/DESKTOP.md`](ARCH/DESKTOP.md) §6.1; the delivery checklist lives in [`TODO.md`](TODO.md) (`P70.D5`,
> `P70.D6`) and the normative contract in [`DESKTOP-APP-SPEC.md`](DESKTOP-APP-SPEC.md).
>
> **The honesty rule that governs it (I15).** A platform is listed as supported only when a recorded
> acceptance pass exists for the artifact that ships. "We wrote the code for it" is not a support claim.

---

## 1. v1 scope — decided 2026-09-22

**v1 ships for Windows. The Linux half ships as WSL. macOS and native Linux desktop are out of v1 scope.**

This is an evidence decision, not a preference. Desktop control is the one capability whose correctness
depends on the host OS, and the only host this project can verify today is Linux — which is not the platform
v1 ships. Windows is where the product will run, so Windows is where the acceptance work has to happen; WSL is
how Linux-native agents stay reachable from that same machine without a Linux desktop build.

Out of scope means **no artifact is published and no acceptance is claimed** — not that the code was deleted.
The Linux and macOS code paths remain in the tree (they are what the local verification harness and CI run on),
and returning them to scope later is a matrix change plus an acceptance pass, not a rewrite.

### v1 qualification scope and current state

The artifact names below are the intended Windows v1 outputs, not evidence that a qualified artifact has shipped. [`ADR-0007`](ARCH/ADR/0007-windows-first-v1-qualification.md) expands the v1 qualification surface without changing the platform decision or adding a new runtime authority. The status words are deliberately not interchangeable: `implemented — unverified`, `blocked`, `runnable`, and `open` do not mean `pass`.

| v1 surface | Required evidence | Current state |
|---|---|---|
| ACP identity and Channel B | Real `Session → Work → Run → AgentBinding` lifecycle; per-Session handle/cancellation; reconnect/resume policy; Channel B `tools/list`/`tools/call` through Guard, executor, receipt, and event. | **Open — implemented — unverified.** Channel B `mcpServers` **is** populated at `session_new` (empty only on a lease failure); `session_load` exists and is gated on the negotiated capability but has no live consumer; no recorded guarded `tools/call` round-trip. |
| Automation admission and provenance | Durable occurrence before Work; immutable revision and occurrence stamped by the production `compile_work` path; event/webhook admission; honest `pending`/`uncertain`/`cancelled` projections. | **Open — implemented — unverified.** The live scheduler firing path **does** go through `compile_work` with occurrence-derived ids; what remains open is durable occurrence identity for `mark_fired` and live acceptance. |
| Windows runtime | Real x64/ARM64 hosts; enforced child policy and Job-Object containment; WGC, UI Automation, and ConPTY behavior on the shipped host. | **Blocked — unverified.** Windows code and packaging gates are not runtime acceptance evidence. |
| Office, PDF, browser, accessibility, and CUA | Real workflows on Windows, including Office snapshot/rollback, PDF redaction, browser/session behavior, accessibility truth, and independent CUA verification. | **Blocked — open — unverified.** No complete live-host acceptance record exists; P68.7/P57.6/P66.6–P66.9 remain visible. |
| Recovery, replay, audit, and receipts | Production `ExecutionKernel` recovery, full Work replay, durable audit/per-effect receipts, and `uncertain` outcomes across a crash/reconnect. | **Open — implemented — unverified.** The live relay recovers via `ExecutionKernel::recover_from_work_gateway_with_checkpoint` — the journal is authoritative and the snapshot is only a validated cache. Open: full cross-surface replay, real-host recovery, durable per-effect receipt attachment. |
| Rust quality and release evidence | Rust 2024 `cargo fmt --all -- --check`, clippy with warnings denied, the complete workspace test matrix, and the coordinator/UI typecheck/test gates. | **Runnable/open.** These are release obligations; this matrix does not turn a wired command into a pass. |
| Sequential upgrade and clean-machine lifecycle | N−1 → N upgrade and rollback preserving durable stores; clean-machine install → first run → real task → uninstall, recorded for the release candidate. | **Blocked — open — unverified.** No sequential Windows build or clean-machine drill has been recorded. |
| Release sign-off | `P70.E1`–`P70.E12` all report `PASS` in one release-candidate record. | **Open — not qualified.** The recorded harness state is 3 `PASS` / 4 `RUNNABLE` / 5 `BLOCKED`; no sign-off file exists. |
| Voice and audio | No voice input, speech-to-text, text-to-speech, wake-word, voice memo, or audio-digest acceptance is required for v1. | **Post-v1 exclusion.** H15, H28, H30, and H31's audio-digest portion remain outside v1. |

The platform matrix therefore describes a Windows-first target, not a completed Windows qualification. Linux/WSL development evidence remains useful but cannot replace the required Windows hosts, sequential upgrade evidence, or clean-machine install/uninstall evidence.

## 2. Platform matrix

| Platform | v1 artifact | Cockpit | Desktop control | Terminal | Status |
|---|---|---|---|---|---|
| **Windows 11** (x64, arm64) | `.msi` (WiX) + `.exe` (NSIS) — target, not yet qualified | v1 target | UIA (invoke-first, background-capable) + Graphics Capture | ConPTY | **v1 target** — acceptance in progress (`P70.D6`, `P68.7`) |
| **Windows 10 22H2** (x64) | same — target, not yet qualified | v1 target | same | ConPTY | **v1 target** — acceptance in progress |
| **WSL2 (Ubuntu 22.04 / 24.04)** | none — supported **host for agents** | n/a (the cockpit is the Windows app) | n/a | the Windows terminal plane | **supported**: Linux-native agents and their ACP entrypoints run inside the distro; a discovered Linux path is launched through `wsl.exe -d <distro> -- <path>` and never enters a native Windows spawn (`P66.1`) |
| macOS (Apple silicon / Intel) | **none** | — | not claimed | — | **out of v1** |
| Native Linux desktop (any distro) | **none** | — | verified on the development host only | — | **out of v1** — the verification host, not a shipped platform |

### Windows specifics

- **Install mode:** per-user, no elevation required (NSIS `installMode: currentUser`).
- **Bundled runtime:** the coordinator sidecar ships as an application resource. Rust, Node, Bun and pnpm are
  **build-time** tools and are never required on a user's machine (`P70.A3`).
- **Agents:** any installed ACP agent runs as a normal user process; WSL-hosted agents are launched through
  their distro. Provider credentials live only in the Rust vault — never in a sidecar or a config file.
- **Sandbox posture:** Windows uses Job Objects and Restricted Tokens. This is a **weaker confinement than the
  Linux `bwrap` backend**, and the app must say so rather than presenting the two as equivalent (`P70.D7`).

## 3. What is explicitly not claimed

- **Windows desktop control is not yet verified.** Graphics Capture and the UIA invoke/hit-test halves have
  never run on a Windows host. Until the acceptance pass is recorded they are listed as *acceptance in
  progress*, and no surface may describe them as working (`ARCH/DESKTOP.md` §6.2).
- **Windows ConPTY is not yet verified** (`P68.7`).
- **ACP Channel B and the full agent lifecycle are not yet qualified on a live host.** The production
  launch **does** pass the Channel B shared-tool server list (empty only on a lease failure) and
  `session_load` is implemented; what remains open is a real guarded `tools/list`/`tools/call` pass,
  per-handle cancellation, and reconnect (`P70.E5`, `P70.E12`).
- **Automation occurrence provenance is not yet qualified on the production path.** The live scheduler
  firing path goes through the `compile_work` factory with occurrence-derived ids; durable occurrence
  identity and live acceptance remain open (`P70.E5`, `P70.E12`).
- **Production recovery/replay and durable receipt attachment remain open.** The WorkGateway journal is
  not the same as a qualified live `ExecutionKernel` recovery run.
- **No release candidate is signed off.** `P70.E1`–`P70.E12` must all report `PASS`; the recorded state
  remains mixed (`PASS` / `RUNNABLE` / `BLOCKED`) and no qualification file has been written.
- **Voice input, speech-to-text, TTS, wake-word, voice memo, and audio-digest output are post-v1 exclusions.**
  A disabled or staged control is not a v1 support claim.
- **No macOS signature, notarization or artifact** exists, and none is planned for v1.
- **No Linux package** (`.deb`, `.rpm`, `.AppImage`, Flatpak, AUR) is published for v1.
- **Telemetry is opt-in, content-free, and off by default**; the app is fully functional with it off and with
  no network (`P70.F6`).
- **No file associations and no `everyaios://` URL scheme are registered.** Documents open through the app's
  own file-open path; there is no OS-level open-document entry point (no single-instance handling, no
  document event), so registering a double-click target would route `.xlsx`/`.docx`/`.csv` to a process that
  cannot receive them. `scripts/check-app-metadata.mjs` fails if an association is declared without a handler
  (`P70.A4`).

## 4. Data and upgrade policy

- User data lives under the per-user data directory and survives uninstall by default, with an explicit
  "remove all data" path (`P70.D4`).
- Every durable store carries a schema version and a forward-only migration path (`P70.A8`). A build refuses
  to open data written by a newer schema rather than guessing (`P70.C6`).
- Upgrade over a previous v1 build must preserve the vault, Work/event log, checkpoints, memory, calendar,
  automations and audit-chain validity; the evidence for that is `P70.C5`/`P70.E8`, and it is recorded before
  release, not assumed.

## 5. Where this decision is enforced

| Concern | Where |
|---|---|
| Bundle targets and Windows installer settings | `src-tauri/tauri.conf.json` (`bundle.targets`, `bundle.windows`) |
| Platform scope, host evidence rule | this file; [`ARCH/DESKTOP.md`](ARCH/DESKTOP.md) §6 |
| Windows/WSL runtime location contract | `P66.1` (`ARCH/02-MODULE-LAYOUT.md`) |
| Release gates that must pass on the shipped platform | [`TODO.md`](TODO.md) `P70.E` |
| Deferred platforms recorded so they cannot leak back into v1 | [`TODO.md`](TODO.md) `P70.G4` |
