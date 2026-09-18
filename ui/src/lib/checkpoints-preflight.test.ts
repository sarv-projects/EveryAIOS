// P64.6/P64.7 — the shadow-preflight verdict rides on edit results and the
// checkpoint timeline surfaces it honestly: `preflighted` / `failed` /
// `unverified`, never a pass that did not happen, and a failing verdict on a
// landed edit is the discrepancy the row must show, not hide.

import { describe, expect, test } from 'bun:test'
import {
  deriveCheckpointTurns,
  preflightOutcome,
  type CheckpointTurn,
} from './checkpoints'
import type { ChatMessage, ToolCallRecord } from './store'

function call(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return { id: 'c1', toolId: 'fs.write', status: 'done', result: {}, ...overrides }
}

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: '2026-09-18T10:00:00.000Z',
    ...overrides,
  }
}

function turnsOf(messages: ChatMessage[]): CheckpointTurn[] {
  return deriveCheckpointTurns(messages)
}

describe('preflightOutcome — three honest states from a tool result', () => {
  test('undefined when the result carries no preflight payload', () => {
    expect(preflightOutcome(undefined)).toBeUndefined()
    expect(preflightOutcome(null)).toBeUndefined()
    expect(preflightOutcome('ok')).toBeUndefined()
    expect(preflightOutcome({ ok: true })).toBeUndefined()
    expect(preflightOutcome({ preflight: null })).toBeUndefined()
    expect(preflightOutcome({ preflight: 'yes' })).toBeUndefined()
  })

  test('verified:false is unverified — no evidence, never a pass', () => {
    const out = preflightOutcome({ ok: true, preflight: { verified: false, passed: false } })
    expect(out?.kind).toBe('unverified')
    expect(out?.note).toBe('Shadow preflight could not run — no evidence')
  })

  test('verified+passed is preflighted', () => {
    const out = preflightOutcome({ preflight: { verified: true, passed: true, checks: ['tsc'] } })
    expect(out?.kind).toBe('preflighted')
    expect(out?.note).toBe('Shadow preflight passed before this edit landed')
  })

  test('verified but failed is the discrepancy state, not a pass', () => {
    const out = preflightOutcome({ ok: true, preflight: { verified: true, passed: false } })
    expect(out?.kind).toBe('failed')
    expect(out?.note).toBe('Shadow preflight failed but the edit landed — restoring is the remedy')
  })

  test('extra payload keys are tolerated; missing verified is no evidence', () => {
    expect(preflightOutcome({ preflight: {} })?.kind).toBe('unverified')
    expect(preflightOutcome({ preflight: { verified: true, passed: true, reason: 'r', checks: [], needsPreflight: true } })?.kind).toBe('preflighted')
  })
})

describe('deriveCheckpointTurns — strongest preflight evidence per mutating turn', () => {
  test('a turn with preflighted results surfaces the verdict and note', () => {
    const [turn] = turnsOf([
      msg({
        id: 'a1',
        toolCalls: [call({ id: 'c1', result: { preflight: { verified: true, passed: true } } })],
      }),
    ])
    expect(turn?.preflight).toBe('preflighted')
    expect(turn?.preflightNote).toBe('Shadow preflight passed before this edit landed')
  })

  test('failed outranks preflighted across a turn\'s results', () => {
    const [turn] = turnsOf([
      msg({
        toolCalls: [
          call({ id: 'c1', result: { preflight: { verified: true, passed: true } } }),
          call({ id: 'c2', toolId: 'apply_exact_edit', result: { preflight: { verified: true, passed: false } } }),
        ],
      }),
    ])
    expect(turn?.preflight).toBe('failed')
    expect(turn?.preflightNote).toBe('Shadow preflight failed but the edit landed — restoring is the remedy')
  })

  test('unverified only reads as unverified even next to a pass', () => {
    const [turn] = turnsOf([
      msg({
        toolCalls: [
          call({ id: 'c1', result: { preflight: { verified: false } } }),
          call({ id: 'c2', toolId: 'shell', result: { noPreflightHere: true } }),
        ],
      }),
    ])
    expect(turn?.preflight).toBe('unverified')
  })

  test('results without a verdict leave the row without preflight evidence', () => {
    const [turn] = turnsOf([msg({ toolCalls: [call({ result: { ok: true } })] })])
    expect(turn).toBeDefined()
    expect(turn?.preflight).toBeUndefined()
    expect(turn?.preflightNote).toBeUndefined()
  })

  test('read-only turns never produce rows, even with a verdict-shaped result', () => {
    const turns = turnsOf([
      msg({ role: 'user', content: 'look around' }),
      msg({
        id: 'a-read',
        toolCalls: [call({ id: 'c0', toolId: 'fs.read', result: { preflight: { verified: true, passed: true } } })],
      }),
    ])
    expect(turns).toHaveLength(0)
  })

  test('turnIndex still counts non-mutating assistant turns above the checkpoint', () => {
    const [turn] = turnsOf([
      msg({ role: 'user', content: 'hi' }),
      msg({ id: 'a1', toolCalls: [] }), // read-only assistant turn
      msg({
        id: 'a2',
        toolCalls: [call({ id: 'c1', result: { preflight: { verified: true, passed: true } } })],
      }),
    ])
    expect(turn?.turnIndex).toBe(2)
    expect(turn?.messageId).toBe('a2')
  })
})
