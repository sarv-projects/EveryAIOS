import type { SearchContext } from '@personal-ai/core-domain';
import { buildCascadeProviders } from './build-cascade-providers.js';
import { ParallelSearchProvider } from './providers/parallel-search.js';
import { WebSearchCascade } from './web-search-cascade.js';

export { WebSearchCascade } from './web-search-cascade.js';
export { rewriteSearchQuery } from './query-rewrite.js';
export { buildCascadeProviders } from './build-cascade-providers.js';

export function buildDefaultCascade(ctx: SearchContext): WebSearchCascade {
  const { providers, cache } = buildCascadeProviders(ctx, {
    parallel: () => new ParallelSearchProvider(),
  });
  return new WebSearchCascade(providers, cache);
}