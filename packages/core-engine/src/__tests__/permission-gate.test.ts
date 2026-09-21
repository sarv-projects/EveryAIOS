/**
 * Advisory permission classifier behaviour (P69.D3 / P69.D6).
 *
 * These cases moved from `@everyaios/core-tools` along with the classifier:
 * the tool catalog is a declaration surface and no longer owns permission
 * policy. The assertions describe *classification*, which is input to Guard —
 * never the verdict itself.
 */
import { describe, expect, it } from 'vitest';
import { evaluatePermissionGate } from '../policy/permission-gate';
import type { RiskLevel, ToolContract } from '@everyaios/core-tools';

function toolFor(riskLevel: RiskLevel, surfaceAllowlist: string[] = ['chat']): ToolContract {
  return {
    id: `t_${riskLevel}`,
    family: 'knowledge',
    riskLevel,
    surfaceAllowlist,
    inputSchema: {},
    outputSchema: {},
    execute: async () => ({}),
  } as unknown as ToolContract;
}

describe('advisory permission classifier', () => {
  it('classifies read tools as auto-grant, no confirmation', () => {
    const result = evaluatePermissionGate('read', 'chat', toolFor('read'), { surface: 'chat' }, false);
    expect(result.granted).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('flags destructive tools as always-confirm and never grants them', () => {
    const result = evaluatePermissionGate(
      'destructive',
      'chat',
      toolFor('destructive'),
      { surface: 'chat' },
      false,
    );
    expect(result.granted).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationKind).toBe('always');
  });

  it('flags tools outside the surface allowlist', () => {
    const result = evaluatePermissionGate(
      'read',
      'reader',
      toolFor('read'),
      { surface: 'reader' },
      false,
    );
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not allowed');
  });

  it('an explicit session approval may classify a local-write as granted', () => {
    const result = evaluatePermissionGate(
      'local-write',
      'chat',
      toolFor('local-write'),
      { surface: 'chat' },
      true,
    );
    expect(result.granted).toBe(true);
  });
});
