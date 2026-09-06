// P52.11 — shared subsequence fuzzy matcher for type-to-filter surfaces
// (composer @///!, settings nav, command palette). Subsequence matching is
// typo-tolerant ("chrt" → "chart") and favors earlier, tighter hits.

/** Score how well `q` matches `text` as a fuzzy subsequence.
 * Returns a score >= 0 when every char of q appears in order
 * (case-insensitive); -1 when it does not. Lower is better: earlier matched
 * positions score lower, and gaps between matched chars add a penalty, so a
 * tight run like "md" → "mode" beats the spread-out "m...d" in "method". */
export function fuzzyScore(q: string, text: string): number {
  const query = q.trim().toLowerCase()
  if (!query) return -1
  const hay = text.toLowerCase()
  let qi = 0
  let score = 0
  let gap = 0
  let lastMatch = -1
  for (let hi = 0; hi < hay.length && qi < query.length; hi++) {
    if (hay[hi] === query[qi]) {
      score += hi
      if (gap > 0) score += gap * 2
      gap = 0
      lastMatch = hi
      qi += 1
    } else {
      gap += 1
    }
  }
  if (qi < query.length) return -1
  // Tail penalty: leftover chars after the query completed make the match
  // looser, so the tighter hit wins ties ("mode" → "/mode" over "/model").
  score += hay.length - (lastMatch + 1)
  return score
}

/** Filter + rank a list by `fuzzyScore` over a key function. Returns rows
 * whose score is >= 0, ascending (best first). A blank query keeps the list
 * in its original order (callers usually gate on having typed a trigger). */
export function fuzzyRank<T>(
  query: string,
  rows: T[],
  key: (row: T) => string,
): T[] {
  if (!query.trim()) return rows
  const scored: { row: T; s: number }[] = []
  for (const row of rows) {
    const s = fuzzyScore(query, key(row))
    if (s >= 0) scored.push({ row, s })
  }
  scored.sort((a, b) => a.s - b.s)
  return scored.map((x) => x.row)
}
