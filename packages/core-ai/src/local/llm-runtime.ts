/**
 * On-device LLM — basic local generation for the "on-device model" path.
 *
 * This is NOT the main focus. It provides a lightweight on-device option
 * for simple tasks when no cloud connectivity is available.
 *
 * Architecture decision:
 * - Cloud-first for quality (Fast/Smart managed classes)
 * - On-device for availability (offline, privacy, simple tasks)
 * - User must explicitly opt in to on-device generation
 */

// ─── Types ───────────────────────────────────────────────────────────

export type LocalModelStatus = 'not_loaded' | 'loading' | 'ready' | 'error';

export type LocalGenerationConfig = {
  /** Max tokens to generate */
  maxTokens: number;
  /** Temperature (0–1) */
  temperature: number;
  /** Top-p sampling */
  topP: number;
  /** Context window size */
  contextWindow: number;
};

export type LocalGenerationResult = {
  text: string;
  tokensGenerated: number;
  latencyMs: number;
  modelId: string;
};

export type LocalModelInfo = {
  id: string;
  name: string;
  parameterCount: string;
  quantization: string;
  sizeMB: number;
  contextWindow: number;
  capabilities: string[];
  status: LocalModelStatus;
};

// ─── Model registry ──────────────────────────────────────────────────

/**
 * Supported on-device models.
 * These are small, quantized models suitable for 4GB Android devices.
 */
export const LOCAL_MODELS: LocalModelInfo[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4',
    name: 'Qwen 2.5 1.5B Instruct',
    parameterCount: '1.5B',
    quantization: 'Q4_K_M',
    sizeMB: 900,
    contextWindow: 2048,
    capabilities: ['chat', 'summarize', 'translate', 'simple-qa'],
    status: 'not_loaded',
  },
  {
    id: 'smollm2-1.7b-instruct-q4',
    name: 'SmolLM2 1.7B Instruct',
    parameterCount: '1.7B',
    quantization: 'Q4_K_M',
    sizeMB: 1000,
    contextWindow: 2048,
    capabilities: ['chat', 'summarize', 'translate', 'simple-qa'],
    status: 'not_loaded',
  },
  {
    id: 'gemma-2-2b-it-q4',
    name: 'Gemma 2 2B IT',
    parameterCount: '2B',
    quantization: 'Q4_K_M',
    sizeMB: 1200,
    contextWindow: 4096,
    capabilities: ['chat', 'summarize', 'translate', 'simple-qa', 'code'],
    status: 'not_loaded',
  },
];

// ─── Runtime interface ───────────────────────────────────────────────

/**
 * Interface for on-device LLM inference.
 * Implementations would use LiteRT, ONNX Runtime, or llama.cpp.
 */
export interface LocalInferenceRuntime {
  /** Load a model into memory */
  loadModel(modelId: string): Promise<void>;
  /** Unload model from memory */
  unloadModel(): Promise<void>;
  /** Get current model status */
  getStatus(): LocalModelStatus;
  /** Generate text from prompt */
  generate(prompt: string, config?: Partial<LocalGenerationConfig>): Promise<LocalGenerationResult>;
  /** Check if model fits in available memory */
  checkMemory(modelId: string): Promise<boolean>;
}

// ─── Capability check ────────────────────────────────────────────────

/**
 * Check what is actually available in local mode.
 * Storage (SQLCipher) and retrieval (FTS5 + vector) always work offline.
 * Generation requires an explicitly downloaded model runtime.
 */
export function getLocalModeCapabilities(): {
  storageReady: boolean;
  retrievalReady: boolean;
  generationReady: boolean;
  generationAvailable: boolean;
  reason: string;
} {
  const inRuntime = typeof globalThis !== 'undefined';
  const nav = inRuntime
    ? ((globalThis as Record<string, unknown>).navigator as { deviceMemory?: number } | undefined)
    : undefined;
  const hasEnoughMemory = !nav?.deviceMemory || nav.deviceMemory >= 2;

  return {
    storageReady: inRuntime,
    retrievalReady: inRuntime,
    generationReady: false,       // requires user to download a model
    generationAvailable: inRuntime && hasEnoughMemory,
    reason: inRuntime && hasEnoughMemory
      ? 'Storage and retrieval work fully offline. Generation requires downloading a model via Settings > Power Features.'
      : hasEnoughMemory
        ? 'Not in a runtime environment'
        : 'Insufficient device memory for on-device generation (< 2GB). Storage and retrieval still work.',
  };
}

/**
 * @deprecated Use getLocalModeCapabilities() — returns a complete picture
 * of what local mode actually supports (storage + retrieval = yes; generation = opt-in).
 */
export function isOnDeviceGenerationAvailable(): {
  available: boolean;
  reason: string;
} {
  const caps = getLocalModeCapabilities();
  return {
    available: caps.generationAvailable,
    reason: caps.reason,
  };
}

/**
 * Get the recommended model for the current device.
 */
export function getRecommendedLocalModel(deviceMemoryGB: number): LocalModelInfo | null {
  if (deviceMemoryGB < 2) return null;
  if (deviceMemoryGB < 3) return LOCAL_MODELS[0]!; // 1.5B
  if (deviceMemoryGB < 4) return LOCAL_MODELS[1]!; // 1.7B
  return LOCAL_MODELS[2]!; // 2B
}

// ─── Prompt formatting ───────────────────────────────────────────────

/**
 * Format a prompt for chat-style on-device models.
 */
export function formatLocalPrompt(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      parts.push(`<|system|>\n${msg.content}\n<|end|>`);
    } else if (msg.role === 'user') {
      parts.push(`<|user|>\n${msg.content}\n<|end|>`);
    } else {
      parts.push(`<|assistant|>\n${msg.content}\n<|end|>`);
    }
  }
  parts.push('<|assistant|>\n');
  return parts.join('\n');
}

// ─── Real llama.rn Runtime ───────────────────────────────────────────

/**
 * Live LlamaRuntime that uses llama.rn (llama.cpp) for on-device inference.
 * Uses Vulkan GPU when available, falls back to CPU.
 * KV cache reused across multi-turn conversations via the same context.
 */
export class LlamaRuntime implements LocalInferenceRuntime {
  private status: LocalModelStatus = 'not_loaded';
  private context: unknown = null;
  private loadedModelId: string | null = null;
  private defaultConfig: LocalGenerationConfig = {
    maxTokens: 256,
    temperature: 0.7,
    topP: 0.9,
    contextWindow: 2048,
  };
  private gpuAvailable = false;

  constructor(opts?: { gpuAvailable?: boolean }) {
    this.gpuAvailable = opts?.gpuAvailable ?? false;
  }

  async loadModel(modelId: string): Promise<void> {
    if (this.status === 'loading') throw new Error('Model already loading');
    this.status = 'loading';

    try {
      const modelPath = await this.resolveModelPath(modelId);
      // @ts-expect-error — RN-native module, only resolves in app-mobile context
      const llama = await import('llama.rn').catch(() => null);
      if (!llama) {
        throw new Error('llama.rn not available. Use Managed/BYOK mode for cloud generation.');
      }

      this.context = await (llama as any).initLlama({
        model: modelPath,
        n_ctx: this.defaultConfig.contextWindow,
        n_gpu_layers: this.gpuAvailable ? 99 : 0,
        embedding: false,
        use_mlock: true,
      });

      this.loadedModelId = modelId;
      this.status = 'ready';
    } catch (err) {
      this.status = 'error';
      throw new Error(`Failed to load ${modelId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async unloadModel(): Promise<void> {
    if (this.context && typeof (this.context as any).release === 'function') {
      try { (this.context as any).release(); } catch { /* best-effort */ }
    }
    this.context = null;
    this.loadedModelId = null;
    this.status = 'not_loaded';
  }

  getStatus(): LocalModelStatus {
    return this.status;
  }

  async generate(prompt: string, config?: Partial<LocalGenerationConfig>): Promise<LocalGenerationResult> {
    if (this.status !== 'ready' || !this.context) {
      return {
        text: 'On-device LLM not loaded. Download a model from Settings > Power Features, or use Managed/BYOK mode.',
        tokensGenerated: 0,
        latencyMs: 0,
        modelId: this.loadedModelId ?? 'none',
      };
    }

    const cfg = { ...this.defaultConfig, ...config };
    const startTime = Date.now();

    try {
      const result = await (this.context as any).completion({
        prompt,
        n_predict: cfg.maxTokens,
        temperature: cfg.temperature,
        top_p: cfg.topP,
      });

      const text = typeof result === 'string' ? result : result?.text ?? '';
      return {
        text,
        tokensGenerated: Math.round(text.length / 4),
        latencyMs: Date.now() - startTime,
        modelId: this.loadedModelId ?? 'unknown',
      };
    } catch (err) {
      return {
        text: `On-device generation failed: ${err instanceof Error ? err.message : String(err)}`,
        tokensGenerated: 0,
        latencyMs: Date.now() - startTime,
        modelId: this.loadedModelId ?? 'unknown',
      };
    }
  }

  async checkMemory(_modelId: string): Promise<boolean> {
    // Conservative: assume yes when running on mobile
    return typeof globalThis !== 'undefined';
  }

  private async resolveModelPath(modelId: string): Promise<string> {
    // Models stored under documentDirectory/models/llm/
    // @ts-expect-error — RN-native module, only resolves in app-mobile context
    const FileSystem = await import('expo-file-system').catch(() => ({
      documentDirectory: '/data/local/tmp/',
    }));
    const base = ((FileSystem as any).documentDirectory ?? '/data/local/tmp/').replace(/\/$/, '');
    return `${base}/models/llm/${modelId}.gguf`;
  }
}

// ─── Placeholder for non-mobile (testing/server) ─────────────────────

/**
 * Placeholder runtime for environments where llama.rn is not available (testing, server).
 * Returns informative messages instead of throwing.
 */
export class PlaceholderRuntime implements LocalInferenceRuntime {
  private status: LocalModelStatus = 'not_loaded';

  async loadModel(_modelId: string): Promise<void> {
    this.status = 'not_loaded';
  }

  async unloadModel(): Promise<void> {
    this.status = 'not_loaded';
  }

  getStatus(): LocalModelStatus {
    return this.status;
  }

  async generate(_prompt: string, _config?: Partial<LocalGenerationConfig>): Promise<LocalGenerationResult> {
    return {
      text: 'On-device LLM is only available on mobile. Files, search, and memory work fully offline.',
      tokensGenerated: 0,
      latencyMs: 0,
      modelId: 'none',
    };
  }

  async checkMemory(_modelId: string): Promise<boolean> {
    return false;
  }
}
