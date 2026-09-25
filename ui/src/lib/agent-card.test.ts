import { describe, expect, test } from 'bun:test'
import { agentCardFromEvents, timelineStatus } from './agent-card'
import type { WorkEventEnvelope } from './work'

function envelope(sequence: number, event: WorkEventEnvelope['event']): WorkEventEnvelope {
  return { workId: 'w1', sequence, eventId: `e${sequence}`, event, timestamp: sequence }
}

describe('P51.14 agent card', () => {
  test('awaiting input pauses, a second writer conflicts, and a handoff stays openable', () => {
    const card = agentCardFromEvents([
      envelope(1, { class: 'operational', event: { kind: 'tool_started', data: { toolId: 'edit' } } }),
      envelope(2, { class: 'operational', event: { kind: 'file_touched', data: { path: 'src/a.rs', writer_id: 'a' } } }),
      envelope(3, { class: 'operational', event: { kind: 'file_touched', data: { path: 'src/a.rs', writer_id: 'b' } } }),
      envelope(4, { class: 'operational', event: { kind: 'write_conflict', data: { path: 'src/a.rs', writers: ['a', 'b'] } } }),
      envelope(5, { class: 'operational', event: { kind: 'test_ran', data: { name: 'unit', passed: false } } }),
      envelope(6, {
        class: 'operational',
        event: {
          kind: 'handoff_recorded',
          data: { artifact_id: 'h1', from_agent: 'a', to_agent: 'b', summary: 'finish the tests' },
        },
      }),
      envelope(7, {
        class: 'domain',
        event: { kind: 'run_waiting', data: { runId: 'r1', reason: 'waiting_user', wait: { reason: 'user_input' } } },
      }),
    ])
    expect(card.awaitingInput).toBe(true)
    expect(card.status).toBe('awaiting_input')
    expect(card.files).toEqual(['src/a.rs'])
    expect(card.conflicts).toEqual(['src/a.rs'])
    expect(card.tests).toEqual([{ name: 'unit', passed: false }])
    expect(card.handoffs[0]?.summary).toBe('finish the tests')
    expect(timelineStatus(card, 'active', true)).toBe('done')
  })
})
