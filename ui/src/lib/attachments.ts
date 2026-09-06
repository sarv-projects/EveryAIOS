// P52.12 — attachment contract, client-side half (pure, unit-testable).
// The image *send* path is wire-gated (no image arg on chat_stream, no
// vision part emission in the coordinator yet) — this module owns the
// validate → resize → b64-limit rules the contract specifies so they are
// ready and tested the moment the image wire lands. SVG + plain text
// attachments ARE sendable today through the `userDocuments` seam.
//
// Contract (P52.12): PNG/JPEG/GIF/WebP only · ≤20 MiB · downscale to
// ≤2000px · reject if still >5 MiB as base64 · SVG attaches as text.

export const ATTACH_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const

/** SVG + plain text ride the existing text `userDocuments` seam. */
export const ATTACH_TEXT_TYPES = ['image/svg+xml', 'text/plain', 'text/markdown', 'text/csv'] as const

export const MAX_ATTACH_BYTES = 20 * 1024 * 1024 // 20 MiB source cap
export const MAX_ATTACH_DIM = 2000 // longest side, px
export const MAX_ATTACH_B64_BYTES = 5 * 1024 * 1024 // 5 MiB as base64

export type AttachClass = 'image' | 'svg' | 'text' | 'unsupported'

/** Classify a picked file against the attach contract. */
export function classifyAttachment(name: string, mime: string): AttachClass {
  if ((ATTACH_IMAGE_TYPES as readonly string[]).includes(mime)) return 'image'
  if (mime === 'image/svg+xml') return 'svg'
  if ((ATTACH_TEXT_TYPES as readonly string[]).includes(mime)) return 'text'
  // Some OSes report empty/synthetic MIME types for common extensions.
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'svg') return 'svg'
  if (['txt', 'md', 'markdown', 'csv'].includes(ext)) return 'text'
  return 'unsupported'
}

export type ValidateResult = { ok: true } | { ok: false; reason: string }

/** Contract gate #1: allowed type + ≤20 MiB, before any resize work. */
export function validateImage(file: { name: string; type: string; size: number }): ValidateResult {
  if (classifyAttachment(file.name, file.type) !== 'image') {
    return { ok: false, reason: `Unsupported image type — expected PNG, JPEG, GIF or WebP (${file.name}).` }
  }
  if (file.size > MAX_ATTACH_BYTES) {
    return { ok: false, reason: `File is ${fmtBytes(file.size)} — the 20 MiB attach limit applies before resize.` }
  }
  return { ok: true }
}

/** Pure aspect-preserving downscale: longest side → ≤maxDim. */
export function downscaleDimensions(w: number, h: number, maxDim = MAX_ATTACH_DIM): { width: number; height: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0 }
  const longest = Math.max(w, h)
  if (longest <= maxDim) return { width: Math.round(w), height: Math.round(h) }
  const scale = maxDim / longest
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** Contract gate #2: ≤5 MiB once base64-encoded (post-resize enforcement). */
export function checkBase64Limit(b64: string): ValidateResult {
  if (b64.length > MAX_ATTACH_B64_BYTES) {
    return {
      ok: false,
      reason: `Still ${fmtBytes(b64.length)} as base64 after resize — the 5 MiB b64 limit applies. Pick a smaller source.`,
    }
  }
  return { ok: true }
}

export interface ResizedImage {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

/**
 * Contract gate #2: decode → downscale to ≤2000px → re-encode → b64 check.
 * Returns the resized data URL (the future image-part payload) or the
 * rejection reason. Uses canvas; the pure sizing math is `downscaleDimensions`
 * so the rules stay testable without a DOM.
 */
export async function resizeImageToMax(file: File, maxDim = MAX_ATTACH_DIM): Promise<ResizedImage | ValidateResult> {
  const gate = validateImage(file)
  if (!gate.ok) return gate
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    return { ok: false, reason: 'Could not decode the image — the file may be corrupt.' }
  }
  const { width, height } = downscaleDimensions(bitmap.width, bitmap.height, maxDim)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: false, reason: 'Canvas unavailable — cannot resize.' }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const mime = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
  const dataUrl = canvas.toDataURL(mime, 0.92)
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const b64Gate = checkBase64Limit(b64)
  if (!b64Gate.ok) return b64Gate
  return { dataUrl, width, height, bytes: b64.length }
}

/** SVG attaches as text through `userDocuments` (title/content strings). */
export async function readSvgAsText(file: File): Promise<string> {
  return file.text()
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`
  return `${n} B`
}