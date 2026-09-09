/** Shared runtime identity for every detached chat/plan attempt. */
export interface RunIdentity {
  streamId: string;
  sessionId: string;
  workId?: string;
  executionId?: string;
  runId?: string;
}

export interface EventEnvelopeFields {
  sessionId: string;
  streamId: string;
  workId?: string;
  executionId?: string;
  runId?: string;
  eventId: string;
  sequence: number;
  schemaVersion: number;
  timestamp: number;
}

let sequence = 0;

/** Add the stable envelope fields without mutating the producer event. */
export function envelopeEvent<T extends { streamId: string }>(
  event: T,
  identity: RunIdentity,
): T & EventEnvelopeFields {
  const next = ++sequence;
  return {
    ...event,
    sessionId: identity.sessionId,
    streamId: identity.streamId,
    ...(identity.workId !== undefined ? { workId: identity.workId } : {}),
    ...(identity.executionId !== undefined ? { executionId: identity.executionId } : {}),
    ...(identity.runId !== undefined ? { runId: identity.runId } : {}),
    eventId: `chat-${next}`,
    sequence: next,
    schemaVersion: 1,
    timestamp: Date.now(),
  } as T & EventEnvelopeFields;
}

export function resetRunIdentitySequence(): void {
  sequence = 0;
}
