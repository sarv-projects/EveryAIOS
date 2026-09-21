/**
 * Context policy (P69.D7) — the manager that decides what enters a turn's
 * context, kept deliberately separate from the prompt serializer
 * (`../prompt-compiler`).
 */
export { ContextManager } from './manager';
export type { ContextBlock, ContextManagerDeps, ContextTier, ContextTraceSink } from './manager';
