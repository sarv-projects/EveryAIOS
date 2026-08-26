/**
 * P30.13 — the `/goal` background goal + resume, **local half** (skales
 * pattern, doc 83 §1): hand a goal, close the lid, resume where left off.
 * This is the user-operated, no-cloud half (B7/H18 local); the mobile
 * companion stays deferred. A goal is a detached run with a durable record:
 * `queued → running → {done | paused | lost}`, resumable with its saved
 * state. The task-ledger (P43) provides the persistence contract; this module
 * is the goal-shaped surface over it (parse `/goal`, start, pause, resume).
 */

export type GoalState = "queued" | "running" | "paused" | "done" | "lost";

export interface GoalRecord {
  id: string;
  /** The goal text (after the `/goal` prefix). */
  goal: string;
  state: GoalState;
  /** UNIX ms started. */
  startedAtMs: number;
  /** The session/stream the work runs under (resume key). */
  sessionId: string;
  /** Checkpoint id the run saved (resume point, P43 class). */
  checkpointId?: string;
  /** Brief progress line (last stage emitted). */
  lastStage?: string;
  /** Terminal outcome, when done. */
  outcome?: string;
}

export interface ParseGoalResult {
  isGoal: boolean;
  goal?: string;
}

/** Parse a composer line: `/goal <text>` (also `goal:` prefix). */
export function parseGoalCommand(text: string): ParseGoalResult {
  const t = text.trim();
  const m = t.match(/^\/goal\s+(.+)$/i);
  if (m) return { isGoal: true, goal: m[1]!.trim() };
  const m2 = t.match(/^goal:\s*(.+)$/i);
  if (m2) return { isGoal: true, goal: m2[1]!.trim() };
  return { isGoal: false };
}

let goalSeq = 0;
export function nextGoalId(now = Date.now()): string {
  goalSeq += 1;
  return `goal-${now.toString(36)}-${goalSeq.toString(36)}`;
}

/** The local goal registry: durable records + state transitions. */
export class GoalRegistry {
  private goals = new Map<string, GoalRecord>();

  constructor(private now: () => number = Date.now) {}

  /** Start a goal (detached run). */
  start(goal: string, sessionId: string): GoalRecord {
    const record: GoalRecord = {
      id: nextGoalId(this.now()),
      goal,
      state: "queued",
      startedAtMs: this.now(),
      sessionId,
    };
    this.goals.set(record.id, record);
    return record;
  }

  get(id: string): GoalRecord | undefined {
    return this.goals.get(id);
  }

  list(): GoalRecord[] {
    return [...this.goals.values()].sort((a, b) => b.startedAtMs - a.startedAtMs);
  }

  activeCount(): number {
    return this.list().filter((g) => g.state === "running" || g.state === "queued").length;
  }

  /** The run reports progress (state → running). */
  markRunning(id: string, stage?: string): boolean {
    const g = this.goals.get(id);
    if (!g) return false;
    g.state = "running";
    if (stage) g.lastStage = stage;
    return true;
  }

  /** Pause + save a checkpoint (the resume point). */
  pause(id: string, checkpointId: string): boolean {
    const g = this.goals.get(id);
    if (!g || g.state === "done") return false;
    g.state = "paused";
    g.checkpointId = checkpointId;
    return true;
  }

  /** Resume from the checkpoint. */
  resume(id: string): { record: GoalRecord; checkpointId?: string } | undefined {
    const g = this.goals.get(id);
    if (!g || g.state !== "paused") return undefined;
    g.state = "running";
    return g.checkpointId
      ? { record: g, checkpointId: g.checkpointId }
      : { record: g };
  }

  finish(id: string, outcome: string): boolean {
    const g = this.goals.get(id);
    if (!g) return false;
    g.state = "done";
    g.outcome = outcome;
    return true;
  }

  /** P43.3-class lost detection: a paused goal whose checkpoint is gone. */
  markLost(id: string): boolean {
    const g = this.goals.get(id);
    if (!g || g.state !== "paused") return false;
    g.state = "lost";
    return true;
  }
}
