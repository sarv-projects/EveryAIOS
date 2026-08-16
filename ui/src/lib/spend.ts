// P5.9 — token/cost dashboard bridge (H9). Mirrors the Rust
// `MemoryService::usage_snapshot()` shape (everyaios-core). In a plain-browser
// preview (no shell) the caller falls back to demo data so the page is
// explorable.

import { inTauri, invoke } from "./tauri";

export interface UsageRecord {
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
}

export interface KeyUsage extends UsageRecord {
  key: string;
  costUsd: number | null;
}

export interface SessionUsage extends UsageRecord {
  sessionId: string;
}

export interface UsageSnapshot {
  total: UsageRecord;
  cacheHitRate: number;
  byKey: KeyUsage[];
  bySession: SessionUsage[];
}

/** The per-key/per-session/cache-hit dashboard data (polled by the page). */
export async function usageSnapshot(): Promise<UsageSnapshot> {
  if (!inTauri()) return demoSnapshot();
  return invoke<UsageSnapshot>("usage_snapshot");
}

function demoSnapshot(): UsageSnapshot {
  return {
    cacheHitRate: 0.66,
    total: {
      tokensIn: 18_120,
      tokensOut: 4_511,
      cachedTokens: 8_940,
      cacheHits: 12,
      cacheMisses: 6,
      cacheHitRate: 0.66,
    },
    byKey: [
      {
        key: "anthropic",
        tokensIn: 12_481,
        tokensOut: 3_204,
        cachedTokens: 6_900,
        cacheHits: 9,
        cacheMisses: 3,
        cacheHitRate: 0.75,
        costUsd: 0.18,
      },
      {
        key: "openai",
        tokensIn: 4_112,
        tokensOut: 987,
        cachedTokens: 2_040,
        cacheHits: 3,
        cacheMisses: 2,
        cacheHitRate: 0.6,
        costUsd: 0.05,
      },
      {
        key: "deepseek",
        tokensIn: 1_527,
        tokensOut: 320,
        cachedTokens: 0,
        cacheHits: 0,
        cacheMisses: 1,
        cacheHitRate: 0,
        costUsd: 0.01,
      },
    ],
    bySession: [
      {
        sessionId: "sess-q3-budget",
        tokensIn: 12_481,
        tokensOut: 3_204,
        cachedTokens: 6_900,
        cacheHits: 9,
        cacheMisses: 3,
        cacheHitRate: 0.75,
      },
      {
        sessionId: "sess-web-scrape",
        tokensIn: 5_639,
        tokensOut: 1_307,
        cachedTokens: 2_040,
        cacheHits: 3,
        cacheMisses: 3,
        cacheHitRate: 0.5,
      },
    ],
  };
}
