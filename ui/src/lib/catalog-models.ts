// P58.7 — the picker's catalog rows: live models.dev data instead of the
// curated `MODELS` list.
//
// Why this module exists (and what it deliberately does NOT do):
//
//  * The curated `MODELS` list in `./agents` is a *fallback*, not catalog
//    coverage. A provider the user actually keyed (or a user-config profile)
//    has a real, live model table in the shell — that is what the picker must
//    offer, with the provider's own model ids, context windows, and per-1M
//    prices.
//  * A catalog pick carries its **provider** as well as its model id: the
//    broker resolves `base_url`/transport from the catalog (P55.5), so the
//    send path must never guess a provider for a models.dev row. That is why
//    the selection is `(provider, modelId)` and not an id-shaped string.
//  * Nothing here invents a model, a price, or a capability. A field the
//    catalog omitted stays absent/zero and the UI renders `—`.

import type { CatalogModel, CatalogProviderRow } from './providers'

/** One row the picker can pin. `id` is the provider's *own* model id — the
 * exact string the provider's API expects — and `provider` is the catalog id
 * the broker resolves the endpoint for. */
export interface CatalogPickerModel {
  id: string
  label: string
  provider: string
  /** Context window in tokens (`0` = the catalog omitted it). */
  context: number
  /** Max output tokens (`0` = omitted). */
  output: number
  /** USD per 1M input tokens (`null` = the catalog omitted cost — render `—`,
   * never `free`, since a missing field is not a zero price). */
  inputPrice: number | null
  /** USD per 1M output tokens (`null` = omitted). */
  outputPrice: number | null
  reasoning: boolean
  toolCall: boolean
  images: boolean
  /** Free tier row (OpenCode Free / a `cost: 0` catalog entry). */
  free: boolean
  /** True when the row came from a user-config profile, not models.dev. */
  profile: boolean
}

/**
 * P58.7 — a provider is usable in the picker when this machine can actually
 * reach it: it holds ≥1 vault key, it has a user-config profile, or it is
 * keyless (Ollama / NIM / OpenCode Free). A plain catalog row with no key is
 * *listed in Settings*, not offered as a chat target — picking it would just
 * produce a 401.
 */
export function usableCatalogProviders(
  rows: CatalogProviderRow[],
): CatalogProviderRow[] {
  return rows.filter((r) => r.keyConfigured || Boolean(r.profileSource) || r.keyless === true)
}

/** Map one models.dev (or profile) row into a picker row. A missing numeric
 * field keeps its honest absence: context/output fall back to `0` (rendered
 * `ctx —`) and an omitted price stays `null` (rendered `—`) rather than
 * becoming a plausible-looking guess — a missing cost is not a free model. */
export function toCatalogPickerModel(
  provider: string,
  m: CatalogModel,
): CatalogPickerModel {
  return {
    id: m.id,
    label: m.name || m.id,
    provider,
    context: m.context ?? 0,
    output: m.output ?? 0,
    inputPrice: m.priceInput ?? null,
    outputPrice: m.priceOutput ?? null,
    reasoning: m.reasoning === true,
    toolCall: m.toolCall === true,
    images: m.images === true,
    free: m.free === true,
    profile: m.fromProfile === true,
  }
}

/**
 * The provider's picker rows: user-config profile models first (the user
 * typed them, so they win), then the live catalog table. Deduped by model id
 * — a table, not a list — and stable within each source.
 */
export function catalogPickerModels(
  provider: string,
  models: CatalogModel[],
  profileModels: CatalogModel[] = [],
): CatalogPickerModel[] {
  const seen = new Set<string>()
  const out: CatalogPickerModel[] = []
  for (const m of [...profileModels, ...models]) {
    if (!m?.id || seen.has(m.id)) continue
    seen.add(m.id)
    out.push(toCatalogPickerModel(provider, m))
  }
  return out
}

/** Flatten per-provider groups, keeping the provider grouping order. */
export function flattenCatalogRows(
  groups: CatalogPickerModel[][],
): CatalogPickerModel[] {
  return groups.flat()
}

/**
 * P58.7 — the status-bar label for a catalog pick. Returns `null` when the
 * selection is not provider-qualified (a curated pick keeps its own label),
 * so the caller can fall back to `MODEL_MAP`.
 *
 * The label is `provider · model-id` **on purpose**: that id is the exact
 * string the broker sends, so the status bar names the real identifier rather
 * than a curated marketing label that may not match the live catalog.
 */
export function catalogPickLabel(
  provider: string | undefined,
  modelId: string,
): string | null {
  if (!provider) return null
  return `${provider} · ${modelId}`
}
