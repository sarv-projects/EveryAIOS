'use client'

// The run surface's derivations. Everything here is a **pure projection** of
// canonical state the store / native commands already hold — no fetch, no store
// access, no invented figure. Keeping it pure is what makes the honesty rules
// unit-testable: an unknown value stays `null` all the way to the screen.
//
// Reuse, not re-derivation: labels/tone/status come from the typed Work mirror
// (`describeWorkEvent`, the same mirror `progress-view` summarises through) and
// the live/failed decision comes from `timelineStatus` over the folded
// `AgentCard` — the one owner of "is this run parked on the user".

import {
  Archive,
  Code2,
  File,
  FileType,
  FileText,
  Image as ImageIcon,
  Music,
  Presentation,
  Table,
  Video,
} from 'lucide-react'
import { describeWorkEvent, type WorkEventEnvelope } from '@/lib/work'
import { timelineStatus, type AgentCard } from '@/lib/agent-card'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Numbers — plain, tabular, never "NaN"
// ---------------------------------------------------------------------------

/** Compact token count. `null` (not reported) is rendered by the caller. */
export function formatTokens(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Human byte size from a real `fs` size. `null` stays `null`. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  const units = ['kB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}

/** Duration from real journal timestamps. Sub-second reads `<1s`. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null
  if (ms < 1000) return '<1s'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return `${minutes}m ${String(rest).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

/** Wall-clock time for a journal timestamp (ms epoch or ISO). */
export function formatClock(ts: number | string | undefined): string {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts ?? ''))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Trace steps — the ordered journal, projected
// ---------------------------------------------------------------------------

/**
 * Five states, and they never collapse (ARCH/RECOVERY.md: an unknown post-effect
 * outcome stays `uncertain`; ARCH/UI.md: no colour-only status).
 *
 * - `done`      the event settled successfully
 * - `running`   the newest step of a live run
 * - `waiting`   the run is parked on the user — the indicator stops here
 * - `failed`    the event settled unsuccessfully
 * - `uncertain` the outcome is genuinely unknown and must read as unknown
 */
export type RunStepStatus = 'done' | 'running' | 'waiting' | 'failed' | 'uncertain'

export const RUN_STATUS_LABEL: Record<RunStepStatus, string> = {
  done: 'Done',
  running: 'Running',
  waiting: 'Waiting for you',
  failed: 'Failed',
  uncertain: 'Outcome unknown',
}

export interface RunStep {
  /** Stable key: the journal sequence number. */
  key: string
  sequence: number
  label: string
  detail?: string
  tone: string
  status: RunStepStatus
  atMs: number
  /** Real elapsed time, or `null` when the journal cannot prove one. */
  durationMs: number | null
  /** What the duration was measured against, shown on hover. */
  durationNote: string | null
  /** Raw journal coordinates, revealed by expand-for-detail. */
  eventClass: string
  eventKind: string
  traceId?: string
  /** The resource this step actually names, or `null`. A step that names
   *  nothing gets no drill-down — never a button that opens an unrelated view. */
  link: RunStepLink
  /** Lowercased haystack for the in-panel filter. Derived, never stored twice. */
  search: string
}

/** A real resource a journal entry named, and the lens that can open it. */
export type RunStepLink =
  | { target: 'code'; label: string; path: string }
  | { target: 'audit'; label: string; id: string }
  | { target: 'shell'; label: string; id: string }
  | null

/**
 * The one honest drill-down per step: only when the entry actually names a
 * resource, and only the lens that can act on it. A `tool_started` names a
 * tool, not a view, so it gets nothing — there is no surface that could open
 * "the tool" honestly.
 */
export function runStepLink(event: WorkEventEnvelope): RunStepLink {
  const w = bodyOf(event)
  if (!w) return null
  const ev = w.event
  if (w.class === 'operational' && ev.kind === 'file_touched' && ev.data.path) {
    return { target: 'code', label: 'Open the file', path: ev.data.path }
  }
  if (w.class === 'domain' && ev.kind === 'write_conflict' && ev.data.path) {
    return { target: 'code', label: 'Open the file', path: ev.data.path }
  }
  if (w.class === 'domain' && (ev.kind === 'approval_requested' || ev.kind === 'approval_resolved') && ev.data.ticketId) {
    return { target: 'audit', label: 'Open the audit trail', id: ev.data.ticketId }
  }
  if (w.class === 'runtime' && (ev.kind === 'pty_started' || ev.kind === 'pty_output' || ev.kind === 'pty_exit') && ev.data.ptyId) {
    return { target: 'shell', label: 'Open the terminal', id: ev.data.ptyId }
  }
  return null
}

// ---------------------------------------------------------------------------
// Trace filtering
// ---------------------------------------------------------------------------

/** What a step belongs to, for the in-panel filter. Derived from the journal
 *  class + kind, never guessed from a label. */
export type RunFilter = 'all' | 'run' | 'tool' | 'file' | 'effect' | 'test' | 'infra'

export const RUN_FILTERS: { id: RunFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'run', label: 'Runs' },
  { id: 'tool', label: 'Tools' },
  { id: 'file', label: 'Files' },
  { id: 'effect', label: 'Effects' },
  { id: 'test', label: 'Tests' },
  { id: 'infra', label: 'Infra' },
]

export function runFilterOf(step: Pick<RunStep, 'eventClass' | 'eventKind'>): RunFilter {
  const { eventClass, eventKind } = step
  if (eventClass === 'operational') {
    if (eventKind.startsWith('tool_')) return 'tool'
    if (eventKind === 'test_ran') return 'test'
    if (eventKind === 'file_touched' || eventKind === 'write_conflict' || eventKind.startsWith('handoff_')) {
      return 'file'
    }
    return 'infra'
  }
  if (eventClass === 'domain') {
    if (eventKind.startsWith('run_') || eventKind.startsWith('work_')) return 'run'
    if (eventKind.startsWith('effect_') || eventKind.startsWith('approval_')) return 'effect'
    if (eventKind.startsWith('artifact_') || eventKind.startsWith('review_')) return 'file'
    return 'infra'
  }
  return 'infra'
}

/** The lowercased haystack a filter searches. */
export function runSearchText(step: RunStep): string {
  const named =
    step.link === null
      ? ''
      : step.link.target === 'code'
        ? step.link.path
        : step.link.id
  return [step.label, step.detail ?? '', step.eventKind, step.eventClass, named]
    .join(' ')
    .toLowerCase()
}

/**
 * Narrow the trace. An empty result is returned as-is (length 0) so the panel
 * can say "nothing matches" instead of implying the run had no such step.
 */
export function filterRunSteps(
  steps: readonly RunStep[],
  opts: { filter: RunFilter; query: string },
): RunStep[] {
  const q = opts.query.trim().toLowerCase()
  return steps.filter((s) => {
    if (opts.filter !== 'all' && runFilterOf(s) !== opts.filter) return false
    if (q && !s.search.includes(q)) return false
    return true
  })
}

/** Outcomes the canonical vocabulary treats as a settled success. */
const SETTLED_OK = new Set([
  'success',
  'succeeded',
  'ok',
  'applied',
  'verified',
  'completed',
  'complete',
  'done',
])

/** Outcomes the canonical vocabulary treats as a settled failure. */
const SETTLED_BAD = new Set([
  'failed',
  'failure',
  'error',
  'denied',
  'blocked',
  'rejected',
  'aborted',
  'rolled_back',
  'rollback',
])

/**
 * An effect outcome nobody can read as settled stays `uncertain`. `null` means
 * "no outcome string on this event", which is **not** the same claim: an
 * `effect_observed` without an outcome has not proven anything either, so it is
 * also uncertain.
 */
export function effectOutcomeStatus(outcome: string | undefined): RunStepStatus {
  if (outcome === undefined) return 'uncertain'
  const key = outcome.trim().toLowerCase()
  if (key === '') return 'uncertain'
  if (SETTLED_OK.has(key)) return 'done'
  if (SETTLED_BAD.has(key)) return 'failed'
  return 'uncertain'
}

/** The event body, or `null` for a malformed envelope. */
function bodyOf(event: WorkEventEnvelope) {
  const w = event.event
  return w && typeof w === 'object' && 'class' in w ? w : null
}

/**
 * Is this entry an **open** operation the journal has not closed yet?
 *
 * This is what stops the live indicator spinning forever. `describeWorkEvent`
 * marks a `run_started` or `tool_started` as `active` the moment it is written,
 * so without a closing check an entry from an hour ago would still pulse. The
 * check is a pure read of the same journal: has anything later settled this
 * exact tool / run / effect / terminal / approval?
 */
export function isUnfinishedOperation(
  event: WorkEventEnvelope,
  journal: readonly WorkEventEnvelope[],
  fromIndex = 0,
): boolean {
  const w = bodyOf(event)
  if (!w) return false
  const ev = w.event
  // Entries appended after this one. Scanned forward with an early exit, and
  // bounded by the caller's index, so building a whole trace stays linear-ish
  // instead of copying the journal once per row.
  let saw = false
  const later: WorkEventEnvelope[] = []
  for (let i = Math.max(0, fromIndex); i < journal.length; i += 1) {
    const c = journal[i]!
    if (c === event) {
      saw = true
      continue
    }
    if (saw && c.timestamp > event.timestamp) later.push(c)
  }
  const isOpen = (c: WorkEventEnvelope) => bodyOf(c)

  if (w.class === 'operational' && ev.kind === 'tool_started') {
    return !later.some((c) => {
      const cw = isOpen(c)
      return (
        cw?.class === 'operational' &&
        (cw.event.kind === 'tool_completed' || cw.event.kind === 'tool_failed') &&
        cw.event.data.toolId === ev.data.toolId
      )
    })
  }

  if (w.class === 'domain' && ev.kind === 'run_started') {
    const terminal: ReadonlySet<string> = new Set([
      'run_completed',
      'run_failed',
      'run_cancelled',
      'run_interrupted',
      'run_waiting',
    ])
    return !later.some((c) => {
      const cw = isOpen(c)
      return (
        cw?.class === 'domain' &&
        terminal.has(cw.event.kind) &&
        (cw.event as { data: { runId: string } }).data.runId === ev.data.runId
      )
    })
  }

  if (w.class === 'domain' && ev.kind === 'run_waiting') {
    // A wait closes when a later run_* event for the same run says it moved on.
    return !later.some((c) => {
      const cw = isOpen(c)
      return (
        cw?.class === 'domain' &&
        cw.event.kind.startsWith('run_') &&
        cw.event.kind !== 'run_waiting' &&
        (cw.event as { data: { runId: string } }).data.runId === ev.data.runId
      )
    })
  }

  if (w.class === 'domain' && ev.kind === 'effect_attempted') {
    return !later.some((c) => {
      const cw = isOpen(c)
      return (
        cw?.class === 'domain' &&
        (cw.event.kind === 'effect_observed' || cw.event.kind === 'effect_verified') &&
        (cw.event as { data: { effectId: string } }).data.effectId === ev.data.effectId
      )
    })
  }

  if (w.class === 'domain' && ev.kind === 'approval_requested') {
    return !later.some((c) => {
      const cw = isOpen(c)
      return cw?.class === 'domain' && cw.event.kind === 'approval_resolved'
    })
  }

  if (w.class === 'runtime' && ev.kind === 'pty_started') {
    return !later.some((c) => {
      const cw = isOpen(c)
      return cw?.class === 'runtime' && cw.event.kind === 'pty_exit' && cw.event.data.ptyId === ev.data.ptyId
    })
  }

  if (
    w.class === 'runtime' &&
    (ev.kind === 'agent_session_spawned' ||
      ev.kind === 'agent_session_attached' ||
      ev.kind === 'agent_session_steered')
  ) {
    const closer: Record<string, string> = {
      agent_session_spawned: 'agent_session_terminated',
      agent_session_attached: 'agent_session_detached',
      agent_session_steered: 'agent_session_terminated',
    }
    const opened = ev.data.agentSessionId
    return !later.some((c) => {
      const cw = isOpen(c)
      if (cw?.class !== 'runtime' || cw.event.kind !== closer[ev.kind]) return false
      const data = cw.event.data as { agentSessionId?: string }
      return data.agentSessionId === opened
    })
  }

  return false
}

/**
 * Fold one journal entry into a step. `live` is the **run's** liveness (the
 * same argument `timelineStatus` calls `sessionRunning`); `isNewest` marks the
 * entry the journal appended last. `card.awaitingInput` is the single owner of
 * "parked on the user".
 */
export function runStepStatus(args: {
  event: WorkEventEnvelope
  card: AgentCard
  live: boolean
  isNewest?: boolean
  journal?: readonly WorkEventEnvelope[]
  fromIndex?: number
}): RunStepStatus {
  const { event, card, live, isNewest = true, journal, fromIndex = 0 } = args
  const w = bodyOf(event)
  if (!w) return 'done'
  const ev = w.event
  if (w.class === 'domain') {
    // An interrupted run has an unknown post-effect outcome: resumable, never
    // "failed" and never "done".
    if (ev.kind === 'run_interrupted') return 'uncertain'
    if (ev.kind === 'effect_observed') return effectOutcomeStatus(ev.data.outcome)
  }
  const own = describeWorkEvent(event)
  // A settled failure is a fact about this step, not about the run: it stays
  // `failed` even while the run is parked on the user. `timelineStatus` checks
  // `awaitingInput` before `failed`, which is right for stopping a spinner but
  // would erase the failure; the guard here keeps the step honest and the
  // helper untouched.
  if (own.status === 'failed') return 'failed'
  // The only remaining own-status is `done` (the `failed` case returned above),
  // and `timelineStatus` maps `done` to `done` for every combination of its
  // arguments — so this is the helper's answer, spelled out.
  if (own.status !== 'active') return 'done'

  // Every remaining row describes something **open**. Whether "open" reads as
  // running or waiting is decided by one fact: has the journal closed it?
  //   - open  + run parked on the user → `waiting` (this is what it waits on)
  //   - open  + run live              → `running`
  //   - closed                        → `done`
  // `timelineStatus` collapses every active row to `done` once the run parks,
  // which would paint an outstanding approval as finished; the branch below
  // keeps that step truthful while still stopping the pulse.
  const open = journal ? isUnfinishedOperation(event, journal, fromIndex) : true
  if (card.awaitingInput) return open ? 'waiting' : 'done'
  if (!live) return 'done'
  if (journal && !isNewest) return open ? 'running' : 'done'
  return 'running'
}

/** The tool/run id a journal entry can be timed against, if it names one. */
function timingAnchor(event: WorkEventEnvelope): string | null {
  const w = bodyOf(event)
  if (!w) return null
  const ev = w.event
  if (
    w.class === 'operational' &&
    (ev.kind === 'tool_started' || ev.kind === 'tool_completed' || ev.kind === 'tool_failed')
  ) {
    return `tool:${ev.data.toolId}`
  }
  if (
    w.class === 'domain' &&
    (ev.kind === 'run_started' ||
      ev.kind === 'run_completed' ||
      ev.kind === 'run_failed' ||
      ev.kind === 'run_cancelled')
  ) {
    return `run:${ev.data.runId}`
  }
  return null
}

/** The entry that starts a timing window, and the words describing it. */
function timingStart(event: WorkEventEnvelope): { anchor: string; kind: string; note: string } | null {
  const anchor = timingAnchor(event)
  if (!anchor) return null
  const w = bodyOf(event)
  if (!w) return null
  const ev = w.event
  const isTool = w.class === 'operational' && ev.kind === 'tool_started'
  const isRun = w.class === 'domain' && ev.kind === 'run_started'
  if (!isTool && !isRun) return null
  return {
    anchor,
    kind: ev.kind,
    note: isTool ? 'since the tool started' : 'since the run started',
  }
}

export interface RunDuration {
  ms: number
  note: string
}

const NO_DURATION: { ms: null; note: null } = { ms: null, note: null }

/**
 * Real elapsed time per journal entry, in one pass.
 *
 * A settled tool is timed against its own `tool_started`; a settled run against
 * its `run_started`. Every other entry gets **no** number — a gap between two
 * unrelated events is not a duration, and printing one would be a fabricated
 * precision. Keyed by journal sequence.
 */
export function resolveRunDurations(
  journal: readonly WorkEventEnvelope[],
): Map<number, RunDuration> {
  const out = new Map<number, RunDuration>()
  const open = new Map<string, { ts: number; note: string }>()
  for (const event of journal) {
    const start = timingStart(event)
    if (start) {
      open.set(start.anchor, { ts: event.timestamp, note: start.note })
      continue
    }
    const anchor = timingAnchor(event)
    if (!anchor) continue
    const began = open.get(anchor)
    if (began === undefined) continue
    out.set(event.sequence, { ms: Math.max(0, event.timestamp - began.ts), note: began.note })
    open.delete(anchor)
  }
  return out
}

/**
 * Real elapsed time for a step, or `null` when the journal cannot prove one.
 * The single-entry form of {@link resolveRunDurations} — same answer, so the
 * trace and this helper can never disagree.
 */
export function runStepDuration(
  step: WorkEventEnvelope,
  journal: readonly WorkEventEnvelope[],
): { ms: null; note: null } | RunDuration {
  return resolveRunDurations(journal).get(step.sequence) ?? NO_DURATION
}

/**
 * Project the run's ordered step list. Same label shape as the Progress
 * timeline (`#<sequence> <label>`) so the two surfaces read as one journal
 * rather than two vocabularies.
 */
export function buildRunTrace(args: {
  journal: readonly WorkEventEnvelope[]
  card: AgentCard
  live: boolean
}): RunStep[] {
  const { journal, card, live } = args
  const steps: RunStep[] = []
  const durations = resolveRunDurations(journal)
  journal.forEach((event, index) => {
    const d = describeWorkEvent(event)
    const w = bodyOf(event)
    const eventClass = w ? String(w.class) : 'unknown'
    const eventKind = w ? String((w.event as { kind?: unknown }).kind ?? 'unknown') : 'unknown'
    const duration = durations.get(event.sequence) ?? null
    steps.push({
      key: `run-step-${event.sequence}`,
      sequence: event.sequence,
      label: `#${event.sequence} ${d.label}`,
      detail: d.detail,
      tone: d.tone,
      status: runStepStatus({
        event,
        card,
        live,
        isNewest: index === journal.length - 1,
        journal,
        fromIndex: index,
      }),
      atMs: event.timestamp,
      durationMs: duration?.ms ?? null,
      durationNote: duration?.note ?? null,
      eventClass,
      eventKind,
      traceId: event.traceId,
      link: runStepLink(event),
      search: '',
    })
  })
  for (const step of steps) step.search = runSearchText(step)
  return steps
}

/** Count by status, for the summary strip. */
export function countRunSteps(steps: readonly RunStep[]): Record<RunStepStatus, number> {
  const out: Record<RunStepStatus, number> = {
    done: 0,
    running: 0,
    waiting: 0,
    failed: 0,
    uncertain: 0,
  }
  for (const s of steps) out[s.status] += 1
  return out
}

// ---------------------------------------------------------------------------
// Run state — the cockpit's own words (`ARCH/UI.md` §5: never "Session")
// ---------------------------------------------------------------------------

/** Plain-language state for a chat's status. */
export function chatStateLabel(status: string | undefined, awaitingInput: boolean): string {
  if (awaitingInput) return 'Waiting for you'
  switch (status) {
    case 'running':
      return 'Running'
    case 'action-required':
      return 'Action needed'
    case 'completed':
      return 'Finished'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'paused':
      return 'Paused'
    case 'budget_exceeded':
      return 'Budget reached'
    case 'scheduled':
      return 'Scheduled'
    case 'reconnecting':
      return 'Reconnecting'
    case 'idle':
      return 'Idle'
    default:
      return status ?? 'Idle'
  }
}

/** Tone class for a chat state. Colour is never the only signal — the label
 * above always says the same thing in words. */
export function chatStateTone(status: string | undefined, awaitingInput: boolean): string {
  if (awaitingInput) return 'border-warning/40 bg-warning/10 text-warning'
  switch (status) {
    case 'running':
      return 'border-brand/40 bg-brand/10 text-brand'
    case 'action-required':
      return 'border-warning/40 bg-warning/10 text-warning'
    case 'failed':
    case 'budget_exceeded':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
    default:
      return 'border-border bg-background/40 text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// Context occupancy
// ---------------------------------------------------------------------------

/**
 * Percentage of a **known** context window, else `null`.
 *
 * `null` is the load-bearing answer: no command in the current tree reports a
 * per-run context window, and the store's 128k fallback is a placeholder, so a
 * percentage computed from it would be a fabricated claim. The callers render
 * "not reported" when this is `null`.
 */
export function contextOccupancy(
  inputTokens: number | null,
  windowTokens: number | null,
): { pct: number; used: number; total: number } | null {
  if (
    typeof inputTokens !== 'number' ||
    typeof windowTokens !== 'number' ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(windowTokens) ||
    windowTokens <= 0
  ) {
    return null
  }
  const pct = Math.min(100, (inputTokens / windowTokens) * 100)
  return { pct, used: inputTokens, total: windowTokens }
}

// ---------------------------------------------------------------------------
// Run outcome — the folded AgentCard, nothing added
// ---------------------------------------------------------------------------

/** Plain words for the folded card's status token. The wire value is never
 *  painted as-is: `idle` / `running` / `awaiting_input` are vocabulary, and
 *  `ARCH/UI.md` §5 requires the user to read Chat, not the kernel's enum. */
const CARD_STATE_LABEL: Record<string, string> = {
  running: 'Running',
  awaiting_input: 'Waiting for you',
  completed: 'Finished',
  failed: 'Failed',
  idle: 'Idle',
}

export function runCardStateLabel(status: string): string {
  return CARD_STATE_LABEL[status] ?? status
}

export interface RunOutcome {
  /** The canonical state the fold reports, in plain words. */
  state: string
  /** `true` when the run is parked on the user. */
  awaitingInput: boolean
  files: string[]
  tests: { name: string; passed: boolean }[]
  testsPassed: number
  testsFailed: number
  /** Paths two writers both touched. Never merged into the files list. */
  conflicts: string[]
  handoffs: { artifactId: string; fromAgent: string; toAgent: string; summary: string }[]
}

/**
 * Project the folded `AgentCard` into the panel's outcome strip. Every field
 * comes straight off the card — an empty list means the journal reported
 * nothing of that kind, and the caller says so rather than implying zero.
 */
export function runOutcome(card: AgentCard): RunOutcome {
  return {
    state: runCardStateLabel(card.awaitingInput ? 'awaiting_input' : card.status),
    awaitingInput: card.awaitingInput,
    files: [...card.files],
    tests: card.tests.map((t) => ({ name: t.name, passed: t.passed })),
    testsPassed: card.tests.filter((t) => t.passed).length,
    testsFailed: card.tests.filter((t) => !t.passed).length,
    conflicts: [...card.conflicts],
    handoffs: card.handoffs.map((h) => ({ ...h })),
  }
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/**
 * Per-type icon. Ordered from most specific to least so `report.docx` never
 * reads as "code", and an unknown extension lands on `generic` rather than
 * guessing.
 */
export type ArtifactKind =
  | 'sheet'
  | 'slides'
  | 'pdf'
  | 'image'
  | 'archive'
  | 'audio'
  | 'video'
  | 'code'
  | 'text'
  | 'generic'

const EXTENSION_KINDS: Record<string, ArtifactKind> = {
  xlsx: 'sheet',
  xlsm: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  ods: 'sheet',
  pptx: 'slides',
  ppt: 'slides',
  odp: 'slides',
  key: 'slides',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  ico: 'image',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  '7z': 'archive',
  rar: 'archive',
  mp3: 'audio',
  wav: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  aac: 'audio',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  mjs: 'code',
  cjs: 'code',
  rs: 'code',
  py: 'code',
  go: 'code',
  java: 'code',
  kt: 'code',
  rb: 'code',
  php: 'code',
  c: 'code',
  h: 'code',
  cc: 'code',
  cpp: 'code',
  hpp: 'code',
  cs: 'code',
  swift: 'code',
  sh: 'code',
  ps1: 'code',
  sql: 'code',
  toml: 'code',
  json: 'code',
  yaml: 'code',
  yml: 'code',
  xml: 'code',
  html: 'code',
  css: 'code',
  scss: 'code',
  md: 'text',
  mdx: 'text',
  txt: 'text',
  rst: 'text',
  log: 'text',
}

/** The artifact card's declared type wins over the extension when it is known. */
const CARD_TYPE_KINDS: Record<string, ArtifactKind> = {
  xlsx: 'sheet',
  pptx: 'slides',
  pdf: 'pdf',
  image: 'image',
  code: 'code',
  markdown: 'text',
  docx: 'text',
  webapp: 'generic',
}

/** Classify a produced file. `hint` is the artifact card's own `type`. */
export function artifactKind(name: string, hint?: string): ArtifactKind {
  if (hint && CARD_TYPE_KINDS[hint]) return CARD_TYPE_KINDS[hint]!
  const ext = name.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_KINDS[ext] ?? 'generic'
}

const KIND_ICON: Record<ArtifactKind, typeof File> = {
  sheet: Table,
  slides: Presentation,
  pdf: FileType,
  image: ImageIcon,
  archive: Archive,
  audio: Music,
  video: Video,
  code: Code2,
  text: FileText,
  generic: File,
}

const KIND_LABEL: Record<ArtifactKind, string> = {
  sheet: 'Spreadsheet',
  slides: 'Slides',
  pdf: 'PDF',
  image: 'Image',
  archive: 'Archive',
  audio: 'Audio',
  video: 'Video',
  code: 'Code',
  text: 'Text',
  generic: 'File',
}

export function artifactKindLabel(kind: ArtifactKind): string {
  return KIND_LABEL[kind]
}

/** The per-type icon. `aria-hidden` — the kind is also written next to it. */
export function ArtifactKindIcon({ kind, className }: { kind: ArtifactKind; className?: string }) {
  const Icon = KIND_ICON[kind]
  return <Icon aria-hidden className={cn('shrink-0', className)} strokeWidth={1.75} />
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Resolve a produced-file path against the working folder. Absolute paths pass
 * through; a relative path is joined with the folder. Returns `null` when there
 * is nothing to resolve, so the caller can say so rather than guess a location.
 */
export function resolveRunPath(raw: string, workingDir?: string | null): string | null {
  const path = raw.trim()
  if (!path) return null
  const isAbsolute = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
  if (isAbsolute) return path
  if (!workingDir || !workingDir.trim()) return null
  return `${workingDir.replace(/[\\/]+$/, '')}/${path.replace(/^[\\/]+/, '')}`
}

/** Split a path into its directory and file name, for the disk lookup. */
export function splitRunPath(path: string): { dir: string; base: string } {
  const normalized = path.replace(/\\/g, '/')
  const cut = normalized.lastIndexOf('/')
  if (cut <= 0) return { dir: cut === 0 ? '/' : '.', base: normalized }
  if (cut === 0) return { dir: '/', base: normalized.slice(1) }
  return { dir: normalized.slice(0, cut), base: normalized.slice(cut + 1) }
}

/** Shorten a long path for a narrow rail, keeping the tail legible. */
export function shortenPath(path: string, maxSegments = 3): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  if (parts.length <= maxSegments) return path
  return `…/${parts.slice(-maxSegments).join('/')}`
}
