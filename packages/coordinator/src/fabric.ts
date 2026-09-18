/**
 * P60.10 — document execution vs perception fabric on the node.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export async function applyFabricIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : undefined;
  const target =
    (typeof args.target === "string" && args.target) ||
    (typeof args.path === "string" && args.path) ||
    (typeof args.url === "string" && args.url) ||
    "";
  if (!root || !nodeId || !target) return { applied: false };
  await request("execution/cua_fabric", { root, nodeId, target });
  return { applied: true };
}
