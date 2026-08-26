# EveryAIOS Design System

This file is the repository-level design context for UI agents. It is a design
constraint, not an authorization grant. Agents must preserve accessibility,
confirmation boundaries, and existing product surfaces.

## Principles

- Calm, dense cockpit: information hierarchy over decoration.
- One surface per task: chat, code, browse, office, storage, and audit remain
  reachable without losing session context.
- Guard before consequence: destructive, financial, credential, install, and
  third-party write actions require a visible Guard-2 decision.
- Evidence over assertion: show source, status, diff, receipt, or audit trail.
- Keyboard first, pointer friendly: focus states, shortcuts, and semantic
  labels are mandatory.
- Local-first: avoid sending content to a service unless the user selected it.

## Visual tokens

Use the existing Tailwind/shadcn tokens (`background`, `card`, `border`,
`foreground`, `muted`, `primary`, `destructive`) rather than introducing new
colors. Prefer compact spacing, readable contrast, and motion that communicates
state. Animations must respect reduced-motion preferences.

## Agent UI checklist

Before shipping a new view: identify its loading/empty/error/demo states; add
accessible names and keyboard paths; preserve cancellation and undo; label
network or model activity; and ensure content is not represented as an
approval or completion claim before its backend receipt exists.
