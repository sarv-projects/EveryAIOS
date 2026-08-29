export interface ResearchProgress {
  stage: 'planning' | 'searching' | 'fetching' | 'synthesizing';
  subQueryIndex?: number;
  subQueryTotal?: number;
  message: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

export interface ResearchSection {
  heading: string;
  content: string;
  sources: ResearchSource[];
}

export interface ResearchResult {
  topic: string;
  summary: string;
  sections: ResearchSection[];
  totalSources: number;
  subQueries: string[];
}

export async function runResearch(
  query: string,
  deps: {
    searchFn: (q: string) => Promise<{ title: string; url: string; snippet: string }[]>;
    fetchFn: (url: string) => Promise<string>;
    synthesizeFn: (query: string, results: string) => Promise<string>;
    onProgress?: (p: ResearchProgress) => void;
    signal?: AbortSignal;
  },
): Promise<ResearchResult> {
  deps.onProgress?.({ stage: 'planning', message: 'Planning research facets...' });

  const subQueries = generateSubQueries(query);
  deps.onProgress?.({ stage: 'searching', subQueryTotal: subQueries.length, subQueryIndex: 0, message: `Searching ${subQueries.length} angles...` });

  const allSources: { query: string; sources: ResearchSource[] }[] = [];

  for (let i = 0; i < subQueries.length; i++) {
    if (deps.signal?.aborted) throw new Error('Research cancelled');
    deps.onProgress?.({ stage: 'searching', subQueryTotal: subQueries.length, subQueryIndex: i + 1, message: `Searching: ${subQueries[i]}` });

    const results = await deps.searchFn(subQueries[i]!);
    allSources.push({ query: subQueries[i]!, sources: results.slice(0, 8).map((r) => ({ ...r, score: 1 })) });
  }

  const allUrls = allSources.flatMap((s) => s.sources.map((src) => src.url));
  const uniqueUrls = [...new Set(allUrls)].slice(0, 8);

  deps.onProgress?.({ stage: 'fetching', subQueryTotal: uniqueUrls.length, subQueryIndex: 0, message: `Fetching ${uniqueUrls.length} pages...` });

  const fetchedContent: string[] = [];
  for (let i = 0; i < uniqueUrls.length; i++) {
    if (deps.signal?.aborted) throw new Error('Research cancelled');
    deps.onProgress?.({ stage: 'fetching', subQueryTotal: uniqueUrls.length, subQueryIndex: i + 1, message: `Fetching: ${uniqueUrls[i]}` });
    try {
      const content = await deps.fetchFn(uniqueUrls[i]!);
      fetchedContent.push(`Source: ${uniqueUrls[i]}\n${content.slice(0, 3000)}`);
    } catch (err) {
      console.warn(`[runResearch] fetch failed for ${uniqueUrls[i]}:`, err);
    }
  }

  deps.onProgress?.({ stage: 'synthesizing', message: 'Synthesizing findings...' });

  const synthesisInput = `
Topic: ${query}

Research findings:
${allSources.flatMap((s) => s.sources.map((src) => `- ${src.title}: ${src.snippet}`)).join('\n')}

Fetched content:
${fetchedContent.join('\n\n---\n\n')}
`;

  const synthesis = await deps.synthesizeFn(query, synthesisInput);

  const totalSources = allSources.reduce((sum, s) => sum + s.sources.length, 0);

  const sections: ResearchSection[] = (
    allSources.length > 0
      ? allSources.map((group) => ({
          heading: `Research: ${group.query}`,
          content: group.sources.map((s) => s.snippet).join('\n\n'),
          sources: group.sources,
        }))
      : [{ heading: 'Research Findings', content: synthesis, sources: allSources.flatMap((s) => s.sources) }]
  );

  return {
    topic: query,
    summary: synthesis.slice(0, 500),
    sections,
    totalSources,
    subQueries,
  };
}

function generateSubQueries(query: string): string[] {
  const lower = query.toLowerCase();
  const queries: string[] = [query];

  queries.push(`${query} overview background`);
  queries.push(`${query} data statistics recent`);

  if (!/vs|versus|compare/i.test(lower)) {
    queries.push(`${query} comparison alternatives`);
  }

  queries.push(`${query} pros cons benefits drawbacks`);

  // Keep max 5 sub-queries for speed
  return queries.slice(0, 5);
}
