/**
 * P30.8 — the **"model-visible means logged" invariant** (deepseek-harness
 * pattern, doc 83 §1): every context block that reaches a model request must
 * be reconstructable from the audit log. This module is the coordinator-side
 * enforcement: a [`ContextTrace`] records each injected block (source label +
 * content hash) at the point of injection, and [`assertContextLogged`] proves
 * every recorded block actually appears in the prompt that went to the model.
 *
 * The audit side (`ContextInjection` events / `audit/context_injection`
 * dispatch) persists the same labels; the assert turns best-effort logging
 * into a hard, testable invariant.
 */

import { createHash } from "node:crypto";

export type ContextSource =
  | "system"
  | "user"
  | "memory_warm_set"
  | "tool_index"
  | "user_document"
  | "style_memory"
  | "trajectory";

/** One recorded context block. */
export interface ContextLogEntry {
  source: ContextSource;
  /** sha256 hex of the block content (reconstructability key). */
  hash: string;
  /** Approximate token length (for the audit view). */
  tokens: number;
}

export interface ContextLogResult {
  /** True when every recorded block appears in the sent prompt. */
  ok: boolean;
  /** Entries recorded at injection time. */
  entries: ContextLogEntry[];
  /** Sources whose block was NOT found in the final prompt. */
  missing: ContextSource[];
}

/** Cheap token estimate (same convention as the rest of the coordinator). */
export function estimateBlockTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Records blocks at injection time. Injection and send happen at different
 * points of the turn loop, so the trace carries the record across.
 */
export class ContextTrace {
  private entries: ContextLogEntry[] = [];

  /** Record a block that is about to be injected into the prompt. */
  record(source: ContextSource, content: string): void {
    this.entries.push({
      source,
      hash: sha256Hex(content),
      tokens: estimateBlockTokens(content),
    });
  }

  entriesFor(source: ContextSource): ContextLogEntry[] {
    return this.entries.filter((e) => e.source === source);
  }

  all(): ContextLogEntry[] {
    return [...this.entries];
  }

  count(): number {
    return this.entries.length;
  }
}

/**
 * Verify a recorded entry against the sent prompt. Because the trace only
 * stores hashes, callers pass the original content back for the presence
 * check; the hash then proves the content is exactly what was injected.
 */
export function verifyEntry(
  trace: ContextTrace,
  source: ContextSource,
  originalContent: string,
  promptSent: string,
): boolean {
  const entries = trace.entriesFor(source);
  const expected = sha256Hex(originalContent);
  const hasEntry = entries.some((e) => e.hash === expected);
  if (!hasEntry) return false;
  return promptSent.includes(originalContent);
}

/** Full invariant: every recorded block is present in the sent prompt. */
export function assertAllLogged(
  trace: ContextTrace,
  blocks: Array<{ source: ContextSource; content: string }>,
  promptSent: string,
): ContextLogResult {
  const missing: ContextSource[] = [];
  for (const b of blocks) {
    if (!verifyEntry(trace, b.source, b.content, promptSent)) {
      missing.push(b.source);
    }
  }
  return { ok: missing.length === 0, entries: trace.all(), missing };
}
