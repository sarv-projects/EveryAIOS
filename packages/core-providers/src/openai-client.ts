import type { ChatMessage, Token } from '@personal-ai/core-domain';
import type { OpenAiProviderConfig, ValidationResult } from './types.js';

type OpenAiModelsResponse = {
  data?: Array<{ id: string }>;
};

type OpenAiDelta = {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string; reasoning?: string };
    finish_reason?: string | null;
  }>;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Strip potential credential-like patterns from error body before surfacing to user. */
function sanitizeErrorBody(body: string): string {
  return body
    .replace(/(sk-[a-zA-Z0-9]{10,})/g, 'sk-***')
    .replace(/(api[_-]?key["\s:=]+["']?)([a-zA-Z0-9_-]{8,})/gi, '$1***')
    .replace(/(Bearer\s+)([a-zA-Z0-9_-]{8,})/gi, '$1***')
    .slice(0, 200);
}

async function tryModelsEndpoint(config: OpenAiProviderConfig): Promise<ValidationResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${normalizeBaseUrl(config.baseUrl)}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: authHeaders(config.apiKey),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: text
          ? `Models check failed (${response.status}): ${sanitizeErrorBody(text)}`
          : `Models check failed (${response.status})`,
      };
    }
    const body = (await response.json()) as OpenAiModelsResponse;
    if (!Array.isArray(body.data) || body.data.length === 0) {
      return { ok: false, error: 'Models endpoint returned no models' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Models request failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryMinimalChat(config: OpenAiProviderConfig): Promise<ValidationResult> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        error: text
          ? `Chat check failed (${response.status}): ${sanitizeErrorBody(text)}`
          : `Chat check failed (${response.status})`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Chat request failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Models that are not chat-capable — skip in the picker. */
const NON_CHAT_MODEL_PATTERNS = [
  /embed/i,
  /embedding/i,
  /bge-/i,
  /snowflake/i,
  /all-MiniLM/i,
  /multilingual-e5/i,
  /gte-/i,
  /arctic-embed/i,
  /reward/i,
  /guard/i,
  /safety/i,
  /classifier/i,
  /rerank/i,
  /detect/i,
  /whisper/i,
  /tts/i,
  /speech/i,
  /audio/i,
  /transcribe/i,
  /translate/i,
  /deplot/i,
  /kosmos/i,
  /vila/i,
  /neva-/i,
  /fuyu/i,
  /video/i,
  /vision/i,
  /controlnet/i,
  /stable-diffusion/i,
  /sdxl/i,
  /flux/i,
  /dall-e/i,
  /imagen/i,
  /upscale/i,
  /inpaint/i,
  /parakeet/i,
  /canary/i,
  /punctuation/i,
  /diarization/i,
  /parakeet/i,
  /cosmos-reason/i,
  /llama-guard/i,
  /nemoguard/i,
  /prompt-guard/i,
  /nemotron-4-340b-reward/i,
  /nv-embed/i,
  /nv-dinov2/i,
  /nv-eva/i,
  /nv-yi/i,
];

function isChatModel(modelId: string): boolean {
  return !NON_CHAT_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
}

/**
 * Redact secrets from log lines. Some gateways echo the Authorization header
 * or key in error bodies — never let an API key reach the logs (C.15).
 */
function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/(authorization\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

/** Fetch available model IDs from an OpenAI-compatible /v1/models endpoint. Returns model IDs sorted alphabetically, filtered to chat-capable models only. */
export async function fetchAvailableModels(
  config: OpenAiProviderConfig,
): Promise<string[]> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${normalizeBaseUrl(config.baseUrl)}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: authHeaders(config.apiKey),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`[fetchAvailableModels] ${config.baseUrl} returned ${response.status}:`, redactSecrets(text.slice(0, 200)));
      return [];
    }
    const body = (await response.json()) as OpenAiModelsResponse;
    if (!Array.isArray(body.data)) {
      return [];
    }
    return body.data
      .map((m) => m.id)
      .filter(Boolean)
      .filter(isChatModel)
      .sort();
  } catch (err) {
    console.warn(`[fetchAvailableModels] ${config.baseUrl} failed:`, err instanceof Error ? err.message : String(err));
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Validate an API key with /v1/models, falling back to a minimal chat call. */
export async function validateApiKey(config: OpenAiProviderConfig): Promise<ValidationResult> {
  try {
    const models = await tryModelsEndpoint(config);
    if (models.ok) {
      return models;
    }
    return tryMinimalChat(config);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Validation request failed',
    };
  }
}

function parseSseEvent(event: string): Token | null {
  const dataLines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join('\n');
  if (payload === '[DONE]') {
    return { text: '', done: true };
  }

  const parsed = JSON.parse(payload) as OpenAiDelta;
  const content = parsed.choices?.[0]?.delta?.content ?? '';
  const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content ?? '';
  const reasoning = parsed.choices?.[0]?.delta?.reasoning ?? '';
  const finishReason = parsed.choices?.[0]?.finish_reason;
  return {
    text: content,
    ...(reasoningContent || reasoning ? { reasoning: reasoningContent || reasoning } : {}),
    done: finishReason != null,
  };
}

/** Stream tokens from an OpenAI-compatible /v1/chat/completions endpoint. */
export async function* streamCompletion(
  config: OpenAiProviderConfig,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; maxTokens?: number } = {},
): AsyncGenerator<Token, void, void> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);

  // Link external signal and always remove listener to avoid leaks.
  const onAbort = () => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', onAbort, { once: true });
  }

  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      ...authHeaders(config.apiKey),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      max_tokens: options.maxTokens ?? 4096,
    }),
    signal: controller.signal,
  };

  try {
    const response = await fetchImpl(url, requestInit);

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.text().catch(() => '');
        if (body) {
          const parsed = JSON.parse(body) as { error?: { message?: string } };
          detail = parsed.error?.message ?? body.slice(0, 200);
        }
      } catch { /* ignore parse */ }
      throw new Error(
        detail
          ? `Provider error (${response.status}): ${detail}`
          : `Provider request failed (${response.status})`,
      );
    }
    if (!response.body) {
      try {
        const text = await response.text();
        // Non-streaming JSON response: extract content + reasoning
        try {
          const parsed = JSON.parse(text) as {
            choices?: Array<{ message?: { content?: string; reasoning_content?: string; reasoning?: string } }>;
          };
          const msg = parsed.choices?.[0]?.message;
          const fullContent = (msg?.content || msg?.reasoning_content || msg?.reasoning || '');
          if (fullContent) {
            yield { text: fullContent, done: true };
            return;
          }
        } catch { /* not JSON, try SSE */ }

        // SSE format: split by double newline (normalize CRLF first)
        const events = text.replace(/\r\n/g, '\n').split('\n\n');
        let accumulated = '';
        let reasoningAcc = '';
        let sawDone = false;
        for (const event of events) {
          if (!event.trim()) continue;
          const token = parseSseEvent(event);
          if (!token) continue;
          accumulated += token.text;
          reasoningAcc += token.reasoning ?? '';
          if (token.text) yield token;
          if (token.done) {
            sawDone = true;
            if (token.text) return;
            break;
          }
        }
        if (sawDone) return;
        const finalText = accumulated || reasoningAcc || '';
        if (finalText) {
          yield { text: finalText, done: true };
          return;
        }
        throw new Error('Provider stream ended before any tokens arrived');
      } catch (e) {
        if (e instanceof Error && e.message.includes('Provider stream ended')) throw e;
        throw new Error('Provider response has no body');
      }
    }

    let accumulated = '';
    let reasoningAcc = '';
    let sawDone = false;
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
        // Normalize CRLF (some providers use \r\n\r\n as SSE delimiter)
        const normalized = buffer.replace(/\r\n/g, '\n');
        const events = normalized.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const token = parseSseEvent(event);
          if (!token) {
            continue;
          }
          accumulated += token.text;
          reasoningAcc += token.reasoning ?? '';
          if (token.text) yield token;
          if (token.done) {
            sawDone = true;
            if (token.text) return;
            break;
          }
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      await reader.cancel();
    }

    // Flush remaining buffered SSE data on EOF (normalize CRLF).
    if (buffer.trim()) {
      const token = parseSseEvent(buffer.replace(/\r\n/g, '\n'));
      if (token) {
        accumulated += token.text;
        reasoningAcc += token.reasoning ?? '';
        if (token.text) yield token;
        if (token.done) {
          sawDone = true;
          if (token.text) return;
        }
      }
    }

    // Don't re-emit accumulated text when SSE [DONE] already signaled completion.
    if (sawDone) return;
    const finalText = accumulated || reasoningAcc || '';
    if (finalText) {
      yield { text: finalText, done: true };
      return;
    }
    throw new Error('Provider stream ended before any tokens arrived');
  } finally {
    clearTimeout(timeout);
    if (options.signal) {
      options.signal.removeEventListener('abort', onAbort);
    }
  }
}