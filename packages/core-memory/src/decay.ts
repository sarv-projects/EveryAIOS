/** Spec §8.3 — λ=0.03 recency decay (half-life ≈23 days). */
export const DECAY_LAMBDA = 0.03;
export const ARCHIVE_THRESHOLD = 0.15;

export interface DecayInput {
  accessCount: number;
  lastAccess: string | null;
  confidence: number;
  pinned: boolean;
  storedAt: string;
}

export function daysSince(isoDate: string | null, now = Date.now()): number {
  if (!isoDate) {
    return 365;
  }
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) {
    return 365;
  }
  return Math.max(0, (now - then) / (1000 * 60 * 60 * 24));
}

/** score = 0.5·exp(−λ·days) + 0.3·min(1, log10(1+access)/2) + 0.2·confidence */
export function computeDecayScore(input: DecayInput, now = Date.now()): number {
  if (input.pinned) {
    return 1.0;
  }

  const anchor = input.lastAccess ?? input.storedAt;
  const days = daysSince(anchor, now);
  const recency = 0.5 * Math.exp(-DECAY_LAMBDA * days);
  const frequency = 0.3 * Math.min(1, Math.log10(1 + input.accessCount) / 2);
  const confidence = 0.2 * input.confidence;
  return recency + frequency + confidence;
}

export function confidenceFromCandidate(confidence: 'high' | 'low'): number {
  return confidence === 'high' ? 1.0 : 0.6;
}

export function isArchived(score: number): boolean {
  return score < ARCHIVE_THRESHOLD;
}

/** Returns true when the last decay run is absent or older than 24h. */
export function shouldRunDecay(lastDecayTimestamp: number | null): boolean {
  if (lastDecayTimestamp === null) return true;
  return Date.now() - lastDecayTimestamp > 24 * 60 * 60 * 1000;
}
