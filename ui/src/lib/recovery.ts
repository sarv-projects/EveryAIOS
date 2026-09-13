// P32.11 / WP3 — the first-failure cliff.
//
// Field evidence (2026): a single agent failure with **no visible way to dial
// back autonomy** produces permanent abandonment, not reduced permission. The
// failure card already explained what went wrong and offered Retry; these are
// the exits that were missing, kept as pure functions so the wording and the
// ladder arithmetic are unit-tested rather than living inside JSX.

import type { PermissionMode } from './ui-prefs'

/** Ascending freedom — index 0 is the most restrictive. */
const SAFER_ORDER: readonly PermissionMode[] = ['sandbox', 'ask', 'auto', 'full']

/**
 * One step toward the safest setting. Returns null when there is nothing safer
 * to offer (already `sandbox`), so the UI can hide the action instead of
 * pretending it will change something.
 */
export function saferMode(current: PermissionMode): PermissionMode | null {
  const i = SAFER_ORDER.indexOf(current)
  if (i <= 0) return null
  return SAFER_ORDER[i - 1] ?? null
}

/** Appended when the user asks for a retry under tighter limits. */
export const TRY_SAFER_NOTE =
  '(Retry this, but stay within tighter limits: propose before changing anything, and avoid irreversible steps.)'

/** Appended when the user asks for a genuinely different approach. */
export const TRY_DIFFERENTLY_NOTE =
  '(That attempt did not work. Try a different approach — do not repeat the same steps.)'

/** The same ask, with an explicit instruction to work more cautiously. */
export function saferPrompt(original: string): string {
  const base = original.trim()
  return base ? `${base}\n\n${TRY_SAFER_NOTE}` : TRY_SAFER_NOTE
}

/** The same ask, with an explicit instruction to change approach. */
export function differentlyPrompt(original: string): string {
  const base = original.trim()
  return base ? `${base}\n\n${TRY_DIFFERENTLY_NOTE}` : TRY_DIFFERENTLY_NOTE
}

/**
 * Whether the failed turn actually ran anything that could be undone. A turn
 * that failed before its first successful tool call has nothing to roll back,
 * so offering "Undo" there would be a lie.
 */
export function hasUndoableWork(toolCalls: { status: string }[] | undefined): boolean {
  return (toolCalls ?? []).some((t) => t.status === 'done')
}
