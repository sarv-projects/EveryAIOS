import { describe, expect, it } from 'vitest';
import {
  estimateTokens,
  classificationPrefix,
  buildClassificationText,
  slmInputCharBudget,
  prepareSlmInput,
} from '../router/prompt-limits.js';

describe('estimateTokens', () => {
  it("'test' (4 chars) → 1", () => {
    expect(estimateTokens('test'.length)).toBe(1);
  });

  it("'a'.repeat(10) → ceil(10/4) = 3", () => {
    expect(estimateTokens('a'.repeat(10).length)).toBe(3);
  });

  it("'a'.repeat(100) → 25", () => {
    expect(estimateTokens('a'.repeat(100).length)).toBe(25);
  });
});

describe('classificationPrefix', () => {
  it('under 250 chars returned as-is', () => {
    expect(classificationPrefix('short query')).toBe('short query');
  });

  it('over 250 chars truncated to 250 + ellipsis', () => {
    const long = 'a'.repeat(300);
    const result = classificationPrefix(long);
    expect(result).toHaveLength(251);
    expect(result.endsWith('…')).toBe(true);
  });

  it('empty string returns empty string', () => {
    expect(classificationPrefix('')).toBe('');
  });
});

describe('buildClassificationText', () => {
  it('with anchor → prefix(anchor, 200) + newline + prefix(query, 80)', () => {
    const anchor = 'original user request for context';
    const query = 'follow up question here';
    const result = buildClassificationText(query, anchor);
    expect(result).toContain(anchor);
    expect(result).toContain(query);
    expect(result).toContain('\n');
  });

  it('without anchor → classificationPrefix(query)', () => {
    const result = buildClassificationText('standalone query');
    expect(result).toBe('standalone query');
  });
});

describe('slmInputCharBudget', () => {
  it('returns (32768 - 9216) * 4 = 94208', () => {
    expect(slmInputCharBudget()).toBe(94208);
  });
});

describe('prepareSlmInput', () => {
  it('within budget → not truncated, zero dropped', () => {
    const result = prepareSlmInput('short input text');
    expect(result.text).toBe('short input text');
    expect(result.truncated).toBe(false);
    expect(result.estimatedDroppedTokens).toBe(0);
  });

  it('over budget → tail kept, truncated=true, estimatedDroppedTokens > 0', () => {
    const budget = slmInputCharBudget();
    const over = 'x'.repeat(budget + 1000);
    const result = prepareSlmInput(over);
    expect(result.truncated).toBe(true);
    expect(result.estimatedDroppedTokens).toBeGreaterThan(0);
    expect(result.text.length).toBe(budget);
  });
});
