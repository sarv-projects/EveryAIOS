/**
 * Mobile entry — same SearXNG pool provider as web (uses universal fetch API).
 * Metro resolves this file when bundling React Native targets.
 */
export {
  SearXNGPoolProvider,
  resetSearxPoolHealthForTests,
  type SearxPoolInstance,
} from './searxng-pool.js';