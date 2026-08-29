import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  buildRagSystemPrompt,
  assertCitationInvariant,
} from '../chat/system-prompt.js';

describe('DEFAULT_CHAT_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(DEFAULT_CHAT_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains key phrases', () => {
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toContain('personal AI assistant on a mobile device');
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toContain('Never reveal your model');
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toContain('sources');
  });

  it('enforces anti-filler and anti-hallucination constraints', () => {
    // Core behavioral constraints that must survive prompt rewrites.
    // If a future contributor softens these, this test will trip.
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toMatch(/No filler/);
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toMatch(/Never invent URLs/);
    expect(DEFAULT_CHAT_SYSTEM_PROMPT).toMatch(/untrusted/i);
  });
});

describe('buildRagSystemPrompt', () => {
  it('includes source labels, RAG MODE, and citation format', () => {
    const prompt = buildRagSystemPrompt(['document.pdf', 'notes.txt']);

    expect(prompt).toContain('RAG MODE');
    expect(prompt).toContain('- document.pdf');
    expect(prompt).toContain('- notes.txt');
    expect(prompt).toContain('[source N]');
  });

  it('uses "(no sources attached)" fallback for empty sources', () => {
    const prompt = buildRagSystemPrompt([]);
    expect(prompt).toContain('(no sources attached)');
  });
});

describe('assertCitationInvariant', () => {
  it('no citation → no warning (silent)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertCitationInvariant('This response has no citation markers.', 3);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('valid citation (within range) → no warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertCitationInvariant('See [source 1] and [source 2] for details.', 3);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('out-of-range citation → console.warn called', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertCitationInvariant('This info is from [source 5].', 3);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('source 5'));
    spy.mockRestore();
  });

  it('sourceCount=0 → always silent regardless of citation', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    assertCitationInvariant('See [source 99] for details.', 0);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
