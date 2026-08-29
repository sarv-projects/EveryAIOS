import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamCompletion, validateApiKey, fetchAvailableModels } from '../openai-client.js';
import type { OpenAiProviderConfig } from '../types.js';

const mockConfig: OpenAiProviderConfig = {
  apiKey: 'sk-test-key',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4',
};

function mockJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

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

describe('validateApiKey', () => {
  it('returns ok:true when models endpoint returns 200 with model list', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      mockJsonResponse({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }] }),
    );

    const result = await validateApiKey(mockConfig);

    expect(result.ok).toBe(true);
    // Only models endpoint hit — no chat fallback needed
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns ok:false when models endpoint returns 401 and chat fallback also fails', async () => {
    const mockFetch = vi.mocked(fetch);
    // Models endpoint fails
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'Unauthorized' }, 401));
    // Chat fallback also fails
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ error: 'Unauthorized' }, 401));

    const result = await validateApiKey(mockConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
    // Both models and chat endpoints were attempted
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns ok:false on network error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await validateApiKey(mockConfig);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Failed to fetch');
  });
});

describe('fetchAvailableModels', () => {
  it('returns sorted model IDs on success', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }, { id: 'claude-3' }],
      }),
    );

    const models = await fetchAvailableModels(mockConfig);

    expect(models).toEqual(['claude-3', 'gpt-3.5-turbo', 'gpt-4']);
  });

  it('returns empty array on 401', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue(mockJsonResponse({}, 401));

    const models = await fetchAvailableModels(mockConfig);

    expect(models).toEqual([]);
  });

  it('returns empty array on network error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValue(new Error('Network error'));

    const models = await fetchAvailableModels(mockConfig);

    expect(models).toEqual([]);
  });
});

describe('streamCompletion', () => {
  it('yields tokens progressively from SSE stream', async () => {
    const mockFetch = vi.mocked(fetch);
    const stream = mockSseStream(
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    );
    mockFetch.mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      }),
    );

    const tokens: Array<{ text: string; done: boolean }> = [];
    for await (const token of streamCompletion(mockConfig, [{ role: 'user', content: 'Hi' }])) {
      tokens.push(token);
    }

    expect(tokens.length).toBeGreaterThanOrEqual(2);
    const texts = tokens.map((t) => t.text).join('');
    expect(texts).toContain('Hello');
    expect(texts).toContain('world');
    expect(texts).toBe('Hello world');
  });
});
