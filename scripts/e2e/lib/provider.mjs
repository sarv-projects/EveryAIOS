#!/usr/bin/env node
/**
 * P50.5 E2E — real provider resolution. NO mocks: the provider HTTP call is
 * a real request to a real endpoint. The environment decides which provider:
 *
 *   EVERYAIOS_E2E_PROVIDER   "nvidia" (default when NVIDIA_API_KEY is set) |
 *                            "openai" | "ollama"
 *   EVERYAIOS_E2E_BASE_URL   override base URL (default per provider)
 *   EVERYAIOS_E2E_MODEL      preferred model id (may be a comma-separated
 *                            fallback chain — the first that yields a token)
 *   EVERYAIOS_E2E_KEY        override key (default: NVIDIA_API_KEY /
 *                            OPENAI_API_KEY)
 *   EVERYAIOS_E2E_TTFT_MS    first-token timeout (default 90_000)
 *
 * When no usable provider is configured, `resolveProvider()` returns null and
 * the gate exits 2 (SKIP) — an honest "not run here", never a fake pass.
 */
const DEFAULTS = {
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    models: ["deepseek-ai/deepseek-v4-pro-0813", "deepseek-ai/deepseek-v4-flash-0731"],
  },
  openai: {
    baseUrl: "http://localhost:4001/v1",
    keyEnv: "OPENAI_API_KEY",
    models: ["gpt-4o-mini"],
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    keyEnv: null,
    models: ["qwen2.5:0.5b"],
  },
};

export function resolveProvider() {
  const wanted = process.env.EVERYAIOS_E2E_PROVIDER ?? null;
  const candidates = wanted ? [wanted] : ["nvidia", "openai", "ollama"];
  for (const name of candidates) {
    const def = DEFAULTS[name];
    if (!def) continue;
    const baseUrl = (process.env.EVERYAIOS_E2E_BASE_URL ?? def.baseUrl).replace(/\/+$/, "");
    const key = process.env.EVERYAIOS_E2E_KEY ?? process.env[def.keyEnv] ?? null;
    const models = (process.env.EVERYAIOS_E2E_MODEL ?? def.models.join(","))
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (def.keyEnv !== null && !key) continue;
    return {
      name,
      baseUrl,
      key,
      models: models.length > 0 ? models : def.models,
      firstTokenMs: Number(process.env.EVERYAIOS_E2E_TTFT_MS ?? 90_000),
    };
  }
  return null;
}

/**
 * Stream a REAL chat completion (SSE) from the provider, trying the model
 * fallback chain in order: the first model that yields a first token wins.
 * `preferredModel` (from the engine's provider/stream request) is tried
 * first when present in the chain. Rejects with the LAST real error after
 * every candidate times out/fails — never fabricates a response.
 */
export async function streamChatCompletion(
  provider,
  messages,
  { preferredModel, noFallback = false, onDelta, onDone, signal } = {},
) {
  const chain = noFallback
    ? [preferredModel]
    : preferredModel
      ? [preferredModel, ...provider.models.filter((m) => m !== preferredModel)]
      : provider.models;
  let lastError = null;
  for (const model of chain) {
    try {
      await streamOne(provider, model, messages, { onDelta, onDone, signal, firstTokenMs: provider.firstTokenMs });
      return { model };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      // An explicit abort from the caller is not a fallback condition.
      if (signal?.aborted) throw lastError;
    }
  }
  throw lastError ?? new Error(`provider ${provider.name}: no usable model`);
}

async function streamOne(provider, model, messages, { onDelta, onDone, signal, firstTokenMs }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) {
    if (signal.aborted) throw new Error("aborted before request");
    signal.addEventListener("abort", abort, { once: true });
  }
  // A throttle guard: wait up to firstTokenMs for the first token; abort the
  // stream (and this attempt) if the endpoint queues instead of streaming.
  let sawFirstToken = false;
  const firstTokenTimer = setTimeout(() => {
    if (!sawFirstToken) abort();
  }, firstTokenMs);
  const headers = { "Content-Type": "application/json" };
  if (provider.key) headers.Authorization = `Bearer ${provider.key}`;
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 256,
    }),
    signal: controller.signal,
  });
  if (!res.ok) {
    clearTimeout(firstTokenTimer);
    const body = await res.text().catch(() => "");
    throw new Error(
      `provider ${provider.name} returned HTTP ${res.status} for model '${model}': ${body.slice(0, 300)}`,
    );
  }
  if (!res.body) {
    clearTimeout(firstTokenTimer);
    throw new Error(`provider ${provider.name} returned no body`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  let finishReason = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = json.choices?.[0];
        if (choice?.delta?.content) {
          sawFirstToken = true;
          onDelta?.(choice.delta.content);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (json.usage) usage = json.usage;
      }
    }
  } finally {
    clearTimeout(firstTokenTimer);
    controller.abort();
  }
  if (!sawFirstToken) {
    throw new Error(`provider ${provider.name} model '${model}' produced no tokens`);
  }
  onDone?.({
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    finishReason,
  });
}
