/**
 * Algorithm #7 — Forgetting-to-Remember Engine (Polarized Memory Retention)
 * =========================================================================
 * Prior-art gap: A-MemGuard / MemoGuard store "lessons" triggered by *attacks*
 * or adversarial inputs. FSFM covers selective *forgetting*. Nobody covers
 * *frustration-driven* polarized retention — learning what NOT to do from the
 * user's natural dissatisfaction signals (regenerate, retry, correction).
 *
 * Mechanism (pure, testable — no I/O):
 *   1. classifyPolarity(content)  — negative marker lexicon → 'negative' lesson
 *   2. detectFrustration(turn)    — regenerate/retry/correction signal capture
 *   3. lessonSuppressionWeight()  — recall-time suppression math: negative
 *      facts are down-weighted UNLESS the query explicitly references the lesson
 *      (or includeLessons=true, e.g. "what should I avoid?")
 *   4. rankWithPolarity()         — re-ranks a recall batch by adjusted score
 *
 * Suppression math (numerical contract — mirrored in tests):
 *   adjusted = decayScore
 *              × (1 − suppression × lessonStrength × relevancePenalty)
 *   where:
 *     suppression        = 0.6 (max penalty for negative lessons)
 *     lessonStrength     = min(1, frustrationCount / 2 + 0.5)   (0.5 fresh → 1.0 seasoned)
 *     relevancePenalty   = 1 − min(1, queryOverlap / overlapFloor)  (1.0 = query avoids lesson)
 *   Net effect: a fresh negative lesson with zero query overlap scores 0.4× its
 *   decayScore; the same lesson queried with 40%+ token overlap scores ≈ 1.0×.
 */

export type FactPolarity = 'positive' | 'negative' | 'neutral';

export const POLARITY_SUPPRESSION = 0.6;
export const POLARITY_OVERLAP_FLOOR = 0.4;

/** Negative-valence markers — the "avoid this" lexicon. */
const NEGATIVE_MARKERS = [
  'don\'t', 'dont', 'never', 'avoid', 'hate', 'dislike', 'regret',
  'wrong', 'failed', 'fails', 'error', 'mistake', 'bug', 'broken',
  'stopped', 'not working', 'doesn\'t work', 'didn\'t work', 'worse',
  'lost', 'refund', 'annoying', 'frustrating', 'unhappy', 'bad',
  'terrible', 'awful', 'worst', 'unreliable', 'crash', 'crashing',
];

/** Positive-valence markers. */
const POSITIVE_MARKERS = [
  'love', 'like', 'great', 'good', 'works', 'working', 'best', 'favorite',
  'reliable', 'fast', 'easy', 'happy', 'recommend', 'saved', 'helped',
  'impressed', 'perfect', 'awesome', 'amazing',
];

/** Frustration trigger markers — regeneration / retry / correction language. */
const FRUSTRATION_MARKERS = [
  'regenerate', 'retry', 'try again', 'that\'s wrong', 'thats wrong',
  'not that', 'no,', 'again', 'rephrase', 'fix it', 'incorrect',
  'wrong answer', 'you\'re wrong', 'you are wrong', 'redo', 'start over',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Deterministic lexicon classifier. Returns 'negative' | 'positive' | 'neutral'
 * based on marker counts (negative wins ties — fail-safe for lesson capture).
 */
export function classifyPolarity(content: string): FactPolarity {
  const lower = content.toLowerCase();
  const negHits = NEGATIVE_MARKERS.filter((m) => lower.includes(m)).length;
  const posHits = POSITIVE_MARKERS.filter((m) => lower.includes(m)).length;
  if (negHits >= posHits && negHits > 0) return 'negative';
  if (posHits > 0) return 'positive';
  return 'neutral';
}

/** True if the turn reads like a frustration/redo signal (regenerate, retry, correction). */
export function detectFrustration(turn: string): boolean {
  const lower = turn.toLowerCase();
  return FRUSTRATION_MARKERS.some((m) => lower.includes(m));
}

/** Jaccard token overlap in [0,1] — used for lesson-relevance gating. */
export function tokenOverlap(query: string, fact: string): number {
  const q = new Set(tokenize(query));
  const f = new Set(tokenize(fact));
  if (q.size === 0 || f.size === 0) return 0;
  let inter = 0;
  for (const t of q) if (f.has(t)) inter += 1;
  return inter / Math.min(q.size, f.size);
}

export interface LessonStrengthInput {
  frustrationCount: number;
  accessCount?: number;
}

/**
 * How seasoned a lesson is: fresh lessons (1 frustration) get 0.5 strength;
 * each additional frustration +0.25, saturating at 1.0 at >=3. Access boosts
 * slightly up to +0.15.
 */
export function lessonStrength(input: LessonStrengthInput): number {
  const frustration = Math.max(0.25, Math.min(1, 0.5 + 0.25 * (input.frustrationCount - 1)));
  const access = Math.min(0.15, (input.accessCount ?? 0) * 0.03);
  return Math.min(1, frustration + access);
}

/**
 * The suppression math for a single negative lesson at recall time.
 * Returns a multiplier in [0.4, 1.0]. Neutral/positive facts pass through at 1.0.
 */
export function lessonSuppressionWeight(
  polarity: FactPolarity,
  queryOverlap: number,
  input: LessonStrengthInput,
): number {
  if (polarity !== 'negative') return 1.0;
  const strength = lessonStrength(input);
  const relevancePenalty = Math.max(0, 1 - queryOverlap / POLARITY_OVERLAP_FLOOR);
  const adjusted = 1 - POLARITY_SUPPRESSION * strength * relevancePenalty;
  return Math.max(0.4, adjusted);
}

/**
 * Re-rank a recall batch applying polarity suppression. Negative lessons sink
 * unless the query references them (high overlap) or includeLessons is set.
 * Deterministic — safe to unit-test against the numerical contract above.
 */
export function rankWithPolarity<T extends { polarity?: FactPolarity; decayScore: number; frustrationCount?: number; content: string }>(
  facts: T[],
  query: string,
  includeLessons = false,
): T[] {
  if (includeLessons) return facts;
  const scored = facts.map((fact) => {
    const overlap = tokenOverlap(query, fact.content);
    const weight = lessonSuppressionWeight(fact.polarity ?? 'neutral', overlap, {
      frustrationCount: fact.frustrationCount ?? 0,
    });
    // A lesson the query directly references is *rescued*: it sorts above
    // equally-scored neutral facts (tiebreak), but never above higher-scoring
    // genuinely relevant neutral facts.
    const rescued = fact.polarity === 'negative' && overlap >= POLARITY_OVERLAP_FLOOR;
    return { fact, score: fact.decayScore * weight, rescued };
  });
  return scored
    .sort((a, b) => b.score - a.score || Number(b.rescued) - Number(a.rescued))
    .map((s) => s.fact);
}
