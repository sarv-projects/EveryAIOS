/**
 * Artifact Maker — shared document spec (model-agnostic).
 *
 * Any LLM (free pool, BYOK, whatever) emits this JSON shape; the app assembles
 * the binary on-device. This is the contract between the model and the builders.
 */

export type ArtifactFormat = 'docx' | 'pdf';

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocSection {
  /** Heading text for this section (optional — intro sections may omit it). */
  heading?: string;
  /** Heading level: 1 = H1, 2 = H2, 3 = H3. Defaults to 1. */
  level?: 1 | 2 | 3;
  /** Body paragraphs under this heading. */
  paragraphs?: string[];
  /** Optional bullet list items. */
  bullets?: string[];
  /** Optional table. */
  table?: DocTable;
}

export interface DocumentSpec {
  type: 'docx' | 'pdf';
  title: string;
  /** Optional subtitle / author line under the title. */
  subtitle?: string;
  sections: DocSection[];
}

export const ARTIFACT_FORMATS: ArtifactFormat[] = ['docx', 'pdf'];

/** Filesystem-safe base filename derived from the document title. */
export function slugifyTitle(title: string, fallback = 'document'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}
