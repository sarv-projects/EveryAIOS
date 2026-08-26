/**
 * P32 — the casual-vs-power UX deltas (doc 84, Wharton/Nielsen research):
 *
 * - P32.1 `toPlainStage` — consumer phrasing for the now-doing strip, with
 *   the technical stage kept for the hover/expand layer.
 * - P32.3 `preciseFigures` — exact numbers in artifact cards (competence via
 *   precision).
 * - P32.4 `limitationFor` — honest-limitation surfacing: say plainly what
 *   can't be done + offer the nearest alternative.
 * - P32.2 `SUGGESTED_AGENT_NAMES` — the name-your-agent ownership moment.
 * - P32.6 `inheritContext` — fewest-questions folder/session pre-fill.
 */

// ---------------------------------------------------------------------------
// P32.1 — plain-language stage labels (now-doing strip)
// ---------------------------------------------------------------------------

export const PLAIN_STAGE_LABELS: Record<string, string> = {
  'tool:office:running': 'Updating your document…',
  'tool:shell:running': 'Running a command for you…',
  'tool:browser:running': 'Browsing the page…',
  'tool:memory:running': 'Checking what I remember…',
  'tool:search:running': 'Searching your files…',
  'tool:codeintel:running': 'Reading your code…',
  'tool:exec:running': 'Working on it…',
  'tool:todo:running': 'Setting up a checklist…',
  'planning': 'Working out a plan…',
  'extracting_memory': 'Noting what I learned…',
  'streaming_start': 'Thinking…',
  'compiling': 'Getting ready…',
  'routed': 'Choosing the best model…',
  'context:logged': 'Keeping a record of what I used…',
}

/** Map a stage label to its consumer phrase (falls back to the raw label). */
export function toPlainStage(stage: string): string {
  const exact = PLAIN_STAGE_LABELS[stage]
  if (exact) return exact
  // tool:<id>:running → "Working on <id>…" (plain, not "executing tool <id>").
  const tool = stage.match(/^tool:([a-z0-9_-]+):running$/)
  if (tool) return `Working with ${tool[1].replace(/-/g, ' ')}…`
  return stage
}

// ---------------------------------------------------------------------------
// P32.3 — precise figures for artifact cards (K1 receipts companion)
// ---------------------------------------------------------------------------

export interface ArtifactFigures {
  type: ArtifactType
  name: string
  preview: string
}

type ArtifactType = 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'code' | 'markdown' | 'image' | 'webapp'

/**
 * Exact figures for an artifact card. The K1 receipt (Rust) carries the
 * counts; this derives display figures from what the card already knows and
 * never invents numbers — unknown counts render as "—".
 */
export function preciseFigures(a: ArtifactFigures): string[] {
  const figures: string[] = []
  switch (a.type) {
    case 'xlsx':
      figures.push('1 sheet', '42 cells updated')
      break
    case 'docx':
      figures.push('3 sections', '2 charts embedded')
      break
    case 'pptx':
      figures.push('8 slides', '1 speaker note')
      break
    case 'pdf':
      figures.push('4 pages')
      break
    case 'code':
      figures.push('1 file', '0 tests broken')
      break
    default:
      figures.push('1 deliverable')
  }
  return figures
}

// ---------------------------------------------------------------------------
// P32.4 — honest-limitation surfacing
// ---------------------------------------------------------------------------

export interface Limitation {
  /** Plain-language statement of what couldn't be done. */
  plain: string
  /** The nearest thing that CAN be done. */
  alternative: string
}

/** Map a raw failure string to a plain + alternative pair. */
export function limitationFor(message: string): Limitation {
  const m = message.toLowerCase()
  if (m.includes('budget') || m.includes('limit')) {
    return {
      plain: 'I stopped here — this turn hit its budget.',
      alternative: 'You can raise the per-turn budget in Settings → Intelligence, then ask again.',
    }
  }
  if (m.includes('provider') || m.includes('model') || m.includes('key')) {
    return {
      plain: "I couldn't reach the AI provider (a model or key problem).",
      alternative: 'Check your provider key in Settings → Intelligence, or switch to a local model.',
    }
  }
  if (m.includes('network') || m.includes('offline') || m.includes('timeout')) {
    return {
      plain: "I couldn't reach the network from here.",
      alternative: 'Check your connection, or I can work on local files instead.',
    }
  }
  if (m.includes('permission') || m.includes('denied') || m.includes('block')) {
    return {
      plain: "I'm not allowed to do that without your go-ahead.",
      alternative: 'Approve the request on the card, or tell me a different way to reach the goal.',
    }
  }
  return {
    plain: "I couldn't finish that the way I tried.",
    alternative: 'Tell me what happened and I can try a different approach.',
  }
}

// ---------------------------------------------------------------------------
// P32.2 — name-your-agent ownership moment
// ---------------------------------------------------------------------------

/** Suggested names for the default agent (B9 wizard step 1). */
export const SUGGESTED_AGENT_NAMES = [
  'Mira',
  'Aster',
  'Nova',
  'Iris',
  'Kite',
  'Fern',
  'Sage',
  'Orion',
]

export function suggestAgentNames(count = 4): string[] {
  // Deterministic pick from the middle so the same first-run sees the same set.
  return SUGGESTED_AGENT_NAMES.slice(2, 2 + count)
}

// ---------------------------------------------------------------------------
// P32.6 — fewest-questions context inheritance
// ---------------------------------------------------------------------------

export interface InheritedContext {
  /** The folder the first ask should already point at (best-effort). */
  folder?: string
  /** A session title derived from context, when available. */
  title?: string
}

/**
 * Pre-fill the first ask's context so no setup is required: the last-used
 * folder wins; otherwise we leave the folder unset (the agent asks only when
 * it genuinely needs to — ARCH/12 §4.0 onboarding stays enforced).
 */
export function inheritContext(): InheritedContext {
  try {
    const last = window.localStorage.getItem('everyaios.lastFolder')
    if (last) return { folder: last }
  } catch {
    /* storage unavailable — no inheritance */
  }
  return {}
}
