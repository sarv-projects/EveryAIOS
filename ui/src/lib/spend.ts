// P5.9 — token/cost dashboard bridge (H9). Mirrors the Rust
// `MemoryService::usage_snapshot()` shape (everyaios-core). In a plain-browser
// preview (no shell) the caller falls back to demo data so the page is
// explorable.

import { invoke } from "./tauri";
import { bridgeCall } from './runtime';

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

/** One per-session aggregate row (mirrors the vault's `SessionTotal`). */
export interface SessionTotal {
  session: string
  tokensIn: number
  tokensOut: number
  cost: number
}

/** The per-key/per-session/cache-hit dashboard data (polled by the page). */
export async function usageSnapshot(): Promise<UsageSnapshot> {
  return bridgeCall({
    operation: 'usage snapshot',
    live: () => invoke<UsageSnapshot>("usage_snapshot"),
    preview: () => demoSnapshot(),
  });
}

/** P5.9 — real per-session cost/token breakdown from the durable ledger. */
export async function sessionTotals(): Promise<SessionTotal[]> {
  return bridgeCall({
    operation: 'session totals',
    live: () => invoke<SessionTotal[]>("session_totals"),
    preview: () => demoSessionTotals(),
  });
}

function demoSessionTotals(): SessionTotal[] {
  return [
    { session: 'sess-q3-budget', tokensIn: 184_000, tokensOut: 22_400, cost: 1.84 },
    { session: 'sess-invoice-batch', tokensIn: 240_000, tokensOut: 31_800, cost: 2.41 },
    { session: 'sess-soc2-review', tokensIn: 142_000, tokensOut: 18_100, cost: 1.31 },
    { session: 'sess-competitor-crawl', tokensIn: 88_000, tokensOut: 12_300, cost: 0.92 },
    { session: 'sess-refactor-users', tokensIn: 51_000, tokensOut: 8_600, cost: 0.51 },
    { session: 'sess-dns-migration', tokensIn: 48_000, tokensOut: 6_900, cost: 0.38 },
  ];
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
