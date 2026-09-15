// H36 (P54) / P67–P68 — integrated terminal bridge.
//
// The Shell view talks only `profile_id` + `pty_id` to Rust; the renderer never
// sends an executable path (the shell resolves the profile name against its own
// detection). Output arrives as base64 chunks and xterm.js owns VT
// interpretation, so this layer never decodes the stream into lines.
//
// Beyond raw bytes the shell also reports *structured facts* (shell
// integration, OSC 633): the working directory, and one record per finished
// command with its exit code and output. Those records are what make exit-code
// decorations, the recent-command picker, and `#terminalLastCommand` chat
// context possible instead of guessed.

import { invoke, inTauri, listen, type UnlistenFn } from './tauri'
import { nativeCall } from './runtime'
import type { ITheme } from '@xterm/xterm'

export type TerminalBackendId = 'local' | 'wsl' | 'remote'
/** Who owns a session. `human` is a user tab; `agent`/`task` are read-only. */
export type TerminalOriginId = 'human' | 'agent' | 'task'
/** VS Code's shell-integration quality ladder. `null` = no integration. */
export type IntegrationQuality = 'Rich' | 'Basic' | null

export interface TerminalProfile {
  profileName: string
  path: string
  backend: TerminalBackendId
  icon?: string | null
  source?: 'PowerShell' | 'GitBash' | null
  wslDistro?: string | null
  isUnsafePath: boolean
  isFromPath: boolean
  isAutoDetected: boolean
  isDefault: boolean
  offered: boolean
}

export interface TerminalProfilesResponse {
  platform: 'windows' | 'linux' | 'macos'
  profiles: TerminalProfile[]
  defaultProfile?: string | null
  automationProfile?: string | null
  useWslProfiles: boolean
  unsafeConfirmed: string[]
  hostAbiVersion: number
  shellIntegration: boolean
  remoteBackendAvailable: boolean
}

export interface TerminalPtyStatus {
  ptyId: string
  profileId: string
  backend: TerminalBackendId
  origin: TerminalOriginId
  /** `script.run` / task label for non-human tabs. */
  label: string | null
  integration: IntegrationQuality
  cwd: string
  pid: number | null
  running: boolean
  exitCode: number | null
}

/** One command the shell reported finishing. */
export interface TerminalCommandRecord {
  command: string
  cwd: string
  exitCode: number | null
  output: string
  /** `false` when the line could not be attributed to the session nonce. */
  trusted: boolean
  failed: boolean
}

export interface TerminalEvent {
  ptyId: string
  kind: 'data' | 'command' | 'cwd' | 'exit'
  /** base64-encoded raw PTY bytes (empty on every non-data frame). */
  data: string
  command?: TerminalCommandRecord
  cwd?: string
  code?: number | null
}

export interface TerminalCommandsResponse {
  ptyId: string
  cwd: string
  count: number
  commands: TerminalCommandRecord[]
}

/** Preview-only profile list so the Shell view stays explorable off-Tauri.
 * Explicitly labelled `demo` — never presented as a detected registry. */
export function demoProfiles(): TerminalProfilesResponse {
  const unix = typeof navigator !== 'undefined' && !/Win/i.test(navigator.platform ?? '')
  const mk = (profileName: string, path: string, isDefault: boolean): TerminalProfile => ({
    profileName,
    path,
    backend: 'local',
    icon: null,
    source: null,
    wslDistro: null,
    isUnsafePath: false,
    isFromPath: false,
    isAutoDetected: true,
    isDefault,
    offered: true,
  })
  return {
    platform: unix ? 'linux' : 'windows',
    profiles: unix
      ? [mk('bash', '/bin/bash', true), mk('zsh', '/usr/bin/zsh', false)]
      : [
          mk('PowerShell', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', true),
          mk('Command Prompt', 'C:\\Windows\\System32\\cmd.exe', false),
        ],
    defaultProfile: unix ? 'bash' : 'PowerShell',
    automationProfile: null,
    useWslProfiles: true,
    unsafeConfirmed: [],
    hostAbiVersion: 1,
    shellIntegration: true,
    remoteBackendAvailable: false,
  }
}

export async function terminalProfiles(): Promise<TerminalProfilesResponse> {
  if (!inTauri()) return demoProfiles()
  return nativeCall('terminal profiles', () => invoke<TerminalProfilesResponse>('terminal_profiles'))
}

export async function terminalSpawn(
  profile: string,
  rows: number,
  cols: number,
  cwd?: string,
): Promise<string> {
  return nativeCall('terminal spawn', () =>
    invoke<string>('terminal_spawn', { profile, rows, cols, cwd: cwd ?? null }),
  )
}

/**
 * P67 — run a command for the agent / a durable task on the *automation*
 * profile, in the same PTY plane. It appears in the Shell view as a read-only
 * labelled tab, and the shell itself reports the command line and exit code
 * back through shell integration.
 */
export async function terminalRun(
  command: string,
  opts: { label?: string; origin?: 'agent' | 'task'; rows?: number; cols?: number } = {},
): Promise<string> {
  return nativeCall('terminal run', () =>
    invoke<string>('terminal_run', {
      command,
      label: opts.label ?? null,
      origin: opts.origin ?? 'agent',
      rows: opts.rows ?? null,
      cols: opts.cols ?? null,
    }),
  )
}

export async function terminalWrite(ptyId: string, data: string): Promise<boolean> {
  if (!inTauri()) return true
  return nativeCall('terminal write', () => invoke<boolean>('terminal_write', { ptyId, data }))
}

export async function terminalResize(ptyId: string, rows: number, cols: number): Promise<boolean> {
  if (!inTauri()) return true
  return nativeCall('terminal resize', () => invoke<boolean>('terminal_resize', { ptyId, rows, cols }))
}

export async function terminalKill(ptyId: string): Promise<boolean> {
  if (!inTauri()) return true
  return nativeCall('terminal kill', () => invoke<boolean>('terminal_kill', { ptyId }))
}

export async function terminalStatus(): Promise<{ count: number; ptys: TerminalPtyStatus[] }> {
  if (!inTauri()) return { count: 0, ptys: [] }
  return nativeCall('terminal status', () => invoke('terminal_status'))
}

export async function terminalSetDefault(name: string): Promise<boolean> {
  if (!inTauri()) return false
  return nativeCall('terminal set default', () => invoke<boolean>('terminal_set_default', { name }))
}

export async function terminalSetAutomation(name: string | null): Promise<string | null> {
  if (!inTauri()) return null
  return nativeCall('terminal set automation', () =>
    invoke<string | null>('terminal_set_automation', { name }),
  )
}

export async function terminalConfirmUnsafe(name: string): Promise<string[]> {
  if (!inTauri()) return []
  return nativeCall('terminal confirm unsafe', () =>
    invoke<string[]>('terminal_confirm_unsafe', { name }),
  )
}

export async function terminalSetShellIntegration(enabled: boolean): Promise<boolean> {
  if (!inTauri()) return enabled
  return nativeCall('terminal set shell integration', () =>
    invoke<boolean>('terminal_set_shell_integration', { enabled }),
  )
}

/** P67 — structured command history for a session (decorations, picker, chat). */
export async function terminalCommands(
  ptyId: string,
  limit = 50,
): Promise<TerminalCommandsResponse> {
  return nativeCall('terminal commands', () =>
    invoke<TerminalCommandsResponse>('terminal_commands', { ptyId, limit }),
  )
}

/**
 * P67 — `#terminalLastCommand`, exactly as it should be shown to a model.
 * `null` when the shell has not reported a trusted command yet — never a
 * fabricated empty block.
 */
export async function terminalLastCommandContext(
  ptyId: string,
  maxChars?: number,
): Promise<string | null> {
  if (!inTauri()) return null
  return nativeCall('terminal last command context', () =>
    invoke<string | null>('terminal_last_command_context', {
      ptyId,
      maxChars: maxChars ?? null,
    }),
  )
}

/** P67 — recent command history as a compact block (terminal-history context). */
export async function terminalHistoryContext(
  ptyId: string,
  limit = 10,
  maxChars?: number,
): Promise<string | null> {
  if (!inTauri()) return null
  return nativeCall('terminal history context', () =>
    invoke<string | null>('terminal_history_context', {
      ptyId,
      limit,
      maxChars: maxChars ?? null,
    }),
  )
}

/**
 * P68.8 — replay a session's retained output after a view reattaches.
 *
 * Bytes come back base64-encoded, exactly like a live `data` frame, so the same
 * decoder feeds xterm and xterm keeps owning VT interpretation. `dropped > 0`
 * means our cursor had already been evicted from the ring: the replay is then
 * *truncated* and the caller must label it rather than present a seamless
 * scrollback that hides a gap. `null` is returned off-Tauri only; a real read
 * failure rejects (via `nativeCall`) so the caller can say the replay is
 * unavailable instead of showing an empty scrollback as if it were complete.
 */
export interface TerminalReplayResponse {
  ptyId: string
  /** Newest retained cursor — pass back as `fromSeq` to fetch only updates. */
  seq: number
  /** Retained output, base64 (same shape as a `data` event frame). */
  data: string
  /** Bytes missed because the cursor was evicted. Nonzero ⇒ truncated view. */
  dropped: number
  /** The ring's capacity in bytes — the honest size of the retention window. */
  capacity: number
}

export async function terminalReplay(
  ptyId: string,
  fromSeq?: number,
): Promise<TerminalReplayResponse | null> {
  if (!inTauri()) return null
  return nativeCall('terminal replay', () =>
    invoke<TerminalReplayResponse>('terminal_replay', { ptyId, fromSeq: fromSeq ?? null }),
  )
}

/** Subscribe to `terminal-event` frames. Returns an unsubscribe fn. */
export function onTerminalEvent(cb: (ev: TerminalEvent) => void): UnlistenFn {
  if (!inTauri()) return () => {}
  let unlisten: UnlistenFn | undefined
  void listen<TerminalEvent>('terminal-event', (e) => cb(e.payload)).then((u) => (unlisten = u))
  return () => unlisten?.()
}

/** Decode a base64 frame into raw bytes for `term.write(Uint8Array)`.
 * Returns null when the payload is not decodable (never writes garbage). */
export function decodeChunk(data: string): Uint8Array | null {
  if (!data) return null
  try {
    const bin = atob(data)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Human label for the backend chip. */
export function backendLabel(backend: TerminalBackendId): string {
  if (backend === 'wsl') return 'WSL'
  if (backend === 'remote') return 'Remote node'
  return 'Local PTY'
}

/** Human label for provenance. `human` tabs are the unremarkable case. */
export function originLabel(origin: TerminalOriginId): string {
  if (origin === 'agent') return 'Agent'
  if (origin === 'task') return 'Task'
  return 'You'
}

/** Only a human tab accepts keystrokes; agent/task tabs are watch-only. */
export function isInteractiveOrigin(origin: TerminalOriginId): boolean {
  return origin === 'human'
}

/** Short directory name for the tab label (VS Code shows the leaf). */
export function cwdLeaf(cwd: string): string {
  if (!cwd) return ''
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

/* ---------------------------------------------------------------------------
 * P68 — tokenized xterm theme.
 *
 * xterm needs concrete color strings, but our palette lives in CSS custom
 * properties (HSL channel triplets like `220 25% 97%`). This reads the live
 * computed styles so the terminal follows light/dark *and* the accent token —
 * no hardcoded warm/cream hex, no `bg-zinc-950`, no orange cursor.
 * ------------------------------------------------------------------------- */

function tokenHsl(name: string, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!raw) return fallback
    // Channels → real color. Supports `H S% L%` and `H S% L% / a` forms.
    return `hsl(${raw.replace(/\//, '/')})`
  } catch {
    return fallback
  }
}

function tokenHsla(name: string, alpha: number, fallback: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (!raw) return fallback
    return `hsl(${raw} / ${alpha})`
  } catch {
    return fallback
  }
}

/** Build an xterm ITheme from the shell's semantic tokens. Falls back to the
 * current dark palette when CSS vars are unavailable (SSR/preview). */
export function computeXtermTheme(dark: boolean): ITheme {
  if (typeof document === 'undefined') {
    return dark
      ? { background: '#0b0b0d', foreground: '#e7e3dc' }
      : { background: '#faf7f0', foreground: '#2a2622' }
  }
  const g = (n: string, f: string) => tokenHsl(n, f)
  return {
    background: g('--background', dark ? '#0b0b0d' : '#faf7f0'),
    foreground: g('--foreground', dark ? '#e7e3dc' : '#2a2622'),
    cursor: g('--brand', dark ? '#3b82f6' : '#2563eb'),
    cursorAccent: g('--background', dark ? '#0b0b0d' : '#faf7f0'),
    selectionBackground: tokenHsla('--accent', 0.35, dark ? '#27272a' : '#e4e4e7'),
    // Muted structure colors derived from semantic tokens (not raw grays, so
    // the ramp follows the theme files).
    black: g('--muted', '#18181b'),
    brightBlack: g('--muted-foreground', dark ? '#a1a1aa' : '#71717a'),
    white: g('--card', dark ? '#1c1c1f' : '#ffffff'),
    brightWhite: g('--foreground', dark ? '#e7e3dc' : '#2a2622'),
    red: g('--danger', '#ef4444'),
    green: g('--success', '#22c55e'),
    yellow: g('--warning', '#eab308'),
    blue: g('--info', '#3b82f6'),
  }
}
