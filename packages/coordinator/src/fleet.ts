/**
 * P17 — H2 parallel-agent multiplexing (doc 69 §4 — Cline 2.0 headless/
 * parallel): run N agents, one view. The cockpit renders a live fleet, not
 * one card.
 *
 * - `FleetPlan` — a pure plan: N agents, per-agent worktrees (B3/B4
 *   isolation so parallel agents don't collide), and the multiplexer that
 *   fans agent events into one ordered stream.
 * - `pinAdapterVersion` — F8 auto-pinning: `npx <adapter>` distributions
 *   install at a pinned version, never floating.
 * - `multiplex` — merges per-agent event streams into a single
 *   `FleetEvent` feed (started / progress / done / error), tagged by agent.
 */

/** One fleet member. */
export interface FleetMember {
  agentId: string;
  /** Task (prompt/objective) assigned to this member. */
  task: string;
  /** The isolated workspace this member operates in (worktree). */
  worktree: string;
}

/** The pure fleet plan: members + the base repo they fork from. */
export interface FleetPlan {
  baseRepo: string;
  members: FleetMember[];
}

/** A worktree provision spec (B3/B4 — the sub-agent workspace floor). */
export interface WorktreeSpec {
  baseRepo: string;
  worktreePath: string;
  /** The branch this worktree checks out (per-agent isolation). */
  branch: string;
}

/** Deterministic fleet planning: N agents → N isolated worktrees. */
export function planFleet(
  baseRepo: string,
  agents: Array<{ agentId: string; task: string }>,
  worktreesRoot: string,
  runId: string,
): FleetPlan {
  return {
    baseRepo,
    members: agents.map((a, i) => ({
      agentId: a.agentId,
      task: a.task,
      worktree: `${worktreesRoot}/run-${runId}/agent-${i + 1}-${slug(a.agentId)}`,
    })),
  };
}

/** The worktree specs for a fleet (each member gets its own branch). */
export function worktreeSpecs(plan: FleetPlan): WorktreeSpec[] {
  return plan.members.map((m, i) => ({
    baseRepo: plan.baseRepo,
    worktreePath: m.worktree,
    branch: `fleet/${plan.baseRepo.split("/").pop()}-${i + 1}-${slug(m.agentId)}`,
  }));
}

/** A typed event from one fleet member, tagged for the cockpit view. */
export type FleetEvent =
  | { agent: string; kind: "started"; task: string; worktree: string }
  | { agent: string; kind: "progress"; text: string }
  | { agent: string; kind: "tool"; tool: string }
  | { agent: string; kind: "done"; ok: boolean; summary: string }
  | { agent: string; kind: "error"; message: string };

/**
 * Multiplex N per-agent event streams into one ordered feed. Deterministic
 * interleaving by agent index; each agent's events keep their internal
 * order. This is the "one view" contract — the cockpit subscribes to the
 * merged stream and renders a live fleet.
 */
export function* multiplex(
  members: FleetMember[],
  streams: Array<Generator<Omit<FleetEvent, "agent">>>,
): Generator<FleetEvent> {
  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const stream = streams[i];
    if (!member || !stream) continue;
    for (const ev of stream) {
      yield { agent: member.agentId, ...ev } as FleetEvent;
    }
  }
}

/** Fold a fleet event stream into a per-agent status map (the cockpit's
 * state). */
export function foldFleetState(
  events: FleetEvent[],
): Map<string, { task: string; worktree: string; status: "running" | "done" | "error" }> {
  const state = new Map<
    string,
    { task: string; worktree: string; status: "running" | "done" | "error" }
  >();
  for (const ev of events) {
    const cur = state.get(ev.agent) ?? { task: "", worktree: "", status: "running" as const };
    switch (ev.kind) {
      case "started":
        cur.task = ev.task;
        cur.worktree = ev.worktree;
        break;
      case "done":
        cur.status = ev.ok ? "done" : "error";
        break;
      case "error":
        cur.status = "error";
        break;
      default:
        break;
    }
    state.set(ev.agent, cur);
  }
  return state;
}

/**
 * F8 auto-pinning: `npx <adapter>` distributions resolve to a pinned
 * version. `null` = no pinned version known (install refuses rather than
 * float). Accepts already-pinned specifiers untouched.
 */
export function pinAdapterVersion(
  distribution: string,
  pinnedVersion?: string,
): string | null {
  if (distribution.startsWith("npx ")) {
    const pkg = distribution.slice(4).trim();
    if (pkg.includes("@")) {
      // Already versioned (pkg@x or @scope/pkg@x) — keep as-is.
      return `npx ${pkg}`;
    }
    if (!pinnedVersion) return null;
    return `npx ${pkg}@${pinnedVersion}`;
  }
  return distribution;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
