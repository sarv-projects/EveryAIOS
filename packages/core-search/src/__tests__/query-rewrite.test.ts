import { describe, expect, it } from 'vitest';
import { rewriteSearchQuery } from '../query-rewrite.js';

const FIXED_NOW = new Date('2026-07-04T12:00:00.000Z');

describe('rewriteSearchQuery', () => {
  it('expands "today" to the current date', () => {
    const result = rewriteSearchQuery('news today', FIXED_NOW);
    expect(result).toContain('2026-07-04');
  });

  it('expands "yesterday" and "tomorrow"', () => {
    expect(rewriteSearchQuery('headlines yesterday', FIXED_NOW)).toContain('2026-07-03');
    expect(rewriteSearchQuery('events tomorrow', FIXED_NOW)).toContain('2026-07-05');
  });

  it('strips filler words', () => {
    const result = rewriteSearchQuery('please tell me about the latest AI news today', FIXED_NOW);
    expect(result.toLowerCase()).not.toMatch(/\bplease\b/);
    expect(result.toLowerCase()).not.toMatch(/\btell\b/);
    expect(result.toLowerCase()).not.toMatch(/\bme\b/);
    expect(result).toContain('latest');
    expect(result).toContain('news');
  });

  it('adds quotes around proper nouns and years', () => {
    const result = rewriteSearchQuery('OpenAI GPT updates 2026', FIXED_NOW);
    expect(result).toContain('"OpenAI"');
    expect(result).toContain('"2026"');
  });

  it('returns empty string for blank input', () => {
    expect(rewriteSearchQuery('   ')).toBe('');
  });

  it('preserves meaningful tokens after rewrite', () => {
    const result = rewriteSearchQuery('what is the stock price of Tesla today', FIXED_NOW);
    expect(result.toLowerCase()).toContain('stock');
    expect(result.toLowerCase()).toContain('price');
    expect(result).toContain('Tesla');
  });
});