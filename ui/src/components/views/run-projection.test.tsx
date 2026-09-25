import { describe, expect, test } from 'bun:test'
import {
  RUN_FILTERS,
  RUN_STATUS_LABEL,
  artifactKind,
  artifactKindLabel,
  buildRunTrace,
  filterRunSteps,
  runFilterOf,
  runOutcome,
  runSearchText,
  runStepLink,
  chatStateLabel,
  contextOccupancy,
  countRunSteps,
  effectOutcomeStatus,
  formatBytes,
  formatDuration,
  formatTokens,
  resolveRunPath,
  runStepDuration,
  runStepStatus,
  shortenPath,
  splitRunPath,
  type RunStepStatus,
} from './run-projection'
import { projectRunUsage } from './run-usage'
import { agentCardFromEvents, type AgentCard } from '@/lib/agent-card'
import type { WorkEvent, WorkEventEnvelope } from '@/lib/work'
import type { UsageSnapshot } from '@/lib/spend'

function envelope(
  sequence: number,
  event: WorkEvent,
  timestamp: number,
  traceId?: string,
): WorkEventEnvelope {
  return {
    workId: 'w-test',
    sequence,
    eventId: `e-${sequence}`,
    event,
    timestamp,
    traceId,
  }
}

const IDLE_CARD: AgentCard = agentCardFromEvents([])

function cardFrom(journal: WorkEventEnvelope[]): AgentCard {
  return agentCardFromEvents(journal)
}

describe('run projection — formatting', () => {
  test('token counts stay readable and never print NaN', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(12_400)).toBe('12.4k')
    expect(formatTokens(2_000_000)).toBe('2.0M')
    expect(formatTokens(null)).toBe('—')
    expect(formatTokens(Number.NaN)).toBe('—')
  })

  test('byte sizes come from a real number, and an unknown size stays null', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(2_204_160)).toBe('2.1 MB')
    expect(formatBytes(null)).toBeNull()
    expect(formatBytes(-1)).toBeNull()
  })

  test('durations are only printed when they are real', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(-5)).toBeNull()
    expect(formatDuration(400)).toBe('<1s')
    expect(formatDuration(1_800)).toBe('2s')
    expect(formatDuration(95_000)).toBe('1m 35s')
  })
})

describe('run projection — step status honesty', () => {
  const failed: WorkEventEnvelope = envelope(
    1,
    { class: 'operational', event: { kind: 'tool_failed', data: { toolId: 'fs.write', error: 'denied' } } },
    1_000,
  )

  test('a failed step is failed, and reads differently from a running one', () => {
    const status = runStepStatus({ event: failed, card: IDLE_CARD, live: false })
    expect(status).toBe('failed')
    expect(RUN_STATUS_LABEL[status]).toBe('Failed')
    // Distinct from every other end state, in words as well as colour.
    expect(RUN_STATUS_LABEL.failed).not.toBe(RUN_STATUS_LABEL.running)
    expect(RUN_STATUS_LABEL.failed).not.toBe(RUN_STATUS_LABEL.done)
    expect(RUN_STATUS_LABEL.failed).not.toBe(RUN_STATUS_LABEL.uncertain)
  })

  test('an unrecognised effect outcome is uncertain, never done and never failed', () => {
    expect(effectOutcomeStatus('succeeded')).toBe('done')
    expect(effectOutcomeStatus('failed')).toBe('failed')
    expect(effectOutcomeStatus('rolled_back')).toBe('failed')
    expect(effectOutcomeStatus('pending_provider_ack')).toBe('uncertain')
    expect(effectOutcomeStatus('uncertain')).toBe('uncertain')
    expect(effectOutcomeStatus('')).toBe('uncertain')
    // An observed effect with no outcome string has proven nothing either.
    expect(effectOutcomeStatus(undefined)).toBe('uncertain')

    const observed = envelope(
      2,
      {
        class: 'domain',
        event: { kind: 'effect_observed', data: { effectId: 'e-1', outcome: 'unknown' } },
      },
      2_000,
    )
    const status = runStepStatus({ event: observed, card: IDLE_CARD, live: false })
    expect(status).toBe('uncertain')
    expect(RUN_STATUS_LABEL[status]).toBe('Outcome unknown')
  })

  test('an interrupted run is uncertain — recoverable, never failed or done', () => {
    const interrupted = envelope(
      3,
      {
        class: 'domain',
        event: { kind: 'run_interrupted', data: { runId: 'r-1', reason: 'process gone' } },
      },
      3_000,
    )
    expect(runStepStatus({ event: interrupted, card: IDLE_CARD, live: false })).toBe('uncertain')
  })

  test('awaiting input pauses the indicator instead of spinning', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } },
        1_000,
      ),
      envelope(
        2,
        {
          class: 'domain',
          event: {
            kind: 'run_waiting',
            data: { runId: 'r-1', reason: 'user_input', wait: { reason: 'user_input' } },
          },
        },
        2_000,
      ),
    ]
    const card = cardFrom(journal)
    expect(card.awaitingInput).toBe(true)
    const steps = buildRunTrace({ journal, card, live: true })
    const statuses = steps.map((s) => s.status)
    // Nothing is "running" while the run is parked on the user.
    expect(statuses).not.toContain('running')
    expect(statuses).toContain('waiting')
    expect(RUN_STATUS_LABEL.waiting).toBe('Waiting for you')
  })

  test('an in-flight tool is running while the journal has not closed it', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } },
        1_000,
      ),
      envelope(
        2,
        { class: 'operational', event: { kind: 'tool_started', data: { toolId: 'fs.write' } } },
        2_000,
      ),
    ]
    const steps = buildRunTrace({ journal, card: IDLE_CARD, live: true })
    expect(steps.map((s) => s.status)).toEqual(['running', 'running'])
  })

  test('a start row stops reading as running once the journal closes it', () => {
    const open: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } },
        1_000,
      ),
      envelope(
        2,
        { class: 'operational', event: { kind: 'tool_started', data: { toolId: 'fs.read' } } },
        2_000,
      ),
    ]
    expect(buildRunTrace({ journal: open, card: IDLE_CARD, live: true })[0]!.status).toBe('running')

    const closed: WorkEventEnvelope[] = [
      ...open,
      envelope(
        3,
        { class: 'operational', event: { kind: 'tool_completed', data: { toolId: 'fs.read' } } },
        3_000,
      ),
      envelope(
        4,
        { class: 'domain', event: { kind: 'run_completed', data: { runId: 'r-1' } } },
        4_000,
      ),
    ]
    // The start row is no longer in flight: no live indicator spinning forever.
    const steps = buildRunTrace({ journal: closed, card: IDLE_CARD, live: false })
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done'])
  })

  test('a settled run never paints its own start row as running', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } },
        1_000,
      ),
      envelope(
        2,
        { class: 'domain', event: { kind: 'run_completed', data: { runId: 'r-1' } } },
        2_000,
      ),
    ]
    const statuses = buildRunTrace({ journal, card: IDLE_CARD, live: false }).map((s) => s.status)
    expect(statuses).toEqual(['done', 'done'])
  })

  test('a settled failure survives a run that is parked on the user', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } },
        1_000,
      ),
      envelope(
        2,
        {
          class: 'operational',
          event: { kind: 'tool_failed', data: { toolId: 'fs.write', error: 'denied' } },
        },
        2_000,
      ),
      envelope(
        3,
        {
          class: 'domain',
          event: {
            kind: 'run_waiting',
            data: { runId: 'r-1', reason: 'user_input', wait: { reason: 'user_input' } },
          },
        },
        3_000,
      ),
    ]
    const card = cardFrom(journal)
    expect(card.awaitingInput).toBe(true)
    const statuses = buildRunTrace({ journal, card, live: true }).map((s) => s.status)
    // The pause stops the live row; it must not repaint a failure as finished.
    expect(statuses).toEqual(['done', 'failed', 'waiting'])
  })

  test('an outstanding approval reads as waiting, never as done', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(1, { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } }, 1_000),
      envelope(2, { class: 'domain', event: { kind: 'approval_requested', data: { ticketId: 't-4' } } }, 2_000),
      envelope(
        3,
        {
          class: 'domain',
          event: {
            kind: 'run_waiting',
            data: { runId: 'r-1', reason: 'approval', wait: { reason: 'approval' } },
          },
        },
        3_000,
      ),
    ]
    // `card.awaitingInput` is false for an approval wait, so this is the
    // `live` branch — and the approval is still open.
    const steps = buildRunTrace({ journal, card: cardFrom(journal), live: true })
    expect(steps.map((s) => s.status)).toEqual(['done', 'running', 'running'])

    // Once the ticket is resolved the request row settles.
    const resolved: WorkEventEnvelope[] = [
      ...journal,
      envelope(4, { class: 'domain', event: { kind: 'approval_resolved', data: { ticketId: 't-4', approved: true } } }, 4_000),
      envelope(5, { class: 'domain', event: { kind: 'run_completed', data: { runId: 'r-1' } } }, 5_000),
    ]
    const after = buildRunTrace({ journal: resolved, card: cardFrom(resolved), live: false })
    expect(after.map((s) => s.status)).toEqual(['done', 'done', 'done', 'done', 'done'])
  })

  test('a step the run is parked on reads as waiting; a closed one reads as done', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(1, { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } }, 1_000),
      envelope(2, { class: 'domain', event: { kind: 'approval_requested', data: { ticketId: 't-4' } } }, 2_000),
      envelope(
        3,
        {
          class: 'domain',
          event: {
            kind: 'run_waiting',
            data: { runId: 'r-1', reason: 'user_input', wait: { reason: 'user_input' } },
          },
        },
        3_000,
      ),
    ]
    const steps = buildRunTrace({ journal, card: cardFrom(journal), live: true })
    // The start row was closed by the wait; the approval is what it waits on.
    expect(steps.map((s) => s.status)).toEqual(['done', 'waiting', 'waiting'])
  })

  test('the trace is ordered, sequence-prefixed, and keeps the journal coordinates', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        7,
        { class: 'operational', event: { kind: 'tool_started', data: { toolId: 'fs.read' } } },
        1_000,
        'trace-7',
      ),
      envelope(
        8,
        { class: 'operational', event: { kind: 'tool_completed', data: { toolId: 'fs.read' } } },
        1_240,
      ),
    ]
    const steps = buildRunTrace({ journal, card: IDLE_CARD, live: false })
    expect(steps.map((s) => s.sequence)).toEqual([7, 8])
    expect(steps[0]!.label.startsWith('#7 ')).toBe(true)
    expect(steps[0]!.eventClass).toBe('operational')
    expect(steps[0]!.eventKind).toBe('tool_started')
    expect(steps[0]!.traceId).toBe('trace-7')
  })
})

describe('run projection — durations the journal can prove', () => {
  test('a settled tool is timed against its own start', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'operational', event: { kind: 'tool_started', data: { toolId: 'fs.read' } } },
        1_000,
      ),
      envelope(
        2,
        { class: 'operational', event: { kind: 'tool_completed', data: { toolId: 'fs.read' } } },
        1_240,
      ),
    ]
    expect(runStepDuration(journal[1]!, journal)).toEqual({
      ms: 240,
      note: 'since the tool started',
    })
    // The start event itself has no measurable duration.
    expect(runStepDuration(journal[0]!, journal).ms).toBeNull()
  })

  test('a settled run is timed against its start', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-9' } } },
        0,
      ),
      envelope(
        2,
        { class: 'domain', event: { kind: 'run_completed', data: { runId: 'r-9' } } },
        5_000,
      ),
    ]
    expect(runStepDuration(journal[1]!, journal).ms).toBe(5_000)
  })

  test('an unrelated gap is not a duration', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(
        1,
        { class: 'operational', event: { kind: 'file_touched', data: { path: 'a.rs', writer_id: 'w' } } },
        1_000,
      ),
      envelope(2, { class: 'domain', event: { kind: 'work_updated', data: { patch: {} } } }, 9_000),
    ]
    // Neither entry names a start it can be measured against.
    expect(runStepDuration(journal[1]!, journal)).toEqual({ ms: null, note: null })
  })
})

describe('run projection — step counts', () => {
  test('every status is counted, and an empty journal counts nothing', () => {
    const empty = countRunSteps([])
    const keys: RunStepStatus[] = ['done', 'running', 'waiting', 'failed', 'uncertain']
    for (const k of keys) expect(empty[k]).toBe(0)
  })
})

describe('run projection — artifact classification', () => {
  test('each kind resolves from its own extension', () => {
    expect(artifactKind('Q3-Financials.xlsx')).toBe('sheet')
    expect(artifactKind('deck.pptx')).toBe('slides')
    expect(artifactKind('contract.pdf')).toBe('pdf')
    expect(artifactKind('chart.png')).toBe('image')
    expect(artifactKind('bundle.tar.gz')).toBe('archive')
    expect(artifactKind('voice.m4a')).toBe('audio')
    expect(artifactKind('demo.mp4')).toBe('video')
    expect(artifactKind('main.rs')).toBe('code')
    expect(artifactKind('notes.md')).toBe('text')
    expect(artifactKind('mystery.zzz')).toBe('generic')
    expect(artifactKind('LICENSE')).toBe('generic')
  })

  test("a card's declared type wins over the extension", () => {
    expect(artifactKind('summary', 'docx')).toBe('text')
    expect(artifactKind('dashboard', 'webapp')).toBe('generic')
    expect(artifactKind('photo', 'image')).toBe('image')
  })

  test('every kind has a written label, so the icon is never the only signal', () => {
    const kinds = [
      'sheet',
      'slides',
      'pdf',
      'image',
      'archive',
      'audio',
      'video',
      'code',
      'text',
      'generic',
    ] as const
    for (const k of kinds) expect(artifactKindLabel(k).length).toBeGreaterThan(0)
  })
})

describe('run projection — paths', () => {
  test('absolute paths pass through, relative paths join the working folder', () => {
    expect(resolveRunPath('C:\\work\\out\\a.xlsx')).toBe('C:\\work\\out\\a.xlsx')
    expect(resolveRunPath('/home/dev/out/a.md')).toBe('/home/dev/out/a.md')
    expect(resolveRunPath('out/a.md', '/home/dev')).toBe('/home/dev/out/a.md')
    expect(resolveRunPath('a.md', '/home/dev/')).toBe('/home/dev/a.md')
  })

  test('a relative path with no folder resolves to nothing rather than to a guess', () => {
    expect(resolveRunPath('out/a.md', null)).toBeNull()
    expect(resolveRunPath('out/a.md', '  ')).toBeNull()
    expect(resolveRunPath('   ', '/home/dev')).toBeNull()
  })

  test('a path splits into the directory a listing must read', () => {
    expect(splitRunPath('/home/dev/a.md')).toEqual({ dir: '/home/dev', base: 'a.md' })
    expect(splitRunPath('C:\\work\\a.md')).toEqual({ dir: 'C:/work', base: 'a.md' })
    expect(splitRunPath('a.md')).toEqual({ dir: '.', base: 'a.md' })
  })

  test('long paths shorten from the tail, which is the legible end', () => {
    expect(shortenPath('/home/dev/work/deep/nested/out/a.md', 2)).toBe('…/out/a.md')
    expect(shortenPath('/a/b', 3)).toBe('/a/b')
  })
})

describe('run projection — chat vocabulary', () => {
  test('the state label never leaks internal vocabulary', () => {
    const labels = [
      chatStateLabel('running', false),
      chatStateLabel('action-required', false),
      chatStateLabel(undefined, true),
      chatStateLabel('failed', false),
    ]
    for (const l of labels) expect(l).not.toMatch(/\bsessions?\b/i)
    expect(chatStateLabel(undefined, true)).toBe('Waiting for you')
  })
})

describe('run projection — usage honesty', () => {
  const baseSnapshot: UsageSnapshot = {
    total: {
      tokensIn: 100,
      tokensOut: 10,
      cachedTokens: 0,
      cachedWriteTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      reportedCostUsd: 0,
    },
    cacheHitRate: 0,
    byKey: [],
    bySession: [],
  }

  test('a chat with no usage row reads as not reported, not as zero', () => {
    const usage = projectRunUsage(baseSnapshot, 'chat-1')
    expect(usage.read).toBe(true)
    expect(usage.inputTokens).toBeNull()
    expect(usage.totalTokens).toBeNull()
    expect(usage.reportedBy).toBe('not reported')
    expect(usage.reason).toBeTruthy()
  })

  test('a reported row carries the split and names who reported it', () => {
    const snapshot: UsageSnapshot = {
      ...baseSnapshot,
      bySession: [
        {
          ...baseSnapshot.total,
          sessionId: 'chat-1',
          tokensIn: 12_481,
          tokensOut: 3_204,
          source: 'acp_event',
        },
      ],
      observations: { unreported: { 'chat-1': 2 } },
    }
    const usage = projectRunUsage(snapshot, 'chat-1')
    expect(usage.inputTokens).toBe(12_481)
    expect(usage.outputTokens).toBe(3_204)
    expect(usage.totalTokens).toBe(15_685)
    expect(usage.reportedBy).toBe('reported in an agent event')
    expect(usage.unreportedTurns).toBe(2)
  })

  test("another owner's unreported counter is never attributed to this chat", () => {
    const snapshot: UsageSnapshot = {
      ...baseSnapshot,
      observations: { unreported: { 'other-chat': 7 } },
    }
    expect(projectRunUsage(snapshot, 'chat-1').unreportedTurns).toBe(0)
  })

  test('no snapshot at all is not a usage reading', () => {
    const usage = projectRunUsage(null, 'chat-1')
    expect(usage.read).toBe(false)
    expect(usage.totalTokens).toBeNull()
  })
})

describe('run projection — context window', () => {
  test('an unknown window yields no percentage at all', () => {
    expect(contextOccupancy(12_481, null)).toBeNull()
    expect(contextOccupancy(null, 200_000)).toBeNull()
    expect(contextOccupancy(10, 0)).toBeNull()
  })

  test('a real window yields a capped percentage', () => {
    const o = contextOccupancy(50_000, 200_000)
    expect(o?.pct).toBe(25)
    expect(contextOccupancy(400_000, 200_000)?.pct).toBe(100)
  })

  test('the projected usage never invents a window', () => {
    const usage = projectRunUsage(null, 'chat-1')
    expect(usage.windowTokens).toBeNull()
  })
})


describe('run projection — the filter is derived, never guessed from a label', () => {
  const step = (seq: number, event: WorkEvent) => envelope(seq, event, seq * 1_000)
  const eRun = step(1, { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } })
  const eTool = step(2, {
    class: 'operational',
    event: { kind: 'tool_started', data: { toolId: 'fs.read' } },
  })
  const eFile = step(3, {
    class: 'operational',
    event: { kind: 'file_touched', data: { path: 'src/a.rs', writer_id: 'r-1' } },
  })
  const eEffect = step(4, {
    class: 'domain',
    event: { kind: 'effect_attempted', data: { effectId: 'fx-1' } },
  })
  const eTest = step(5, {
    class: 'operational',
    event: { kind: 'test_ran', data: { name: 'cargo test', passed: true } },
  })
  const ePty = step(6, {
    class: 'runtime',
    event: { kind: 'pty_started', data: { ptyId: 'pty-1', rows: 24, cols: 80 } },
  })
  const journal = [eRun, eTool, eFile, eEffect, eTest, ePty]
  const steps = buildRunTrace({ journal, card: IDLE_CARD, live: false })

  test('every class lands in exactly one filter bucket', () => {
    expect(steps.map(runFilterOf)).toEqual(['run', 'tool', 'file', 'effect', 'test', 'infra'])
  })

  test('"all" keeps every step, and each bucket keeps only its own', () => {
    expect(filterRunSteps(steps, { filter: 'all', query: '' })).toHaveLength(6)
    for (const f of RUN_FILTERS) {
      const got = filterRunSteps(steps, { filter: f.id, query: '' })
      const expected = steps.filter((s) => f.id === 'all' || runFilterOf(s) === f.id)
      expect(got.map((s) => s.sequence)).toEqual(expected.map((s) => s.sequence))
    }
  })

  test('a text filter searches the label, the detail, and the named resource', () => {
    expect(filterRunSteps(steps, { filter: 'all', query: 'fs.read' }).map((s) => s.sequence)).toEqual([2])
    expect(filterRunSteps(steps, { filter: 'all', query: 'src/a.rs' }).map((s) => s.sequence)).toEqual([3])
    expect(filterRunSteps(steps, { filter: 'all', query: 'PTY' }).map((s) => s.sequence)).toEqual([6])
  })

  test('a filter that matches nothing returns nothing, so the panel can say so', () => {
    expect(filterRunSteps(steps, { filter: 'all', query: 'zzz-nope' })).toHaveLength(0)
  })

  test('the search haystack is lowercase and includes the resource id', () => {
    const s0 = steps[0]!
    expect(runSearchText(s0)).toBe(runSearchText(s0).toLowerCase())
    expect(runSearchText(steps[2]!)).toContain('src/a.rs')
  })
})

describe('run projection — a drill-down only where a resource is named', () => {
  test('a file, a ticket, and a terminal each get the one lens that can act', () => {
    expect(
      runStepLink(
        envelope(1, {
          class: 'operational',
          event: { kind: 'file_touched', data: { path: 'src/a.rs', writer_id: 'r-1' } },
        }, 1_000),
      ),
    ).toEqual({ target: 'code', label: 'Open the file', path: 'src/a.rs' })

    expect(
      runStepLink(
        envelope(2, {
          class: 'domain',
          event: { kind: 'approval_requested', data: { ticketId: 't-9' } },
        }, 2_000),
      ),
    ).toEqual({ target: 'audit', label: 'Open the audit trail', id: 't-9' })

    expect(
      runStepLink(
        envelope(3, {
          class: 'runtime',
          event: { kind: 'pty_started', data: { ptyId: 'pty-1', rows: 24, cols: 80 } },
        }, 3_000),
      ),
    ).toEqual({ target: 'shell', label: 'Open the terminal', id: 'pty-1' })
  })

  test('a step that names no resource gets no drill-down', () => {
    expect(
      runStepLink(
        envelope(1, { class: 'domain', event: { kind: 'run_started', data: { runId: 'r-1' } } }, 1_000),
      ),
    ).toBeNull()
    // A tool names a tool, not a view — there is nothing honest to open.
    expect(
      runStepLink(
        envelope(2, {
          class: 'operational',
          event: { kind: 'tool_started', data: { toolId: 'fs.read' } },
        }, 2_000),
      ),
    ).toBeNull()
  })
})

describe('run projection — the outcome strip adds nothing to the card', () => {
  test('counts and lists come straight off the folded card', () => {
    const journal: WorkEventEnvelope[] = [
      envelope(1, {
        class: 'operational',
        event: { kind: 'file_touched', data: { path: 'src/a.rs', writer_id: 'r-1' } },
      }, 1_000),
      envelope(2, {
        class: 'operational',
        event: { kind: 'file_touched', data: { path: 'src/b.rs', writer_id: 'r-1' } },
      }, 1_100),
      envelope(3, { class: 'operational', event: { kind: 'test_ran', data: { name: 'a', passed: true } } }, 1_200),
      envelope(4, { class: 'operational', event: { kind: 'test_ran', data: { name: 'b', passed: false } } }, 1_300),
      envelope(5, {
        class: 'operational',
        event: { kind: 'write_conflict', data: { path: 'src/a.rs', writers: ['r-1', 'r-2'] } },
      }, 1_400),
      envelope(6, {
        class: 'operational',
        event: {
          kind: 'handoff_recorded',
          data: { artifact_id: 'a1', from_agent: 'Codex CLI', to_agent: 'Claude Code', summary: 'wrote the patch' },
        },
      }, 1_500),
    ]
    const outcome = runOutcome(agentCardFromEvents(journal))
    expect(outcome.files).toEqual(['src/a.rs', 'src/b.rs'])
    expect(outcome.testsPassed).toBe(1)
    expect(outcome.testsFailed).toBe(1)
    // A conflicted path is reported as a conflict, not quietly merged away.
    expect(outcome.conflicts).toEqual(['src/a.rs'])
    expect(outcome.handoffs).toEqual([
      { artifactId: 'a1', fromAgent: 'Codex CLI', toAgent: 'Claude Code', summary: 'wrote the patch' },
    ])
  })

  test('an idle card reports empty lists, which the panel states as "nothing reported"', () => {
    const outcome = runOutcome(IDLE_CARD)
    expect(outcome.files).toEqual([])
    expect(outcome.tests).toEqual([])
    expect(outcome.conflicts).toEqual([])
    expect(outcome.handoffs).toEqual([])
    expect(outcome.state).toBe('Idle')
    expect(outcome.awaitingInput).toBe(false)
  })

  test('a run parked on the user is named as such, not as idle', () => {
    const card = agentCardFromEvents([
      envelope(1, {
        class: 'domain',
        event: { kind: 'run_waiting', data: { runId: 'r-1', reason: 'user_input', wait: { reason: 'user_input' } } },
      }, 1_000),
    ])
    const outcome = runOutcome(card)
    expect(outcome.awaitingInput).toBe(true)
    expect(outcome.state).toBe('Waiting for you')
  })
})
