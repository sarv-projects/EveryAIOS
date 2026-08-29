import { describe, expect, it } from 'vitest';
import {
  spreadActivation,
  lateralInhibit,
  rankByActivation,
  type ActivationEdge,
} from '../spreading-activation.js';

const STAR: ActivationEdge[] = [
  { from: 'a', to: 'b' },
  { from: 'a', to: 'c' },
  { from: 'a', to: 'd' },
];

describe('spreadActivation', () => {
  it('activates direct neighbors of a seed at hop 1', () => {
    const results = spreadActivation(STAR, [{ id: 'a' }]);
    const byId = new Map(results.map((r) => [r.id, r]));
    expect(byId.get('b')?.hops).toBe(1);
    expect(byId.get('c')?.hops).toBe(1);
    expect(byId.get('d')?.hops).toBe(1);
    // Seed keeps full energy (1.0); neighbors decay by `decay` (0.5) at hop 1.
    // Per-hop lateral inhibition (default 0.2) rank-scales the hop-1 layer:
    //   b (rank 0) = 0.5; c (rank 1) = 0.5/1.2 = 0.4167; d (rank 2) = 0.5/1.4 ≈ 0.357
    // After normalize-by-max (seed = 1.0): same values.
    expect(byId.get('a')!.activation).toBeCloseTo(1, 3);
    expect(byId.get('b')!.activation).toBeCloseTo(0.5, 3);
    expect(byId.get('c')!.activation).toBeCloseTo(0.4167, 3);
    expect(byId.get('d')!.activation).toBeCloseTo(0.3571, 3);
  });

  it('decays per hop (2-hop nodes get less than 1-hop nodes)', () => {
    const chain: ActivationEdge[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const results = spreadActivation(chain, [{ id: 'a' }], { decay: 0.5, normalize: false });
    const byId = new Map(results.map((r) => [r.id, r]));
    // a: seed → 1; b: 1×0.5 = 0.5; c: 0.5×0.5 = 0.25
    expect(byId.get('a')!.raw).toBeCloseTo(1, 3);
    expect(byId.get('b')!.raw).toBeCloseTo(0.5, 3);
    expect(byId.get('c')!.raw).toBeCloseTo(0.25, 3);
  });

  it('honors edge weights (stronger edge → stronger neighbor)', () => {
    const edges: ActivationEdge[] = [
      { from: 'a', to: 'strong' },
      { from: 'a', to: 'weak', weight: 0.1 },
    ];
    const results = spreadActivation(edges, [{ id: 'a' }], { normalize: false });
    const strong = results.find((r) => r.id === 'strong')!;
    const weak = results.find((r) => r.id === 'weak')!;
    // Raw energies: strong = 1×1×0.5 = 0.5; weak = 1×0.1×0.5 = 0.05.
    // Per-hop lateral inhibition (0.2) rank-scales: strong (rank 0) keeps 0.5,
    // weak (rank 1) = 0.05/1.2 ≈ 0.0417.
    expect(strong.raw).toBeCloseTo(0.5, 3);
    expect(weak.raw).toBeCloseTo(0.0417, 3);
  });

  it('applies lateral inhibition — top competitor keeps energy, weaker ones suppressed', () => {
    // Three competitors at the same hop: a→x (weight 1), a→y (weight 0.9), a→z (weight 0.5).
    const edges: ActivationEdge[] = [
      { from: 'a', to: 'x' },
      { from: 'a', to: 'y', weight: 0.9 },
      { from: 'a', to: 'z', weight: 0.5 },
    ];
    const results = spreadActivation(edges, [{ id: 'a' }], { decay: 1, lateralInhibition: 0.5, normalize: false });
    const byId = new Map(results.map((r) => [r.id, r]));
    // Without inhibition: x=1, y=0.9, z=0.5. With inhibition at hop 1:
    // x = 1/(1+0.5×0)=1; y = 0.9/(1+0.5×1)=0.6; z = 0.5/(1+0.5×2)=0.25
    expect(byId.get('x')!.raw).toBeCloseTo(1, 3);
    expect(byId.get('y')!.raw).toBeCloseTo(0.6, 3);
    expect(byId.get('z')!.raw).toBeCloseTo(0.25, 3);
  });

  it('normalizes to [0,1] by default', () => {
    const results = spreadActivation(STAR, [{ id: 'a' }]);
    expect(Math.max(...results.map((r) => r.activation))).toBeCloseTo(1, 3);
    for (const r of results) {
      expect(r.activation).toBeGreaterThanOrEqual(0);
      expect(r.activation).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty for no seeds', () => {
    expect(spreadActivation(STAR, [])).toEqual([]);
  });

  it('drops below-threshold nodes', () => {
    const chain: ActivationEdge[] = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const results = spreadActivation(chain, [{ id: 'a' }], {
      decay: 0.1,
      threshold: 0.5,
      normalize: false,
    });
    const ids = results.map((r) => r.id);
    expect(ids).toContain('a'); // seed survives
    // b = 1×0.1 = 0.1 < 0.5 → dropped; c never reached.
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('c');
  });

  it('keeps seeds even when graph is empty', () => {
    const results = spreadActivation([], [{ id: 'solo' }], { normalize: false });
    expect(results).toEqual([{ id: 'solo', raw: 1, activation: 1, hops: 0 }]);
  });
});

describe('lateralInhibit', () => {
  it('scales by 1/(1 + inhibition × rank)', () => {
    const layer = new Map([
      ['top', 1],
      ['mid', 0.8],
      ['low', 0.4],
    ]);
    const inhibited = lateralInhibit(layer, 1);
    expect(inhibited.get('top')).toBeCloseTo(1, 3);
    expect(inhibited.get('mid')).toBeCloseTo(0.4, 3); // 0.8/(1+1)
    expect(inhibited.get('low')).toBeCloseTo(0.133, 2); // 0.4/(1+2)
  });

  it('is a no-op for empty layer', () => {
    expect(lateralInhibit(new Map(), 0.5).size).toBe(0);
  });
});

describe('rankByActivation', () => {
  it('maps candidate ids to activation, missing → 0', () => {
    const results = spreadActivation(STAR, [{ id: 'a' }]);
    const rank = rankByActivation(results, ['a', 'b', 'zzz']);
    expect(rank.get('a')).toBeGreaterThan(0);
    expect(rank.get('b')).toBeGreaterThan(0);
    expect(rank.get('zzz')).toBe(0);
  });
});
