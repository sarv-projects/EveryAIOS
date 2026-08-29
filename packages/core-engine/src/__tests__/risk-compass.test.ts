import { describe, expect, it } from 'vitest';
import {
  assessHallucinationRisk,
  countUncertaintyMarkers,
  evaluateCalibration,
  type CalibrationSample,
} from '../risk-compass.js';

describe('#8 Hallucination Risk Compass — score contract', () => {
  it('well-grounded, confident answer scores low', () => {
    const r = assessHallucinationRisk({
      retrievalConfidence: 0.9,
      sourceCoverage: 0.95,
      hasSources: true,
      uncertaintyMarkers: 0,
      answerLength: 300,
      groundedOnly: true,
    });
    expect(r.score).toBeLessThan(0.35);
    expect(r.band).toBe('low');
  });

  it('no-sources answer gets the +0.10 penalty', () => {
    const withSources = assessHallucinationRisk({
      retrievalConfidence: 0.5,
      sourceCoverage: 0.5,
      hasSources: true,
      uncertaintyMarkers: 0,
    }).score;
    const without = assessHallucinationRisk({
      retrievalConfidence: 0.5,
      sourceCoverage: 0.5,
      hasSources: false,
      uncertaintyMarkers: 0,
    }).score;
    expect(without - withSources).toBeCloseTo(0.10, 5);
  });

  it('weak retrieval confidence drives risk up', () => {
    const strong = assessHallucinationRisk({
      retrievalConfidence: 0.95,
      sourceCoverage: 0.9,
      hasSources: true,
      uncertaintyMarkers: 0,
    }).score;
    const weak = assessHallucinationRisk({
      retrievalConfidence: 0.1,
      sourceCoverage: 0.9,
      hasSources: true,
      uncertaintyMarkers: 0,
    }).score;
    expect(weak).toBeGreaterThan(strong);
    expect(weak - strong).toBeCloseTo(0.35 * 0.85, 5);
  });

  it('clamps score to [0,1]', () => {
    const r = assessHallucinationRisk({
      retrievalConfidence: 0,
      sourceCoverage: 0,
      hasSources: false,
      uncertaintyMarkers: 10,
    });
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('emits human-readable flags', () => {
    const r = assessHallucinationRisk({
      retrievalConfidence: 0.2,
      sourceCoverage: 0.2,
      hasSources: false,
      uncertaintyMarkers: 1,
    });
    expect(r.flags.length).toBeGreaterThan(0);
    expect(r.flags.join(' ')).toContain('no sources');
  });
});

describe('#8 — uncertainty marker counting', () => {
  it('counts hedge words', () => {
    expect(countUncertaintyMarkers('I think it might be 42, probably')).toBe(3);
  });
  it('ignores plain statements', () => {
    expect(countUncertaintyMarkers('The capital of France is Paris.')).toBe(0);
  });
});

describe('#8 — calibration (the effect proof)', () => {
  /** Synthetic labeled set: low-risk answers are mostly correct, high-risk mostly wrong. */
  function buildLabeledSamples(): CalibrationSample[] {
    const samples: CalibrationSample[] = [];
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const score = rng();
      const baseError = score < 0.35 ? 0.1 : score < 0.65 ? 0.45 : 0.85;
      samples.push({ score, wasCorrect: rng() > baseError });
    }
    return samples;
  }

  it('error rate rises monotonically across low → medium → high bands', () => {
    const report = evaluateCalibration(buildLabeledSamples());
    expect(report.bandErrorRates.low!.errorRate).toBeLessThan(report.bandErrorRates.medium!.errorRate);
    expect(report.bandErrorRates.medium!.errorRate).toBeLessThan(report.bandErrorRates.high!.errorRate);
    expect(report.monotonicity).toBe(1);
  });

  it('high band has meaningful discrimination vs low band', () => {
    const report = evaluateCalibration(buildLabeledSamples());
    const lift = report.bandErrorRates.high!.errorRate / report.bandErrorRates.low!.errorRate;
    expect(lift).toBeGreaterThan(4);
  });

  it('handles empty bands without NaN', () => {
    const report = evaluateCalibration([{ score: 0.9, wasCorrect: false }]);
    expect(report.bandErrorRates.low!.errorRate).toBe(0);
    expect(report.overallErrorRate).toBe(1);
  });
});

/** Deterministic PRNG for reproducible synthetic data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
