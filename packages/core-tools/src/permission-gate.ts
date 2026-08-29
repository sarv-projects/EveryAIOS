import type { RiskLevel, ToolFamily, ToolContract, PermissionGateResult, ToolContext } from './types';
import { TrustLadder, maxRiskForScore } from './trust-ladder';

/** Cap session approval map to avoid unbounded growth across long sessions. */
const MAX_SESSION_KEYS = 200;
/** TTL for session approvals — 30 minutes. Prevents stale entries from lingering. */
const APPROVAL_TTL_MS = 30 * 60 * 1_000;

interface ApprovalEntry {
  risks: Set<RiskLevel>;
  /** Timestamp (ms) of last write — used for TTL eviction. */
  lastAccess: number;
}

/**
 * Per-session scoped approval map. Keyed by `${sessionId}:${family}`.
 * Each entry carries a `lastAccess` timestamp for TTL-based expiry,
 * and `pruneSessionMap()` evicts both by size cap AND by age (>30 min).
 */
const SESSION_APPROVED_RISKS = new Map<string, ApprovalEntry>();

function pruneSessionMap(): void {
  const now = Date.now();
  // First pass: evict expired entries (TTL).
  for (const [key, entry] of SESSION_APPROVED_RISKS) {
    if (now - entry.lastAccess > APPROVAL_TTL_MS) {
      SESSION_APPROVED_RISKS.delete(key);
    }
  }
  // Second pass: if still over cap, evict oldest by insertion order.
  if (SESSION_APPROVED_RISKS.size > MAX_SESSION_KEYS) {
    const excess = SESSION_APPROVED_RISKS.size - MAX_SESSION_KEYS;
    let i = 0;
    for (const key of SESSION_APPROVED_RISKS.keys()) {
      SESSION_APPROVED_RISKS.delete(key);
      i += 1;
      if (i >= excess) break;
    }
  }
}

export function evaluatePermissionGate(
  agentMaxRisk: RiskLevel,
  surface: string,
  tool: ToolContract,
  context: ToolContext,
  sessionApproved: boolean,
): PermissionGateResult {
  // #32: TTL-evict on EVERY evaluation, not just on approve — otherwise a
  // 30-minute approval lives forever once granted (pruneSessionMap only ran
  // from approveRiskForSession).
  pruneSessionMap();

  if (!tool.surfaceAllowlist.includes(surface)) {
    return { granted: false, reason: `Tool ${tool.id} not allowed on ${surface} surface`, requiresConfirmation: false };
  }

  const effectiveRisk = higherRisk(agentMaxRisk, tool.riskLevel);

  if (effectiveRisk === 'destructive') {
    return { granted: false, requiresConfirmation: true, confirmationKind: 'always' };
  }
  if (effectiveRisk === 'external-write') {
    return { granted: false, requiresConfirmation: true, confirmationKind: 'always' };
  }
  if (effectiveRisk === 'local-write') {
    if (sessionApproved) {
      return { granted: true, requiresConfirmation: false };
    }
    const key = `${context.sessionId}:${tool.family}`;
    const entry = SESSION_APPROVED_RISKS.get(key);
    // Honor any session-approved risk at this level or higher path already handled.
    if (entry && entry.risks.has('local-write')) {
      return { granted: true, requiresConfirmation: false };
    }
    return { granted: false, requiresConfirmation: true, confirmationKind: 'session-first' };
  }
  // read (and any lower) — granted
  return { granted: true, requiresConfirmation: false };
}

export function approveRiskForSession(sessionId: string, family: ToolFamily, risk: RiskLevel): void {
  const key = `${sessionId}:${family}`;
  const existing = SESSION_APPROVED_RISKS.get(key);
  if (existing) {
    existing.risks.add(risk);
    existing.lastAccess = Date.now();
  } else {
    SESSION_APPROVED_RISKS.set(key, {
      risks: new Set([risk]),
      lastAccess: Date.now(),
    });
  }
  pruneSessionMap();
}

/** Test/helper: clear session approvals (e.g. on logout). */
export function clearSessionApprovals(sessionId?: string): void {
  if (!sessionId) {
    SESSION_APPROVED_RISKS.clear();
    return;
  }
  for (const key of [...SESSION_APPROVED_RISKS.keys()]) {
    if (key.startsWith(`${sessionId}:`)) SESSION_APPROVED_RISKS.delete(key);
  }
}

const RISK_ORDER: RiskLevel[] = ['read', 'local-write', 'external-write', 'destructive'];

function higherRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const ai = RISK_ORDER.indexOf(a);
  const bi = RISK_ORDER.indexOf(b);
  return RISK_ORDER[Math.max(ai, bi)]!;
}

/**
 * Algorithm #12 Trust Ladder integration: evaluate the permission gate with an
 * optional TrustLadder. The ladder's trust score can auto-grant LOCAL-WRITE
 * once the local-write rung (score ≥ 25) is reached — removing the session
 * confirmation prompt for trusted, low-stakes writes.
 *
 * Security posture (hard rules, deliberately narrower than the ladder's raw
 * rungs): external-write and destructive ALWAYS require explicit per-call
 * confirmation regardless of trust — the base gate's `confirmationKind` is
 * never overridden for those. Trust only upgrades the risk level the gate will
 * *consider*; it never silences a confirmation the base gate demands for
 * consequential actions. Passing `ladder` is fully optional — legacy path
 * unchanged.
 */
export function evaluatePermissionGateWithTrust(
  agentMaxRisk: RiskLevel,
  surface: string,
  tool: ToolContract,
  context: ToolContext,
  sessionApproved: boolean,
  ladder?: TrustLadder,
): PermissionGateResult {
  // Surface allowlist is a hard gate — never bypassed by trust.
  if (!tool.surfaceAllowlist.includes(surface)) {
    return { granted: false, reason: `Tool ${tool.id} not allowed on ${surface} surface`, requiresConfirmation: false };
  }

  const effectiveRisk = higherRisk(agentMaxRisk, tool.riskLevel);

  // Trust never bypasses confirmation for consequential actions.
  if (effectiveRisk === 'external-write' || effectiveRisk === 'destructive') {
    return { granted: false, requiresConfirmation: true, confirmationKind: 'always' };
  }

  // Local-write with a TrustLadder. Docs (trust-ladder.ts) say the local-write
  // rung unlocks the risk with "session-first confirm on 1st use" — the gate
  // previously auto-granted with zero confirmation, disagreeing with the docs.
  // Aligned behavior: the rung makes local-write AVAILABLE; the first use in a
  // session still requires session-first confirmation (explicit user/UI
  // approval via approveRiskForSession rides the session map thereafter).
  if (effectiveRisk === 'local-write' && ladder) {
    const ladderRisk = maxRiskForScore(ladder.getScore());
    if (RISK_ORDER.indexOf('local-write') <= RISK_ORDER.indexOf(ladderRisk)) {
      // #32: honor session approval (the ladder branch previously ignored it).
      if (sessionApproved) {
        return { granted: true, requiresConfirmation: false, reason: 'session-approved' };
      }
      const key = `${context.sessionId}:${tool.family}`;
      const entry = SESSION_APPROVED_RISKS.get(key);
      if (entry && entry.risks.has('local-write')) {
        return { granted: true, requiresConfirmation: false, reason: 'session-approved' };
      }
      return { granted: false, requiresConfirmation: true, confirmationKind: 'session-first', reason: 'trust-ladder-first-use' };
    }
    return { granted: false, requiresConfirmation: true, confirmationKind: 'session-first' };
  }

  // Fall through to the standard gate (read or local-write without ladder).
  return evaluatePermissionGate(agentMaxRisk, surface, tool, context, sessionApproved);
}
