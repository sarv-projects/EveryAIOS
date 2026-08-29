/**
 * Request metrics — tracks per-request and rolling route health.
 * Default: ON. Every managed request emits metrics.
 *
 * Two highest-value dashboards:
 * 1. Cache-hit ratio by conversation length and route
 * 2. p95 TTFT by route, provider, network region, device class
 */

// ─── Per-request metrics ─────────────────────────────────────────────

export type RequestMetrics = {
  requestId: string;
  privacyMode: 'local' | 'managed' | 'byok';
  userSelectedMode: 'fast' | 'smart' | 'user_selected' | null;
  finalRouteClass: 'local' | 'fast-text' | 'smart-text' | 'vision-extract' | 'byok';
  provider: string;
  deploymentId: string;
  promptPrefixHash: string;
  cacheHit: boolean;
  cachedInputTokens: number;
  totalInputTokens: number;
  ttftMs: number;
  completionTokensPerSecond: number;
  totalLatencyMs: number;
  retrievalLatencyMs: number;
  toolLatencyMs: number;
  fallbackReason: string | null;
  retryCount: number;
  errorCategory: string | null;
  estimatedCostCredits: number;
  actualCostCredits: number;
  qualityValidationPassed: boolean;
  userStopped: boolean;
  userRegenerated: boolean;
  timestamp: number;
};

// ─── Rolling route health ────────────────────────────────────────────

export type RouteHealth = {
  routeId: string;
  p50TtftMs: number;
  p95TtftMs: number;
  p50CompletionTokensPerSecond: number;
  errorRate5m: number;
  timeoutRate5m: number;
  queueDepth: number;
  cacheHitRate: number;
  costPerSuccessfulTurn: number;
  totalRequests: number;
  updatedAt: number;
};

// ─── Rolling window accumulator ──────────────────────────────────────

type WindowEntry = {
  ttftMs: number;
  tokensPerSec: number;
  latencyMs: number;
  error: boolean;
  timeout: boolean;
  cacheHit: boolean;
  cost: number;
  timestamp: number;
};

const FIVE_MIN_MS = 5 * 60 * 1000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1);
  return sorted[idx]!;
}

function rollingWindow(entries: WindowEntry[], now: number): WindowEntry[] {
  const cutoff = now - FIVE_MIN_MS;
  return entries.filter((e) => e.timestamp > cutoff);
}

// ─── Metrics collector ───────────────────────────────────────────────

export class MetricsCollector {
  private requests: RequestMetrics[] = [];
  private routeWindows: Map<string, WindowEntry[]> = new Map();
  private readonly maxRequests: number;
  private readonly maxWindowEntries: number;

  constructor(options: { maxRequests?: number; maxWindowEntries?: number } = {}) {
    this.maxRequests = options.maxRequests ?? 1000;
    this.maxWindowEntries = options.maxWindowEntries ?? 500;
  }

  /** Record a completed request. */
  record(metrics: RequestMetrics): void {
    this.requests.push(metrics);
    if (this.requests.length > this.maxRequests) {
      this.requests = this.requests.slice(-this.maxRequests);
    }

    const window = this.routeWindows.get(metrics.finalRouteClass) ?? [];
    window.push({
      ttftMs: metrics.ttftMs,
      tokensPerSec: metrics.completionTokensPerSecond,
      latencyMs: metrics.totalLatencyMs,
      error: metrics.errorCategory !== null,
      timeout: metrics.errorCategory === 'timeout',
      cacheHit: metrics.cacheHit,
      cost: metrics.actualCostCredits,
      timestamp: metrics.timestamp,
    });
    if (window.length > this.maxWindowEntries) {
      window.splice(0, window.length - this.maxWindowEntries);
    }
    this.routeWindows.set(metrics.finalRouteClass, window);
  }

  /** Get rolling health for a route class. */
  getRouteHealth(routeId: string): RouteHealth {
    const now = Date.now();
    const entries = rollingWindow(this.routeWindows.get(routeId) ?? [], now);

    if (entries.length === 0) {
      return {
        routeId,
        p50TtftMs: 0,
        p95TtftMs: 0,
        p50CompletionTokensPerSecond: 0,
        errorRate5m: 0,
        timeoutRate5m: 0,
        queueDepth: 0,
        cacheHitRate: 0,
        costPerSuccessfulTurn: 0,
        totalRequests: 0,
        updatedAt: now,
      };
    }

    const ttfts = entries.map((e) => e.ttftMs).sort((a, b) => a - b);
    const tps = entries.map((e) => e.tokensPerSec).sort((a, b) => a - b);
    const errors = entries.filter((e) => e.error).length;
    const timeouts = entries.filter((e) => e.timeout).length;
    const cacheHits = entries.filter((e) => e.cacheHit).length;
    const successEntries = entries.filter((e) => !e.error);
    const totalCost = successEntries.reduce((s, e) => s + e.cost, 0);

    return {
      routeId,
      p50TtftMs: percentile(ttfts, 50),
      p95TtftMs: percentile(ttfts, 95),
      p50CompletionTokensPerSecond: percentile(tps, 50),
      errorRate5m: errors / entries.length,
      timeoutRate5m: timeouts / entries.length,
      queueDepth: 0, // Set externally by the runtime
      cacheHitRate: entries.length > 0 ? cacheHits / entries.length : 0,
      costPerSuccessfulTurn: successEntries.length > 0 ? totalCost / successEntries.length : 0,
      totalRequests: entries.length,
      updatedAt: now,
    };
  }

  /** Get all route health snapshots. */
  getAllRouteHealth(): RouteHealth[] {
    return Array.from(this.routeWindows.keys()).map((id) => this.getRouteHealth(id));
  }

  /** Get recent requests (for debugging/dashboard). */
  getRecentRequests(limit = 50): RequestMetrics[] {
    return this.requests.slice(-limit);
  }

  /** Get aggregate stats. */
  getAggregateStats(): {
    totalRequests: number;
    avgTtftMs: number;
    p95TtftMs: number;
    cacheHitRate: number;
    errorRate: number;
  } {
    const now = Date.now();
    const recent = rollingWindow(
      this.requests.map((r) => ({
        ttftMs: r.ttftMs,
        tokensPerSec: r.completionTokensPerSecond,
        latencyMs: r.totalLatencyMs,
        error: r.errorCategory !== null,
        timeout: false,
        cacheHit: r.cacheHit,
        cost: r.actualCostCredits,
        timestamp: r.timestamp,
      })),
      now,
    );

    if (recent.length === 0) {
      return { totalRequests: 0, avgTtftMs: 0, p95TtftMs: 0, cacheHitRate: 0, errorRate: 0 };
    }

    const ttfts = recent.map((e) => e.ttftMs).sort((a, b) => a - b);
    const errors = recent.filter((e) => e.error).length;
    const cacheHits = recent.filter((e) => e.cacheHit).length;

    return {
      totalRequests: recent.length,
      avgTtftMs: ttfts.reduce((s, v) => s + v, 0) / ttfts.length,
      p95TtftMs: percentile(ttfts, 95),
      cacheHitRate: cacheHits / recent.length,
      errorRate: errors / recent.length,
    };
  }

  /** Clear all metrics (e.g. on user logout). */
  clear(): void {
    this.requests = [];
    this.routeWindows.clear();
  }
}

// ─── Singleton for app-wide use ──────────────────────────────────────

let globalCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new MetricsCollector();
  }
  return globalCollector;
}

/** Build a RequestMetrics object from a completed request. */
export function buildRequestMetrics(overrides: Partial<RequestMetrics> & { requestId: string }): RequestMetrics {
  return {
    privacyMode: 'managed',
    userSelectedMode: null,
    finalRouteClass: 'fast-text',
    provider: '',
    deploymentId: '',
    promptPrefixHash: '',
    cacheHit: false,
    cachedInputTokens: 0,
    totalInputTokens: 0,
    ttftMs: 0,
    completionTokensPerSecond: 0,
    totalLatencyMs: 0,
    retrievalLatencyMs: 0,
    toolLatencyMs: 0,
    fallbackReason: null,
    retryCount: 0,
    errorCategory: null,
    estimatedCostCredits: 0,
    actualCostCredits: 0,
    qualityValidationPassed: true,
    userStopped: false,
    userRegenerated: false,
    timestamp: Date.now(),
    ...overrides,
  };
}
