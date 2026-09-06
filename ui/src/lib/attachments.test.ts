import { describe, expect, test } from 'bun:test'
import {
  ATTACH_IMAGE_TYPES,
  MAX_ATTACH_B64_BYTES,
  MAX_ATTACH_BYTES,
  MAX_ATTACH_DIM,
  checkBase64Limit,
  classifyAttachment,
  downscaleDimensions,
  fmtBytes,
  readSvgAsText,
  validateImage,
} from './attachments'

describe('classifyAttachment', () => {
  test('known image mimes', () => {
    for (const m of ATTACH_IMAGE_TYPES) expect(classifyAttachment('x.bin', m)).toBe('image')
  })
  test('svg is its own class (text-rideable)', () => {
    expect(classifyAttachment('diagram.svg', 'image/svg+xml')).toBe('svg')
  })
  test('text mimes', () => {
    expect(classifyAttachment('notes.txt', 'text/plain')).toBe('text')
    expect(classifyAttachment('a.md', 'text/markdown')).toBe('text')
  })
  test('extension fallback when mime is empty (OS quirk)', () => {
    expect(classifyAttachment('photo.PNG', '')).toBe('image')
    expect(classifyAttachment('flow.svg', '')).toBe('svg')
    expect(classifyAttachment('x.csv', '')).toBe('text')
  })
  test('unsupported', () => {
    expect(classifyAttachment('evil.exe', 'application/x-msdownload')).toBe('unsupported')
    expect(classifyAttachment('x.gif', 'image/gif')).toBe('image')
    expect(classifyAttachment('x.bmp', 'image/bmp')).toBe('unsupported')
  })
})

describe('validateImage (contract gate #1)', () => {
  test('accepts an in-limit image', () => {
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 1024 })).toEqual({ ok: true })
  })
  test('rejects over 20 MiB', () => {
    const r = validateImage({ name: 'a.png', type: 'image/png', size: MAX_ATTACH_BYTES + 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('20 MiB')
  })
  test('boundary: exactly 20 MiB passes', () => {
    expect(validateImage({ name: 'a.png', type: 'image/png', size: MAX_ATTACH_BYTES })).toEqual({ ok: true })
  })
  test('rejects non-image with clear reason', () => {
    const r = validateImage({ name: 'a.bmp', type: 'image/bmp', size: 10 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('PNG, JPEG, GIF or WebP')
  })
})

describe('downscaleDimensions (pure resize math)', () => {
  test('4000×3000 → 2000×1500', () => {
    expect(downscaleDimensions(4000, 3000)).toEqual({ width: 2000, height: 1500 })
  })
  test('tall 3000×9000 → 667×2000', () => {
    expect(downscaleDimensions(3000, 9000)).toEqual({ width: 667, height: 2000 })
  })
  test('under the cap stays untouched', () => {
    expect(downscaleDimensions(800, 600)).toEqual({ width: 800, height: 600 })
    expect(downscaleDimensions(MAX_ATTACH_DIM, MAX_ATTACH_DIM)).toEqual({ width: 2000, height: 2000 })
  })
  test('never collapses to zero', () => {
    expect(downscaleDimensions(1, 5000)).toEqual({ width: 1, height: 2000 })
  })
  test('garbage input → 0×0', () => {
    expect(downscaleDimensions(NaN, 10)).toEqual({ width: 0, height: 0 })
  })
})

describe('checkBase64Limit (contract gate #2)', () => {
  test('under 5 MiB passes', () => {
    expect(checkBase64Limit('a'.repeat(1024))).toEqual({ ok: true })
  })
  test('at exactly 5 MiB passes', () => {
    expect(checkBase64Limit('a'.repeat(MAX_ATTACH_B64_BYTES))).toEqual({ ok: true })
  })
  test('over 5 MiB rejects with reason', () => {
    const r = checkBase64Limit('a'.repeat(MAX_ATTACH_B64_BYTES + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('5 MiB')
  })
})

describe('readSvgAsText', () => {
  test('returns the svg source verbatim', async () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    const f = new File([src], 'd.svg', { type: 'image/svg+xml' })
    expect(await readSvgAsText(f)).toBe(src)
  })
})

describe('fmtBytes', () => {
  test('units', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(2048)).toBe('2 KiB')
    expect(fmtBytes(3 * 1024 * 1024)).toBe('3.0 MiB')
  })
})