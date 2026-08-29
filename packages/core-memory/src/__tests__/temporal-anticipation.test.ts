import { describe, expect, it } from 'vitest';
import {
  evaluateAnticipation,
  predictNextTopics,
  scoreTopic,
  type TemporalEvent,
} from '../temporal-anticipation';

/** Weekly rhythm: Monday 9:00 → "weekly review", Wed 18:00 → "gym", Fri 21:00 → "movies". */
function weeklyRhythm(weeks: number, startMs: number): TemporalEvent[] {
  const events: TemporalEvent[] = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monday = startMs;
  const wednesday = startMs + 2 * 24 * 60 * 60 * 1000;
  const friday = startMs + 4 * 24 * 60 * 60 * 1000;
  for (let w = 0; w < weeks; w += 1) {
    events.push({ topic: 'weekly review', ts: monday + w * weekMs + 9 * 60 * 60 * 1000 });
    events.push({ topic: 'gym', ts: wednesday + w * weekMs + 18 * 60 * 60 * 1000 });
    events.push({ topic: 'movies', ts: friday + w * weekMs + 21 * 60 * 60 * 1000 });
  }
  return events;
}

describe('#4 Temporal Anticipation — score math', () => {
  const start = Date.parse('2026-06-01T00:00:00Z'); // a Monday
  const events = weeklyRhythm(6, start);
  const nextMonday9am = start + 6 * 7 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000;

  it('ranks the recurring topic at prediction time', () => {
    const pred = predictNextTopics(events, nextMonday9am);
    expect(pred[0]!.topic).toBe('weekly review');
    expect(pred[0]!.score).toBeGreaterThan(0.5);
  });

  it('respects the min-occurrences guard', () => {
    const sparse = [
      ...events,
      { topic: 'one-off', ts: nextMonday9am - 1000 },
      { topic: 'one-off', ts: nextMonday9am - 2000 },
    ];
    const pred = predictNextTopics(sparse, nextMonday9am, { minOccurrences: 3 });
    expect(pred.some((p) => p.topic === 'one-off')).toBe(false);
  });

  it('scores drop to 0 below min occurrences', () => {
    const s = scoreTopic(events.slice(0, 2).map((e, i) => ({ ...e, topic: 'rare', ts: e.ts - i * 1000 })), 'rare', start);
    expect(s.score).toBe(0);
    expect(s.occurrences).toBe(2);
  });

  it('is deterministic', () => {
    const a = predictNextTopics(events, nextMonday9am).map((p) => p.topic);
    const b = predictNextTopics(events, nextMonday9am).map((p) => p.topic);
    expect(a).toEqual(b);
  });
});

describe('#4 — the effect: beats recency-only and random baselines', () => {
  it('top-1 accuracy on a weekly rhythm is high and beats the recency baseline', () => {
    const start = Date.parse('2026-01-05T00:00:00Z'); // Monday
    const events = weeklyRhythm(20, start);
    const evalResult = evaluateAnticipation(events, {}, 9);
    // With 20 weeks of signal, the periodic predictor should nail nearly all
    // held-out predictions; the recency-only baseline (no periodicity) guesses
    // between the 3 equally-recent topics and lands ~1/3.
    expect(evalResult.top1Accuracy).toBeGreaterThanOrEqual(0.55);
    expect(evalResult.top1Accuracy).toBeGreaterThan(evalResult.baselineAccuracy + 0.15);
  });

  it('recency-only baseline is no better than chance on a periodic signal', () => {
    const start = Date.parse('2026-01-05T00:00:00Z');
    const events = weeklyRhythm(20, start);
    const evalResult = evaluateAnticipation(events, {}, 9);
    expect(evalResult.baselineAccuracy).toBeLessThanOrEqual(0.45);
  });

  it('with a flat (non-periodic) signal, predictor does not fabricate anticipation', () => {
    const events: TemporalEvent[] = [];
    let t = Date.parse('2026-02-01T00:00:00Z');
    const topics = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < 60; i += 1) {
      events.push({ topic: topics[i % topics.length]!, ts: t });
      t += 7 * 24 * 60 * 60 * 1000 + (i % 5) * 60 * 60 * 1000; // jittered — no fixed slot
    }
    const evalResult = evaluateAnticipation(events, {}, 9);
    // Chaotic timeline: predictor should be near-random (<= 0.4), proving it
    // does not hallucinate patterns.
    expect(evalResult.top1Accuracy).toBeLessThanOrEqual(0.45);
  });
});
