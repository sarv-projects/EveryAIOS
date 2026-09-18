/**
 * P60.9 — Chief vs worker spend. Warn above 20%; do not abort.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export async function applySpendSplitIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean; warn?: boolean }> {
  const chief =
    typeof args.chiefTokens === "number"
      ? args.chiefTokens
      : typeof args.chiefTokens === "string"
        ? Number(args.chiefTokens)
        : undefined;
  const worker =
    typeof args.workerTokens === "number"
      ? args.workerTokens
      : typeof args.workerTokens === "string"
        ? Number(args.workerTokens)
        : undefined;
  if (chief === undefined || worker === undefined || Number.isNaN(chief) || Number.isNaN(worker)) {
    return { applied: false };
  }
  const out = (await request("execution/spend_split", {
    chiefTokens: chief,
    workerTokens: worker,
  })) as { spend?: { warnNotDelegating?: boolean } };
  return { applied: true, warn: out?.spend?.warnNotDelegating === true };
}
