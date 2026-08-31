// P48.3 (E9) — desktop computer-use bridge (desktop_cmds.rs / everyaios-
// computeruse). See / read / act on native windows through the effect funnel:
// every `act` is Guard-2 gated + Merkle-audited with human-gesture provenance,
// and risky classes fail closed on the Rust side.
//
// Human-gesture path only: the user drives this view directly (like the
// shell/git/office human path). In a plain-browser preview (no shell) the
// callers fall back to honest demo data so the surface is explorable.

import { inTauri, invoke } from './tauri'
import { nativeCall } from './runtime'

export interface DesktopCapabilities {
  see: string
  see_occluded: boolean
  uia_tree: boolean
  invoke_set_value: boolean
  send_input: boolean
  ocr: boolean
  window_list: boolean
  launch_app: boolean
}
export interface DesktopStatus {
  attached: boolean
  reason?: string | null
  capabilities?: DesktopCapabilities
}
export interface DesktopWindow {
  id: number
  title: string
  app: string
  x: number
  y: number
  width: number
  height: number
}
export type DesktopActKind = 'click' | 'clickByName' | 'type' | 'setValue'

export async function desktopStatus(): Promise<DesktopStatus> {
  if (!inTauri()) return { attached: false, reason: 'requires desktop shell' }
  return nativeCall('desktop status', () => invoke<DesktopStatus>('desktop_status'))
}

export async function desktopWindows(): Promise<DesktopWindow[]> {
  if (!inTauri()) return demoWindows()
  const r = await nativeCall('desktop windows', () => invoke<{ windows: DesktopWindow[] }>('desktop_windows'))
  return r.windows
}

export async function desktopRead(
  windowId: number,
): Promise<{ tree: string; has_tree: boolean; dpi_scale: number }> {
  if (!inTauri()) return { tree: '[0] Window "Demo"\n[1] Button "OK"', has_tree: true, dpi_scale: 1 }
  return nativeCall('desktop read', () => invoke('desktop_read', { windowId }))
}

export async function desktopSee(
  windowId: number,
): Promise<{ png: string; width: number; height: number }> {
  return nativeCall('desktop see', () => invoke('desktop_see', { windowId }))
}

/** Execute ONE human-initiated act. Risky classes fail closed on the Rust side. */
export async function desktopAct(
  windowId: number,
  kind: DesktopActKind,
  opts: { x?: number; y?: number; name?: string; text?: string } = {},
): Promise<{ ok: boolean; act: string }> {
  return nativeCall('desktop act', () => invoke('desktop_act', { windowId, kind, ...opts }))
}

export async function desktopStop(): Promise<{ stopped: boolean }> {
  if (!inTauri()) return { stopped: true }
  return nativeCall('desktop stop', () => invoke('desktop_stop'))
}

// ---- demo data (preview mode) ------------------------------------------

function demoWindows(): DesktopWindow[] {
  return [
    { id: 1, title: 'Untitled — TextEdit', app: 'TextEdit', x: 100, y: 80, width: 720, height: 480 },
    { id: 2, title: 'EveryAIOS — Chromium', app: 'Chromium', x: 200, y: 120, width: 1200, height: 800 },
  ]
}
