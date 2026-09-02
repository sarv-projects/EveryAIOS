/**
 * P38 — Dynamic Chief (spec §4.2.5a): the dispatcher side of the configurable
 * top-brain slot.
 *
 * - `resolveChiefId` — the fail-closed resolution: explicit session value →
 *   user default → `inbuilt`; unknown ids refuse, never a silent fallback.
 * - `injectChiefContext` — the memory passport (C10) + taste profile (C9)
 *   injected into the Chief's initial prompt in BOTH paths (inbuilt and ACP);
 *   the two paths differ only in transport, never in governance.
 * - `SubagentPolicy` — B3 delegation limits that apply to subagent chains
 *   under ANY Chief (inbuilt or external): depth ≤2, concurrency ≤6, strict
 *   budgets, derived child permissions (parent ∩ deny ∩ explicit grants).
 * - `ChiefRegistry` — per-session chief records so Work survives Chief death:
 *   the same intent → plan → checkpoints → receipts chain resumes under a new
 *   Chief without re-explanation or replayed non-idempotent effects.
 */

/** A chief id: `inbuilt` or an ACP-registered agent id. */
export type ChiefId = string;

export const INBUILT_CHIEF = "inbuilt";
export const KNOWN_CHIEFS: readonly string[] = ["inbuilt", "claude-code", "codex"];

/** The governance badge per agent (spec §4.2.5a §3, corrected v3.46). */
export type GovernanceMode =
  | { kind: "mediated"; fs: boolean; terminal: boolean }
  | { kind: "self_contained"; channelB: boolean }
  | { kind: "not_governed" };

export function governanceBadge(mode: GovernanceMode): string {
  switch (mode.kind) {
    case "mediated":
      return "Governed-Mediated";
    case "self_contained":
      return "Self-contained";
    case "not_governed":
      return "NotGoverned";
  }
}

/**
 * Fail-closed resolution (spec §4.2.5a §1): explicit session value → user
 * default → `inbuilt`. Unknown ids throw — never a silent fallback to the
 * inbuilt engine.
 */
export function resolveChiefId(explicit?: string, userDefault?: string): ChiefId {
  if (explicit !== undefined && explicit !== "") {
    if (!KNOWN_CHIEFS.includes(explicit)) {
      throw new Error(
        `unknown primary_chief "${explicit}" — fail-closed (no silent fallback)`,
      );
    }
    return explicit;
  }
  if (userDefault !== undefined && userDefault !== "" && userDefault !== INBUILT_CHIEF) {
    if (!KNOWN_CHIEFS.includes(userDefault)) {
      throw new Error(
        `unknown primary_chief default "${userDefault}" — fail-closed (no silent fallback)`,
      );
    }
    return userDefault;
  }
  return INBUILT_CHIEF;
}

/**
 * P38 (spec §4.2.5a §1) — per-session Chief resolution, the single dispatch
 * decision the coordinator's chat path uses. Precedence: **session pin** →
 * **user default** → `inbuilt`. A session pins its own Chief via
 * `chief/set_session` (fail-closed: unknown ids refuse, never a silent
 * fallback). A session that never pinned one follows the user default, and a
 * fresh install with no default is the inbuilt engine.
 */
export function resolveSessionChief(opts: {
  sessionPin?: string;
  userDefault?: string;
}): ChiefId {
  return resolveChiefId(opts.sessionPin, opts.userDefault);
}

/**
 * P38 — validate a session-level Chief pin before recording it. Returns the
 * pin when known; throws fail-closed for unknown ids (same vocabulary as
 * `resolveChiefId`).
 */
export function validateSessionChiefPin(pin: string): ChiefId {
  if (!KNOWN_CHIEFS.includes(pin)) {
    throw new Error(`unknown primary_chief "${pin}" — fail-closed (no silent fallback)`);
  }
  return pin;
}

export interface ChiefContext {
  /** Memory passport (C10): the session's durable facts. */
  passport: string;
  /** Taste profile (C9): the user's style/preference summary. */
  taste: string;
  /** The active governance badge. */
  governance: GovernanceMode;
}

/**
 * Inject the memory passport + taste profile into the Chief's initial prompt
 * (spec §4.2.5a §2 — both paths get the same injection). Returns the initial
 * prompt text the dispatcher sends as the first message of a session.
 */
export function injectChiefContext(ctx: ChiefContext, baseSystemPrompt: string): string {
  const parts: string[] = [baseSystemPrompt.trim()];
  if (ctx.passport.trim().length > 0) {
    parts.push(`## Memory passport (C10)\n${ctx.passport.trim()}`);
  }
  if (ctx.taste.trim().length > 0) {
    parts.push(`## Taste profile (C9)\n${ctx.taste.trim()}`);
  }
  parts.push(`## Governance\nThis session runs under ${governanceBadge(ctx.governance)}.`);
  return parts.join("\n\n");
}

/**
 * B3 delegation policy under any Chief (spec §4.2.5a §5): depth ≤2,
 * concurrency ≤6, strict token/step budgets, derived child permissions
 * (parent ∩ deny ∩ explicit grants). Applies whether the subagent chain runs
 * under the inbuilt engine or an external ACP Chief — subagent launch under
 * an external Chief is an ACP tool call, never a bypass.
 */
export interface SubagentLimits {
  maxDepth: number;
  maxConcurrency: number;
  maxStepsPerSubagent: number;
  /** Shared budget cap across the whole chain (e.g. spend units or steps). */
  chainBudget: number;
}

export const DEFAULT_SUBAGENT_LIMITS: SubagentLimits = {
  maxDepth: 2,
  maxConcurrency: 6,
  maxStepsPerSubagent: 200,
  chainBudget: 1000,
};

export interface SpawnState {
  /** Current chain depth (the Chief is 0). */
  depth: number;
  /** Live subagent count at this level. */
  active: number;
  /** Chain steps consumed so far. */
  stepsUsed: number;
  /** Permissions the parent holds (derived child = parent ∩ deny ∩ grants). */
  parentPermissions: ReadonlySet<string>;
  /** Explicit denies that shrink the child's set. */
  denies: ReadonlySet<string>;
  /** Explicit grants that widen it. */
  grants: ReadonlySet<string>;
}

export type SpawnVerdict = { allowed: true } | { allowed: false; reason: string };

export function checkSpawn(state: SpawnState, limits: SubagentLimits = DEFAULT_SUBAGENT_LIMITS): SpawnVerdict {
  if (state.depth >= limits.maxDepth) {
    return { allowed: false, reason: `depth ${state.depth} ≥ max ${limits.maxDepth}` };
  }
  if (state.active >= limits.maxConcurrency) {
    return { allowed: false, reason: `concurrency ${state.active} ≥ max ${limits.maxConcurrency}` };
  }
  if (state.stepsUsed >= limits.chainBudget) {
    return { allowed: false, reason: `chain budget exhausted (${state.stepsUsed} ≥ ${limits.chainBudget})` };
  }
  return { allowed: true };
}

/** Derived child permissions: parent ∩ (deny removed) ∪ explicit grants. */
export function deriveChildPermissions(state: SpawnState): Set<string> {
  const derived = new Set(state.parentPermissions);
  for (const d of state.denies) derived.delete(d);
  for (const g of state.grants) derived.add(g);
  return derived;
}

/** One session's chief record (Work-survives-Chief + audit). */
export interface ChiefRecord {
  sessionId: string;
  chiefId: ChiefId;
  governance: GovernanceMode;
  /** Last completed turn index in the event-sourced session log. */
  lastCompletedTurn: number;
  /** config_hash of the run (immutable manifest the new Chief resumes under). */
  configHash: string;
}

/**
 * Work survives Chief death (spec §4.2.5a §4): swap `primary_chief` mid-Work
 * and resume the same intent → plan → checkpoints → receipts chain from the
 * last completed turn. `configHash` stays the same; approvals are not lost;
 * non-idempotent effects are never replayed (they live in the receipt chain,
 * not the Chief's context).
 */
export function buildResumePrompt(
  record: ChiefRecord,
  intent: string,
  completedPlan: string,
): string {
  return [
    `Resuming an existing Work session (${record.sessionId}, config ${record.configHash.slice(0, 12)}).`,
    `The previous Chief completed ${record.lastCompletedTurn} turns. Continue the SAME Work — do not re-explain the task, do not replay completed effects.`,
    `## Intent\n${intent}`,
    `## Completed plan so far (checkpoints + receipts)\n${completedPlan}`,
    `## Next\nContinue from the next unfinished checkpoint.`,
  ].join("\n\n");
}

/** In-memory per-session chief records (the durable log is Rust's event log). */
export class ChiefRegistry {
  private records = new Map<string, ChiefRecord>();
  /** P38 — session-level pins: sessionId → pinned Chief (`inbuilt` | ACP id).
   * A pin outranks the user default for every turn of that session; absent a
   * pin, the user default applies. Fail-closed on unknown ids. */
  private pins = new Map<string, ChiefId>();

  record(r: ChiefRecord): void {
    this.records.set(r.sessionId, r);
  }

  get(sessionId: string): ChiefRecord | undefined {
    return this.records.get(sessionId);
  }

  /** P38 — pin a session to a Chief (per-session override). Returns the pin. */
  setSessionPin(sessionId: string, chiefId: ChiefId): ChiefId {
    const validated = validateSessionChiefPin(chiefId);
    this.pins.set(sessionId, validated);
    // Keep the Work-survives-Chief record in sync so the resume chain and the
    // pin never disagree.
    const prev = this.records.get(sessionId);
    if (prev) {
      this.records.set(sessionId, { ...prev, chiefId: validated });
    }
    return validated;
  }

  sessionPin(sessionId: string): ChiefId | undefined {
    return this.pins.get(sessionId);
  }

  clearSessionPin(sessionId: string): void {
    this.pins.delete(sessionId);
  }

  /** Swap the Chief for a session, keeping the Work chain intact. */
  swap(sessionId: string, chiefId: ChiefId, governance: GovernanceMode): ChiefRecord | undefined {
    const prev = this.records.get(sessionId);
    if (!prev) return undefined;
    const next: ChiefRecord = {
      ...prev,
      chiefId,
      governance,
    };
    this.records.set(sessionId, next);
    return next;
  }

  get size(): number {
    return this.records.size;
  }
}

export const chiefRegistry = new ChiefRegistry();
