import { expect, test } from 'bun:test'
import { describeWorkEvent, presenceLabel, type WorkEventEnvelope } from './work'

function env(event: WorkEventEnvelope['event'], sequence = 1): WorkEventEnvelope {
  return { workId: 's1', sequence, eventId: `e${sequence}`, event, timestamp: 1 }
}

test('describeWorkEvent renders effect lifecycle steps (P51.14)', () => {
  const attempted = describeWorkEvent(env({ class: 'domain', event: { kind: 'effect_attempted', data: { effectId: 'fx-1234567890' } } }))
  expect(attempted.status).toBe('active')
  expect(attempted.label).toContain('fx-1234567')
  const verified = describeWorkEvent(env({ class: 'domain', event: { kind: 'effect_verified', data: { effectId: 'fx-1', verified: true } } }))
  expect(verified.status).toBe('done')
  const failed = describeWorkEvent(env({ class: 'domain', event: { kind: 'effect_verified', data: { effectId: 'fx-1', verified: false } } }))
  expect(failed.status).toBe('failed')
})

test('describeWorkEvent renders run + waiting + artifact surfaces', () => {
  const started = describeWorkEvent(env({ class: 'domain', event: { kind: 'run_started', data: { runId: 'r1' } } }))
  expect(started.label).toContain('started')
  const waiting = describeWorkEvent(env({ class: 'domain', event: { kind: 'run_waiting', data: { runId: 'r1', reason: 'waiting_user' } } }))
  expect(waiting.tone).toBe('approval')
  expect(waiting.status).toBe('active')
  const artifact = describeWorkEvent(env({ class: 'domain', event: { kind: 'artifact_created', data: { artifactId: 'a1' } } }))
  expect(artifact.tone).toBe('file')
})

test('describeWorkEvent renders the thought summary with the text (P51.14)', () => {
  const thought = describeWorkEvent(env({ class: 'presence', event: { kind: 'agent_thought_summary', data: { text: 'editing the spec' } } }))
  expect(thought.label).toContain('editing the spec')
  expect(thought.tone).toBe('thought')
  expect(thought.status).toBe('active')
})

test('describeWorkEvent renders operational tool + runtime worktree events', () => {
  const tool = describeWorkEvent(env({ class: 'operational', event: { kind: 'tool_failed', data: { toolId: 'shell', error: 'boom' } } }))
  expect(tool.status).toBe('failed')
  expect(tool.detail).toBe('boom')
  const wt = describeWorkEvent(env({ class: 'runtime', event: { kind: 'worktree_created', data: { worktreeId: 'wt1', branch: 'feat/x' } } }))
  expect(wt.detail).toBe('feat/x')
  expect(wt.label).toContain('wt1')
  expect(wt.tone).toBe('worktree')
})

test('unknown event class falls back to a numbered label, never crashes', () => {
  const d = describeWorkEvent(env({ class: 'domain' as never, event: { kind: 'nope' as never, data: {} } as never }))
  expect(d.label).toContain('Work event')
})

test('presenceLabel maps wire snake_case to human labels (P51.14)', () => {
  expect(presenceLabel('waiting_for_user')).toBe('Waiting for you')
  expect(presenceLabel('waiting_for_approval')).toBe('Waiting for approval')
  expect(presenceLabel('running')).toBe('Running')
  expect(presenceLabel('completed')).toBe('Completed')
  expect(presenceLabel(undefined)).toBe('Connected')
})

test('cowork lens defaults off and toggles in the store', () => {
  const { useAppStore } = require('./store') as typeof import('./store')
  useAppStore.setState({ coworkMode: false })
  expect(useAppStore.getState().coworkMode).toBe(false)
  useAppStore.getState().setCoworkMode(true)
  expect(useAppStore.getState().coworkMode).toBe(true)
})