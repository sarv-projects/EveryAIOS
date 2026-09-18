/**
 * P65.1 — Configured / Popular / All grouping over the existing catalog
 * inventory. No second registry: ids come from `settings_providers_list`
 * (which already groups from catalog + vault + profile store).
 */

export interface ProviderGroupIds {
  configured: string[]
  popular: string[]
  all: string[]
}

export function rowsByGroup<T extends { id: string }>(
  rows: T[],
  groups: ProviderGroupIds | null,
  configuredFallback: (row: T) => boolean,
): { configured: T[]; popular: T[]; catalog: T[] } {
  const byId = new Map(rows.map((r) => [r.id, r]))
  if (groups) {
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((r): r is T => !!r)
    const configured = pick(groups.configured)
    const popular = pick(groups.popular)
    const catalog = pick(groups.all.length > 0 ? groups.all : rows.map((r) => r.id)).filter(
      (r) => !groups.configured.includes(r.id),
    )
    return { configured, popular, catalog }
  }
  const configured = rows.filter(configuredFallback)
  const catalog = rows.filter((r) => !configuredFallback(r))
  return { configured, popular: [], catalog }
}
