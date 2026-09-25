/**
 * P65.8 — the settings acceptance checklist.
 *
 * This is the list a later live pass must exercise. It does not claim that
 * pass has run. Each id names one surface the shell already has a section for.
 */
export const SETTINGS_ACCEPTANCE = [
  { id: 'agent-auth', label: 'Agent auth state follows the agent seam' },
  { id: 'oauth-connector', label: 'One OAuth or MCP connector' },
  { id: 'schedule', label: 'One schedule' },
  { id: 'signed-extension', label: 'One signed extension' },
  { id: 'restart', label: 'Restart hydration' },
  { id: 'search', label: 'Settings search' },
  { id: 'a11y', label: 'Accessible names on settings controls' },
  { id: 'one-registry', label: 'One agent registry, not a second catalog' },
] as const

export function settingsAcceptanceIds(): string[] {
  return SETTINGS_ACCEPTANCE.map((row) => row.id)
}
