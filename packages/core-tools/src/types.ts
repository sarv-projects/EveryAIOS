import { z } from 'zod';

export type RiskLevel = 'read' | 'local-write' | 'external-write' | 'destructive';
/**
 * Tool family taxonomy. After the 2026-07-22 automations rename, the legacy
 * `'tasks'` family was retired in favor of `'automations'`. Using `'tasks'`
 * anywhere in the codebase is now a TS error (fail-closed).
 */
export type ToolFamily = 'knowledge' | 'reader' | 'automations' | 'creation' | 'system';

export interface ToolContext {
  userId?: string;
  sessionId?: string;
  projectId?: string;
  surface: string;
}

export interface ToolContract<I = unknown, O = unknown> {
  id: string;
  family: ToolFamily;
  riskLevel: RiskLevel;
  inputSchema: z.ZodSchema<I>;
  outputSchema: z.ZodSchema<O>;
  surfaceAllowlist: string[];
  execute(ctx: ToolContext, args: I): Promise<O>;
}

export interface PermissionGateResult {
  granted: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  confirmationKind?: 'session-first' | 'always';
}

export interface ToolInvocation {
  id: string;
  messageId: string;
  toolId: string;
  risk: RiskLevel;
  argsHash: string;
  resultStatus: 'success' | 'error' | 'cancelled';
  durationMs: number;
}
