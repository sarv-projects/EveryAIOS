import { describe, expect, it } from 'vitest';
import { inferMemoryCategoriesFromQuery, memoryCategoriesForIntent } from '../categories.js';

describe('memory category inference', () => {
  it('detects finance queries', () => {
    expect(inferMemoryCategoriesFromQuery('upcoming tax payment')).toContain('finance');
  });

  it('detects book queries', () => {
    expect(inferMemoryCategoriesFromQuery('who is the main character in this book')).toContain('books');
  });

  it('scopes reader mode to books', () => {
    const cats = memoryCategoriesForIntent('needs-files', 'summarize chapter 3', {
      openDocumentId: 'file-abc',
    });
    expect(cats).toEqual(['books']);
  });
});