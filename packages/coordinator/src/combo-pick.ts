/**
 * P60.4 — cheapest reliable combo on the live turn.
 * Not all workers cheap: vision and verify-fail escalate.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function comboFromToolArgs(args: Record<string, unknown>): {
  needsVision: boolean;
  verifyFailed: boolean;
  tier: string;
} | null {
  if (args.needsVision === undefined && args.verifyFailed === undefined && args.tier === undefined) {
    return null;
  }
  return {
    needsVision: args.needsVision === true,
    verifyFailed: args.verifyFailed === true,
    tier: typeof args.tier === "string" && args.tier.trim() ? args.tier.trim() : "cheap",
  };
}

export async function applyComboPickIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean; tier?: string }> {
  const spec = comboFromToolArgs(args);
  if (!spec) return { applied: false };
  const out = (await request("execution/runtime_pick", spec)) as { tier?: string };
  return { applied: true, tier: typeof out?.tier === "string" ? out.tier : spec.tier };
}
