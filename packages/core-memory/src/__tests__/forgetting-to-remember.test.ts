import { describe, expect, it } from 'vitest';
import {
  classifyPolarity,
  detectFrustration,
  lessonStrength,
  lessonSuppressionWeight,
  rankWithPolarity,
  POLARITY_SUPPRESSION,
  POLARITY_OVERLAP_FLOOR,
  tokenOverlap,
  type FactPolarity,
} from '../forgetting-to-remember.js';

const fact = (
  content: string,
  polarity: FactPolarity,
  decayScore = 1.0,
  frustrationCount = 0,
) => ({ id: Math.random(), content, polarity, decayScore, frustrationCount });

describe('#7 Forgetting-to-Remember — polarity classification (lexicon precision)', () => {
  it('classifies clearly-negative lessons as negative', () => {
    expect(classifyPolarity("don't use that payment app — it failed twice")).toBe('negative');
    expect(classifyPolarity('never buy the cheap charger, it crashes')).toBe('negative');
    expect(classifyPolarity('the blue route is unreliable')).toBe('negative');
  });

  it('classifies clearly-positive experiences as positive', () => {
    expect(classifyPolarity('I love the new cafe near work')).toBe('positive');
    expect(classifyPolarity('that app works great and is fast')).toBe('positive');
  });

  it('classifies neutral statements as neutral', () => {
    expect(classifyPolarity('The meeting is at 3pm tomorrow')).toBe('neutral');
  });

  it('negative wins ties (fail-safe for lesson capture)', () => {
    expect(classifyPolarity('good app but it lost my data once')).toBe('negative');
  });
});

describe('#7 — frustration signal detection (regenerate/retry capture)', () => {
  it('detects regenerate / retry / correction language', () => {
    expect(detectFrustration('regenerate that answer')).toBe(true);
    expect(detectFrustration('retry — that was wrong')).toBe(true);
    expect(detectFrustration('no, that\'s not what I meant, again')).toBe(true);
    expect(detectFrustration('you are wrong, fix it')).toBe(true);
  });

  it('does not fire on ordinary questions', () => {
    expect(detectFrustration('what is the weather today?')).toBe(false);
    expect(detectFrustration('summarize this chapter')).toBe(false);
  });
});

describe('#7 — suppression math (numerical contract)', () => {
  it('fresh negative lesson with zero query overlap scores 0.7x', () => {
    const w = lessonSuppressionWeight('negative', 0, { frustrationCount: 1 });
    expect(w).toBeCloseTo(1 - POLARITY_SUPPRESSION * 0.5 * 1, 5); // 0.7
    expect(w).toBeGreaterThanOrEqual(0.4);
  });

  it('seasoned negative lesson (frustration>=3) suppresses to the 0.4 floor', () => {
    const w = lessonSuppressionWeight('negative', 0, { frustrationCount: 3 });
    expect(w).toBeCloseTo(1 - POLARITY_SUPPRESSION * 1.0 * 1, 5); // 0.4
  });

  it('query referencing the lesson rescues it back to ~1.0x', () => {
    const w = lessonSuppressionWeight('negative', POLARITY_OVERLAP_FLOOR, { frustrationCount: 1 });
    expect(w).toBeCloseTo(1.0, 5);
  });

  it('neutral and positive facts always pass through at 1.0', () => {
    expect(lessonSuppressionWeight('neutral', 0, { frustrationCount: 0 })).toBe(1.0);
    expect(lessonSuppressionWeight('positive', 0, { frustrationCount: 0 })).toBe(1.0);
  });
});

describe('#7 — recall re-ranking (the actual effect)', () => {
  const neutralFact = fact('I use the blue metro line to work', 'neutral', 1.0);
  const negativeLesson = fact("the red metro line is always delayed — don't take it", 'negative', 1.0, 2);
  const positiveFact = fact('I like the coffee at the office', 'positive', 1.0);

  it('suppresses the negative lesson below neutral/positive in general recall', () => {
    const ranked = rankWithPolarity([neutralFact, negativeLesson, positiveFact], 'morning commute');
    expect(ranked[ranked.length - 1]).toBe(negativeLesson);
  });

  it('rescues the lesson when the query references it (avoidance question)', () => {
    const ranked = rankWithPolarity([neutralFact, negativeLesson, positiveFact], 'which metro line should I avoid?');
    expect(ranked[0]).toBe(negativeLesson);
  });

  it('includeLessons=true surfaces lessons without query match', () => {
    const ranked = rankWithPolarity([neutralFact, negativeLesson, positiveFact], 'anything', true);
    expect(ranked).toContain(negativeLesson);
    // no suppression applied — order preserved by input stability
    expect(ranked.length).toBe(3);
  });

  it('is deterministic — same input, same order', () => {
    const a = rankWithPolarity([neutralFact, negativeLesson, positiveFact], 'morning commute');
    const b = rankWithPolarity([neutralFact, negativeLesson, positiveFact], 'morning commute');
    expect(a.map((f) => f.content)).toEqual(b.map((f) => f.content));
  });
});

describe('#7 — lesson strength ramp', () => {
  it('ramps 0.5 (fresh) → 1.0 (seasoned) with frustration count', () => {
    expect(lessonStrength({ frustrationCount: 0 })).toBeCloseTo(0.25, 5);
    expect(lessonStrength({ frustrationCount: 1 })).toBeCloseTo(0.5, 5);
    expect(lessonStrength({ frustrationCount: 2 })).toBeCloseTo(0.75, 5);
    expect(lessonStrength({ frustrationCount: 3 })).toBeCloseTo(1.0, 5);
  });

  it('access count adds a small boost up to 0.15', () => {
    expect(lessonStrength({ frustrationCount: 1, accessCount: 5 })).toBeCloseTo(0.65, 5);
    expect(lessonStrength({ frustrationCount: 0, accessCount: 5 })).toBeCloseTo(0.4, 5);
  });
});

describe('#7 — token overlap gate', () => {
  it('computes Jaccard-ish overlap between query and fact', () => {
    expect(tokenOverlap('avoid red line', 'red line delayed')).toBeGreaterThan(0.3);
    expect(tokenOverlap('coffee shop', 'red line metro')).toBe(0);
  });
});
