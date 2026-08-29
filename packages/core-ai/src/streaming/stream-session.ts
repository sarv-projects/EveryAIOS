/**
 * Stream architecture — smooth UI updates, checkpoint persistence,
 * cancellation tokens, and credit-aware streaming.
 *
 * "Time-to-first-token matters more than total completion time for chat UX."
 * "Batch UI updates every animation frame or every small token/time interval."
 * "Persist final messages after completion or bounded checkpoints."
 */

import { getMetricsCollector, buildRequestMetrics } from '../metrics/metrics-collector.js';

// ─── Streaming session ───────────────────────────────────────────────

export type StreamEvent =
  | { type: 'ttft'; latencyMs: number }
  | { type: 'token'; text: string; tokenIndex: number }
  | { type: 'batch'; text: string; tokenCount: number }
  | { type: 'checkpoint'; text: string; turnId: string }
  | { type: 'done'; fullText: string; totalTokens: number; latencyMs: number }
  | { type: 'error'; error: string };

export type StreamSessionConfig = {
  /** Token batch interval in ms (default 33ms = ~30fps) */
  batchIntervalMs?: number;
  /** Checkpoint every N tokens (default 50) */
  checkpointEvery?: number;
  /** Max tokens before forced checkpoint (default 200) */
  maxTokensBeforeCheckpoint?: number;
  /** Enable credit-aware streaming (pause if credits exhausted) */
  creditAware?: boolean;
  /** Max credits to spend on this stream */
  maxCredits?: number;
};

// ─── StreamSession ───────────────────────────────────────────────────

export class StreamSession {
  private buffer = '';
  private tokenCount = 0;
  private firstTokenTime = 0;
  private startTime = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private readonly config: Required<StreamSessionConfig>;
  private readonly onEvent: (event: StreamEvent) => void;
  private readonly turnId: string;

  constructor(
    turnId: string,
    onEvent: (event: StreamEvent) => void,
    config: StreamSessionConfig = {},
  ) {
    this.turnId = turnId;
    this.onEvent = onEvent;
    this.startTime = Date.now();
    this.config = {
      batchIntervalMs: config.batchIntervalMs ?? 33,
      checkpointEvery: config.checkpointEvery ?? 50,
      maxTokensBeforeCheckpoint: config.maxTokensBeforeCheckpoint ?? 200,
      creditAware: config.creditAware ?? false,
      maxCredits: config.maxCredits ?? 1.0,
    };
  }

  pushToken(text: string): void {
    if (this.destroyed) return;

    if (!this.firstTokenTime) {
      this.firstTokenTime = Date.now();
      this.onEvent({ type: 'ttft', latencyMs: this.firstTokenTime - this.startTime });
    }

    this.buffer += text;
    this.tokenCount++;

    if (!this.timer) {
      this.timer = setTimeout(() => this.flushBatch(), this.config.batchIntervalMs);
    }

    if (this.tokenCount % this.config.checkpointEvery === 0 ||
        this.tokenCount === this.config.maxTokensBeforeCheckpoint) {
      this.emitCheckpoint();
    }
  }

  private flushBatch(): void {
    if (this.destroyed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length > 0) {
      const batch = this.buffer;
      this.buffer = '';
      this.onEvent({ type: 'batch', text: batch, tokenCount: this.tokenCount });
    }
  }

  private emitCheckpoint(): void {
    this.onEvent({ type: 'checkpoint', text: this.buffer, turnId: this.turnId });
  }

  complete(): void {
    // Snapshot BEFORE flush — flushBatch() clears the buffer, so fullText
    // would always be '' if we read after the flush.
    const fullText = this.buffer;
    this.flushBatch();
    const latencyMs = Date.now() - this.startTime;
    this.onEvent({
      type: 'done',
      fullText,
      totalTokens: this.tokenCount,
      latencyMs,
    });

    const metrics = getMetricsCollector();
    metrics.record(buildRequestMetrics({
      requestId: `req_${Date.now()}`,
      privacyMode: 'managed',
      finalRouteClass: 'fast-text',
      ttftMs: this.firstTokenTime ? this.firstTokenTime - this.startTime : 0,
      totalLatencyMs: latencyMs,
      completionTokensPerSecond: this.tokenCount / Math.max(latencyMs / 1000, 0.1),
    }));
  }

  error(message: string): void {
    this.onEvent({ type: 'error', error: message });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = '';
  }

  getFullText(): string {
    return this.buffer;
  }

  getTokenCount(): number {
    return this.tokenCount;
  }
}

// ─── Cancellation token ──────────────────────────────────────────────

export class StreamCancellationToken {
  private controller: AbortController;

  constructor() {
    this.controller = new AbortController();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isCancelled(): boolean {
    return this.controller.signal.aborted;
  }

  cancel(): void {
    this.controller.abort();
  }
}

// ─── Credit-aware streaming ──────────────────────────────────────────

/**
 * Check if a stream should continue based on remaining credits.
 */
export function shouldContinueStreaming(
  creditsUsed: number,
  maxCredits: number,
  currentCost: number,
): boolean {
  return creditsUsed + currentCost <= maxCredits;
}

/**
 * Calculate the estimated cost of a streaming turn based on token count.
 */
export function estimateStreamCost(
  tokenCount: number,
  isCached: boolean = false,
): number {
  if (isCached) return 0.001;
  if (tokenCount <= 200) return 0.05;
  if (tokenCount <= 1000) return 0.10;
  if (tokenCount <= 4000) return 0.20;
  return 0.35;
}
