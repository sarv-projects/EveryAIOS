/**
 * Thread affinity — keeps a conversation pinned to the same provider/deployment
 * for cache locality. Cache hits can be 50× cheaper than cache misses.
 *
 * "Route a conversation, not just a request."
 */

import type { RouteHealth } from '../metrics/metrics-collector.js';

// ─── Types ───────────────────────────────────────────────────────────

export type RouteClass = 'local' | 'fast-text' | 'smart-text' | 'vision-extract' | 'byok';

export type ThreadAffinity = {
  conversationId: string;
  routeClass: RouteClass;
  provider: string;
  deploymentId: string;
  modelVersion: string;
  promptPrefixHash: string;
  cacheKey?: string;
  expiresAt: number;
  lastHealthyAt: number;
};

export type AffinityDecision = {
  /** Should we stay pinned to the current deployment? */
  stayPinned: boolean;
  /** If not pinned, which route to use */
  suggestedRoute: RouteClass;
  /** Reason for the decision */
  reason: string;
};

// ─── Configuration ───────────────────────────────────────────────────

const AFFINITY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HEALTH_STALE_MS = 5 * 60 * 1000; // 5 minutes — route is stale if no health update
const MAX_CACHE_DEVIATION = 0.15; // Allow 15% prompt prefix change before breaking affinity

// ─── Affinity tracker ────────────────────────────────────────────────

export class AffinityTracker {
  private affinities: Map<string, ThreadAffinity> = new Map();

  /**
   * Check if we should stay pinned to the current deployment.
   */
  evaluate(
    conversationId: string,
    currentRoute: RouteClass,
    currentProvider: string,
    currentDeploymentId: string,
    currentModelVersion: string,
    currentPromptPrefixHash: string,
    health: RouteHealth | null,
  ): AffinityDecision {
    const existing = this.affinities.get(conversationId);

    // No existing affinity — create one
    if (!existing) {
      this.set(conversationId, {
        conversationId,
        routeClass: currentRoute,
        provider: currentProvider,
        deploymentId: currentDeploymentId,
        modelVersion: currentModelVersion,
        promptPrefixHash: currentPromptPrefixHash,
        expiresAt: Date.now() + AFFINITY_TTL_MS,
        lastHealthyAt: Date.now(),
      });
      return { stayPinned: false, suggestedRoute: currentRoute, reason: 'new_affinity' };
    }

    // Affinity expired
    if (Date.now() > existing.expiresAt) {
      this.affinities.delete(conversationId);
      this.set(conversationId, {
        conversationId,
        routeClass: currentRoute,
        provider: currentProvider,
        deploymentId: currentDeploymentId,
        modelVersion: currentModelVersion,
        promptPrefixHash: currentPromptPrefixHash,
        expiresAt: Date.now() + AFFINITY_TTL_MS,
        lastHealthyAt: Date.now(),
      });
      return { stayPinned: false, suggestedRoute: currentRoute, reason: 'affinity_expired' };
    }

    // Route class changed (e.g. user switched Fast → Smart)
    if (existing.routeClass !== currentRoute) {
      this.update(conversationId, {
        routeClass: currentRoute,
        provider: currentProvider,
        deploymentId: currentDeploymentId,
        modelVersion: currentModelVersion,
        promptPrefixHash: currentPromptPrefixHash,
        expiresAt: Date.now() + AFFINITY_TTL_MS,
        lastHealthyAt: Date.now(),
      });
      return { stayPinned: false, suggestedRoute: currentRoute, reason: 'route_class_changed' };
    }

    // Provider/model changed (e.g. user switched BYOK model)
    if (existing.provider !== currentProvider || existing.modelVersion !== currentModelVersion) {
      this.update(conversationId, {
        provider: currentProvider,
        deploymentId: currentDeploymentId,
        modelVersion: currentModelVersion,
        promptPrefixHash: currentPromptPrefixHash,
        expiresAt: Date.now() + AFFINITY_TTL_MS,
        lastHealthyAt: Date.now(),
      });
      return { stayPinned: false, suggestedRoute: currentRoute, reason: 'provider_changed' };
    }

    // Prompt prefix changed significantly — cache won't hit
    const prefixSimilarity = this.comparePrefixHashes(existing.promptPrefixHash, currentPromptPrefixHash);
    if (prefixSimilarity < 1 - MAX_CACHE_DEVIATION) {
      this.update(conversationId, {
        promptPrefixHash: currentPromptPrefixHash,
        expiresAt: Date.now() + AFFINITY_TTL_MS,
      });
      return { stayPinned: false, suggestedRoute: currentRoute, reason: 'prefix_changed' };
    }

    // Health check — is the deployment still healthy?
    if (health) {
      if (health.errorRate5m > 0.3) {
        return { stayPinned: false, suggestedRoute: currentRoute, reason: 'high_error_rate' };
      }
      if (health.timeoutRate5m > 0.2) {
        return { stayPinned: false, suggestedRoute: currentRoute, reason: 'high_timeout_rate' };
      }
      if (health.p95TtftMs > 10000) { // 10s p95 TTFT
        return { stayPinned: false, suggestedRoute: currentRoute, reason: 'slow_p95_ttft' };
      }
      // Update last healthy time
      this.update(conversationId, { lastHealthyAt: Date.now() });
    } else {
      // No health data — check staleness
      if (Date.now() - existing.lastHealthyAt > HEALTH_STALE_MS) {
        return { stayPinned: false, suggestedRoute: currentRoute, reason: 'health_stale' };
      }
    }

    // All checks passed — stay pinned
    this.update(conversationId, {
      promptPrefixHash: currentPromptPrefixHash,
      expiresAt: Date.now() + AFFINITY_TTL_MS,
    });
    return { stayPinned: true, suggestedRoute: existing.routeClass, reason: 'cache_affinity' };
  }

  /** Record that we switched to a new deployment. */
  set(conversationId: string, affinity: ThreadAffinity): void {
    this.affinities.set(conversationId, affinity);
  }

  /** Update fields of an existing affinity record. */
  update(conversationId: string, patch: Partial<ThreadAffinity>): void {
    const existing = this.affinities.get(conversationId);
    if (existing) {
      this.affinities.set(conversationId, { ...existing, ...patch });
    }
  }

  /** Get the current affinity for a conversation. */
  get(conversationId: string): ThreadAffinity | undefined {
    return this.affinities.get(conversationId);
  }

  /** Remove affinity for a conversation (e.g. on chat delete). */
  remove(conversationId: string): void {
    this.affinities.delete(conversationId);
  }

  /** Compare two prefix hashes — returns 0 (totally different) to 1 (identical). */
  private comparePrefixHashes(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    // Simple character-level similarity
    let matches = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / Math.max(a.length, b.length);
  }

  /** Clear all affinities. */
  clear(): void {
    this.affinities.clear();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let globalTracker: AffinityTracker | null = null;

export function getAffinityTracker(): AffinityTracker {
  if (!globalTracker) {
    globalTracker = new AffinityTracker();
  }
  return globalTracker;
}
