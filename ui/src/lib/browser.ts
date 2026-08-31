// P11.5.3 — browse view over a real CDP session (browser_cmds.rs). The Rust
// side spawns a headless Chrome, connects through everyaios-cdp and holds
// the session; these calls drive it. Without the shell, the demo fallback
// serves a canned page snapshot.

import { invoke, inTauri } from './tauri'
import { nativeCall } from './runtime'

export interface BrowserStatus {
  attached: boolean
  url?: string
}

export async function browserStart(): Promise<BrowserStatus> {
  if (!inTauri()) return { attached: false }
  return nativeCall('browser start', () => invoke<BrowserStatus>('browser_start'))
}

export async function browserNavigate(url: string): Promise<{ url: string }> {
  if (!inTauri()) return { url }
  return nativeCall('browser navigate', () => invoke('browser_navigate', { url }))
}

export async function browserSnapshot(): Promise<{ url: string; documentId: string; text: string }> {
  if (!inTauri()) return demoSnapshot()
  return nativeCall('browser snapshot', () => invoke('browser_snapshot'))
}

export async function browserRead(): Promise<{ url: string; text: string }> {
  if (!inTauri()) return { url: 'about:blank', text: '# Demo page\n\nStart the browser from the shell to browse the live web.' }
  return nativeCall('browser read', () => invoke('browser_read'))
}

export async function browserClick(refId: string): Promise<{ ok: boolean; added: string[]; removed: string[] }> {
  if (!inTauri()) return { ok: true, added: [], removed: [] }
  return nativeCall('browser click', () => invoke('browser_click', { refId }))
}

export async function browserType(refId: string | null, text: string): Promise<{ ok: boolean }> {
  if (!inTauri()) return { ok: true }
  return nativeCall('browser type', () => invoke('browser_type', { refId, text }))
}

export async function browserStop(): Promise<{ stopped: boolean }> {
  if (!inTauri()) return { stopped: false }
  return nativeCall('browser stop', () => invoke('browser_stop'))
}

export async function browserStatus(): Promise<BrowserStatus> {
  if (!inTauri()) return { attached: false }
  return nativeCall('browser status', () => invoke<BrowserStatus>('browser_status'))
}

function demoSnapshot() {
  return {
    url: 'about:blank',
    documentId: 'demo',
    text: [
      'webArea Demo page',
      '  heading Start browsing',
      '  paragraph Start the browser from the toolbar — the snapshot below will be the real accessibility tree.',
      '  link example.com [ref=e1]',
    ].join('\n'),
  }
}
