/**
 * Artifact intent detection — model-agnostic, heuristic-first.
 *
 * This is the core of the "app owns the intelligence" design: we do NOT rely on
 * the LLM's native tool-calling to decide when to build a document. The app
 * detects the intent from the user's text, so it works with ANY model.
 */

import type { ArtifactFormat } from './document-spec.js';

export interface ArtifactIntent {
  /** True when the message is asking to build a document artifact. */
  isArtifact: boolean;
  /** Chosen output format (defaults to docx when unspecified). */
  format: ArtifactFormat;
  /** Confidence 0-1 from the heuristic. */
  confidence: number;
  /** True when the request refers to prior chat content ("this", "the above"). */
  referencesContext: boolean;
}

const CREATE_VERBS = [
  'make', 'create', 'generate', 'write', 'draft', 'build', 'produce',
  'put together', 'prepare', 'compose', 'export', 'give me', 'turn into',
  'turn this into', 'convert', 'save as', 'download',
];

const DOC_NOUNS = [
  'document', 'doc', 'report', 'letter', 'memo', 'proposal', 'essay',
  'resume', 'cv', 'cover letter', 'brief', 'summary doc', 'white paper',
  'whitepaper', 'article', 'contract', 'agreement', 'invoice', 'plan doc',
  'writeup', 'write-up', 'paper', 'file',
];

const PDF_HINTS = ['pdf', 'pdf file', 'as a pdf', 'to pdf', 'printable'];
const DOCX_HINTS = ['word', 'docx', '.doc', 'word document', 'word doc', 'editable'];

const CONTEXT_REFS = [
  'this', 'that', 'the above', 'above', 'it', 'these', 'those',
  'our conversation', 'what we discussed', 'the previous', 'this chat',
];

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

/**
 * Detect whether a user message is asking to build a document, and which format.
 *
 * Heuristic scoring:
 *   - create verb + doc noun     → strong signal
 *   - explicit format word       → boosts + sets format
 *   - "export/save as pdf/word"  → strong signal on its own
 */
export function detectArtifactIntent(message: string): ArtifactIntent {
  const text = ` ${message.toLowerCase().trim()} `;

  const hasVerb = containsAny(text, CREATE_VERBS.map((v) => ` ${v} `))
    || CREATE_VERBS.some((v) => text.trimStart().startsWith(v + ' '));
  const hasNoun = containsAny(text, DOC_NOUNS.map((n) => ` ${n}`));
  const hasPdf = containsAny(text, PDF_HINTS);
  const hasDocx = containsAny(text, DOCX_HINTS);

  // Format: explicit pdf wins, else word/docx, else default docx.
  const format: ArtifactFormat = hasPdf && !hasDocx ? 'pdf' : 'docx';

  let confidence = 0;
  if (hasVerb && hasNoun) confidence = 0.85;
  else if (hasNoun && (hasPdf || hasDocx)) confidence = 0.8;
  else if (hasVerb && (hasPdf || hasDocx)) confidence = 0.7;
  else if (hasNoun) confidence = 0.3;

  // "export as pdf" / "save as word" — strong even without a doc noun.
  if ((hasPdf || hasDocx) && containsAny(text, [' export', ' save as', ' download', ' as a '])) {
    confidence = Math.max(confidence, 0.82);
  }

  const referencesContext = containsAny(text, CONTEXT_REFS.map((r) => ` ${r} `));

  return {
    isArtifact: confidence >= 0.6,
    format,
    confidence,
    referencesContext,
  };
}
