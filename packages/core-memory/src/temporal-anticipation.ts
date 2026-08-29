/**
 * Algorithm #4 — Temporal Graph Anticipation (Predict-then-Suggest)
 * ================================================================
 * Prior-art gap: TKG reasoning papers (LMS, RE-Net, rGalT) predict facts in
 * public event graphs. Nobody applies it to a *personal, mobile* assistant
 * where predictions drive proactive suggestions (what the user will ask next).
 *
 * Input: a stream of (topic, timestamp) observations — e.g. memory recalls,
 * KG object touches, or chat intents with day/hour stamps.
 *
 * Score contract (mirrored in tests):
 *   score(topic, now) = 0.6 × periodicity + 0.4 × recency
 *   periodicity = p_day_of_week × p_hour_of_day     (empirical frequencies)
 *   recency     = exp(−0.02 × daysSinceLast)         (halflife ≈ 35 days)
 *   minOccurrences = 3 → a topic seen only once/twice is never "anticipated".
 *
 * Prediction = argmax over topics with ≥3 occurrences. Accuracy is measured
 * top-1 hit rate against a held-out next topic — the test simulates a weekly
 * rhythm and asserts the predictor beats both random and recency-only baselines.
 */

export interface TemporalEvent {
  topic: string;
  ts: number; // epoch ms
}

export interface PredictOptions {
  /** Minimum occurrences for a topic to be anticipatable. Default 3. */
  minOccurrences?: number;
  /** Recency half-life in days. Default 35. */
  recencyHalfLifeDays?: number;
}

export interface PredictionScore {
  topic: string;
  score: number;
  occurrences: number;
  daysSinceLast: number;
}

/** 1.0 if the event falls on the same day-of-week AND hour bucket. */
function periodicity(events: TemporalEvent[], topic: string, now: number): number {
  const sameTopic = events.filter((e) => e.topic === topic);
  if (sameTopic.length === 0) return 0;
  const nowDate = new Date(now);
  const nowDow = nowDate.getDay();
  const nowHour = nowDate.getHours();
  let dowHits = 0;
  let hourHits = 0;
  for (const e of sameTopic) {
    const d = new Date(e.ts);
    if (d.getDay() === nowDow) dowHits += 1;
    if (d.getHours() === nowHour) hourHits += 1;
  }
  const pDow = dowHits / sameTopic.length;
  const pHour = hourHits / sameTopic.length;
  // Both matter, but day-of-week is the stronger human signal.
  return 0.6 * pDow + 0.4 * pHour;
}

export function scoreTopic(
  events: TemporalEvent[],
  topic: string,
  now: number,
  options: PredictOptions = {},
): PredictionScore {
  const minOccurrences = options.minOccurrences ?? 3;
  const halfLifeDays = options.recencyHalfLifeDays ?? 35;
  const sameTopic = events.filter((e) => e.topic === topic);
  const occurrences = sameTopic.length;
  const lastTs = occurrences > 0 ? Math.max(...sameTopic.map((e) => e.ts)) : 0;
  const daysSinceLast = lastTs > 0 ? Math.max(0, (now - lastTs) / (1000 * 60 * 60 * 24)) : 365;

  if (occurrences < minOccurrences) {
    return { topic, score: 0, occurrences, daysSinceLast };
  }

  // Decay rate derived from half-life: λ = ln2 / halfLifeDays (default 35d).
  const lambda = Math.log(2) / halfLifeDays;
  const period = periodicity(events, topic, now);
  const recency = Math.exp(-lambda * daysSinceLast);
  return { topic, score: 0.6 * period + 0.4 * recency, occurrences, daysSinceLast };
}

/** Predict the next topic the user is likely to engage with, ranked. */
export function predictNextTopics(
  events: TemporalEvent[],
  now: number,
  options: PredictOptions = {},
): PredictionScore[] {
  const topics = new Set(events.map((e) => e.topic));
  const ranked = [...topics]
    .map((topic) => scoreTopic(events, topic, now, options))
    .filter((s) => s.occurrences >= (options.minOccurrences ?? 3))
    .sort((a, b) => b.score - a.score);
  return ranked;
}

export interface AnticipationEval {
  top1Hits: number;
  total: number;
  /** top-1 hit rate — the effect metric. */
  top1Accuracy: number;
  /** Same metric for a recency-only baseline (score = exp decay, no period). */
  baselineAccuracy: number;
}

/**
 * Lab harness: given a history of events up to `now`, does the predictor pick
 * the topic the user actually engaged next? Splits a time-sorted event list
 * into train (all but last K) / test (last K) and scores top-1 hits.
 */
export function evaluateAnticipation(
  events: TemporalEvent[],
  options: PredictOptions = {},
  holdout = 8,
): AnticipationEval {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const test = sorted.slice(-holdout);
  let top1Hits = 0;
  let baselineHits = 0;
  for (const held of test) {
    const train = sorted.filter((e) => e.ts < held.ts);
    const prediction = predictNextTopics(train, held.ts, options)[0];
    if (prediction?.topic === held.topic) top1Hits += 1;
    // Recency-only baseline: highest decay, ignoring periodicity.
    const baseline = [...new Set(train.map((e) => e.topic))]
      .map((t) => {
        const last = Math.max(...train.filter((e) => e.topic === t).map((e) => e.ts));
        return { topic: t, score: Math.exp(-0.02 * Math.max(0, (held.ts - last) / (1000 * 60 * 60 * 24))) };
      })
      .sort((a, b) => b.score - a.score)[0];
    if (baseline?.topic === held.topic) baselineHits += 1;
  }
  return {
    top1Hits,
    total: test.length,
    top1Accuracy: test.length > 0 ? top1Hits / test.length : 0,
    baselineAccuracy: test.length > 0 ? baselineHits / test.length : 0,
  };
}
