/** BM25-lite rerank for fetched URL content snippets vs query. */

export interface Bm25RerankItem {
  text: string;
  url: string;
  title?: string;
}

export interface Bm25RankedItem extends Bm25RerankItem {
  score: number;
}

const K1 = 1.2;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function buildTermFreqMap(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

function computeBm25Score(
  queryTerms: string[],
  termFreqMap: Map<string, number>,
  docLen: number,
  avgDocLen: number,
  idfValues: Map<string, number>,
): number {
  if (docLen === 0 || queryTerms.length === 0) {
    return 0;
  }

  let score = 0;
  for (const term of queryTerms) {
    const tf = termFreqMap.get(term) ?? 0;
    if (tf === 0) continue;

    const idf = idfValues.get(term)!;
    const numerator = tf * (K1 + 1);
    const denominator = tf + K1 * (1 - B + (B * docLen) / Math.max(avgDocLen, 1));
    score += idf * (numerator / denominator);
  }

  return score;
}

/**
 * Rerank items by BM25 relevance to the query.
 * Returns items sorted by descending score (highest first).
 */
export function rerankByBm25(
  query: string,
  items: Bm25RerankItem[],
): Bm25RankedItem[] {
  if (items.length === 0) {
    return [];
  }

  const queryTerms = [...new Set(tokenize(query))];
  const docTokenLists = items.map((item) => {
    const combined = [item.title ?? '', item.text].filter(Boolean).join(' ');
    return tokenize(combined);
  });

  const totalDocs = items.length;
  const avgDocLen =
    docTokenLists.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(totalDocs, 1);

  const docFreq = new Map<string, number>();
  for (const tokens of docTokenLists) {
    const unique = new Set(tokens);
    for (const term of unique) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const idfValues = new Map<string, number>();
  for (const term of queryTerms) {
    const df = docFreq.get(term) ?? 0;
    idfValues.set(term, Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5)));
  }

  const termFreqMaps = docTokenLists.map(buildTermFreqMap);

  const ranked = items.map((item, index) => ({
    ...item,
    score: computeBm25Score(queryTerms, termFreqMaps[index]!, docTokenLists[index]!.length, avgDocLen, idfValues),
  }));

  return ranked.sort((a, b) => b.score - a.score);
}