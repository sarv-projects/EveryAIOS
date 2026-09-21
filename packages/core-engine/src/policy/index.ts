/**
 * Advisory policy classifiers (P69.D3 / P69.D6).
 *
 * Everything exported here is *policy input*, never an authority: Guard (Rust)
 * decides every mutating effect. Keeping the classifiers next to the engine
 * that emits them leaves `@everyaios/core-tools` as a pure tool-declaration
 * surface.
 */
export {
  evaluatePermissionGate,
  evaluatePermissionGateWithTrust,
  approveRiskForSession,
  clearSessionApprovals,
} from './permission-gate';
export {
  TrustLadder,
  maxRiskForScore,
  ladderLevelForScore,
  TRUST_LADDER,
  TRUST_SUCCESS_DELTA,
  TRUST_FAILURE_DELTA,
  TRUST_DECLINE_DELTA,
  TRUST_MAX,
  TRUST_FARM_WINDOW_MS,
  TRUST_FARM_CAP,
} from './trust-ladder';
export type { LadderRiskLevel, TrustOutcome } from './trust-ladder';
