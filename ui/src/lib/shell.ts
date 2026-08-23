// P11.5.3 — real shell bridge. `shellSpawn` launches a real interactive shell
// (sh/cmd) with piped stdio; output streams back as `shell-event` frames from
// the Rust reader threads. The demo fallback echoes commands so the shell view
// is explorable without the Tauri shell.

import { invoke, inTauri, listen, type UnlistenFn } from './tauri'

export interface ShellEvent {
  id: string
  sessionId: string
  line: string
  kind: 'out' | 'err' | 'exit'
}

export async function shellSpawn(sessionId: string, shell?: string): Promise<string> {
  if (!inTauri()) return sessionId
  return invoke<string>('shell_spawn', { sessionId, shell })
}

export async function shellWrite(sessionId: string, input: string): Promise<{ ok: boolean; echo: string }> {
  if (!inTauri()) return { ok: true, echo: input }
  return invoke('shell_write', { sessionId, input })
}

export async function shellKill(sessionId: string): Promise<{ killed: boolean }> {
  if (!inTauri()) return { killed: false }
  return invoke('shell_kill', { sessionId })
}

export async function shellStatus(): Promise<{ shells: Record<string, string>; count: number }> {
  if (!inTauri()) return { shells: {}, count: 0 }
  return invoke('shell_status')
}

/** Subscribe to `shell-event` frames. Returns an unsubscribe fn. */
export function onShellEvent(cb: (ev: ShellEvent) => void): UnlistenFn {
  if (!inTauri()) return () => {}
  let unlisten: UnlistenFn | undefined
  void listen<ShellEvent>('shell-event', (e) => cb(e.payload)).then((u) => (unlisten = u))
  return () => unlisten?.()
}
