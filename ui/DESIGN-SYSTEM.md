# EveryAIOS Design System (P11.1)

> **What this is:** the implementable surrogate of the "Figma/design file with
> all components + layouts" item. A real Figma file is a design-tool artifact
> this repo cannot host; this document is the source of truth that *would*
> live inside it — every token, component, layout and state, keyed to the
> code that implements it. Any designer can turn it into Figma frames 1:1.
>
> **Status:** Current UI design reference. The three-control composer and honest office-viewer behavior are defined by the normative product spec; historical changes belong in `../SPEC-CHANGELOG.md`.

## 1. Tokens (code: `src/globals.css` `:root` / `.dark`)

| Token | Light | Dark | Notes |
|---|---|---|---|
| Canvas `--surface-0` | `#F7F7F4` | `#1A1917` | warm cream, never sterile white |
| Panel `--surface-1` | `#FFFFFF` | `#232220` | |
| Card `--surface-2` | `#FFFFFF` | `#2D2C29` | + 1px `#E8E5E0` hairline |
| Hover `--surface-3` | `#F0EFEB` | `#353330` | |
| Ink `--foreground` | `#26251E` | `#F0EFEB` | warm near-black |
| Muted `--muted-foreground` | `#6B6860` | `#B9B6AD` | |
| Brand (sole accent) | `#F54E00` | `#F54E00` | orange — never decorative |
| Success / Warning / Danger / Info | green / amber / red / blue | same | semantic only |

**Radius** `--radius: 0.5rem` (sm/md/lg/xl derived). **Fonts** Inter (sans) +
JetBrains Mono (mono). **Spacing** 4px grid. **Motion** 150–300ms
`cubic-bezier(0.4, 0, 0.2, 1)`; reduced-motion kills all (globals.css).

## 2. Layouts (code: `src/components/shell/*`)

- **Cockpit** (`App.tsx`): TitleBar → [LeftSidebar | CenterColumn | ActivityRail | RightViewport] → StatusBar. Never 9 peer tabs.
- **LeftSidebar**: workspace selector, nav (Home/Activity/Projects/Files/Automations), Recent sessions (P11.5.1 child forks indent), Settings. Collapsible to 48px.
- **CenterColumn**: chat (timeline + composer + approve cards) or one panel screen.
- **ActivityRail + RightViewport** (`right-rail.tsx`): 48px rail (Folder/Shell/Browse/Code + Office flyout + Progress/Trajectory), one open surface, drag-resize 28–70%, per-session persistence (P11.5.3).
- **StatusBar**: state pill (● Live / ⏸ Paused / Processing) + privacy reassurance; dev-mode telemetry strip incl. LCP/TTI (P11.4).

## 3. Components (code: `src/components/ui/*` + `src/components/panels|chat|views/*`)

| Component | File | States |
|---|---|---|
| Button (primary/ghost/outline/icon) | `ui/button.tsx` | default / hover / focus-visible / disabled |
| Badge, Card, Input, Select, Switch, Slider | `ui/*` | + loading skeletons (`ui/loading-state.tsx`) |
| EmptyState | `ui/empty-state.tsx` | icon + title + desc + action (P11.2) |
| ErrorState (5 kinds) | `ui/error-state.tsx` | network / keyRevoked / provider5xx / budget / unknown |
| LoadingState (5 kinds) | `ui/loading-state.tsx` | ttft / compaction / tool / agent / generic |
| MessageBubble, ChatComposer, MCQ card | `chat/*` | Composer: Work Mode ▾ (Auto/Plan/Build/Research) · Agent ▾ · Autonomy ▾ (Sandbox/Ask/Auto/Maximum). Casual chips `[🤖 Auto] [🛡 Ask]`. Now-doing strip shows the live autonomy level. |
| OnboardingModal | `onboarding-modal.tsx` | 4 steps, non-dismissible, skip allowed |
| Folder/Shell/Browse/Code/Diff views | `views/*` | real backends (fs/shell/CDP/undo-list) |
| Cockpit slideover | `shell/cockpit-slideover.tsx` | animated open/close, per-agent pause/resume |

## 4. Accessibility (P11.3)

WCAG 2.1 AA: focus-visible ring on every interactive element; high-contrast
mode (`html.high-contrast`); reduced motion; font scaling
(`html.font-scale-*`); RTL (`html[dir=rtl]` + logical-property pass);
aria-labels on icon-only buttons; keyboard nav via `KeyboardShortcuts` +
Radix focus traps.

## 5. Performance UX (P11.4)

Skeletons on async views; debounced search (`useDebouncedValue`); virtual
scrolling (`useVirtualList` in session timeline); lazy chunks (pdf/charts/
markdown); LCP/TTI measured in `lib/perf.ts` and surfaced in the status bar.

## 6. Layouts index (all screens)

Chat · Home launchpad · Automations (+ templates + NL create + Tasks rail) · Guard (v1 webview+nonce) ·
Connectors (live OAuth + P42 not-attached) · Memory (5 tabs, live RPC) · Analytics · Settings ·
Folder · Shell · Browse · Code · Diff · Audit · Storage · Blueprint ·
Trajectory · Office honest viewers (Sheets/Word/Slides/PDF + LO fallback + file switcher).
