/**
 * Output normalizer (spec §7 "Output Fidelity Engine" — post-processor).
 *
 * Cleans common LLM artifacts from a *completed* assistant response WITHOUT
 * touching fenced code blocks. Runs on-device after streaming completes (never
 * mid-stream — it needs the whole message). Pure + idempotent + allocation-light
 * so it is safe on a 4 GB Android device.
 *
 * What it removes/fixes (prose segments only):
 *  - Fluffy openers ("I'd be happy to…", "Certainly!", "Great question!")
 *  - Fluffy closers ("Let me know if you need anything else!", "Feel free to ask!")
 *  - "As an AI language model…" disclaimers
 *  - 3+ consecutive blank lines → single blank line
 *  - Trailing whitespace on each line
 *
 * What it NEVER touches:
 *  - Anything inside ```fenced code blocks``` (verbatim)
 *  - The substance of the answer (only known boilerplate phrases are cut)
 */

const OPENER_PATTERNS: RegExp[] = [
  /^\s*(?:sure|certainly|absolutely|of course|great question|good question|happy to help)[!,.]?\s*/i,
  /^\s*i(?:'| a)m happy to (?:help|assist)(?: you)?(?: with (?:this|that))?[!,.]?\s*/i,
  /^\s*i(?:'| woul)d be (?:happy|glad|delighted) to[^.!\n]*[.!]\s*/i,
  /^\s*let me (?:help|assist) you(?: with (?:this|that))?[!,.]?\s*/i,
  /^\s*here(?:'s| is) (?:the|a|an|your)[^:\n]{0,40}:\s*\n/i,
];

const CLOSER_PATTERNS: RegExp[] = [
  /\n+\s*(?:let me know if(?: you)?[^.\n]*|feel free to[^.\n]*|hope (?:this|that) helps[^.\n]*|is there anything else[^.\n]*|don't hesitate to[^.\n]*)[.!?]?\s*$/i,
];

const DISCLAIMER_PATTERNS: RegExp[] = [
  /\bas an ai(?: language)?(?: model)?[,]?\s*(?:i(?:'m| am)?)?\b[^.!?\n]*[.!?]\s*/gi,
  /\bi(?:'m| am) (?:just )?an ai[,]?\s*(?:and )?[^.!?\n]*[.!?]\s*/gi,
];

/** Normalize one prose segment (not code). */
function normalizeProse(text: string): string {
  let s = text;

  // Strip disclaimers anywhere.
  for (const re of DISCLAIMER_PATTERNS) s = s.replace(re, '');

  // Strip a single leading fluffy opener (only once, at the very start).
  for (const re of OPENER_PATTERNS) {
    const next = s.replace(re, '');
    if (next !== s) {
      s = next;
      break;
    }
  }

  // Strip a single trailing fluffy closer.
  for (const re of CLOSER_PATTERNS) {
    const next = s.replace(re, '');
    if (next !== s) {
      s = next;
      break;
    }
  }

  // Trailing whitespace per line + collapse 3+ blank lines.
  s = s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');

  return s;
}

/**
 * Normalize a completed assistant message. Splits out fenced code blocks,
 * normalizes only the prose between them, then reassembles verbatim.
 */
export function normalizeOutput(raw: string): string {
  if (!raw) return raw;

  // Split on fenced code blocks, keeping the fences as delimiters.
  // Even indices = prose, odd indices = code blocks (untouched).
  const parts = raw.split(/(```[\s\S]*?```)/g);
  const out = parts
    .map((part, i) => (i % 2 === 0 ? normalizeProse(part) : part))
    .join('');

  // Final trim of the whole message (safe — outside any code fence boundary).
  return out.trim();
}
