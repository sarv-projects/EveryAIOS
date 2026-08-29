import { describe, expect, it } from 'vitest';
import { normalizeOutput } from '../chat/output-normalizer.js';

describe('normalizeOutput (spec §7 output fidelity)', () => {
  it('strips a fluffy opener', () => {
    expect(normalizeOutput("Certainly! The answer is 42.")).toBe('The answer is 42.');
    expect(normalizeOutput("Sure, here we go. Do X then Y.")).toContain('Do X then Y.');
    expect(normalizeOutput("I'd be happy to help with this. Step one is easy.")).toBe(
      'Step one is easy.',
    );
  });

  it('strips a fluffy closer', () => {
    const out = normalizeOutput('The config lives in app.json.\n\nLet me know if you need anything else!');
    expect(out).toBe('The config lives in app.json.');
  });

  it('strips "as an AI" disclaimers', () => {
    const out = normalizeOutput('As an AI language model, I cannot browse. But the docs say X.');
    expect(out.toLowerCase()).not.toContain('as an ai');
    expect(out).toContain('the docs say X.');
  });

  it('collapses 3+ blank lines and trailing whitespace', () => {
    const out = normalizeOutput('line one   \n\n\n\nline two');
    expect(out).toBe('line one\n\nline two');
  });

  it('NEVER modifies fenced code blocks', () => {
    const code = 'Here is the fix:\n\n```js\n// Certainly! I am an AI.   \nconst x = 1;\n\n\n\nconst y = 2;\n```\n\nLet me know if you need anything else!';
    const out = normalizeOutput(code);
    // The code block content must survive byte-for-byte, including the comment
    // that looks like an AI-ism and the multiple blank lines inside.
    expect(out).toContain('```js\n// Certainly! I am an AI.   \nconst x = 1;\n\n\n\nconst y = 2;\n```');
    // But the trailing prose closer is gone.
    expect(out).not.toContain('need anything else');
  });

  it('preserves code across multiple fenced blocks', () => {
    const md = '```py\nprint(1)\n```\nmiddle prose\n```py\nprint(2)\n```';
    const out = normalizeOutput(md);
    expect(out).toContain('print(1)');
    expect(out).toContain('print(2)');
    expect(out).toContain('middle prose');
  });

  it('is idempotent', () => {
    const input = "Certainly! Here is the answer.\n\n\n\nDone.\n\nHope this helps!";
    const once = normalizeOutput(input);
    const twice = normalizeOutput(once);
    expect(twice).toBe(once);
  });

  it('leaves clean output unchanged (except trim)', () => {
    const clean = 'The build command is `pnpm build`.';
    expect(normalizeOutput(clean)).toBe(clean);
  });

  it('handles empty and whitespace-only input', () => {
    expect(normalizeOutput('')).toBe('');
    expect(normalizeOutput('   \n\n  ')).toBe('');
  });

  it('does not strip legitimate content that resembles a closer mid-message', () => {
    // "let me know" only stripped at the very end, not mid-body
    const out = normalizeOutput('First, let me know your OS. Then run the installer.');
    expect(out).toContain('let me know your OS');
  });
});
