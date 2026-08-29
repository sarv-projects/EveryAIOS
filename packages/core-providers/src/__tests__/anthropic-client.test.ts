import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANTHROPIC_KNOWN_MODELS,
  streamAnthropicCompletion,
  validateAnthropicApiKey,
} from '../anthropic-client.js';
import type { OpenAiProviderConfig } from '../types.js';

const mockConfig: OpenAiProviderConfig = {
  apiKey: 'sk-ant-test-key',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-sonnet-5',
};

function mockSseStream(...chunks: string[]): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ANTHROPIC_KNOWN_MODELS', () => {
  it('is an array of known Claude model IDs', () => {
    expect(Array.isArray(ANTHROPIC_KNOWN_MODELS)).toBe(true);
    expect(ANTHROPIC_KNOWN_MODELS.length).toBeGreaterThan(0);
    // Key model families should be represented
    expect(ANTHROPIC_KNOWN_MODELS).toContain('claude-opus-4-8');
    expect(ANTHROPIC_KNOWN_MODELS).toContain('claude-sonnet-5');
    expect(ANTHROPIC_KNOWN_MODELS).toContain('claude-haiku-4-5');
  });
});

describe('validateAnthropicApiKey', () => {
  it('returns ok:true when API responds with 200', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ content: [{ text: 'ok' }] }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }),
    );

    const result = await validateAnthropicApiKey(mockConfig);

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when API responds with 401', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: new Headers({ 'Content-Type': 'application/json' }),
      }),
    );

    const result = await validateAnthropicApiKey(mockConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns ok:false on network error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await validateAnthropicApiKey(mockConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Failed to fetch');
  });
});

describe('streamAnthropicCompletion', () => {
  it('yields tokens progressively from Anthropic SSE stream', async () => {
    const mockFetch = vi.mocked(fetch);
    const stream = mockSseStream(
      [
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      ].join('\n') + '\n\n',
      [
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
      ].join('\n') + '\n\n',
      [
        'event: message_stop',
        'data: {"type":"message_stop"}',
      ].join('\n') + '\n\n',
    );
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      }),
    );

    const tokens: Array<{ text: string; done: boolean }> = [];
    for await (const token of streamAnthropicCompletion(mockConfig, [
      { role: 'user', content: 'Hi' },
    ])) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    const [t0, t1, t2] = tokens;
    expect(t0?.text).toBe('Hello');
    expect(t0?.done).toBe(false);
    expect(t1?.text).toBe(' world');
    expect(t1?.done).toBe(false);
    expect(t2?.text).toBe('');
    expect(t2?.done).toBe(true);
  });
});
