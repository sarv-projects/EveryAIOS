import type { ChatMessage, Token } from '@personal-ai/core-domain';
import type { OpenAiProviderConfig, ValidationResult } from './types.js';

/**
 * Known Claude model IDs from Anthropic's official models overview
 * (platform.claude.com, verified 2026-07-20). Prefer current IDs for new work;
 * legacy entries remain while Anthropic still lists them.
 */
export const ANTHROPIC_KNOWN_MODELS = [
  // Current
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  // Legacy (still listed by Anthropic)
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
  'claude-opus-4-1',
  'claude-opus-4-1-20250805',
] as const;

/**
 * Anthropic Messages API requires:
 *   - x-api-key header (NOT Bearer)
 *   - anthropic-version: 2023-06-01 header
 *   - POST /v1/messages (NOT /v1/chat/completions)
 *   - SSE event-based streaming (content_block_delta → text_delta)
 */

const ANTHROPIC_VERSION = '2023-06-01';

/** Strip credential patterns from error body before surfacing to user. */
function sanitizeErrorBody(body: string): string {
  return body
    .replace(/(sk-ant-[a-zA-Z0-9]{10,})/g, 'sk-ant-***')
    .replace(/(api[_-]?key["\s:=]+["']?)([a-zA-Z0-9_-]{8,})/gi, '$1***')
    .slice(0, 200);
}

type AnthropicSseEvent = {
  type: string;
  /** content_block_delta */
  index?: number;
  delta?: { type?: string; text?: string; stop_reason?: string; stop_sequence?: string | null };
  /** message_start / message_delta */
  message?: { id: string; type: string; role: string; content: unknown[]; stop_reason?: string; stop_sequence?: string | null };
  /** message_delta */
  usage?: { input_tokens: number; output_tokens: number };
};

/** Validate an Anthropic API key by hitting /v1/messages with a minimal non-streaming request. */
export async function validateAnthropicApiKey(config: OpenAiProviderConfig): Promise<ValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const fetchImpl = config.fetchImpl ?? fetch;
    const url = `${config.baseUrl.replace(/\/+$/, '')}/messages`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: text
          ? `Anthropic validation failed (${response.status}): ${sanitizeErrorBody(text)}`
          : `Anthropic validation failed (${response.status})`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Anthropic validation request failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Stream tokens from the Anthropic /v1/messages endpoint (SSE event-based format). */
export async function* streamAnthropicCompletion(
  config: OpenAiProviderConfig,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; maxTokens?: number } = {},
): AsyncGenerator<Token, void, void> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/messages`;
  const maxTokens = options.maxTokens ?? 1024;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  // Link external signal
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    }),
    signal: controller.signal,
  };

  try {
    const response = await fetchImpl(url, requestInit);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        text
          ? `Anthropic request failed (${response.status}): ${sanitizeErrorBody(text)}`
          : `Anthropic request failed (${response.status})`,
      );
    }
    if (!response.body) {
      throw new Error('Anthropic response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    /** Per-chunk idle timeout — abort if no data arrives for 30 seconds. */
    const STREAM_IDLE_MS = 30_000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_MS);
    };
    resetIdle();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        resetIdle();

        buffer += decoder.decode(value, { stream: true });
        const normalized = buffer.replace(/\r\n/g, '\n');
        const events = normalized.split('\n\n');
        buffer = events.pop() ?? '';

        for (const eventBlock of events) {
          const token = parseAnthropicSse(eventBlock);
          if (!token) {
            continue;
          }
          yield token;
          if (token.done) {
            return;
          }
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      await reader.cancel();
    }

    // Flush remaining buffered data on EOF — catches trailing event fragments.
    const remaining = buffer.trim();
    if (remaining) {
      const token = parseAnthropicSse(remaining);
      if (token && !token.done) {
        yield token;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse an Anthropic SSE event block.
 *
 * Anthropic SSE format:
 *   event: <event_type>
 *   data: <json>
 *
 * We extract text from `content_block_delta` events (where delta.type === 'text_delta').
 * Stream signals done on `message_stop`.
 */
function parseAnthropicSse(eventBlock: string): Token | null {
  const lines = eventBlock.split('\n');
  let eventType = '';
  let dataLine = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataLine = line.slice(6).trim();
    }
  }

  if (!dataLine || dataLine === '[DONE]') {
    return null;
  }

  let parsed: AnthropicSseEvent;
  try {
    parsed = JSON.parse(dataLine) as AnthropicSseEvent;
  } catch {
    return null;
  }

  switch (eventType) {
    case 'content_block_delta':
      if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
        return { text: parsed.delta.text, done: false };
      }
      return null;

    case 'message_delta':
      if (parsed.delta?.stop_reason) {
        return { text: '', done: true };
      }
      return null;

    case 'message_stop':
      return { text: '', done: true };

    case 'message_start':
    case 'content_block_start':
    case 'content_block_stop':
    case 'ping':
      // These events carry no user-visible text; ignore them.
      return null;

    default:
      return null;
  }
}
