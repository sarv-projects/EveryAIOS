import { describe, expect, it } from 'vitest';
import {
  decodeParts,
  encodeParts,
  isCodePart,
  isTextPart,
  isToolCallPart,
  type MessagePart,
} from '../message-parts.js';

const sample: MessagePart[] = [
  { type: 'text', md: 'Hello ' },
  { type: 'code', lang: 'ts', content: 'const x = 1;', streaming: true },
  { type: 'tool_call', toolId: 't1', toolName: 'web_search', status: 'running' },
  {
    type: 'tool_call',
    toolId: 't1',
    toolName: 'web_search',
    status: 'ok',
    resultCard: { title: 'Result', body: 'snippet...' },
  },
  {
    type: 'citations',
    refs: [{ sourceId: 's1', page: 4, bbox: [0.1, 0.2, 0.5, 0.3], snippet: 'row 4...', chunkId: 7 }],
  },
  {
    type: 'source_cards',
    results: [{ title: 'Article', url: 'https://a.com', snippet: '...', provider: 'exa' }],
  },
  { type: 'artifact', artifactId: 'art1', preview: { kind: 'docx', title: 'Report' } },
  { type: 'memory_proposal', factId: 'f1', preview: 'User prefers concise answers' },
  { type: 'image', ref: 'file://image/1.png', alt: 'diagram' },
  { type: 'error', code: '429', message: 'try again', retryable: true },
];

describe('MessagePart encode/decode round-trip', () => {
  it('serialize + parse preserves document order', () => {
    const json = encodeParts(sample);
    const decoded = decodeParts(json);
    expect(decoded.length).toBe(sample.length);
    expect(decoded.map((p) => p.type)).toEqual(sample.map((p) => p.type));
  });

  it('encodes as a JSON string', () => {
    const json = encodeParts([{ type: 'text', md: 'hi' }]);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed[0]).toEqual({ type: 'text', md: 'hi' });
  });

  it('decodeParts returns [] on null/undefined/bad JSON', () => {
    expect(decodeParts(null)).toEqual([]);
    expect(decodeParts(undefined)).toEqual([]);
    expect(decodeParts('')).toEqual([]);
    expect(decodeParts('not-json')).toEqual([]);
    expect(decodeParts('{')).toEqual([]);
  });

  it('decodeParts rejects non-array payloads', () => {
    expect(decodeParts(JSON.stringify({ x: 1 }))).toEqual([]);
    expect(decodeParts(JSON.stringify('foo'))).toEqual([]);
  });
});

describe('MessagePart type guards', () => {
  it('isTextPart narrows by type', () => {
    const p: MessagePart = { type: 'text', md: 'x' };
    expect(isTextPart(p)).toBe(true);
    if (isTextPart(p)) {
      // after narrowing, md is accessible directly
      expect(p.md).toBe('x');
    }
  });

  it('isCodePart narrows by type', () => {
    expect(isCodePart({ type: 'code', lang: 'js', content: '' })).toBe(true);
    expect(isCodePart({ type: 'text', md: '' })).toBe(false);
  });

  it('isToolCallPart narrows by type and exposes tool fields', () => {
    const p: MessagePart = { type: 'tool_call', toolId: 't', toolName: 'n', status: 'ok' };
    expect(isToolCallPart(p)).toBe(true);
    if (isToolCallPart(p)) {
      expect(p.status).toBe('ok');
      expect(p.toolName).toBe('n');
    }
  });
});
