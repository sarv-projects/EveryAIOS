/**
 * P59.7 — Manager remaining-node rewrite on the live turn.
 *
 * Fetched Agent-S Manager (`gui_agents/s2/agents/manager.py` @ 73ea172):
 * `get_action_queue(failed_subtask, completed, remaining)` → new plan for
 * the remainder on fail, revise remaining on completion, then DAG translate.
 * MACU: mutate remaining only; verified stay.
 *
 * The planner LLM writes remaining-node JSON. Rust `execution/cua_replan`
 * disposes. Tests inject the JSON — they do not fake an LLM.
 */

export type CuaReplanReason = "halt" | "completion" | "planner";

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function remainingFromToolArgs(args: Record<string, unknown>): unknown | undefined {
  if (args.remaining !== undefined) return args.remaining;
  if (args.replanRemaining !== undefined) return args.replanRemaining;
  if (args.remainingNodes !== undefined) return args.remainingNodes;
  return undefined;
}

export function cuaReplanReasonFromResult(
  result: unknown,
  explicit?: unknown,
): CuaReplanReason {
  if (typeof explicit === "string") {
    const e = explicit.trim().toLowerCase();
    if (e === "halt" || e === "identical-fail-halt" || e === "failure") return "halt";
    if (e === "completion" || e === "complete" || e === "done") return "completion";
  }
  if (result && typeof result === "object") {
    const r = result as { code?: unknown; halt?: unknown };
    if (r.code === "cua_halt" || r.halt === true) return "halt";
  }
  return "planner";
}

/**
 * Live consumer: persist a Manager remaining rewrite through Rust.
 * No-op when `cuaRoot` or remaining JSON is absent.
 */
export async function applyCuaReplanIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
  result?: unknown,
): Promise<{ applied: boolean; reason?: CuaReplanReason }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const remaining = remainingFromToolArgs(args);
  if (!root || remaining === undefined) return { applied: false };
  const reason = cuaReplanReasonFromResult(result, args.replanReason);
  await request("execution/cua_replan", { root, remaining, reason });
  return { applied: true, reason };
}
