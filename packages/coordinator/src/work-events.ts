/**
 * P51.14 — Work Gateway event emission from the coordinator engine loop.
 *
 * The Rust side already owns the durable `WorkEvent` log and records effects
 * itself when `tool/exec`/`tool/commit` carry a `workId` (chat.rs: `tool/*`
 * arm records attempted/observed/verified on every commit) and when
 * `execution/begin`/`execution/transition` are sent (bind + run lifecycle).
 *
 * This module supplies the three things the coordinator must do to make the
 * agent-card surface truthful:
 *   1. `ensureWork` — create the per-session Work item idempotently
 *      (`work/create` returns the existing address when present).
 *   2. `recordTransition` — drive the run lifecycle (`running` → `completed`
 *      / `failed` / `cancelled`), which also flips `WorkPresence.state` so
 *      the UI shows Running / WaitingForUser / Completed / Failed chips.
 *   3. `recordThought` — stream the turn's live summary onto the agent card
 *      (`PresenceEvent::AgentThoughtSummary`).
 *
 * Every call is best-effort: a missing handler or unknown work never blocks
 * the chat stream (mirrors the memory/cache best-effort convention).
 */

export type WorkRunState =
  | "running"
  | "checkpointed"
  | "waiting_approval"
  | "waiting_user"
  | "waiting_tool"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type RequestFn = (method: string, params: unknown) => Promise<unknown>;

/** Create the per-session work item once; never errors on the second call. */
export async function ensureWork(
  request: RequestFn,
  workId: string,
  sessionId: string,
  objective = "",
): Promise<void> {
  try {
    await request("work/create", {
      workId,
      sessionId,
      objective,
    });
  } catch {
    /* already exists or handler absent — best-effort */
  }
}

/** Drive the run lifecycle transition on the bound execution. */
export async function recordTransition(
  request: RequestFn,
  workId: string,
  executionId: string,
  state: WorkRunState,
): Promise<void> {
  try {
    await request("execution/transition", {
      workId,
      id: executionId,
      state,
    });
  } catch {
    /* best-effort — never blocks the stream */
  }
}

/** Publish a live agent-thought summary to the agent card. */
export async function recordThought(
  request: RequestFn,
  workId: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  try {
    await request("work/thought", { workId, text: text.trim() });
  } catch {
    /* best-effort */
  }
}