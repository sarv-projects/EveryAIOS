// P35.2 — entrance stagger for list/table surfaces.
//
// Each list item gets `className="enter-stagger"` + `style={staggerStyle(i)}`.
// The CSS utility animates `enter-surface` with `backwards` fill, so delayed
// items stay invisible until their turn — a clean fade-up stagger on mount.

import type { CSSProperties } from 'react'

export interface StaggerOptions {
  /** Delay before the first item (ms). Default 0. */
  startMs?: number
  /** Delay between items (ms). Default 28 — barely-there, not march. */
  stepMs?: number
}

/** Per-index inline style: `style={staggerStyle(i)}`. */
export function staggerStyle(index: number, opts: StaggerOptions = {}): CSSProperties {
  const startMs = opts.startMs ?? 0
  const stepMs = opts.stepMs ?? 28
  const delay = startMs + index * stepMs
  return { animationDelay: `${delay}ms` }
}

/** Map helper for rendering: `items.map((item, i) => <li style={staggerStyle(i)} …>)`. */
export const staggerDelay = staggerStyle
