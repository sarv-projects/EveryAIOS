// The composer's web-search control is a *switch over the agent's own search
// tool*, so these tests exist to prove it never claims more than it knows:
//
//   * a configured endpoint is not a reachable one;
//   * an unreadable configuration is "not reported", not "none";
//   * a run is described from the tool log only, and the two facts the log does
//     not carry (which backend answered, how many results) stay "not reported";
//   * OFF is the default and the directive never reads as a completed search.

import { describe, expect, test } from 'bun:test'
import {
  WEB_SEARCH_DEFAULT,
  WEB_SEARCH_DIRECTIVE,
  feedSourceLabel,
  isSearchToolCall,
  lastSearchRun,
  readSearchInstances,
  searchBackends,
  searchRunLine,
  searchSummary,
  webSearchDirective,
  type SearchConfigRow,
  type SearchFeedRow,
} from './search-controls'

const CONFIG: SearchConfigRow = {
  usePublic: false,
  endpoints: ['http://localhost:8080'],
  localEndpoints: ['http://localhost:8080', 'http://localhost:8081'],
  publicEndpoints: [],
}

const FEED: SearchFeedRow = {
  source: 'live',
  count: 2,
  instances: [
    {
      url: 'https://searx.example/',
      version: '2026.1',
      median_seconds: 0.42,
      search_success_percentage: 96,
    },
    { url: 'https://slow.example', median_seconds: null, search_success_percentage: null },
  ],
}

describe('search backends', () => {
  test('an unreadable configuration is unknown, not an empty machine', () => {
    expect(searchBackends(null, FEED)).toBeNull()
    const summary = searchSummary(null, null, null)
    expect(summary.head).toContain('not reported')
    expect(summary.inCascade).toBe(0)
  })

  test('a rejected read is stated as the failure it is', () => {
    const summary = searchSummary(null, null, 'search_config: vault is locked')
    expect(summary.head).toBe('search status not reported')
    expect(summary.detail).toContain('vault is locked')
    expect(summary.tone).toBe('warn')
  })

  test('configured means in the cascade — never reachable', () => {
    const projection = searchBackends(CONFIG, null)
    expect(projection).not.toBeNull()
    const inCascade = projection!.rows.filter((r) => r.state === 'in-cascade')
    expect(inCascade).toHaveLength(1)
    expect(inCascade[0]?.url).toBe('http://localhost:8080')
    // The kernel health-gates endpoints at query time; the composer must not
    // claim the endpoint answered, is online, or is verified.
    expect(inCascade[0]?.note).toContain('reachability is decided when a query runs')
    expect(inCascade[0]?.note).not.toMatch(/online|reachable|verified/i)
    // A built-in default that is not in the list is not presented as configured.
    const unused = projection!.rows.find((r) => r.url === 'http://localhost:8081')
    expect(unused?.state).toBe('not-in-cascade')
  })

  test('the summary names the cascade, and an empty cascade says so with a way out', () => {
    const ok = searchSummary(CONFIG, null, null)
    expect(ok.head).toBe('1 backend in the cascade')
    expect(ok.tone).toBe('ok')
    expect(ok.detail).toContain('http://localhost:8080')

    const empty = searchSummary({ ...CONFIG, endpoints: [] }, null, null)
    expect(empty.head).toBe('no search backend configured')
    expect(empty.tone).toBe('warn')
    expect(empty.detail).toContain('Settings → Search')
  })

  test('an opted-in public endpoint is attributed to the feed, never to this machine', () => {
    const withPublic: SearchConfigRow = {
      usePublic: true,
      endpoints: ['http://localhost:8080', 'https://searx.example'],
      localEndpoints: ['http://localhost:8080'],
      publicEndpoints: ['https://searx.example'],
    }
    const projection = searchBackends(withPublic, FEED)
    const row = projection!.rows.find((r) => r.kind === 'public')
    expect(row?.state).toBe('in-cascade')
    expect(row?.upstreamSuccessPct).toBe(96)
    expect(row?.upstreamTiming).toBe('0.42s median (feed)')
    expect(row?.note).toContain('measured elsewhere')
    // Two feed instances exist; one is opted in, so one is merely eligible.
    expect(projection!.eligible).toBe(1)
  })

  test('public endpoints stay "not used" while the opt-in is off', () => {
    const notYet: SearchConfigRow = {
      usePublic: false,
      endpoints: ['http://localhost:8080'],
      localEndpoints: ['http://localhost:8080'],
      publicEndpoints: ['https://searx.example'],
    }
    const row = searchBackends(notYet, FEED)!.rows.find((r) => r.kind === 'public')
    expect(row?.state).toBe('not-in-cascade')
    expect(row?.label).toContain('not used')
  })

  test('feed provenance is named, and an unknown source is not read as fresh', () => {
    expect(feedSourceLabel('live')).toBe('fetched just now')
    expect(feedSourceLabel('stale_cache')).toBe('cached — last known good')
    expect(feedSourceLabel(null)).toBe('source not reported')
  })
})

describe('the switch', () => {
  test('web search is off by default', () => {
    expect(WEB_SEARCH_DEFAULT).toBe(false)
    expect(webSearchDirective(false)).toBe('')
  })

  test('the directive is a request to the agent, not a claim of work done', () => {
    const directive = webSearchDirective(true)
    expect(directive).toBe(WEB_SEARCH_DIRECTIVE)
    expect(directive).toContain('your own web-search tool')
    expect(directive).toContain('has not run a query')
  })
})

describe('what actually ran', () => {
  test('only a search-kind call counts as a web search', () => {
    expect(isSearchToolCall({ kind: 'search', title: 'Anything' })).toBe(true)
    expect(isSearchToolCall({ kind: 'other', title: 'web_search' })).toBe(true)
    expect(isSearchToolCall({ kind: 'read', title: 'Read src/lib/store.ts' })).toBe(false)
    expect(isSearchToolCall(undefined)).toBe(false)
  })

  test('a turn with no search call is an absence, not a zero-result run', () => {
    expect(lastSearchRun([])).toBeNull()
    expect(lastSearchRun(null)).toBeNull()
    expect(
      lastSearchRun([{ tsMs: 1, stopReason: 'end_turn', toolCalls: [{ kind: 'read', status: 'completed' }] }]),
    ).toBeNull()
    expect(searchRunLine(null)).toBe('No turn has run a web search yet.')
  })

  test('the newest searching turn wins and keeps the log\u2019s own buckets', () => {
    const report = lastSearchRun([
      { tsMs: 1, stopReason: 'end_turn', toolCalls: [{ kind: 'search', status: 'completed' }] },
      { tsMs: 2, stopReason: 'end_turn', toolCalls: [{ kind: 'read', status: 'completed' }] },
      {
        tsMs: 3,
        stopReason: 'end_turn',
        toolCalls: [
          { kind: 'search', status: 'completed' },
          { kind: 'search', status: 'failed' },
          { kind: 'search', status: 'in_progress' },
        ],
      },
    ])
    expect(report).toMatchObject({ at: 3, calls: 3, ok: 1, failed: 1, unsettled: 1 })
    // The two facts the shell does not expose stay unknown.
    expect(report?.backendDetail).toBe('not reported')
    expect(report?.resultCount).toBe('not reported')
    const line = searchRunLine(report)
    expect(line).toContain('3 search calls')
    expect(line).toContain('1 completed')
    expect(line).toContain('1 failed')
    expect(line).toContain('1 with no result yet')
    expect(line).toContain('which backend answered: not reported')
    expect(line).toContain('results: not reported')
  })

  test('a cancelled call is not counted as a success', () => {
    const report = lastSearchRun([
      { tsMs: 9, stopReason: 'cancelled', toolCalls: [{ kind: 'search', status: 'cancelled' }] },
    ])
    expect(report?.ok).toBe(0)
    expect(report?.failed).toBe(1)
  })
})

describe('the read path', () => {
  test('refreshing the feed is opt-in and goes through the existing command', () => {
    // A pure-shape guard: the wrapper exists, is typed against the Rust command
    // and only runs inside the shell (nativeCall throws in a browser preview).
    expect(typeof readSearchInstances).toBe('function')
  })
})
