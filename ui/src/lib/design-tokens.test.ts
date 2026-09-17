import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

// P66.5 — contrast coverage for the semantic tokens, measured from the shipped
// stylesheet rather than eyeballed.
//
// The theme's whole point is that brand and status meaning live in tokens
// (`--brand`, `--warning`, …) and every surface references the token. That makes
// the accessible-colour question decidable in a test: parse `globals.css`, compose
// each theme variant the way the cascade does, and check the pairs the UI actually
// renders. TEST-CASES.md dimension 6 sets the bar at WCAG 2.2 AA.
//
// This is not a substitute for looking at the app — spacing, motion, focus order
// and first-paint are still visual. It is a substitute for *guessing* about colour.

const CSS = readFileSync(new URL('../globals.css', import.meta.url), 'utf8')

/** Extract `--name: value` declarations from the body of a selector block. */
function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS)
  if (!match) throw new Error(`no block for ${selector}`)
  const out: Record<string, string> = {}
  for (const line of match[1]!.split(';')) {
    const decl = /(--[a-z0-9-]+)\s*:\s*(.+)/.exec(line.trim())
    if (decl) out[decl[1]!] = decl[2]!.trim()
  }
  return out
}

/** Parse `H S% L%` (alpha forms are skipped — they are tints, not text). */
function hsl(value: string | undefined): [number, number, number] | null {
  if (!value || value.includes('/')) return null
  const m = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/.exec(value)
  if (!m) return null
  return [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100]
}

function toRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const seg = Math.floor(hp)
  const rgb: [number, number, number] =
    seg === 0 ? [c, x, 0]
    : seg === 1 ? [x, c, 0]
    : seg === 2 ? [0, c, x]
    : seg === 3 ? [0, x, c]
    : seg === 4 ? [x, 0, c]
    : [c, 0, x]
  const m = l - c / 2
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m]
}

function luminance(value: string | undefined): number | null {
  const parsed = hsl(value)
  if (!parsed) return null
  const [r, g, b] = toRgb(parsed).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio. */
function ratio(fg: string | undefined, bg: string | undefined): number {
  const a = luminance(fg)
  const b = luminance(bg)
  if (a === null || b === null) return 0
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const root = block(':root')
const dark = { ...root, ...block('.dark') }
const LIGHT_STEP = 4.5 // WCAG AA, normal-size text
const NON_TEXT_STEP = 3.0 // WCAG AA, large text / UI components

/** The surfaces a token can be drawn on, per theme. */
const LIGHT_SURFACES = ['--surface-0', '--surface-1', '--surface-2'] as const

/** Tokens used as text glyphs somewhere in `ui/src`. */
const TEXT_TOKENS = ['--foreground', '--muted-foreground', '--brand', '--warning'] as const

describe('P66.5 — semantic token contrast (WCAG 2.2 AA)', () => {
  test('body text meets AA on every light surface', () => {
    for (const surface of LIGHT_SURFACES) {
      for (const token of ['--foreground', '--muted-foreground'] as const) {
        const r = ratio(root[token], root[surface])
        expect(r, `${token} on ${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(LIGHT_STEP)
      }
    }
  })

  test('body text meets AA on every dark surface', () => {
    for (const surface of LIGHT_SURFACES) {
      for (const token of ['--foreground', '--muted-foreground'] as const) {
        const r = ratio(dark[token], dark[surface])
        expect(r, `${token} on dark ${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          LIGHT_STEP,
        )
      }
    }
  })

  test('the accent is legible as text on every light surface', () => {
    // `text-brand` is used for labels and glyphs, so it needs the text step.
    for (const surface of LIGHT_SURFACES) {
      const r = ratio(root['--brand'], root[surface])
      expect(r, `--brand on ${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(LIGHT_STEP)
    }
  })

  test('a button label stays legible on the accent fill', () => {
    const light = ratio(root['--brand-foreground'], root['--brand'])
    expect(light, `brand-foreground on brand = ${light.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      LIGHT_STEP,
    )
  })

  test('every semantic text token stays clear of its surface (non-text floor)', () => {
    // The floor that must never regress, in either theme, for every token the
    // UI draws as a glyph. `--warning` light is a recorded exception below.
    for (const surface of LIGHT_SURFACES) {
      for (const token of ['--foreground', '--muted-foreground', '--brand'] as const) {
        const light = ratio(root[token], root[surface])
        expect(light, `${token} on ${surface} = ${light.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          NON_TEXT_STEP,
        )
      }
      for (const token of TEXT_TOKENS) {
        const night = ratio(dark[token], dark[surface])
        expect(night, `dark ${token} on ${surface} = ${night.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          NON_TEXT_STEP,
        )
      }
    }
  })

  test('every selectable accent keeps the brand text step on light surfaces', () => {
    // Not every preset clears AA as small text on a light surface; the ones that
    // do are held here so a future palette edit cannot quietly undo them.
    for (const accent of ['violet']) {
      const themed = { ...root, ...block(`[data-accent="${accent}"]`) }
      for (const surface of LIGHT_SURFACES) {
        const r = ratio(themed['--brand'], themed[surface])
        expect(r, `accent ${accent}: --brand on ${surface} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          LIGHT_STEP,
        )
      }
    }
  })

  test('dark mode lifts every semantic status token above the light value', () => {
    // The regression this pins: `--success`/`--warning`/`--danger`/`--info` were
    // declared in `:root` only, so dark mode painted them at light-canvas
    // lightness. Each must now have its own dark declaration.
    for (const token of ['--success', '--warning', '--danger', '--info'] as const) {
      expect(dark[token], `${token} has no dark value`).toBeDefined()
      const darkL = luminance(dark[token])
      const lightL = luminance(root[token])
      expect(darkL, `${token} dark luminance`).not.toBeNull()
      expect(darkL!, `${token} dark value is not lifted (${darkL} vs ${lightL})`).toBeGreaterThan(
        lightL!,
      )
    }
  })

  test('known AA gaps are recorded, and cannot go stale silently', () => {
    // These four pairs are BELOW the AA step for normal text, and it is worth
    // being precise about why, because it is not a coding mistake:
    //
    //   UI-DESIGN-PROMPT §2.1 pins `Brand #2563EB` and `Warning/Ask #CA8A04`.
    //   #2563EB is 4.82:1 on the canvas (passes); #CA8A04 is 2.96:1 on a white
    //   card (fails) — the spec'd warning hue is simply too light to carry 10px
    //   text. Same story for the bright `sky` / `amber` accent presets, and for
    //   white-on-accent in dark mode (the dark brand is pinned bright).
    //
    // So each is asserted to sit in its measured band: below AA and above its
    // own floor. If a palette change closes a gap, the upper bound fails and the
    // note above has to be updated in the same commit. Nothing is claimed to
    // pass that does not pass.
    const gaps: Array<[string, number, number]> = [
      // label, floor, measured-not-yet-AA
      ['--warning on --surface-0', 2.5, ratio(root['--warning'], root['--surface-0'])],
      ['--warning on --surface-1', 2.5, ratio(root['--warning'], root['--surface-1'])],
      [
        'dark --brand-foreground on --brand',
        3.0,
        ratio(dark['--brand-foreground'], dark['--brand']),
      ],
      [
        'accent sky: --brand on --surface-0',
        2.2,
        ratio({ ...root, ...block('[data-accent="sky"]') }['--brand'], root['--surface-0']),
      ],
      [
        'accent emerald: --brand on --surface-0',
        3.0,
        ratio({ ...root, ...block('[data-accent="emerald"]') }['--brand'], root['--surface-0']),
      ],
      [
        'accent amber: --brand on --surface-0',
        2.2,
        ratio({ ...root, ...block('[data-accent="amber"]') }['--brand'], root['--surface-0']),
      ],
    ]
    for (const [label, floor, measured] of gaps) {
      expect(measured, `${label} = ${measured.toFixed(2)}:1 — below its own floor`).toBeGreaterThanOrEqual(
        floor,
      )
      expect(
        measured,
        `${label} now reaches AA (${measured.toFixed(2)}:1) — remove it from this list`,
      ).toBeLessThan(LIGHT_STEP)
    }
  })
})
