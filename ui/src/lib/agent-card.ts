import type { WorkEventEnvelope } from './work'
import { waitReasonLabel, workStateLabel } from './work'

/** P51.14 — one agent's card, folded from the Work journal. */
export interface AgentCard {
  status: 'running' | 'awaiting_input' | 'completed' | 'failed' | 'idle'
  /** Shown instead of a spinner while the run is parked on the user. */
  awaitingInput: boolean
  steps: string[]
  files: string[]
  tests: { name: string; passed: boolean }[]
  /** Paths two writers both touched. */
  conflicts: string[]
  /** Handoffs the user can open. `summary` is the artifact body. */
  handoffs: { artifactId: string; fromAgent: string; toAgent: string; summary: string }[]
}

function isUserWait(reason: string | undefined, waitReason: string | undefined): boolean {
  return reason === 'waiting_user' || reason === 'user_input' || waitReason === 'user_input'
}

/** Fold typed work events into the card. Unknown classes are ignored. */
export function agentCardFromEvents(events: WorkEventEnvelope[]): AgentCard {
  const card: AgentCard = {
    status: 'idle',
    awaitingInput: false,
    steps: [],
    files: [],
    tests: [],
    conflicts: [],
    handoffs: [],
  }
  for (const envelope of events) {
    const body = envelope.event
    if (!body || typeof body !== 'object' || !('event' in body)) continue
    const ev = body.event
    if (body.class === 'domain') {
      if (ev.kind === 'run_started') {
        card.status = 'running'
        card.awaitingInput = false
      } else if (ev.kind === 'run_completed') {
        card.status = 'completed'
        card.awaitingInput = false
      } else if (ev.kind === 'run_failed' || ev.kind === 'run_cancelled') {
        card.status = 'failed'
        card.awaitingInput = false
      } else if (ev.kind === 'run_waiting') {
        const waiting = isUserWait(ev.data.reason, ev.data.wait?.reason)
        card.awaitingInput = waiting
        card.status = waiting ? 'awaiting_input' : 'running'
        card.steps.push(waiting ? 'Awaiting Input' : `Waiting — ${waitReasonLabel(ev.data.wait?.reason ?? ev.data.reason)}`)
      } else if (ev.kind === 'effect_attempted' || ev.kind === 'effect_observed' || ev.kind === 'effect_verified') {
        card.steps.push(workStateLabel(ev.kind))
      }
    } else if (body.class === 'operational') {
      if (ev.kind === 'tool_started' || ev.kind === 'tool_completed' || ev.kind === 'tool_failed') {
        card.steps.push(`${ev.data.toolId} ${ev.kind.replace('tool_', '')}`)
        if (card.status === 'idle') card.status = 'running'
      } else if (ev.kind === 'file_touched') {
        if (!card.files.includes(ev.data.path)) card.files.push(ev.data.path)
      } else if (ev.kind === 'test_ran') {
        card.tests.push({ name: ev.data.name, passed: ev.data.passed })
        card.steps.push(`test ${ev.data.name}`)
      } else if (ev.kind === 'write_conflict') {
        if (!card.conflicts.includes(ev.data.path)) card.conflicts.push(ev.data.path)
      } else if (ev.kind === 'handoff_recorded') {
        card.handoffs.push({
          artifactId: ev.data.artifact_id,
          fromAgent: ev.data.from_agent,
          toAgent: ev.data.to_agent,
          summary: ev.data.summary,
        })
      }
    }
  }
  return card
}

/** The timeline must not keep a spinner on a card that is waiting for the user. */
export function timelineStatus(
  card: AgentCard,
  eventStatus: 'done' | 'active' | 'failed',
  sessionRunning: boolean,
): 'done' | 'active' | 'failed' {
  if (card.awaitingInput) return 'done'
  if (eventStatus === 'failed') return 'failed'
  if (sessionRunning && eventStatus === 'active') return 'active'
  return eventStatus === 'active' ? 'active' : 'done'
}
