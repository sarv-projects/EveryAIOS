// P32.14 / WP4 — tiers of interruption.
//
// Field evidence (2026): ~93% of agent permission prompts get approved and
// ~70% of security warnings are dismissed in under two seconds. Uniform gating
// trains a reflex, so the prompts that genuinely need a human must be rare AND
// look different from the routine ones.
//
// Two tiers are produced today:
//   • "Needs you" — an effect is blocked until you answer (permission, plan,
//     diff, budget, autonomy escalation).
//   • "Your call" — a question; nothing is blocked on an effect (spec Q&A).
//
// The third tier from the audit — "Undo" (an effect already ran, and the
// affordance is to roll it back) — is not an interrupt: it is delivered by the
// failure card's Undo action plus the receipt-backed rollback, so it is not
// duplicated here as a tier with no producer.

/** The subset of an interrupt this module reasons about. */
export interface InterruptLike {
  kind: 'diff' | 'permission' | 'mcq' | 'budget' | 'plan' | 'autonomy'
  title: string
  description?: string
  urgency?: 'low' | 'medium' | 'high'
}

export type InterruptTier = 'review' | 'needs-you' | 'review-after'

/**
 * P61.12 — non-blocking "Done — review" class. Low-risk local writes under
 * Auto autonomy run without a prompt and are summarised afterwards. The Guard
 * still records the receipt; this only classifies the UI interrupt.
 */
export function digestClass(
  risk: string,
  permissionMode: string,
  highBlast: boolean,
): InterruptTier {
  if (highBlast) return 'needs-you'
  const mode = permissionMode.toLowerCase()
  const auto = mode === 'auto' || mode === 'full' || mode === 'sandbox'
  const low = risk === 'low' || risk === 'local-write' || risk === 'read'
  if (auto && low) return 'review-after'
  return 'needs-you'
}

/** Which kind of attention this interrupt is asking for. */
export function tierFor(i: InterruptLike): InterruptTier {
  return i.kind === 'mcq' ? 'review' : 'needs-you'
}

export const TIER_LABEL: Record<InterruptTier, string> = {
  review: 'Your call',
  'needs-you': 'Needs you',
  'review-after': 'Done — review',
}

/**
 * Words that mean an effect is hard or impossible to walk back. Deliberately
 * broad and text-based: it only decides whether the approval must be
 * deliberate, never whether the action is allowed (the Guard owns that).
 */
const HIGH_BLAST =
  /\b(delete|remove|erase|purge|drop|truncate|format|wipe|overwrite|send|email|pay|payment|transfer|purchase|buy|grant|revoke|install|uninstall|deploy|publish|submit|password|secret|credential|api[ -]?key|rm -rf|shutdown|terminate)\b/i

/**
 * Whether approving this needs to be a deliberate act, not a reflex click.
 *
 * Tested against the text as written *and* with `_`/`-` read as separators:
 * a tool id like `delete_file` has no word boundary before/after "delete"
 * because `_` is itself a word character, so the raw form alone would miss
 * exactly the operations this gate exists for.
 */
export function isHighBlast(text: string): boolean {
  return HIGH_BLAST.test(text) || HIGH_BLAST.test(text.replace(/[_-]+/g, ' '))
}

/**
 * The exact words the user must retype to approve a high-blast action — the
 * name of the thing being acted on (a file basename when one is named,
 * otherwise the operation's first word). Typing the real name is the point:
 * "Approve" is a button everyone has learned to press.
 */
export function confirmWord(i: InterruptLike): string {
  // Titles look like "delete_file · /home/me/report.xlsx, /home/me/notes.md".
  const afterSep = i.title.split('·')[1]?.trim()
  if (afterSep) {
    const first = afterSep.split(',')[0]?.trim() ?? ''
    const base = first.split(/[\\/]/).filter(Boolean).pop()
    if (base) return base
    if (first) return first
  }
  return i.title.trim().split(/\s+/)[0] ?? i.title
}

/**
 * Whether the typed text satisfies the confirmation. Case- and
 * whitespace-insensitive so it is a deliberate act, not a typing test.
 */
export function confirmSatisfied(i: InterruptLike, typed: string): boolean {
  if (!isHighBlast(`${i.title} ${i.description ?? ''}`)) return true
  return typed.trim().toLowerCase() === confirmWord(i).trim().toLowerCase()
}
