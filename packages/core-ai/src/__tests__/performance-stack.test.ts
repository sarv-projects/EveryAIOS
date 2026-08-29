import { describe, expect, it } from 'vitest';
import { QuestionCache, ReaderPerformanceStack } from '../retrieval/performance-stack.js';

describe('ReaderPerformanceStack', () => {
  it('tracks chaptersReady UI state during lazy ingest', async () => {
    const stack = new ReaderPerformanceStack();
    const embedded: number[] = [];

    const state = await stack.lazyChapterIngest({
      fileId: 'book-1',
      chapters: ['ch1', 'ch2', 'ch3', 'ch4'],
      readingPosition: 2,
      onChapterEmbedded: (index) => embedded.push(index),
    });

    expect(state).toEqual({ chaptersReady: 4, chaptersTotal: 4 });
    expect(stack.getChaptersReady('book-1')).toEqual(state);
    expect(embedded[0]).toBe(2);
  });

  it('caches answers for 24h in questionCache', () => {
    const cache = new QuestionCache();
    cache.set('What is the notice period?', 'book-1', '90 days');
    expect(cache.get('What is the notice period?', 'book-1')).toBe('90 days');
    expect(cache.get('unrelated question', 'book-1')).toBeUndefined();
  });
});