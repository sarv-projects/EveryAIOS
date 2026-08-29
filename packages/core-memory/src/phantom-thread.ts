/**
 * Algorithm #10 — Phantom Thread (Activity-Aware Memory Pre-Loading)
 * ==================================================================
 * Idea: instead of *waiting* for a query to arrive and then recalling memory
 * synchronously (adding TTFT), pre-load a small "warm" memory set when the user
 * starts a new activity (opens a book, opens a project, starts a chat turn).
 * The warm set is injected into the next prompt assembly at zero extra latency.
 *
 * Design principles (from the 2026-08-02 research pass):
 * - The preload is *non-intrusive*: only a bounded top-N (default 5) facts move
 *   into the warm set, so it can never crowd the prompt.
 * - Activity signals: activeFileId, projectId, recentTopics (tokens), plus a
 *   recency signal (facts accessed in the last 7 days win).
 * - Leakage guard: facts that share zero topic tokens with the activity are
 *   never preloaded — the leakage test enforces this numerically.
 *
 * Scoring contract (mirrored in tests):
 *   score = 0.5 × topicOverlap(fact, activity)
 *         + 0.3 × recencyBoost(fact)          (≤1.0 for last-7-day access)
 *         + 0.2 × categoryMatch(fact, activity)
 *   Preload = top-N by score, subject to topicOverlap > 0 (hard leakage floor).
 */

export interface PhantomActivity {
  activeFileId?: string;
  projectId?: string;
  /** Topic tokens gleaned from the open document / recent conversation. */
  recentTopics: string[];
  /** ISO timestamps of recent user activity (for recency weighting). */
  recentActivityAt?: string[];
}

export interface PhantomFact {
  id: number;
  content: string;
  category: string;
  sourceId?: string;
  projectId?: string;
  /** ISO timestamp of last recall/access. */
  lastAccess?: string;
  tags?: string[];
}

export interface PreloadOptions {
  /** Max facts to warm. Default 5. */
  topN?: number;
  /** Minimum topic overlap (0..1) — hard leakage floor. Default 0. */
  minOverlap?: number;
  /** Days of "recent" access for the recency boost. Default 7. */
  recencyDays?: number;
}

function topicTokens(fact: PhantomFact): string[] {
  const source = `${fact.content} ${(fact.tags ?? []).join(' ')}`;
  return source
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Jaccard overlap between the fact's tokens and the activity's topic tokens. */
export function topicOverlap(fact: PhantomFact, activity: PhantomActivity): number {
  const factTokens = new Set(topicTokens(fact));
  const activityTokens = new Set(activity.recentTopics.map((t) => t.toLowerCase()));
  if (factTokens.size === 0 || activityTokens.size === 0) return 0;
  let inter = 0;
  for (const t of factTokens) if (activityTokens.has(t)) inter += 1;
  return inter / Math.min(factTokens.size, activityTokens.size);
}

/** 1.0 if accessed in the last recencyDays, else 0. */
export function recencyBoost(fact: PhantomFact, recencyDays = 7): number {
  if (!fact.lastAccess) return 0;
  const then = new Date(fact.lastAccess).getTime();
  if (Number.isNaN(then)) return 0;
  const days = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return days <= recencyDays ? 1.0 : 0;
}

/** 1.0 when fact.projectId matches the activity's project. */
export function categoryMatch(fact: PhantomFact, activity: PhantomActivity): number {
  return fact.projectId && fact.projectId === activity.projectId ? 1.0 : 0;
}

export function scoreFact(fact: PhantomFact, activity: PhantomActivity, options: PreloadOptions = {}): number {
  const overlap = topicOverlap(fact, activity);
  const recency = recencyBoost(fact, options.recencyDays ?? 7);
  const category = categoryMatch(fact, activity);
  return 0.5 * overlap + 0.3 * recency + 0.2 * category;
}

/**
 * Pre-load the warm memory set. Facts with zero topic overlap are excluded
 * (leakage floor) unless explicitly allowed via minOverlap = 0. Returns the
 * ranked warm set, always bounded by topN.
 */
export function preloadForActivity(
  facts: PhantomFact[],
  activity: PhantomActivity,
  options: PreloadOptions = {},
): PhantomFact[] {
  const topN = Math.max(1, options.topN ?? 5);
  const minOverlap = options.minOverlap ?? 0;
  const scored = facts
    .map((fact) => ({ fact, overlap: topicOverlap(fact, activity), score: scoreFact(fact, activity, options) }))
    // Leakage guard (absolute): a fact sharing ZERO topic tokens with the
    // activity is never preloaded — injecting unrelated memory would pollute
    // the prompt with off-topic context. minOverlap (>0) only raises the bar.
    .filter((entry) => entry.overlap > 0 && entry.overlap >= minOverlap)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((entry) => entry.fact);
}

/** What fraction of a query's content tokens appear in the warm set? */
export function preloadCoverage(preloaded: PhantomFact[], query: string): number {
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (queryTokens.length === 0) return 0;
  const warmTokens = new Set(preloaded.flatMap((f) => topicTokens(f)));
  const hit = queryTokens.filter((t) => warmTokens.has(t)).length;
  return hit / queryTokens.length;
}

/**
 * Effect metric used by the test harness: preloaded coverage vs cold (no
 * preload) coverage for a query about the activity's topic. A useful preload
 * must materially beat cold coverage — otherwise pre-loading is pointless.
 */
export function preloadLift(preloaded: PhantomFact[], baseline: PhantomFact[], query: string): number {
  return preloadCoverage(preloaded, query) - preloadCoverage(baseline, query);
}
