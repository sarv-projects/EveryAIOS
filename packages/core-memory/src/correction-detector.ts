/**
 * correction-detector.ts — Heuristic correction detection for learned behaviors.
 *
 * Detects when a user corrects the AI on the same pattern repeatedly
 * and returns a PromotionCandidate for auto-promotion to persistent memory.
 *
 * No LLM calls — pure heuristic matching.
 */

export interface PromotionCandidate {
  /** The extracted preference string, e.g. "always use TypeScript" */
  pattern: string;
  /** Classification of the correction */
  category: 'style' | 'format' | 'content' | 'behavior';
  /** Confidence 0.0–1.0 based on how strongly the correction signal fires */
  confidence: number;
  /** The actual user messages that triggered this correction */
  sourceExamples: string[];
}

/** How many times the same correction must appear before promotion. */
export const PROMOTION_THRESHOLD = 3;

/**
 * Patterns that signal the start of a correction.
 * The message must BEGIN with one of these to be a correction (not just a disagreement
 * buried in a longer message).
 */
const NEGATION_STARTS: RegExp[] = [
  /^no[,.]?\s+/i,
  /^nope[,.]?\s+/i,
  /^not like that[,.]?\s+/i,
  /^wrong[,.]?\s+/i,
  /^that's not\s+/i,
  /^that is not\s+/i,
];

/**
 * Preference signals that indicate the user is expressing a preference or directive
 * about how the AI should behave.
 */
const PREFERENCE_SIGNALS: RegExp[] = [
  /I prefer\s+/i,
  /I (always|usually) want\s+/i,
  /please always\s+/i,
  /stop\s+/i,
  /don'?t\s+(ever|do|use|say|make|write|format)\s+/i,
  /never\s+(use|say|do|write|format|make)\s+/i,
  /always\s+(use|say|do|write|format|make)\s+/i,
  /I['']?d rather\s+/i,
  /I['']?d like\s+/i,
];

/**
 * Format/style correction verbs — the user instructs the AI to change *how* it responds,
 * not *what* the correct fact is.
 */
const DIRECTIVE_VERBS = [
  'use', 'write', 'format', 'say', 'do', 'make', 'keep',
  'add', 'include', 'remove', 'avoid', 'switch', 'change',
];

/** In-memory counter: pattern → number of times corrected. */
const correctionCounts = new Map<string, number>();

/**
 * Detect whether `userMessage` is a correction about AI behavior/style/format.
 *
 * Returns a `PromotionCandidate` when a correction is detected, or `null` when
 * the message is a factual disagreement, a question, or not a correction.
 *
 * The `history` parameter is reserved for future cross-turn analysis (e.g., if the
 * user responds to a clarification with the correction). Currently only the current
 * user message is analyzed.
 */
export function detectCorrections(
  userMessage: string,
  _assistantMessage: string,
  _history: Array<{ role: 'user' | 'assistant'; content: string }>,
): PromotionCandidate | null {
  const text = userMessage.trim();

  // Guard: too short to contain a meaningful correction
  if (text.length < 8) return null;
  // Guard: questions are not corrections
  if (text.endsWith('?')) return null;

  const lower = text.toLowerCase();

  // Check for preference signals first (these can stand alone)
  const hasPreferenceSignal = PREFERENCE_SIGNALS.some((p) => p.test(lower));

  // Check if message starts with a negation (stronger correction signal)
  const hasNegationStart = NEGATION_STARTS.some((p) => p.test(text));

  // Check for format correction patterns: "use X not Y"
  const hasFormatSwap = /use\s+.+?\s+(instead of|not)\s+/i.test(text);

  // Without any correction signal, bail out
  if (!hasNegationStart && !hasPreferenceSignal && !hasFormatSwap) return null;

  // Distinguish factual corrections from behavioral ones.
  // A message that ONLY contains a noun phrase + fact with no directive verb
  // is a factual disagreement, not a behavioral correction.
  const isFactualDisagreement = isPurelyFactual(lower, hasNegationStart, hasPreferenceSignal, hasFormatSwap);
  if (isFactualDisagreement) return null;

  // Extract the preference pattern from the correction
  const pattern = extractPattern(text, lower);
  if (!pattern || pattern.length < 4) return null;

  // Classify the category
  const category = classifyCategory(pattern, lower);

  // Source examples — just the current user message for now
  const sourceExamples = [userMessage];

  // Calculate confidence based on signal strength
  const confidence = computeConfidence(lower, hasNegationStart, hasPreferenceSignal, hasFormatSwap);

  return { pattern, category, confidence, sourceExamples };
}

/**
 * Returns true if the message looks like a factual disagreement rather than
 * a behavioral/style correction.
 */
function isPurelyFactual(
  lower: string,
  hasNegation: boolean,
  hasPreference: boolean,
  hasFormatSwap: boolean,
): boolean {
  if (hasFormatSwap) return false;

  // Preference signal alone is not enough — must also contain a directive or
  // behavioral word about how the AI should act.
  if (hasPreference) {
    return !hasBehavioralIntent(lower);
  }

  if (hasNegation) {
    return !hasBehavioralIntent(lower);
  }

  return false;
}

/**
 * Check whether text contains behavioral or directive intent about the AI's output.
 * Requires a directive verb or explicit behavioral keyword.
 */
function hasBehavioralIntent(lower: string): boolean {
  const hasDirectiveVerb = DIRECTIVE_VERBS.some((v) => {
    const regex = new RegExp(`\\b${v}(?:ing|s)?\\b`, 'i');
    return regex.test(lower);
  });
  if (hasDirectiveVerb) return true;

  const formatMention = /\b(typescript|javascript|python|rust|code|markdown|html|css|json|async|bullet|list|paragraph|bullet\s*points|formatting)\b/i.test(lower);
  if (formatMention) return true;

  const reflexiveAboutAi = /\b(your)\s+(response|answer|reply|output|explanation|format|approach|way|reasoning)\w*\b/i.test(lower);
  if (reflexiveAboutAi) return true;

  const responseQuality = /\b(shorter|longer|concise|verbose|simpler|clearer|detailed|brief|summary)\b/i.test(lower);
  if (responseQuality) return true;

  return false;
}

/**
 * Extract the meaningful preference from a correction message.
 * Strips negation and signal prefixes, returns the core directive.
 */
function extractPattern(text: string, lower: string): string | null {
  const lowerTrimmed = lower;

  // Try to extract after preference signals first
  for (const signal of PREFERENCE_SIGNALS) {
    if (!signal.test(lowerTrimmed)) continue;
    const m = signal.exec(lowerTrimmed);
    if (!m) continue;
    const afterSignal = text.slice(m.index + m[0].length).trim();
    const cleaned = afterSignal.replace(/[.!]+$/, '').trim();
    if (cleaned.length > 3) return cleaned;
  }

  // Try to extract after negation prefixes
  for (const start of NEGATION_STARTS) {
    if (!start.test(text)) continue;
    const match = start.exec(text);
    if (!match) continue;
    const afterNegation = text.slice(match.index + match[0].length).trim();
    const formatMatch = afterNegation.match(/(use\s+.+)/i);
    const formatResult = formatMatch?.[1];
    if (formatResult) return formatResult.replace(/[.!]+$/, '').trim();
    const cleaned = afterNegation.replace(/[.!]+$/, '').trim();
    if (cleaned.length > 3) return cleaned;
  }

  // Fallback: check for format swap without negation
  const swapMatch = text.match(/(use\s+.+?\s+(instead of|not)\s+.+)/i);
  const swapResult = swapMatch?.[1];
  if (swapResult) return swapResult.replace(/[.!]+$/, '').trim();

  return null;
}

/**
 * Classify a correction pattern into style, format, content, or behavior.
 */
function classifyCategory(pattern: string, lower: string): PromotionCandidate['category'] {
  // Format: about how things look, code style, structure
  const formatKeywords = /\b(use\s+\w+\s+(not|instead)|format|shorter|longer|indent|tab|spacing|syntax|case|naming|code|typescript|javascript|rust|python|async|coding|naming)\b/i;
  if (formatKeywords.test(pattern) || formatKeywords.test(lower)) return 'format';

  // Content: about what information to include or exclude
  const contentKeywords = /\b(detail|detail|summary|specific|include|mention|add|remove|more\s+about|less\s+about|focus|emphasis)\b/i;
  if (contentKeywords.test(pattern) || contentKeywords.test(lower)) return 'content';

  // Behavior: about how the AI acts or communicates
  const behaviorKeywords = /\b(don'?t|never|always|stop|avoid|say|do|make|respond|reply|call|jargon|tone|voice|persona|formal|casual|polite)\b/i;
  if (behaviorKeywords.test(pattern) || behaviorKeywords.test(lower)) return 'behavior';

  // Default: style (general presentation preference)
  return 'style';
}

/**
 * Compute a confidence score 0.0–1.0 based on how strong the correction signal is.
 */
function computeConfidence(
  lower: string,
  hasNegationStart: boolean,
  hasPreference: boolean,
  hasFormatSwap: boolean,
): number {
  let score = 0.4;

  // Stronger signals increase confidence
  if (hasNegationStart) score += 0.2;
  if (hasPreference) score += 0.2;
  if (hasFormatSwap) score += 0.15;

  // "always", "never", "stop" are strong behavioral corrections
  if (/always\s+|never\s+|stop\s+|don'?t\s+ever\b/i.test(lower)) score += 0.15;

  // Cap at 0.95 (never 1.0 — there's always uncertainty without LLM)
  return Math.min(0.95, score);
}

/**
 * Track a correction pattern in the in-memory counter.
 *
 * @returns The current count and whether it should be promoted.
 */
export function trackCorrection(pattern: string): { count: number; shouldPromote: boolean } {
  const current = correctionCounts.get(pattern) ?? 0;
  const count = current + 1;
  correctionCounts.set(pattern, count);
  return { count, shouldPromote: count >= PROMOTION_THRESHOLD };
}

/**
 * Get the current count for a pattern without incrementing.
 */
export function getCorrectionCount(pattern: string): number {
  return correctionCounts.get(pattern) ?? 0;
}

/**
 * Seed counts from persisted storage (called on startup by correction-store).
 * Does not reset existing counts that are higher.
 */
export function seedCorrectionCounts(entries: Array<{ pattern: string; count: number }>): void {
  for (const { pattern, count } of entries) {
    const existing = correctionCounts.get(pattern) ?? 0;
    if (count > existing) {
      correctionCounts.set(pattern, count);
    }
  }
}

/**
 * Clear all in-memory correction counts (used in tests).
 */
export function clearCounts(): void {
  correctionCounts.clear();
}
