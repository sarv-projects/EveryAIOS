// P9.5 — local OpenAI-compatible server bridge (openai_cmds.rs).
// Start/stop/status the loopback server that exposes the engine as an
// OpenAI-compatible API for VS Code / Cursor / Continue / any OpenAI SDK.
// In a plain-browser preview the calls return a representative demo status so
// the panel stays explorable.

import { invoke } from './tauri'
import { bridgeCall } from './runtime'

export interface OpenAiServerStatus {
  running: boolean
  baseUrl?: string
  token?: string
  already?: boolean
}

export async function openAiServerStatus(): Promise<OpenAiServerStatus> {
  return bridgeCall({
    operation: 'OpenAI-compatible server status',
    live: () => invoke<OpenAiServerStatus>('openai_server_status'),
    preview: () => ({ running: false }),
  })
}

export async function openAiServerStart(port?: number): Promise<OpenAiServerStatus> {
  return bridgeCall({
    operation: 'OpenAI-compatible server start',
    live: () => invoke<OpenAiServerStatus>('openai_server_start', port ? { port } : {}),
    preview: () => ({ running: false, already: false }),
  })
}

export async function openAiServerStop(): Promise<void> {
  await bridgeCall({
    operation: 'OpenAI-compatible server stop',
    live: () => invoke('openai_server_stop'),
    preview: () => undefined,
  })
}
