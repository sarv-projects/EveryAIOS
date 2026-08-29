/**
 * Artifact Maker — model-agnostic document generation logic.
 *
 * The app owns the intelligence: detection, prompting, and spec parsing all live
 * here so document generation works with ANY LLM (free pool, BYOK, etc.) — never
 * fixated on one model's native tool-calling. Binary assembly happens on-device
 * in the app-mobile layer (fflate for DOCX, expo-print for PDF).
 */

export {
  type ArtifactFormat,
  type DocumentSpec,
  type DocSection,
  type DocTable,
  ARTIFACT_FORMATS,
  slugifyTitle,
} from './document-spec.js';

export {
  type ArtifactIntent,
  detectArtifactIntent,
} from './detect-artifact-intent.js';

export { buildDocMakerPrompt } from './docmaker-prompt.js';

export {
  type ParseResult,
  parseDocumentSpec,
} from './parse-spec.js';
