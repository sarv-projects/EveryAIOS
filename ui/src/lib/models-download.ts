/**
 * P50.4.2 — Local model downloads (UI bridge over `model_cmds.rs`).
 *
 * The P27 backend was already landed in Rust (HfClient resumable Range
 * downloads + sha256 verify, ModelRegistry at `<data_dir>/models/hf`,
 * local:// resolver, ModelsRuntime). This module is the consumer wiring:
 * start/cancel/resume downloads, registry CRUD, hardware-fit quant
 * recommendation, and runtime binding — plus the live `model-download`
 * event stream (progress + terminal states).
 *
 * Truth rules: inside Tauri every call is a native call; failures propagate
 * (never converted to fake progress). Outside Tauri the panel is a
 * design-only preview: downloads are not offered (the controls render the
 * honest "requires the Tauri shell" note).
 */

import { inTauri, invoke, listen, type UnlistenFn } from "./tauri";

/** One in-flight or just-finished download (mirrors `DownloadStatus`). */
export interface ModelDownloadRow {
  id: string
  repo: string
  filename: string
  phase: "downloading" | "done" | "error" | "cancelled" | "serving" | "served"
  doneBytes: number
  totalBytes: number
  error?: string | null
  path?: string | null
  registryId?: string | null
}

/** An interrupted `.part` file found on disk (crash/cancel across restarts). */
export interface OrphanPart {
  dest: string
  rel: string
  doneBytes: number
}

/** One installed model in the canonical registry (`index.json`). */
export interface RegistryEntry {
  id: string
  path: string
  sha256: string
  size: number
  ctx: number
  quant: string
  source: string
}

export interface RegistryList {
  models: RegistryEntry[]
  totalBytes: number
  baseDir: string
}

/** Live `model-download` event payload (download + serve kinds). */
export interface ModelDownloadEvent {
  kind: "download" | "serve"
  id: string
  repo?: string
  filename?: string
  phase: string
  doneBytes?: number
  totalBytes?: number
  error?: string | null
  path?: string | null
  registryId?: string | null
  baseUrl?: string | null
}

export async function startDownload(repo: string, filename: string): Promise<{
  ok: boolean
  alreadyInstalled?: boolean
  id?: string
  resuming?: boolean
}> {
  return invoke("model_download_start", { repo, filename })
}

export async function listDownloads(): Promise<{
  active: ModelDownloadRow[]
  orphans: OrphanPart[]
}> {
  return invoke("model_downloads")
}

export async function cancelDownload(id: string): Promise<{ ok: boolean }> {
  return invoke("model_download_cancel", { id })
}

export async function registryList(): Promise<RegistryList> {
  return invoke("model_registry_list")
}

export async function removeModel(id: string): Promise<{ ok: boolean }> {
  return invoke("model_registry_remove", { id })
}

export async function recommendQuant(repo: string): Promise<{
  quant: string
  availableRamBytes: number
}> {
  return invoke("model_recommend_quant", { repo })
}

export async function serveModel(id: string): Promise<{
  ok: boolean
  port: number
  baseUrl: string
  starting: boolean
}> {
  return invoke("model_serve", { id })
}

/** Subscribe to download/serve progress events; returns an unlisten fn. */
export async function onModelDownloadEvent(
  cb: (e: ModelDownloadEvent) => void,
): Promise<UnlistenFn> {
  return listen<ModelDownloadEvent>("model-download", (event) => cb(event.payload))
}

/** True only in the Tauri shell — the downloader is a native capability. */
export function downloadsAvailable(): boolean {
  return inTauri()
}