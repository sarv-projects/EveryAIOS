/**
 * P60.5 — Chief writes a five-part brief onto a CUA node.
 * Worker gets this slice, not the whole transcript.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export interface FivePartBrief {
  goal: string;
  constraints: string;
  inputs: string;
  postconditions: string;
  outOfScope: string;
}

export function briefFromToolArgs(args: Record<string, unknown>): FivePartBrief | undefined {
  const raw = args.brief;
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const str = (k: string, alt?: string) => {
    const v = o[k] ?? (alt ? o[alt] : undefined);
    return typeof v === "string" ? v : "";
  };
  return {
    goal: str("goal"),
    constraints: str("constraints"),
    inputs: str("inputs"),
    postconditions: str("postconditions"),
    outOfScope: str("outOfScope", "out_of_scope"),
  };
}

export function briefIsComplete(b: FivePartBrief): boolean {
  return [b.goal, b.constraints, b.inputs, b.postconditions, b.outOfScope].every(
    (s) => s.trim().length > 0,
  );
}

export async function applyCuaBriefIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : undefined;
  const brief = briefFromToolArgs(args);
  if (!root || !nodeId || !brief) return { applied: false };
  await request("execution/cua_set_brief", { root, nodeId, brief });
  return { applied: true };
}
