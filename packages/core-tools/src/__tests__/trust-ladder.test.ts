import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { evaluatePermissionGateWithTrust } from '../permission-gate';
import type { ToolContract } from '../types';
import {
  TrustLadder,
  maxRiskForScore,
  ladderLevelForScore,
  TRUST_MAX,
  TRUST_SUCCESS_DELTA,
  TRUST_FAILURE_DELTA,
  TRUST_DECLINE_DELTA,
} from '../trust-ladder';

describe('#12 Trust Ladder — rung thresholds', () => {
  it('read-only below 25', () => {
    expect(maxRiskForScore(0)).toBe('read');
    expect(maxRiskForScore(24)).toBe('read');
  });
  it('local-write from 25', () => {
    expect(maxRiskForScore(25)).toBe('local-write');
    expect(maxRiskForScore(49)).toBe('local-write');
  });
  it('external-write from 50', () => {
    expect(maxRiskForScore(50)).toBe('external-write');
    expect(maxRiskForScore(74)).toBe('external-write');
  });
  it('destructive consideration from 75 (but never auto-grant)', () => {
    expect(maxRiskForScore(75)).toBe('destructive');
    expect(maxRiskForScore(100)).toBe('destructive');
  });
  it('ladder levels map 1..4', () => {
    expect(ladderLevelForScore(0)).toBe(1);
    expect(ladderLevelForScore(30)).toBe(2);
    expect(ladderLevelForScore(60)).toBe(3);
    expect(ladderLevelForScore(80)).toBe(4);
  });
});

describe('#12 — escalation dynamics (the effect proof)', () => {
  it('successes climb trust and unlock higher risks over time', () => {
    vi.useFakeTimers();
    const ladder = new TrustLadder(0);
    expect(ladder.isUnlocked('local-write')).toBe(false);

    // 13 successes × 2.0 = 26 → crosses the 25 rung. Spaced >10s apart so the
    // anti-farm guard doesn't truncate genuine, day-spaced trust building.
    for (let i = 0; i < 13; i += 1) {
      ladder.recordOutcome({ success: true, risk: 'read' });
      vi.advanceTimersByTime(11_000);
    }
    expect(ladder.getScore()).toBeGreaterThanOrEqual(25);
    expect(ladder.isUnlocked('local-write')).toBe(true);
    expect(ladder.isUnlocked('external-write')).toBe(false);
  });

  it('failures erode trust and re-lock previously unlocked risk', () => {
    const ladder = new TrustLadder(30); // already past local-write rung
    expect(ladder.isUnlocked('local-write')).toBe(true);
    // 2 failures × 5 = 10 → 20, below 25 again
    ladder.recordOutcome({ success: false, risk: 'local-write' });
    ladder.recordOutcome({ success: false, risk: 'local-write' });
    expect(ladder.getScore()).toBe(20);
    expect(ladder.isUnlocked('local-write')).toBe(false);
  });

  it('destructive NEVER auto-unlocks regardless of score', () => {
    const ladder = new TrustLadder(100);
    expect(ladder.isUnlocked('destructive')).toBe(false);
    expect(ladder.isUnlocked('external-write')).toBe(true);
  });

  it('user decline penalizes harder than a failure', () => {
    const ladder = new TrustLadder(40);
    ladder.recordOutcome({ success: true, declined: true });
    expect(ladder.getScore()).toBe(40 - TRUST_DECLINE_DELTA);
    expect(TRUST_DECLINE_DELTA).toBeGreaterThan(TRUST_FAILURE_DELTA);
  });

  it('score never exceeds 100 or drops below 0', () => {
    vi.useFakeTimers();
    const up = new TrustLadder(99);
    for (let i = 0; i < 10; i += 1) {
      up.recordOutcome({ success: true, risk: 'read' });
      vi.advanceTimersByTime(11_000);
    }
    expect(up.getScore()).toBeLessThanOrEqual(TRUST_MAX);

    const down = new TrustLadder(10);
    for (let i = 0; i < 10; i += 1) down.recordOutcome({ success: false });
    expect(down.getScore()).toBe(0);
  });
});

describe('#12 — anti-farming guard', () => {
  it('caps success gains in a 10s window to prevent read-farming', () => {
    const ladder = new TrustLadder(0);
    for (let i = 0; i < 10; i += 1) ladder.recordOutcome({ success: true, risk: 'read' });
    // Only the first 2 in-window wins count → 4 points, not 20.
    expect(ladder.getScore()).toBe(2 * TRUST_SUCCESS_DELTA);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('#12 — gate integration security posture', () => {
  const toolFor = (riskLevel: 'external-write' | 'local-write'): ToolContract => ({
    id: 't',
    family: 'automations',
    riskLevel,
    surfaceAllowlist: ['chat'],
    inputSchema: z.object({}),
    outputSchema: z.any(),
    execute: async () => ({}),
  });

  it('trust NEVER bypasses confirmation for external-write or destructive', () => {
    const ladder = new TrustLadder(100); // max trust
    const tool = toolFor('external-write');
    const r = evaluatePermissionGateWithTrust('read', 'chat', tool, { sessionId: 's', surface: 'chat' }, false, ladder);
    expect(r.requiresConfirmation).toBe(true);
    expect(r.granted).toBe(false);
  });

  it('trust unlocks local-write but first use still needs session-first confirmation (docs-aligned)', () => {
    // Docs (trust-ladder.ts): the local-write rung unlocks the risk with
    // "session-first confirm on 1st use" — NOT silent auto-grant. The gate
    // now aligns: rung reached → tool available, but the first use in a
    // session requires confirmation; an explicit session approval grants.
    const ladder = new TrustLadder(30);
    const tool = toolFor('local-write');
    const first = evaluatePermissionGateWithTrust('read', 'chat', tool, { sessionId: 's', surface: 'chat' }, false, ladder);
    expect(first.granted).toBe(false);
    expect(first.requiresConfirmation).toBe(true);
    expect(first.confirmationKind).toBe('session-first');

    const approved = evaluatePermissionGateWithTrust('read', 'chat', tool, { sessionId: 's', surface: 'chat' }, true, ladder);
    expect(approved.granted).toBe(true);
    expect(approved.requiresConfirmation).toBe(false);
  });

  it('trust below the local-write rung does not auto-grant', () => {
    const ladder = new TrustLadder(10);
    const tool = toolFor('local-write');
    const r = evaluatePermissionGateWithTrust('read', 'chat', tool, { sessionId: 's', surface: 'chat' }, false, ladder);
    expect(r.granted).toBe(false);
    expect(r.requiresConfirmation).toBe(true);
  });
});

describe('#12 — progress helper', () => {
  it('progress is normalized 0..1', () => {
    expect(new TrustLadder(0).progress()).toBe(0);
    expect(new TrustLadder(100).progress()).toBe(1);
    expect(new TrustLadder(50).progress()).toBeCloseTo(0.5, 5);
  });
});

describe('#12 — persistence (restore survives restart)', () => {
  it('restore clamps to [0, TRUST_MAX] and resets the farm window', () => {
    vi.useFakeTimers();
    const ladder = new TrustLadder(30);
    // Farm a bit inside the window, then restore — farm state must reset.
    ladder.recordOutcome({ success: true, risk: 'read' });
    ladder.recordOutcome({ success: true, risk: 'read' });
    ladder.restore(40);
    expect(ladder.getScore()).toBe(40);
    // Farm window reset → next wins count again.
    ladder.recordOutcome({ success: true, risk: 'read' });
    expect(ladder.getScore()).toBe(40 + TRUST_SUCCESS_DELTA);

    ladder.restore(999);
    expect(ladder.getScore()).toBe(TRUST_MAX);
    ladder.restore(-5);
    expect(ladder.getScore()).toBe(0);
  });

  it('restore preserves rung unlocks', () => {
    const ladder = new TrustLadder(0);
    ladder.restore(60);
    expect(ladder.maxRisk()).toBe('external-write');
    expect(ladder.isUnlocked('external-write')).toBe(true);
  });
});
