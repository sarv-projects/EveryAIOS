import { describe, expect, it } from 'vitest';
import { parseIntentCategory, classificationFromLabel } from '../router/parse-intent.js';

describe('parseIntentCategory', () => {
  it("parses 'conversational' → conversational", () => {
    expect(parseIntentCategory('conversational')).toBe('conversational');
  });

  it("parses 'needs-files' → needs-files", () => {
    expect(parseIntentCategory('needs-files')).toBe('needs-files');
  });

  it("parses 'needs-web' → needs-web", () => {
    expect(parseIntentCategory('needs-web')).toBe('needs-web');
  });

  it("parses 'needs-automation' → needs-automation", () => {
    expect(parseIntentCategory('needs-automation')).toBe('needs-automation');
  });

  it("parses 'needs-connector' → needs-connector", () => {
    expect(parseIntentCategory('needs-connector')).toBe('needs-connector');
  });

  it("parses 'out-of-scope' → out-of-scope", () => {
    expect(parseIntentCategory('out-of-scope')).toBe('out-of-scope');
  });

  it('throws TypeError for null', () => {
    // @ts-expect-error - testing null input
    expect(() => parseIntentCategory(null)).toThrow(TypeError);
  });

  it('throws TypeError for undefined', () => {
    // @ts-expect-error - testing undefined input
    expect(() => parseIntentCategory(undefined)).toThrow(TypeError);
  });

  it('returns null for empty string', () => {
    expect(parseIntentCategory('')).toBeNull();
  });

  it('partial match: "web search" → needs-web', () => {
    expect(parseIntentCategory('web search')).toBe('needs-web');
  });

  it('partial match: "file related" → needs-files', () => {
    expect(parseIntentCategory('file related')).toBe('needs-files');
  });

  it('partial match: "task reminder" → needs-automation', () => {
    expect(parseIntentCategory('task reminder')).toBe('needs-automation');
  });

  it("partial match: 'conversational intent' → conversational (via 'convers')", () => {
    expect(parseIntentCategory('conversational intent')).toBe('conversational');
  });

  it("'out of scope' → out-of-scope", () => {
    expect(parseIntentCategory('out of scope')).toBe('out-of-scope');
  });

  it('random gibberish → null', () => {
    expect(parseIntentCategory('xyzzy flurbo garble')).toBeNull();
  });
});

describe('classificationFromLabel', () => {
  it('valid label → correct category, confidence 0.75', () => {
    const result = classificationFromLabel('needs-web');
    expect(result.category).toBe('needs-web');
    expect(result.confidence).toBe(0.75);
  });

  it('empty label → fallback conversational, confidence 0.55', () => {
    const result = classificationFromLabel('');
    expect(result.category).toBe('conversational');
    expect(result.confidence).toBe(0.55);
  });

  it('custom fallback works', () => {
    const result = classificationFromLabel('', 'out-of-scope');
    expect(result.category).toBe('out-of-scope');
    expect(result.confidence).toBe(0.55);
  });
});
