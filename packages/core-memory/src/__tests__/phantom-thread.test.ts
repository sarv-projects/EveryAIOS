import { describe, expect, it } from 'vitest';
import {
  preloadForActivity,
  preloadCoverage,
  preloadLift,
  scoreFact,
  topicOverlap,
  type PhantomActivity,
  type PhantomFact,
} from '../phantom-thread.js';

const bookFact = (id: number, content: string, extra: Partial<PhantomFact> = {}): PhantomFact => ({
  id,
  content,
  category: 'books',
  projectId: 'proj-dune',
  lastAccess: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1h ago → recent
  ...extra,
});

const financeFact = (id: number, content: string): PhantomFact => ({
  id,
  content,
  category: 'finance',
  projectId: 'proj-tax',
});

describe('#10 Phantom Thread — topic overlap', () => {
  it('scores high overlap for same-topic facts', () => {
    const activity: PhantomActivity = { recentTopics: ['dune', 'arrakis', 'spice', 'paul'] };
    const f = bookFact(1, 'Paul Atreides arrives on Arrakis for the spice trade.');
    expect(topicOverlap(f, activity)).toBeGreaterThan(0.2);
  });

  it('scores zero overlap for unrelated facts', () => {
    const activity: PhantomActivity = { recentTopics: ['dune', 'arrakis', 'spice'] };
    const f = financeFact(2, 'ITR filing deadline is 31 July for this year.');
    expect(topicOverlap(f, activity)).toBe(0);
  });
});

describe('#10 — preload selection', () => {
  const duneActivity: PhantomActivity = {
    activeFileId: 'book-dune',
    projectId: 'proj-dune',
    recentTopics: ['dune', 'arrakis', 'spice', 'paul', 'atreides'],
  };

  const facts: PhantomFact[] = [
    bookFact(1, 'Paul Atreides arrives on Arrakis for the spice trade.'),
    bookFact(2, 'The Fremen live deep in the deserts of Arrakis.'),
    bookFact(3, 'Baron Harkonnen plots against House Atreides.'),
    financeFact(4, 'ITR filing deadline is 31 July.'),
    financeFact(5, 'Mutual fund SIP grows 12% annually.'),
    bookFact(6, 'Arrakis spice extends human life dramatically.', { lastAccess: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() }), // 30d old
  ];

  it('preloads the top-N relevant facts (bounded)', () => {
    const warm = preloadForActivity(facts, duneActivity, { topN: 3 });
    expect(warm.length).toBe(3);
    expect(warm.every((f) => topicOverlap(f, duneActivity) > 0)).toBe(true);
  });

  it('leakage guard: zero-overlap facts are never preloaded', () => {
    const warm = preloadForActivity(facts, duneActivity, { topN: 10 });
    expect(warm.some((f) => f.id === 4)).toBe(false);
    expect(warm.some((f) => f.id === 5)).toBe(false);
  });

  it('recency matters: 30-day-old fact ranks below fresh same-topic facts', () => {
    const warm = preloadForActivity(facts, duneActivity, { topN: 5 });
    const idxOld = warm.findIndex((f) => f.id === 6);
    const idxFresh = warm.findIndex((f) => f.id === 1);
    expect(idxFresh).toBeGreaterThanOrEqual(0);
    expect(idxOld).toBeGreaterThan(idxFresh);
  });

  it('is deterministic given the same inputs', () => {
    const a = preloadForActivity(facts, duneActivity, { topN: 3 }).map((f) => f.id);
    const b = preloadForActivity(facts, duneActivity, { topN: 3 }).map((f) => f.id);
    expect(a).toEqual(b);
  });
});

describe('#10 — the effect: coverage lift vs cold recall', () => {
  const duneActivity: PhantomActivity = {
    activeFileId: 'book-dune',
    projectId: 'proj-dune',
    recentTopics: ['dune', 'arrakis', 'spice', 'paul', 'fremen'],
  };
  const facts: PhantomFact[] = [
    financeFact(3, 'ITR filing deadline is 31 July.'),
    financeFact(4, 'Mutual fund SIP grows 12% annually.'),
    bookFact(1, 'Paul Atreides arrives on Arrakis for the spice trade.'),
    bookFact(2, 'The Fremen live deep in the deserts of Arrakis.'),
  ];

  it('warm set covers a question about the activity topic far better than cold', () => {
    const warm = preloadForActivity(facts, duneActivity, { topN: 2 });
    const cold = facts.slice(0, 2); // worst-case cold: first N unrelated
    const lift = preloadLift(warm, cold, 'Where do the Fremen live on Arrakis?');
    expect(lift).toBeGreaterThan(0.15);
    expect(preloadCoverage(warm, 'Where do the Fremen live on Arrakis?')).toBeGreaterThan(0.3);
  });

  it('warm set adds zero coverage for unrelated questions (no hallucination bait)', () => {
    const warm = preloadForActivity(facts, duneActivity, { topN: 2 });
    expect(preloadCoverage(warm, 'When is my ITR deadline?')).toBeLessThanOrEqual(0.2);
  });
});

describe('#10 — scoring weights', () => {
  it('score = 0.5×overlap + 0.3×recency + 0.2×category', () => {
    const activity: PhantomActivity = { recentTopics: ['dune'], projectId: 'proj-dune' };
    const f: PhantomFact = {
      id: 1,
      content: 'Dune is a desert planet.',
      category: 'books',
      projectId: 'proj-dune',
      lastAccess: new Date().toISOString(),
    };
    const overlap = topicOverlap(f, activity); // 1 token overlap of min(1,1) → 1.0
    const expected = 0.5 * overlap + 0.3 * 1.0 + 0.2 * 1.0;
    expect(scoreFact(f, activity)).toBeCloseTo(expected, 5);
  });
});
