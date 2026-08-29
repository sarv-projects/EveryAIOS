import { describe, expect, it } from 'vitest';
import { rerankByBm25 } from '../bm25-rerank.js';

describe('rerankByBm25', () => {
  it('returns empty array for no items', () => {
    expect(rerankByBm25('fusion reactor', [])).toEqual([]);
  });

  it('ranks the most relevant snippet highest', () => {
    const ranked = rerankByBm25('fusion reactor design', [
      {
        url: 'https://irrelevant.test',
        title: 'Cooking pasta',
        text: 'Boil water and add salt for perfect pasta.',
      },
      {
        url: 'https://relevant.test',
        title: 'Fusion reactor overview',
        text: 'Tokamak fusion reactor design uses magnetic confinement for plasma.',
      },
      {
        url: 'https://partial.test',
        title: 'Energy news',
        text: 'Solar panels are cheaper this year.',
      },
    ]);

    expect(ranked[0]!.url).toBe('https://relevant.test');
    expect(ranked[0]!.score).toBeGreaterThan(0);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[2]!.score);
  });

  it('includes score on each ranked item', () => {
    const ranked = rerankByBm25('typescript testing', [
      { url: 'https://a.test', text: 'vitest typescript unit tests' },
      { url: 'https://b.test', text: 'gardening tips for spring' },
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked.every((item) => typeof item.score === 'number')).toBe(true);
  });

  it('uses title text in relevance scoring', () => {
    const ranked = rerankByBm25('bm25 rerank', [
      { url: 'https://a.test', title: 'BM25 rerank algorithm', text: 'short' },
      { url: 'https://b.test', title: 'Unrelated', text: 'bm25 rerank algorithm details and scoring' },
    ]);

    expect(ranked[0]!.url).toBe('https://a.test');
  });
});