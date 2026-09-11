// H36 (P54) — integrated terminal bridge. The Shell view talks only
// `profile_id` + `pty_id` to Rust; the renderer never sends an executable
// path (the shell resolves the profile name against its own detection).
//
// Output frames arrive as base64 chunks (`terminal-event`); xterm.js owns VT
// interpretation, so this layer never decodes the stream into lines.

import { invoke, inTauri, listen, type UnlistenFn } from './tauri'
import { nativeCall } from './runtime'

export type TerminalBackendId = 'local' | 'wsl' | 'remote'

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
  remoteBackendAvailable: boolean
}

export interface TerminalPtyStatus {
  ptyId: string
  profileId: string
  backend: TerminalBackendId
  running: boolean
  exitCode: number | null
}

export interface TerminalEvent {
  ptyId: string
  kind: 'data' | 'exit' | 'error'
  /** base64-encoded raw PTY bytes (empty on exit frames). */
  data: string
  code?: number | null
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
      : [mk('PowerShell', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', true), mk('Command Prompt', 'C:\\Windows\\System32\\cmd.exe', false)],
    defaultProfile: unix ? 'bash' : 'PowerShell',
    automationProfile: null,
    useWslProfiles: true,
    unsafeConfirmed: [],
    hostAbiVersion: 1,
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
