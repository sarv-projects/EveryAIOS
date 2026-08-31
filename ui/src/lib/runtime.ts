import { useSyncExternalStore } from 'react'
import { inTauri } from './tauri'

/** The only runtime states the consumer UI may expose. */
export type RuntimeReadiness =
  | 'preview'
  | 'booting'
  | 'vault-setup'
  | 'vault-locked'
  | 'sidecar-offline'
  | 'live'
  | 'degraded'

export interface RuntimeState {
  status: RuntimeReadiness
  detail?: string
  updatedAt: number
}

const initialStatus: RuntimeState = {
  status: inTauri() ? 'booting' : 'preview',
  updatedAt: Date.now(),
}

let current = initialStatus
const listeners = new Set<() => void>()

export function getRuntimeState(): RuntimeState {
  return current
}

export function subscribeRuntimeState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRuntimeState(): RuntimeState {
  return useSyncExternalStore(
    subscribeRuntimeState,
    getRuntimeState,
    () => initialStatus,
  )
}

export function setRuntimeState(status: RuntimeReadiness, detail?: string): void {
  if (current.status === status && current.detail === detail) return
  current = { status, ...(detail ? { detail } : {}), updatedAt: Date.now() }
  for (const listener of listeners) listener()
}

export function runtimeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'The desktop runtime rejected the request.'
}

/**
 * One policy for every UI bridge:
 * - browser preview may use its explicitly marked fixture;
 * - Tauri must execute the native operation or reject it;
 * - a native rejection is never converted into a success or fixture.
 */
export async function nativeCall<T>(
  operation: string,
  live: () => Promise<T>,
  failureStatus: RuntimeReadiness = 'degraded',
): Promise<T> {
  if (!inTauri()) {
    throw new Error(`${operation} requires the Tauri desktop shell`)
  }
  try {
    return await live()
  } catch (error) {
    setRuntimeState(failureStatus, `${operation}: ${runtimeError(error)}`)
    throw error
  }
}

export async function bridgeCall<T>(opts: {
  operation: string
  live: () => Promise<T>
  preview: () => T | Promise<T>
  failureStatus?: RuntimeReadiness
}): Promise<T> {
  if (!inTauri()) {
    setRuntimeState('preview', 'Plain-browser development preview')
    return opts.preview()
  }
  return nativeCall(opts.operation, opts.live, opts.failureStatus)
}

export function markRuntimeLive(): void {
  setRuntimeState('live')
}

export function setRuntimeDetail(status: RuntimeReadiness, detail?: string): void {
  setRuntimeState(status, detail)
}

export function markSidecarOffline(detail = 'The coordinator sidecar is not available.'): void {
  setRuntimeState('sidecar-offline', detail)
}

export function markVaultSetup(detail = 'Create a vault passphrase to continue.'): void {
  setRuntimeState('vault-setup', detail)
}

export function markVaultLocked(detail = 'Unlock the vault to continue.'): void {
  setRuntimeState('vault-locked', detail)
}

export function markRuntimeBooting(): void {
  setRuntimeState('booting')
}
