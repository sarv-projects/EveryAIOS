/**
 * The context manager (P69.D7).
 *
 * One responsibility, and only one: **decide what enters a turn's context** —
 * which blocks, from which source, into which tier (the byte-stable prefix or
 * below the cache boundary), and what provenance the trace records for each.
 * It never serializes: turning the decision into bytes is
 * [`compilePrompt`](../prompt-compiler/index.ts)'s job, and assembling the
 * 12-segment system prompt is the coordinator's (`prompt.ts` → `core-ai`
 * `assembleChatPrompt`).
 *
 * Keeping the two apart is the point of D7: a single object that both decides
 * and serializes is the shape that made "where did this text come from?"
 * unanswerable and made cache stability unauditable.
 *
 * The manager is deliberately transport-free: the trace sink and the
 * below-boundary injector are injected, so `core-engine` stays a policy layer
 * (`P69.D8`, enforced by the LAYER-1 gate) and the coordinator keeps owning
 * where the bytes land.
 */

/** Where a block goes relative to the provider cache boundary. */
export type ContextTier =
  /** Above the boundary — must stay byte-stable across turns of a Work. */
  | 'stable'
  /** Below the boundary — varies per turn (memory, tools, files, the user). */
  | 'volatile';

/** A block that entered the context, with the provenance the trace needs. */
export interface ContextBlock<S extends string = string> {
  source: S;
  content: string;
  tier: ContextTier;
}

/** The trace sink (`ContextTrace` satisfies this structurally). */
export interface ContextTraceSink<S extends string = string> {
  record(source: S, content: string): void;
}

export interface ContextManagerDeps<S extends string = string> {
  trace: ContextTraceSink<S>;
  /**
   * Insert a volatile block below the cache boundary and return the updated
   * prompt. The coordinator supplies its `injectBelowBoundary`; the manager
   * never invents a boundary of its own.
   */
  injectVolatile(prompt: string, block: string): string;
}

/**
 * The one context manager. Blocks are appended in call order (the order the
 * caller decided on), and every accepted block is recorded on the trace —
 * "model-visible means logged" (P30.8) is a property of this class, not of
 * each call site.
 */
export class ContextManager<S extends string = string> {
  private readonly trace: ContextTraceSink<S>;
  private readonly injectVolatileBlock: (prompt: string, block: string) => string;
  private readonly accepted: ContextBlock<S>[] = [];

  constructor(deps: ContextManagerDeps<S>) {
    this.trace = deps.trace;
    this.injectVolatileBlock = deps.injectVolatile;
  }

  /** Record a volatile block and inject it below the boundary. */
  inject(prompt: string, source: S, content: string): string {
    if (!content) return prompt;
    this.record(source, content, 'volatile');
    return this.injectVolatileBlock(prompt, content);
  }

  /**
   * Record a block without injecting it here — for content the caller places
   * itself (the stable prefix, or a block injected as part of a larger one).
   */
  record(source: S, content: string, tier: ContextTier = 'volatile'): void {
    if (!content) return;
    this.trace.record(source, content);
    this.accepted.push({ source, content, tier });
  }

  /** Every accepted block, in call order (the `assertAllLogged` input). */
  blocks(): readonly ContextBlock<S>[] {
    return this.accepted;
  }

  /** The blocks of one tier, in call order. */
  blocksOf(tier: ContextTier): readonly ContextBlock<S>[] {
    return this.accepted.filter((b) => b.tier === tier);
  }

  /** How many blocks entered the context this turn. */
  count(): number {
    return this.accepted.length;
  }

  /** First index of a source, or -1 — used by cache-stability assertions. */
  indexOf(source: S): number {
    return this.accepted.findIndex((b) => b.source === source);
  }
}
