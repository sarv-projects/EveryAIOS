import { describe, expect, it, beforeEach } from 'vitest';
import {
  detectCorrections,
  trackCorrection,
  getCorrectionCount,
  clearCounts,
  seedCorrectionCounts,
} from '../correction-detector.js';

describe('detectCorrections', () => {
  beforeEach(() => {
    clearCounts();
  });

  it('detects "no, use TypeScript" as a format correction', () => {
    const result = detectCorrections(
      'no, use TypeScript instead of JavaScript',
      'Here is some JavaScript code...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('format');
    expect(result!.pattern.toLowerCase()).toContain('use typescript');
    expect(result!.sourceExamples).toHaveLength(1);
    expect(result!.sourceExamples[0]).toBe('no, use TypeScript instead of JavaScript');
  });

  it('detects "I prefer bullet points" as a style correction', () => {
    const result = detectCorrections(
      'I prefer bullet points for lists',
      'Here is a paragraph...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('style');
    expect(result!.pattern.toLowerCase()).toContain('bullet points');
  });

  it('does NOT false-positive on "no, the answer is 42"', () => {
    const result = detectCorrections(
      'no, the answer is 42',
      'I think the answer might be 43...',
      [],
    );

    expect(result).toBeNull();
  });

  it('does NOT false-positive on questions', () => {
    const result = detectCorrections(
      'Can you explain that again?',
      'Sure, let me explain...',
      [],
    );

    expect(result).toBeNull();
  });

  it('does NOT false-positive on very short messages', () => {
    const result = detectCorrections('no', 'Okay...', []);
    expect(result).toBeNull();
  });

  it('detects "stop using jargon" as a behavior correction', () => {
    const result = detectCorrections(
      'stop using technical jargon in your responses',
      'The implementation utilizes a bidirectional...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('behavior');
    expect(result!.pattern.toLowerCase()).toContain('technical jargon');
  });

  it('detects "use X not Y" format swap as format correction', () => {
    const result = detectCorrections(
      'use Markdown not HTML for formatting',
      'Here is the HTML formatted version...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('format');
    expect(result!.pattern.toLowerCase()).toContain('markdown not html');
  });

  it('detects "never say that again" as behavior correction', () => {
    const result = detectCorrections(
      'never say "as an AI" again',
      'As an AI, I would recommend...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('behavior');
    expect(result!.pattern).toContain('as an AI');
  });

  it('detects "always include citations" as a correction', () => {
    const result = detectCorrections(
      'please always include citations in your answers',
      'Here is some information...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.pattern.toLowerCase()).toContain('include citations');
  });

  it('returns null for purely factual disagreement', () => {
    const result = detectCorrections(
      'wrong, the capital of France is Paris',
      'The capital of France is Lyon...',
      [],
    );

    expect(result).toBeNull();
  });

  it('returns null for "I prefer dogs to cats" (opinion, not AI behavior)', () => {
    const result = detectCorrections(
      'I prefer dogs to cats',
      'Cats make great pets too...',
      [],
    );

    expect(result).toBeNull();
  });

  it('returns null for "I prefer a different approach" without directive context', () => {
    const result = detectCorrections(
      'I prefer a different approach to this problem',
      'Here is one approach...',
      [],
    );

    expect(result).toBeNull();
  });

  it('detects "don\'t do that" as behavior correction', () => {
    const result = detectCorrections(
      "don't do that, always check with me first",
      'I will go ahead and...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('behavior');
  });

  it('detects "not like that, use async/await" as format correction', () => {
    const result = detectCorrections(
      'not like that, use async/await',
      'Here is the callback-based approach...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('format');
  });

  it('detects "no, include more detail" as content correction', () => {
    const result = detectCorrections(
      'no, include more detail in your explanation',
      'Here is a brief summary...',
      [],
    );

    expect(result).not.toBeNull();
    expect(result!.category).toBe('content');
  });

  it('computes higher confidence for stronger signals', () => {
    const weak = detectCorrections(
      'I prefer shorter responses',
      'Here is a long detailed response...',
      [],
    );
    const strong = detectCorrections(
      'no, I always want shorter responses, never write more than 2 paragraphs',
      'Here is a long detailed response across many paragraphs...',
      [],
    );

    expect(weak).not.toBeNull();
    expect(strong).not.toBeNull();
    expect(strong!.confidence).toBeGreaterThan(weak!.confidence);
  });

  describe('does NOT false-positive on factual corrections with negation', () => {
    it.each([
      ['no, the event happened in 2023', 'The event happened in 2024...'],
      ['no, my name is John not Jane', 'Hi Jane...'],
      ['no, I live in New York', 'You live in Boston...'],
      ['wrong, that costs $50', 'That costs $40...'],
      ["no, that's not correct, the value is 100", 'The value is 200...'],
    ])('"%s" is not a behavioral correction', (userMsg, asstMsg) => {
      const result = detectCorrections(userMsg, asstMsg, []);
      expect(result).toBeNull();
    });
  });
});

describe('trackCorrection', () => {
  beforeEach(() => {
    clearCounts();
  });

  it('starts count at 1 for first correction', () => {
    const { count, shouldPromote } = trackCorrection('always use TypeScript');
    expect(count).toBe(1);
    expect(shouldPromote).toBe(false);
  });

  it('increments count on repeated corrections', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    const { count } = trackCorrection('always use TypeScript');
    expect(count).toBe(3);
  });

  it('tracks different patterns independently', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('use Markdown not HTML');

    expect(getCorrectionCount('always use TypeScript')).toBe(1);
    expect(getCorrectionCount('use Markdown not HTML')).toBe(1);
  });

  it('promotes at threshold 3', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    const { shouldPromote } = trackCorrection('always use TypeScript');
    expect(shouldPromote).toBe(true);
  });

  it('does not promote before threshold', () => {
    trackCorrection('always use TypeScript');
    const { shouldPromote } = trackCorrection('always use TypeScript');
    expect(shouldPromote).toBe(false);
  });

  it('continues promoting after threshold', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    const { shouldPromote, count } = trackCorrection('always use TypeScript');
    expect(shouldPromote).toBe(true);
    expect(count).toBe(4);
  });
});

describe('getCorrectionCount', () => {
  beforeEach(() => {
    clearCounts();
  });

  it('returns 0 for unknown pattern', () => {
    expect(getCorrectionCount('unknown pattern')).toBe(0);
  });

  it('returns correct count for tracked pattern', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    expect(getCorrectionCount('always use TypeScript')).toBe(2);
  });
});

describe('seedCorrectionCounts', () => {
  beforeEach(() => {
    clearCounts();
  });

  it('loads persisted counts', () => {
    seedCorrectionCounts([{ pattern: 'always use TypeScript', count: 2 }]);
    expect(getCorrectionCount('always use TypeScript')).toBe(2);
  });

  it('does not overwrite higher existing counts', () => {
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    trackCorrection('always use TypeScript');
    seedCorrectionCounts([{ pattern: 'always use TypeScript', count: 1 }]);
    expect(getCorrectionCount('always use TypeScript')).toBe(3);
  });
});

describe('correctionConfidenceFromCount', () => {
  it('maps count 1 to 0.3', async () => {
    const { correctionConfidenceFromCount } = await import('../correction-store.js');
    expect(correctionConfidenceFromCount(1)).toBe(0.3);
  });

  it('maps count 2 to 0.5', async () => {
    const { correctionConfidenceFromCount } = await import('../correction-store.js');
    expect(correctionConfidenceFromCount(2)).toBe(0.5);
  });

  it('maps count 3 to 0.7', async () => {
    const { correctionConfidenceFromCount } = await import('../correction-store.js');
    expect(correctionConfidenceFromCount(3)).toBe(0.7);
  });

  it('maps count 4 to 0.9 (cap)', async () => {
    const { correctionConfidenceFromCount } = await import('../correction-store.js');
    expect(correctionConfidenceFromCount(4)).toBe(0.9);
  });

  it('caps at 0.9 for higher counts', async () => {
    const { correctionConfidenceFromCount } = await import('../correction-store.js');
    expect(correctionConfidenceFromCount(10)).toBe(0.9);
  });
});
