# 01 — Naming & Brand Map (v1)

> **Status:** Draft P0 — provisional **working names** per product-owner direction (2026-09-26). Nothing here is final branding; the layer is centralized so a rename is mechanical.
> **Rule of use:** all v1 docs use the **v1 names** only. v0 names appear only in the rename map below or in explicit historical notes.

## 1. Working names

| Concept | v1 working name | v0 name | Owner doc | Notes |
|---|---|---|---|---|
| Product / platform | **AgentCowork** | EveryAIOS / EAIOS | `AGENTCOWORK-SPEC.md`, `ARCH/02-THESIS.md` | Working name “for now”. Formal long name open (OQ-001). |
| Runtime / kernel | **Core** (“AgentCowork Core” in formal prose) | EveryCore | `ARCH/03-HLD.md` | The brain; all surfaces are projections of it. |
| Native first-party agent | **Agent X** | EveryAgent | `ARCH/15-AGENT-X.md` | Architecturally a peer of external agents — same `AgentEngine` contract, no privileged path into Core. |
| Digital world model | **World Model** (the World) | EveryWorld | `ARCH/21-WORLD-MODEL.md` | Continuously updated structural map of the machine. |
| Office runtime | **Office Runtime** | EveryOffice | `ARCH/22-OFFICE.md` | Lives under the universal document surface — not a sidebar mode. |
| Browser runtime | **Browser Runtime** | EveryBrowser | `ARCH/23-BROWSER.md` | Managed Chromium default + selectable adapters. |
| Repository intelligence | **RepoGraph / RepoMap** | same | `ARCH/26-CODE.md` | Graph + token-budgeted projection. Names kept. |
| CLI (future) | `agentcowork` (placeholder) | `every …` | `ARCH/32-CHANNELS.md` | Final binary name decided with the CLI surface (OQ-005). |
| Code identifiers | `everyaios-*` (unchanged) | — | — | Code is frozen; identifier rename is a scheduled code-phase task after v1 freezes (OQ-003). |

## 2. Rename map (reading v0)

| v0 term | v1 term |
|---|---|
| EveryAIOS | AgentCowork |
| EAIOS | (retired shorthand — use AgentCowork) |
| EveryCore | Core |
| EveryAgent | Agent X |
| EveryWorld | World Model |
| EveryOffice | Office Runtime |
| EveryBrowser | Browser Runtime |
| EveryRepo | RepoGraph / RepoMap |
| `everyaios-*` (code) | unchanged until the code-phase rename |
| `every …` CLI | `agentcowork …` (placeholder) |

## 3. Rules

1. **Docs use v1 names only.** The only places v0 names may appear: this map; archive references; explicit “v0 called this X” history notes.
2. **Renames are decisions.** Changing any working name = update this doc + a `DEC` entry in `ARCH/04-DECISIONS.md` + a mechanical sweep of docs.
3. **Commit hygiene** (carried from `AGENTS.md`): never mention AI tool/agent vendor names in commits, code, or docs. This is separate from product naming.
4. **Code identifiers are frozen.** `everyaios-*` crate/package names, `EveryAIOS` strings, and the CLI binary keep their current names during the docs phase; the code-phase rename is planned *after* v1 freezes so docs and code move once, together (OQ-003).
5. **Product positioning** does not rename with the brand: AgentCowork is described as an AI-native execution environment layered on the user’s existing computer — never as an OS/kernel replacement (`ARCH/02-THESIS.md`).

## 4. Open

- **OQ-001** — product shorthand for UI copy (“AC”, “Cowork”, or none). Decide before UI copy freeze (P5).
- **OQ-003** — timing + scope of the code identifier rename (crates, packages, `EveryAIOS` strings, CLI binary, vault paths, config dirs).
