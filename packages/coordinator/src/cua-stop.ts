/**
 * P60.7 — BLOCKED ≠ FAILED. Missing permission/info does not burn the
 * fail budget. FAILED ×3 → Chief reclaims.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function stopReasonFromToolArgs(args: Record<string, unknown>): string | undefined {
  if (typeof args.stopReason === "string" && args.stopReason.trim()) return args.stopReason;
  if (typeof args.blocked === "string" && args.blocked.trim()) return args.blocked;
  if (args.blocked === true) return "blocked";
  return undefined;
}

export async function applyCuaStopIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean; reason?: string }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : undefined;
  const reason = stopReasonFromToolArgs(args);
  if (!root || !nodeId || !reason) return { applied: false };
  await request("execution/cua_stop", { root, nodeId, reason });
  return { applied: true, reason };
}
