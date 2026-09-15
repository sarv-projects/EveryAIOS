# Doc 91 — Windows-first agent discovery, picker, and cowork readiness (2026-09-15)

> **Purpose:** implementation provenance for the Windows-first UI and runtime follow-up (`TODO.md` P66). This is an audit of the current checkout plus targeted primary-source/repository research. It does not claim that a library or external product is integrated merely because it was researched.
> **Evidence rule:** `REPO-VERIFIED` means confirmed in this checkout; `DOC/SEARCH-VERIFIED` means confirmed from an official page or repository search result; `UNVERIFIED` means it needs a Windows/live acceptance test.

## 1. Current checkout findings

| Area | Finding | Grade |
|---|---|---|
| EveryAIOS data root | `everyaios-core::default_data_dir()` honors `EVERYAIOS_HOME`, then `HOME`, `USERPROFILE`, `HOMEDRIVE+HOMEPATH`, and finally temp; Windows release must display the resolved path rather than call it `~`. | REPO-VERIFIED |
| Managed agent installs | ACP installer records managed installs below `<data_dir>/agents/<agent>/<version>/`; binary archives are hash-verified; npx/uvx rows record a package-manager pin. | REPO-VERIFIED |
| External discovery | ACP launch registry is merged with the cached official registry; occupancy is separate and comes from an install record or executable resolution on `PATH`. Windows probes `.exe`, `.cmd`, and `.bat`. | REPO-VERIFIED |
| WSL | WSL is already a `Wsl` terminal/execution backend with path translation. A WSL CLI is not a Windows install and must carry distro + Linux path + launch backend. | REPO-VERIFIED |
| Models | Native uses EveryAIOS provider/model data; external ACP agents expose their own `configOptions`. P63 may inject provider env at spawn, but does not write the external config file. | REPO-VERIFIED |
| UI | The picker already has a two-column runtime/model shape, but it is dense, orange-branded, and does not yet provide a full Windows discovery provenance/path detail or a session capability pane. | REPO-VERIFIED |
| Office/browser/memory | Engines have substantial unit-level primitives; this checkout does not yet provide enough Windows live acceptance evidence to call the combined cowork surface production-grade. | REPO-VERIFIED |

## 2. Path contract to implement

Every discovered agent row must carry:

```ts
type RuntimeLocation = {
  kind: 'managed' | 'windows_path' | 'windows_registry' | 'wsl' | 'user_path' | 'package_manager' | 'unavailable';
  executable?: string;       // absolute Windows path, never a bare command
  command?: string;          // original command/package identity
  distro?: string;           // required for WSL
  linuxPath?: string;        // required for WSL
  version?: string;          // null/unknown when not probed
  source: 'everyaios_install' | 'path_probe' | 'app_paths' | 'wsl_probe' | 'user_selected' | 'registry_catalog';
  verifiedAt?: string;
};
```

Rules: catalog discovery never means occupancy; PATH/App Paths/Start Menu/explicit user path are distinct provenance; WSL paths are never passed to a Windows process; managed installs are launched by their pinned absolute path; a missing or permission-denied path is visible and not silently replaced by a fallback.

Canonical Windows locations to probe/show (when present, without inventing them): `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMDATA%`, `%ProgramFiles%`, `%ProgramFiles(x86)%`, the effective `PATH`, and WSL distro roots through `wsl.exe`. EveryAIOS secrets remain in its encrypted vault; external subscription credentials remain in the external agent's own auth flow.

## 3. Research adopted

- Cline Desktop: searchable settings inventory, provider detail, explicit readiness, schedules, and Installed vs Marketplace are useful UX patterns; its registry/runtime is not copied.
- OpenCode documentation: provider/model configuration and environment-substitution patterns reinforce agent-owned model configuration and secret indirection.
- Claude Code settings documentation and Codex CLI/app-server material reinforce native session/auth/config ownership and the rule to integrate through the reachable CLI seam.
- `vercel-labs/agent-browser`: compact agent-oriented browser output is a useful benchmark for token-bounded browser façades; EveryAIOS keeps its Rust CDP/a11y implementation.
- `Jeomon/Windows-Use`, `simular-ai/agent-s`, and Windows UI Automation research: semantic UIA/accessibility first, screenshot/coordinate fallback, then verify; no blind coordinate automation.
- `iOfficeAI/OfficeCLI` search result: agent-shaped Office operations are a useful comparison, not an adopted dependency. EveryAIOS keeps its Rust OOXML/IronCalc/LO oracle path and must benchmark it on real files.
- `Gentleman-Programming/engram` and SQLite/FTS5 memory projects: MCP-accessible persistent memory is a useful interoperability pattern; EveryAIOS keeps its Rust ACT-R/FTS5/graph/FSRS ownership.

## 4. Acceptance gaps

Before claiming Windows cowork parity, run a real Windows matrix: discover/import a PATH-installed OpenCode, Claude Code, Codex, Cline, Pi, and a WSL-only CLI; show exact paths and provenance; launch each through its actual seam; select only models exposed by that agent; use a vault provider only through the documented spawn binding; run Office read/edit/recalc/render/rollback; browser snapshot/action/verify; computer-use UIA action/verification; restart and rehydrate memory/MCP/skills/schedules; and verify all effects in the Work/audit timeline.

No result should be marked green from a mocked browser preview, static seed, unit-only Office test, or a catalog row. Missing Windows backend evidence remains `unverified`, not `ready`.
