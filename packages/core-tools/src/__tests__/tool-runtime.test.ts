import { describe, it, expect } from 'vitest';
import { ToolRuntime, evaluatePermissionGate } from '../index';
import { z } from 'zod';
import type { ToolContract } from '../types';

describe('ToolRuntime', () => {
  it('registers and executes tools', async () => {
    const runtime = new ToolRuntime();
    const mockExec = async () => ({ files: ['file1.pdf'] });
    const tool: ToolContract = {
      id: 'search_local_files',
      family: 'knowledge',
      riskLevel: 'read',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.any(),
      surfaceAllowlist: ['chat'],
      execute: mockExec,
    };
    runtime.register(tool);

    const result = await runtime.execute('search_local_files', { surface: 'chat' }, { query: 'test' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws for unknown tool', async () => {
    const runtime = new ToolRuntime();
    await expect(runtime.execute('unknown', { surface: 'chat' }, {})).rejects.toThrow('Tool not found');
  });
});

describe('PermissionGate', () => {
  it('auto-grants read tools', () => {
    const tool: ToolContract = {
      id: 'read_memory',
      family: 'knowledge',
      riskLevel: 'read',
      inputSchema: z.any(),
      outputSchema: z.any(),
      surfaceAllowlist: ['chat'],
      execute: async () => ({}),
    };
    const result = evaluatePermissionGate('read', 'chat', tool, { surface: 'chat' }, false);
    expect(result.granted).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('requires confirmation for destructive', () => {
    const tool: ToolContract = {
      id: 'delete_forever',
      family: 'system',
      riskLevel: 'destructive',
      inputSchema: z.any(),
      outputSchema: z.any(),
      surfaceAllowlist: ['chat'],
      execute: async () => ({}),
    };
    const result = evaluatePermissionGate('destructive', 'chat', tool, { surface: 'chat' }, false);
    expect(result.granted).toBe(false);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationKind).toBe('always');
  });

  it('blocks tools not on surface allowlist', () => {
    const tool: ToolContract = {
      id: 'search_web',
      family: 'knowledge',
      riskLevel: 'read',
      inputSchema: z.any(),
      outputSchema: z.any(),
      surfaceAllowlist: ['chat'],
      execute: async () => ({}),
    };
    const result = evaluatePermissionGate('read', 'reader', tool, { surface: 'reader' }, false);
    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not allowed');
  });
});
