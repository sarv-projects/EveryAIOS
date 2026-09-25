/** A count the title bar can print. NaN and infinities become the fallback. */
export function finiteCount(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Thousands of tokens, never "NaN". */
export function tokenThousandsLabel(tokens: number | null | undefined): string {
  const n = finiteCount(tokens)
  return `${Math.round(n / 1000)}K tok`
}
