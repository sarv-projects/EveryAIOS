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

## 2. Platform matrix

| Platform | v1 artifact | Cockpit | Desktop control | Terminal | Status |
|---|---|---|---|---|---|
| **Windows 11** (x64, arm64) | `.msi` (WiX) + `.exe` (NSIS) | shipped | UIA (invoke-first, background-capable) + Graphics Capture | ConPTY | **v1 target** — acceptance in progress (`P70.D6`, `P68.7`) |
| **Windows 10 22H2** (x64) | same | shipped | same | ConPTY | **v1 target** — acceptance in progress |
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
