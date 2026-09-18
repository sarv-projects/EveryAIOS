/**
 * P60.11 — occupancy is the currently picked Chief.
 * `DEFAULT_ROUTING` must not dispatch Browse/Shell/Computer use.
 * Auto-route stays model-tier (A7) only.
 */

export function occupancyChief(opts: {
  selectedAgentId?: string
  sessionPin?: string
  userDefaultChief?: string
}): string {
  if (opts.sessionPin && opts.sessionPin.trim()) return opts.sessionPin.trim()
  if (opts.selectedAgentId && opts.selectedAgentId.trim()) return opts.selectedAgentId.trim()
  if (opts.userDefaultChief && opts.userDefaultChief.trim()) return opts.userDefaultChief.trim()
  return 'inbuilt'
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
