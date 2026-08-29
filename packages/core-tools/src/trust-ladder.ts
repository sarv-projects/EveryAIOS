/**
 * Algorithm #12 — Trust Ladder (Progressive Permission Escalation)
 * ===============================================================
 * Prior-art gap: Chain-of-Trust (2026) evaluates *collaborators* in
 * distributed systems; existing papers evaluate trust, but nobody gates
 * *permission escalation inside a single AI assistant* on a scalar TrustScore.
 *
 * The ladder: a device/agent accumulates TrustScore (0–100) from tool-call
 * outcomes. Higher scores unlock riskier tool families WITHOUT confirmation:
 *
 *   score < 25           → read only
 *   25 ≤ score < 50      → + local-write (session-first confirm on 1st use)
 *   50 ≤ score < 75      → + external-write (always confirm, but no session re-prompt)
 *   75 ≤ score ≤ 100     → + destructive (still requires explicit per-call confirm)
 *
 * Dynamics (numerical contract — mirrored in tests):
 *   success: score += 2.0  (capped 100)
 *   failure: score -= 5.0  (floored 0)
 *   user-declined confirm: score -= 10.0  (soft penalty, floored 0)
 *   No-op wins are capped at +2 per 10s window to prevent farming via cheap reads.
 *
 * Security posture: TrustScore NEVER bypasses the PermissionGate confirmation
 * for destructive actions — it only upgrades the *maximum risk level* the
 * gate will consider granting. Explicit per-call confirmation always stands.
 */

export type LadderRiskLevel = 'read' | 'local-write' | 'external-write' | 'destructive';

export const TRUST_LADDER = [
  { minScore: 0, maxRisk: 'read' as const },
  { minScore: 25, maxRisk: 'local-write' as const },
  { minScore: 50, maxRisk: 'external-write' as const },
  { minScore: 75, maxRisk: 'destructive' as const },
];

export const TRUST_SUCCESS_DELTA = 2.0;
export const TRUST_FAILURE_DELTA = 5.0;
export const TRUST_DECLINE_DELTA = 10.0;
export const TRUST_MAX = 100;
export const TRUST_FARM_WINDOW_MS = 10_000;
export const TRUST_FARM_CAP = 2;

const RISK_ORDER: LadderRiskLevel[] = ['read', 'local-write', 'external-write', 'destructive'];

export function maxRiskForScore(score: number): LadderRiskLevel {
  let maxRisk: LadderRiskLevel = 'read';
  for (const rung of TRUST_LADDER) {
    if (score >= rung.minScore) maxRisk = rung.maxRisk;
  }
  return maxRisk;
}

export function riskIndex(risk: LadderRiskLevel): number {
  return RISK_ORDER.indexOf(risk);
}

export interface TrustOutcome {
  success: boolean;
  /** True when the user explicitly declined a confirmation prompt. */
  declined?: boolean;
  /** Risk level of the action that just completed. */
  risk?: LadderRiskLevel;
}

export class TrustLadder {
  private score: number;
  private lastFarmAt = 0;
  private farmGained = 0;

  constructor(initialScore = 0) {
    this.score = Math.max(0, Math.min(TRUST_MAX, initialScore));
  }

  getScore(): number {
    return this.score;
  }

  maxRisk(): LadderRiskLevel {
    return maxRiskForScore(this.score);
  }

  /**
   * Whether the given risk level can be attempted without per-call
   * confirmation given the current trust. Destructive ALWAYS requires
   * explicit confirmation (hard rule) — trust can only unlock *consideration*.
   */
  isUnlocked(risk: LadderRiskLevel): boolean {
    if (risk === 'destructive') return false;
    return riskIndex(risk) <= riskIndex(this.maxRisk());
  }

  /**
   * Restore a persisted score (e.g. loaded from SecureStore at app boot).
   * Clamps to [0, TRUST_MAX] and resets the anti-farm window so a restored
   * score can never inherit stale farm state across restarts.
   */
  restore(score: number): void {
    this.score = Math.max(0, Math.min(TRUST_MAX, score));
    this.resetFarm();
  }

  /** Record an outcome; returns the new score. */
  recordOutcome(outcome: TrustOutcome): number {
    if (outcome.declined) {
      this.score = Math.max(0, this.score - TRUST_DECLINE_DELTA);
      this.resetFarm();
      return this.score;
    }
    if (!outcome.success) {
      this.score = Math.max(0, this.score - TRUST_FAILURE_DELTA);
      this.resetFarm();
      return this.score;
    }
    // Success — anti-farming guard: cap wins in a rolling 10s window.
    const now = Date.now();
    if (now - this.lastFarmAt > TRUST_FARM_WINDOW_MS) {
      this.farmGained = 0;
      this.lastFarmAt = now;
    }
    if (this.farmGained < TRUST_FARM_CAP) {
      this.farmGained += 1;
      this.score = Math.min(TRUST_MAX, this.score + TRUST_SUCCESS_DELTA);
    }
    return this.score;
  }

  private resetFarm(): void {
    this.farmGained = 0;
    this.lastFarmAt = 0;
  }

  /** Fraction of the ladder climbed — UI progress bar / dashboard. */
  progress(): number {
    return this.score / TRUST_MAX;
  }
}

/** Pure helper — the rung the user is on (for UI labels: "Trusted · Level 2"). */
export function ladderLevelForScore(score: number): number {
  let level = 1;
  for (const rung of TRUST_LADDER) {
    if (score >= rung.minScore) level = riskIndex(rung.maxRisk) + 1;
  }
  return level;
}
