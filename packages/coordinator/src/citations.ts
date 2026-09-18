/**
 * P52.20 / P50.5.2 — citation producers from live search hits.
 *
 * Search results already carry url/title/snippet/source. This module is the
 * only place those become numbered `[^n]` jump targets. Empty or malformed
 * results produce zero citations (never a fabricated source).
 */

export interface Citation {
  index: number;
  title: string;
  url: string;
  snippet?: string;
  source?: string;
}

function asHit(v: unknown): { title: string; url: string; snippet?: string; source?: string } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  const title =
    (typeof o.title === "string" && o.title.trim()) ||
    (typeof o.name === "string" && o.name.trim()) ||
    url;
  const snippet = typeof o.snippet === "string" ? o.snippet : typeof o.text === "string" ? o.text : undefined;
  const source = typeof o.source === "string" ? o.source : undefined;
  const hit: { title: string; url: string; snippet?: string; source?: string } = { title, url };
  if (snippet !== undefined) hit.snippet = snippet;
  if (source !== undefined) hit.source = source;
  return hit;
}

/** Pull numbered citations out of a `search.query` tool result. */
export function citationsFromSearchResult(result: unknown): Citation[] {
  if (!result || typeof result !== "object") return [];
  const o = result as Record<string, unknown>;
  const hits = Array.isArray(o.results)
    ? o.results
    : Array.isArray(o.hits)
      ? o.hits
      : [];
  const out: Citation[] = [];
  for (const h of hits) {
    const hit = asHit(h);
    if (!hit) continue;
    const c: Citation = { index: out.length + 1, title: hit.title, url: hit.url };
    if (hit.snippet !== undefined) c.snippet = hit.snippet;
    if (hit.source !== undefined) c.source = hit.source;
    out.push(c);
  }
  return out;
}
