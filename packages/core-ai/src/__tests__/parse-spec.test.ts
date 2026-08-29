import { describe, expect, it } from 'vitest';
import { parseDocumentSpec } from '../artifact-maker/parse-spec.js';

const validSpec = JSON.stringify({
  type: 'docx',
  title: 'On-Device AI',
  subtitle: 'A Privacy Report',
  sections: [
    { heading: 'Summary', level: 1, paragraphs: ['On-device AI keeps data local.'] },
    {
      heading: 'Comparison',
      level: 2,
      table: { headers: ['Aspect', 'Cloud', 'On-Device'], rows: [['Data', 'Server', 'Local']] },
    },
  ],
});

describe('parseDocumentSpec', () => {
  it('parses a clean valid spec', () => {
    const r = parseDocumentSpec(validSpec);
    expect(r.ok).toBe(true);
    expect(r.spec?.title).toBe('On-Device AI');
    expect(r.spec?.sections).toHaveLength(2);
    expect(r.spec?.sections[1]?.table?.headers).toEqual(['Aspect', 'Cloud', 'On-Device']);
  });

  it('strips markdown code fences', () => {
    const r = parseDocumentSpec('```json\n' + validSpec + '\n```');
    expect(r.ok).toBe(true);
    expect(r.spec?.title).toBe('On-Device AI');
  });

  it('strips prose around the JSON', () => {
    const r = parseDocumentSpec('Here is your document:\n' + validSpec + '\nHope that helps!');
    expect(r.ok).toBe(true);
  });

  it('repairs truncated JSON (cut off mid-object)', () => {
    const truncated = '{"type":"docx","title":"Report","sections":[{"heading":"Intro","paragraphs":["This is incomplete';
    const r = parseDocumentSpec(truncated);
    expect(r.ok).toBe(true);
    expect(r.spec?.title).toBe('Report');
    expect(r.spec?.sections[0]?.heading).toBe('Intro');
  });

  it('defaults type to fallback format when missing', () => {
    const r = parseDocumentSpec('{"title":"X","sections":[{"heading":"A","paragraphs":["b"]}]}', 'pdf');
    expect(r.ok).toBe(true);
    expect(r.spec?.type).toBe('pdf');
  });

  it('fails on missing title', () => {
    const r = parseDocumentSpec('{"type":"docx","sections":[{"heading":"A"}]}');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/title/i);
  });

  it('fails on empty input', () => {
    expect(parseDocumentSpec('').ok).toBe(false);
  });

  it('fails on non-JSON garbage', () => {
    expect(parseDocumentSpec('I cannot create that document.').ok).toBe(false);
  });

  it('drops empty sections but keeps usable ones', () => {
    const spec = JSON.stringify({
      type: 'docx',
      title: 'T',
      sections: [{}, { heading: 'Real', paragraphs: ['content'] }, { level: 2 }],
    });
    const r = parseDocumentSpec(spec);
    expect(r.ok).toBe(true);
    expect(r.spec?.sections).toHaveLength(1);
  });

  it('coerces non-string table cells to strings', () => {
    const spec = JSON.stringify({
      type: 'docx',
      title: 'T',
      sections: [{ heading: 'Nums', table: { headers: ['A'], rows: [[42], [true]] } }],
    });
    const r = parseDocumentSpec(spec);
    expect(r.ok).toBe(true);
    expect(r.spec?.sections[0]?.table?.rows).toEqual([['42'], ['true']]);
  });
});
