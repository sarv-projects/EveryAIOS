/**
 * Algorithm — Spreading-Activation Retrieval with Lateral Inhibition
 * =================================================================
 * Prior-art gap (SYNAPSE, Findings ACL 2026): episodic-semantic memory via
 * spreading activation exists in academic agents; nobody ships it in a
 * production, on-device personal assistant. This module adapts the mechanism
 * to our existing KG: seed entities from the query, spread activation along
 * relation edges with per-hop decay, then apply lateral inhibition so
 * competing pathways don't all win — the strongest path per hop survives.
 *
 * Mechanics (mirrored in tests):
 *   activation(node) = Σ_seed (seedWeight × Π_edgeWeight × decay^hops)
 *   lateral inhibition: within each hop layer, rank by activation desc and
 *     scale by 1/(1 + inhibition×rank) — the top path keeps full strength,
 *     weaker competitors are suppressed.
 *
 * The output is a ranked list of node ids with activation ∈ (0, 1] after
 * normalization, so callers can re-rank retrieval results ("boost entities
 * the query is graph-related to") without coupling to raw scores.
 */

export interface ActivationEdge {
  from: string;
  to: string;
  /** Edge strength multiplier. Default 1. */
  weight?: number;
}

export interface ActivationSeed {
  id: string;
  /** Seed strength. Default 1. */
  weight?: number;
}

export interface SpreadOptions {
  /** Max hops to propagate from a seed. Default 2 (1-hop + 2-hop implicit). */
  maxHops?: number;
  /** Activation multiplier per hop (energy loss). Default 0.5. */
  decay?: number;
  /** Lateral-inhibition coefficient. Default 0.2. */
  lateralInhibition?: number;
  /** Drop nodes below this absolute activation. Default 1e-4. */
  threshold?: number;
  /** Normalize final activations to [0,1] (max → 1). Default true. */
  normalize?: boolean;
}

export interface ActivationResult {
  id: string;
  /** Raw accumulated activation (pre-normalization). */
  raw: number;
  /** Final activation after inhibition + normalization. */
  activation: number;
  /** Shortest hop distance from any seed (0 = seed itself). */
  hops: number;
}

/** Graph adjacency helper — bidirectional traversal for undirected edges. */
function buildAdjacency(edges: ActivationEdge[]): Map<string, Array<{ to: string; weight: number }>> {
  const adj = new Map<string, Array<{ to: string; weight: number }>>();
  const push = (from: string, to: string, weight: number) => {
    const list = adj.get(from) ?? [];
    list.push({ to, weight });
    adj.set(from, list);
  };
  for (const e of edges) {
    const w = e.weight ?? 1;
    push(e.from, e.to, w);
    push(e.to, e.from, w);
  }
  return adj;
}

/**
 * Apply lateral inhibition to a hop layer: rank activations descending and
 * scale each by 1/(1 + inhibition×rank). The strongest pathway keeps full
 * energy; weaker competitors at the same hop are suppressed proportionally.
 */
export function lateralInhibit(
  layer: Map<string, number>,
  inhibition: number,
): Map<string, number> {
  if (layer.size === 0) return layer;
  const ranked = [...layer.entries()].sort((a, b) => b[1] - a[1]);
  const out = new Map<string, number>();
  ranked.forEach(([id, act], rank) => {
    out.set(id, act / (1 + inhibition * rank));
  });
  return out;
}

/**
 * Pure spreading activation over an undirected weighted graph.
 *
 * - Seeds inject initial energy.
 * - Energy flows to neighbors, multiplied by edge weight and `decay` per hop.
 * - Per-hop lateral inhibition suppresses competing pathways.
 * - Result is ranked by final activation (normalized to [0,1] by default).
 */
export function spreadActivation(
  edges: ActivationEdge[],
  seeds: ActivationSeed[],
  options: SpreadOptions = {},
): ActivationResult[] {
  const maxHops = options.maxHops ?? 2;
  const decay = options.decay ?? 0.5;
  const inhibition = options.lateralInhibition ?? 0.2;
  const threshold = options.threshold ?? 1e-4;
  const normalize = options.normalize ?? true;

  if (seeds.length === 0) return [];
  const adj = buildAdjacency(edges);

  // Seeds are pure sources: activation flows OUTWARD and never re-activates a
  // seed (otherwise closed loops pump seed energy back into itself and skew
  // the normalization). Seeds keep full weight and define the graph's source.
  const seedSet = new Set(seeds.map((s) => s.id));

  // Layer-by-layer activation accumulation (BFS frontier).
  const layers: Map<string, number>[] = [];
  const firstHop = new Map<string, number>();
  layers[0] = new Map();
  for (const seed of seeds) {
    layers[0]!.set(seed.id, (layers[0]!.get(seed.id) ?? 0) + (seed.weight ?? 1));
    if (!firstHop.has(seed.id)) firstHop.set(seed.id, 0);
  }

  for (let hop = 0; hop < maxHops; hop += 1) {
    const layer = layers[hop];
    if (!layer || layer.size === 0) break;
    const next = new Map<string, number>();
    for (const [id, energy] of layer) {
      for (const { to, weight } of adj.get(id) ?? []) {
        if (seedSet.has(to)) continue; // never re-activate a seed
        const contribution = energy * weight * decay;
        if (contribution <= 0) continue;
        next.set(to, (next.get(to) ?? 0) + contribution);
        if (!firstHop.has(to)) firstHop.set(to, hop + 1);
      }
    }
    if (next.size === 0) break;
    layers[hop + 1] = next;
  }

  // Lateral inhibition per hop layer (except seed layer — seeds keep full weight).
  const accumulated = new Map<string, number>();
  for (let hop = 0; hop < layers.length; hop += 1) {
    const layer = hop === 0 ? layers[hop]! : lateralInhibit(layers[hop]!, inhibition);
    for (const [id, act] of layer) {
      accumulated.set(id, (accumulated.get(id) ?? 0) + act);
    }
  }

  let ranked = [...accumulated.entries()]
    .map(([id, raw]) => ({
      id,
      raw,
      activation: raw,
      hops: firstHop.get(id) ?? maxHops,
    }))
    .filter((r) => r.raw >= threshold)
    .sort((a, b) => b.raw - a.raw);

  if (normalize && ranked.length > 0) {
    const max = ranked[0]!.raw;
    if (max > 0) {
      ranked = ranked.map((r) => ({ ...r, activation: r.raw / max }));
    }
  }

  return ranked;
}

/** Convenience: rank a set of candidate ids by their activation (missing → 0). */
export function rankByActivation(
  results: ActivationResult[],
  candidates: string[],
): Map<string, number> {
  const byId = new Map(results.map((r) => [r.id, r.activation]));
  const out = new Map<string, number>();
  for (const id of candidates) {
    out.set(id, byId.get(id) ?? 0);
  }
  return out;
}
