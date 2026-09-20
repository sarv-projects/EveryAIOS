// P58.4 — one owner for the inbuilt slash commands.
//
// The composer intercepts exactly the commands in this table and Settings →
// Commands renders this same table, so the two surfaces can never disagree
// (the P58.1 keyboard-map rule: the surface renders the catalog the executor
// implements, never a second hand-typed list).
//
// Provenance rules:
// - These are **inbuilt-engine** commands. While an external ACP Chief is
//   pinned the composer does not intercept them at all: the agent's own live
//   `available_commands` take over (P53.2) and `/name` goes out as
//   `session/prompt` text.
// - A command the user switched off is no longer intercepted here, so its text
//   falls through to the model exactly like any other unknown `/word`. That is
//   the honest reading of “off”: the inbuilt engine stops claiming it.

export interface SlashCommand {
  /** The literal command, including the leading `/`. */
  cmd: string
  desc: string
  /** Mutates the session — the composer refuses mid-turn instead of queuing. */
  mutating: boolean
}

/** The commands the inbuilt engine implements (`runSlash` in chat-composer). */
export const INBUILT_SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/help', desc: 'Show all commands', mutating: false },
  { cmd: '/mode', desc: 'Cycle work mode (Auto · Plan · Build · Research)', mutating: false },
  { cmd: '/model', desc: 'Switch underlying model', mutating: false },
  { cmd: '/undo', desc: 'Roll back last turn', mutating: true },
  { cmd: '/compact', desc: 'Compact older turns (keeps recent tail + marker)', mutating: true },
  { cmd: '/clear', desc: 'Clear chat messages', mutating: true },
  { cmd: '/export', desc: 'Export chat transcript', mutating: false },
]

/** Preference key holding the commands the user switched **off** (P58.4). */
export const SLASH_DISABLED_KEY = 'commands.disabled'

/** Normalize a preference entry to the `/name` form used by the table. */
function normalize(entry: string): string {
  const trimmed = entry.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * The commands the inbuilt engine will actually intercept right now: the
 * canonical table minus whatever the user disabled. Unknown/legacy preference
 * entries are ignored — they can never advertise a command that has no
 * handler.
 */
export function enabledSlashCommands(disabled: readonly string[] = []): SlashCommand[] {
  const off = new Set(disabled.map(normalize).filter(Boolean))
  return INBUILT_SLASH_COMMANDS.filter((c) => !off.has(c.cmd))
}

/** The disabled set, as `/name` strings, for the Settings switches. */
export function disabledSlashSet(disabled: readonly string[] = []): Set<string> {
  return new Set(disabled.map(normalize).filter(Boolean))
}
