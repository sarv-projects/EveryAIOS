/**
 * P11.5.10 — Context Provider plugin system (@Codebase, @Docs, @URL).
 *
 * In-chat `@`-mention injection points (Cline pattern). Each provider knows
 * how to resolve its own payload into prompt-ready context:
 *   - `@Codebase`  → repo-map / symbol index (deterministic, no LLM)
 *   - `@Docs`      → a docs store (markdown corpus search)
 *   - `@URL`       → single-URL fetch (read-only, SSRF-guarded downstream)
 *
 * Providers are registered by id; the coordinator parses mentions out of the
 * composer text and calls `resolve` before assembling the prompt below the
 * CACHE_BOUNDARY.
 */

export type ContextProviderId = "codebase" | "docs" | "url" | "file" | "memory";

export interface Mention {
  /** Provider id, lower-cased, without the `@`. */
  id: ContextProviderId;
  /** Everything after the provider id (path/topic/URL). */
  query: string;
  /** Raw match including the `@`. */
  raw: string;
}

export interface ContextPayload {
  provider: ContextProviderId;
  query: string;
  /** Prompt-ready, wrapped in an untrusted envelope by the caller. */
  content: string;
  /** Token estimate (caller may cap). */
  tokens: number;
}

export type ContextResolver = (query: string) => Promise<ContextPayload>;

const REGISTRY = new Map<ContextProviderId, ContextResolver>();

/** Register a resolver (plugins call this at boot). */
export function registerContextProvider(id: ContextProviderId, resolver: ContextResolver): void {
  REGISTRY.set(id, resolver);
}

export function hasContextProvider(id: ContextProviderId): boolean {
  return REGISTRY.has(id);
}

export function listContextProviders(): ContextProviderId[] {
  return [...REGISTRY.keys()];
}

/**
 * Extract `@id query` mentions. Supports `@Codebase`, `@Codebase path`,
 * `@Docs topic`, `@URL https://…`. Quotes group multi-word queries.
 */
export function parseMentions(text: string): Mention[] {
  const out: Mention[] = [];
  // Query = quoted string or a single token (multi-word needs quotes),
  // stopping at the next @ or whitespace-adjacent connector.
  const re = /@([A-Za-z]+)(?:\s+("[^"]+"|'[^']+'|[^\s@]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = (m[1] ?? "").toLowerCase() as ContextProviderId;
    const rawQ = m[2]?.trim() ?? "";
    const query = rawQ.replace(/^["']|["']$/g, "").trim();
    out.push({ id, query, raw: m[0] });
  }
  return out;
}

/** Resolve every mention in a prompt (deduped by id+query). */
export async function resolveMentions(
  text: string,
  resolvers: Map<ContextProviderId, ContextResolver> = REGISTRY,
): Promise<{ payloads: ContextPayload[]; mentions: Mention[] }> {
  const mentions = parseMentions(text).filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id && x.query === m.query) === i,
  );
  const payloads: ContextPayload[] = [];
  for (const m of mentions) {
    const resolver = resolvers.get(m.id);
    if (!resolver) continue;
    try {
      payloads.push(await resolver(m.query));
    } catch {
      // A failing provider never breaks the turn — it's skipped.
    }
  }
  return { payloads, mentions };
}

/** Deterministic token estimate (~4 chars/token, matches fusion::approx_tokens). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
