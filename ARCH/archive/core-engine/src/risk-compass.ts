/**
 * Algorithm #8 — Hallucination Risk Compass
 * ==========================================
 * Prior-art: raw LLM self-confidence is miscalibrated (semantic-entropy line of
 * work: Farquhar et al. 2024). So instead of trusting the model's own "I'm
 * sure", this compass scores answers from *grounding signals* that are cheap to
 * collect at inference time:
 *   - retrievalConfidence  (0..1): top retrieval score / fusion confidence
 *   - sourceCoverage       (0..1): fraction of answer claims traceable to sources
 *   - hasSources           (bool): any retrieved sources at all
 *   - uncertaintyMarkers   (int): "probably / I think / might / not sure" count
 *   - answerLength         (tokens)
 *   - groundedOnly         (bool): prompt forced grounding-only mode
 *
 * Score contract (numerical — mirrored in tests):
 *   base     = 0.15 (everything starts mildly risky)
 *   +0.35 × (1 − retrievalConfidence)          [weak retrieval ⇒ risk]
 *   +0.30 × (1 − sourceCoverage)               [uncovered claims ⇒ risk]
 *   +0.10 × (hasSources ? 0 : 1)               [no sources at all ⇒ risk]
 *   +0.04 × min(3, uncertaintyMarkers)         [hedging ⇒ risk]
 *   −0.10 × (groundedOnly ? 1 : 0)             [grounding-enforced ⇒ safer]
 *   clamp [0,1]. Bands: <0.35 low · <0.65 medium · else high.
 *
 * Calibration: a compass is only useful if P(wrong | high-risk) ≫ P(wrong |
 * low-risk). The calibration test in __tests__ verifies this ordering on a
 * synthetic labeled set — the same harness we'd run on production telemetry.
 */

export type RiskBand = 'low' | 'medium' | 'high';

export interface RiskSignals {
  retrievalConfidence: number;
  sourceCoverage: number;
  hasSources: boolean;
  uncertaintyMarkers: number;
  answerLength?: number;
  groundedOnly?: boolean;
}

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  /** Human-readable flags explaining what pushed the score. */
  flags: string[];
}

const MIN_GROUNDED_ANSWER_LENGTH = 80;

export function assessHallucinationRisk(signals: RiskSignals): RiskAssessment {
  const flags: string[] = [];
  const rc = Math.max(0, Math.min(1, signals.retrievalConfidence));
  const sc = Math.max(0, Math.min(1, signals.sourceCoverage));
  const markers = Math.max(0, signals.uncertaintyMarkers);
  const groundedOnly = signals.groundedOnly ?? false;

  let score = 0.15;
  score += 0.35 * (1 - rc);
  if (rc < 0.5) flags.push('weak retrieval confidence');
  score += 0.30 * (1 - sc);
  if (sc < 0.5) flags.push('low source coverage');
  if (!signals.hasSources) {
    score += 0.10;
    flags.push('no sources retrieved');
  }
  const markerBonus = 0.04 * Math.min(3, markers);
  score += markerBonus;
  if (markers > 0) flags.push(`${markers} uncertainty marker(s)`);
  if (groundedOnly) {
    score -= 0.10;
    flags.push('grounding-enforced');
  }
  // Short answers to substantive questions are suspicious — likely guesswork.
  const length = signals.answerLength ?? Number.MAX_SAFE_INTEGER;
  if (length < MIN_GROUNDED_ANSWER_LENGTH && !groundedOnly) {
    score += 0.05;
    flags.push('suspiciously short answer');
  }

  score = Math.max(0, Math.min(1, score));
  const band: RiskBand = score < 0.35 ? 'low' : score < 0.65 ? 'medium' : 'high';
  return { score, band, flags };
}

/** Simple keyword hedge counter — "probably / I think / might / not sure / maybe". */
const HEDGE_RE =
  /\b(probably|i think|i guess|might|may be|maybe|not sure|not certain|could be|possibly|seems like|i believe)\b/gi;

export function countUncertaintyMarkers(text: string): number {
  const matches = text.match(HEDGE_RE);
  return matches ? matches.length : 0;
}

/**
 * Calibration evaluator: given labeled (assessment, wasCorrect) pairs, returns
 * per-band error rates + the compass's usefulness. A useful compass shows a
 * strictly increasing error rate across low → medium → high bands.
 */
export interface CalibrationSample {
  score: number;
  wasCorrect: boolean;
}

export interface CalibrationReport {
  bandErrorRates: Record<RiskBand, { total: number; wrong: number; errorRate: number }>;
  /** 1.0 = perfect ordering (monotone ↑ error with risk); 0 = no signal. */
  monotonicity: number;
  overallErrorRate: number;
}

export function evaluateCalibration(samples: CalibrationSample[]): CalibrationReport {
  const bands: Record<RiskBand, { total: number; wrong: number }> = {
    low: { total: 0, wrong: 0 },
    medium: { total: 0, wrong: 0 },
    high: { total: 0, wrong: 0 },
  };
  for (const s of samples) {
    const band: RiskBand = s.score < 0.35 ? 'low' : s.score < 0.65 ? 'medium' : 'high';
    bands[band].total += 1;
    if (!s.wasCorrect) bands[band].wrong += 1;
  }
  const bandErrorRates = {} as CalibrationReport['bandErrorRates'];
  let overallWrong = 0;
  let overallTotal = 0;
  for (const band of ['low', 'medium', 'high'] as RiskBand[]) {
    const b = bands[band];
    overallWrong += b.wrong;
    overallTotal += b.total;
    bandErrorRates[band] = {
      total: b.total,
      wrong: b.wrong,
      errorRate: b.total > 0 ? b.wrong / b.total : 0,
    };
  }
  const order = ['low', 'medium', 'high'] as RiskBand[];
  let monotonicSteps = 0;
  for (let i = 1; i < order.length; i += 1) {
    const prev = bandErrorRates[order[i - 1]!]!;
    const cur = bandErrorRates[order[i]!]!;
    if (prev.total === 0 || cur.total === 0) continue;
    if (cur.errorRate >= prev.errorRate) monotonicSteps += 1;
  }
  return {
    bandErrorRates,
    monotonicity: monotonicSteps / (order.length - 1),
    overallErrorRate: overallTotal > 0 ? overallWrong / overallTotal : 0,
  };
}
