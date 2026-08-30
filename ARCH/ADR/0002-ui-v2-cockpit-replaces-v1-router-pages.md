# ADR-0002 — UI v2 cockpit replaces the v1 router pages

- **Status:** accepted
- **Date:** 2026-08-16
- **Applies to:** `ui/`, `TODO.md` UI sections, `ARCH/12-UI-SPEC.md`

## Decision

The v2 cockpit (`ui/`, `UI-DESIGN-PROMPT.md` = canonical spec) **replaced** the
v1 router pages. Historical `[DONE]` lines that cite `ui/src/pages/*.tsx`
(Chat, Cockpit, Spend, Trajectory, Audit, Spreadsheet, DocxViewer, PptxViewer,
PdfViewer, Settings) describe the v1 implementation.

## Capability map (v1 page → v2 home)

| v1 page | v2 surface |
|---|---|
| Chat | `components/chat/*` (panel/composer/picker) + `lib/bridge.ts` streaming |
| Cockpit | GuardPanel + bridge ticket cards + status bar |
| Spend | composer budget strip + status-bar cache + AnalyticsPanel |
| Audit | `views/audit-view` (live-capable via `lib/audit.ts`; demo fallback only in plain-browser preview) |
| Spreadsheet | `views/office-xlsx-view` (live-wired read/recalc/ticketed edits/bulk/structural shift/pivot) |
| Docx/Pptx/Pdf viewers | `views/office-*` via `OfficeOpenBar` (`docx_open`/`pptx_open`/`pdf_open`; pdf.js canvas) |
| Settings | `panels/settings-panel` |
| Trajectory (J5) | `views/trajectory-view` (source-grouped context-injection inspector, ⌘⇧T) |

## Consequences

- New UI work lands in `ui/src/components/{shell,views,panels,chat}`, never in
  new `pages/` router routes.
- ACP sign-in lives in the agent picker (`connectAgent` → `acp_launch`).
- Connectors surface is the live-wired Connectors panel (`mcp_catalog` →
  `ui/src/lib/mcp.ts`).
