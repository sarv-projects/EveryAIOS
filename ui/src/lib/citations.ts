/**
 * P52.20 — numbered citation jump targets for the chat bubble.
 * Producers live in the coordinator (`citationsFromSearchResult`); this
 * module only formats and locates them.
 */

export interface ChatCitation {
  index: number
  title: string
  url: string
  snippet?: string
  source?: string
}

export function citationAnchorId(index: number): string {
  return `cite-${index}`
}

/** Replace a bare URL mention with `[^n]` when that URL is a known citation. */
export function applyCitationMarks(text: string, citations: ChatCitation[]): string {
  if (!citations.length) return text
  let out = text
  for (const c of citations) {
    const mark = `[^${c.index}]`
    if (out.includes(mark)) continue
    if (c.url && out.includes(c.url)) {
      out = out.replace(c.url, `${c.url} ${mark}`)
    }
  }
  return out
}
