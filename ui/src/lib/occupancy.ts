/**
 * P60.11 — occupancy is the currently picked agent.
 * `DEFAULT_ROUTING` must not dispatch Browse/Shell/Computer use.
 * Auto-route stays model-tier (A7) only.
 *
 * `P71.2c` — the fallback is **unbound** (`''`), not a built-in runtime: there is
 * no always-present agent to occupy a view with (ADR-0005 §1/§2). An empty
 * result means "nothing is bound yet — lead the user to agent discovery", which
 * is what the turn path does too.
 */

export function occupancyChief(opts: {
  selectedAgentId?: string
  sessionPin?: string
  userDefaultChief?: string
}): string {
  if (opts.sessionPin && opts.sessionPin.trim()) return opts.sessionPin.trim()
  if (opts.selectedAgentId && opts.selectedAgentId.trim()) return opts.selectedAgentId.trim()
  if (opts.userDefaultChief && opts.userDefaultChief.trim()) return opts.userDefaultChief.trim()
  return ''
}

/** View occupancy never reads the Settings task→runtime table. */
export function dispatchOccupancy(
  _view: string,
  selectedAgentId: string,
  _routing: Record<string, string>,
): string {
  return selectedAgentId
}

export function routingTableDrivesDispatch(): false {
  return false
}
