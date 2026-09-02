// P50.3.6 — pure provider/model resolution for the chat send path.
//
// Extracted (like the coordinator's `scorer.ts`) so the auto-route decision
// is unit-testable without the zustand store. The live per-turn routing itself
// happens in the coordinator's `router.ts selectModelForTask` (fed health/cost/
// latency observations); this module only decides *whether* the UI hands the
// broker a pinned provider/model or lets the live router decide.

import { getModel, type ModelProvider } from "./agents";

export interface SelectedProviderModel {
  provider?: string;
  model?: string;
}

/**
 * Resolve the provider/model a turn should run on.
 * - An explicit local runtime selection always wins (the user picked it).
 * - When auto-route is on, return undefined/undefined so the coordinator's
 *   live task→model router decides per turn; the Rust `chat_stream` boundary
 *   accepts `None` for both and routes accordingly.
 * - Otherwise fall back to the static catalog mapping for the picked model.
 */
export function resolveProviderModel(opts: {
  modelId: string;
  localRuntime?: string;
  autoRoute: boolean;
}): SelectedProviderModel {
  if (opts.localRuntime) {
    return { provider: opts.localRuntime, model: opts.modelId };
  }
  if (opts.autoRoute) {
    return { provider: undefined, model: undefined };
  }
  const m = getModel(opts.modelId);
  if (!m) return { provider: "nvidia", model: opts.modelId };
  const provider: ModelProvider | "nvidia" =
    m.provider === "meta" ? "nvidia" : m.provider;
  return { provider, model: m.slug || m.id };
}
