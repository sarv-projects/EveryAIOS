/** Chars used for intent classification (not the full pasted body). */
export const CLASSIFY_PREFIX_CHARS = 250;

/** Above this: block managed-pool chat — route to file/BYOK path. */
export const SLM_BLOCK_CHARS = 2000;
/** V11 alias — same limit, cloud-only inference. */
export const CHAT_BLOCK_CHARS = SLM_BLOCK_CHARS;

/** Above this on PROMPT_BYOK: show file-first guidance instead of generic connect card. */
export const LARGE_INPUT_CHARS = 1000;

/** Must match chat load settings in app-mobile. */
export const SLM_CONTEXT_TOKENS = 32768;
export const SLM_MAX_OUTPUT_TOKENS = 9216;
/** V11 aliases for cloud chat limits. */
export const CHAT_CONTEXT_TOKENS = SLM_CONTEXT_TOKENS;
export const CHAT_MAX_OUTPUT_TOKENS = SLM_MAX_OUTPUT_TOKENS;

/** Rough English heuristic when no on-device tokenizer is available. */
export const CHARS_PER_TOKEN_ESTIMATE = 4;

export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / CHARS_PER_TOKEN_ESTIMATE);
}

export function classificationPrefix(text: string, maxChars = CLASSIFY_PREFIX_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}…`;
}

export function buildClassificationText(
  queryText: string,
  chatIntentAnchor?: string,
): string {
  const current = classificationPrefix(queryText, 80);
  const anchor = chatIntentAnchor?.trim();
  if (!anchor) {
    return classificationPrefix(queryText);
  }
  return `${classificationPrefix(anchor, 200)}\n${current}`;
}

export function createChatIntentAnchor(text: string): string {
  return classificationPrefix(text);
}

export function slmInputCharBudget(): number {
  return (SLM_CONTEXT_TOKENS - SLM_MAX_OUTPUT_TOKENS) * CHARS_PER_TOKEN_ESTIMATE;
}

export type SlmInputPrep = {
  text: string;
  truncated: boolean;
  estimatedDroppedTokens: number;
};

/** Keeps the tail of very long SLM prompts so the latest instruction stays visible. */
export function prepareSlmInput(fullText: string): SlmInputPrep {
  const budgetChars = slmInputCharBudget();
  if (fullText.length <= budgetChars) {
    return { text: fullText, truncated: false, estimatedDroppedTokens: 0 };
  }
  const text = fullText.slice(-budgetChars);
  const droppedChars = fullText.length - text.length;
  return {
    text,
    truncated: true,
    estimatedDroppedTokens: estimateTokens(droppedChars),
  };
}