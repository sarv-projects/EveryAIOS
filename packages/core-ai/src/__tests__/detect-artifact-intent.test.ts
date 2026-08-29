import { describe, expect, it } from 'vitest';
import { detectArtifactIntent } from '../artifact-maker/detect-artifact-intent.js';

describe('detectArtifactIntent', () => {
  it('detects "make a report" as docx artifact', () => {
    const r = detectArtifactIntent('make a report on climate change');
    expect(r.isArtifact).toBe(true);
    expect(r.format).toBe('docx');
  });

  it('detects "create a word document" as docx', () => {
    const r = detectArtifactIntent('create a word document about my trip');
    expect(r.isArtifact).toBe(true);
    expect(r.format).toBe('docx');
  });

  it('detects "generate a pdf" as pdf', () => {
    const r = detectArtifactIntent('generate a pdf invoice for this order');
    expect(r.isArtifact).toBe(true);
    expect(r.format).toBe('pdf');
  });

  it('detects "export this as a pdf" as pdf artifact', () => {
    const r = detectArtifactIntent('export this as a pdf');
    expect(r.isArtifact).toBe(true);
    expect(r.format).toBe('pdf');
    expect(r.referencesContext).toBe(true);
  });

  it('detects "write a cover letter" as docx', () => {
    const r = detectArtifactIntent('write a cover letter for a software job');
    expect(r.isArtifact).toBe(true);
    expect(r.format).toBe('docx');
  });

  it('does NOT trigger on a normal question', () => {
    const r = detectArtifactIntent('what is the capital of France?');
    expect(r.isArtifact).toBe(false);
  });

  it('does NOT trigger on casual chat', () => {
    const r = detectArtifactIntent('tell me a joke about cats');
    expect(r.isArtifact).toBe(false);
  });

  it('does NOT trigger on "read this document"', () => {
    const r = detectArtifactIntent('read this document and tell me what it says');
    expect(r.isArtifact).toBe(false);
  });

  it('flags context reference for "turn this into a doc"', () => {
    const r = detectArtifactIntent('turn this into a document');
    expect(r.isArtifact).toBe(true);
    expect(r.referencesContext).toBe(true);
  });

  it('prefers docx when both word and pdf mentioned', () => {
    const r = detectArtifactIntent('make a word doc, not pdf');
    expect(r.format).toBe('docx');
  });
});
