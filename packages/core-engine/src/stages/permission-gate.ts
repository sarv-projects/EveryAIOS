import { evaluatePermissionGate, approveRiskForSession } from '@personal-ai/core-tools';
import type { ToolContract } from '@personal-ai/core-tools';
import type { ToolFamily } from '../types';

export interface GateResult {
  granted: boolean;
  requiresConfirmation: boolean;
  confirmationKind?: 'session-first' | 'always';
}

/**
 * Minimal scaffold contract used when no full ToolContract registry exists.
 * Passed to evaluatePermissionGate which only reads id, family, riskLevel,
 * and surfaceAllowlist — the zod schema and execute fields are never accessed.
 */
interface ScaffoldContract {
  id: string;
  family: string;
  riskLevel: string;
  surfaceAllowlist: string[];
}

export class PermissionGate {
  evaluate(
    surface: string,
    toolFamily: ToolFamily,
    risk: 'read' | 'local-write' | 'external-write' | 'destructive',
    sessionId: string,
    sessionApproved: boolean,
  ): GateResult {
    const scaffold: ScaffoldContract = {
      id: toolFamily,
      family: toolFamily,
      riskLevel: risk,
      surfaceAllowlist: [surface],
    };
    const result = evaluatePermissionGate(
      risk,
      surface,
      scaffold as unknown as ToolContract,
      { surface, sessionId },
      sessionApproved,
    );
    return result;
  }

  approveForSession(
    sessionId: string,
    family: ToolFamily,
    risk: 'read' | 'local-write' | 'external-write' | 'destructive',
  ): void {
    approveRiskForSession(sessionId, family, risk);
  }
}
