/**
 * Robust DocumentSpec parser.
 *
 * Free/small models frequently wrap JSON in fences, add prose, or truncate mid-
 * object. This parser extracts, repairs, and validates the spec so the pipeline
 * survives imperfect model output.
 */

import type { DocumentSpec, DocSection, ArtifactFormat } from './document-spec.js';

export interface ParseResult {
  ok: boolean;
  spec?: DocumentSpec;
  error?: string;
}

/** Strip markdown fences and any prose around the JSON object. */
function extractJsonBlock(raw: string): string {
  let s = raw.trim();
  // Remove ```json ... ``` or ``` ... ``` fences.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Grab from the first { to the last } (handles leading/trailing prose).
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
}

/**
 * Attempt to repair truncated JSON by closing open strings/brackets.
 * Handles the common free-model failure: response cut off by max_tokens.
 */
function repairTruncatedJson(s: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!;
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') stack.pop();
  }

  let repaired = s;
  if (inString) repaired += '"';
  // Drop a trailing comma before closing.
  repaired = repaired.replace(/,\s*$/, '');
  while (stack.length > 0) {
    const open = stack.pop();
    repaired += open === '{' ? '}' : ']';
  }
  return repaired;
}

function coerceLevel(v: unknown): 1 | 2 | 3 {
  const n = typeof v === 'number' ? v : Number(v);
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 1;
}

function normalizeSection(raw: unknown): DocSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const section: DocSection = {};

  if (typeof r.heading === 'string' && r.heading.trim()) section.heading = r.heading.trim();
  section.level = coerceLevel(r.level);

  if (Array.isArray(r.paragraphs)) {
    const paras = r.paragraphs.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    if (paras.length > 0) section.paragraphs = paras;
  }
  if (Array.isArray(r.bullets)) {
    const bullets = r.bullets.filter((b): b is string => typeof b === 'string' && b.trim().length > 0);
    if (bullets.length > 0) section.bullets = bullets;
  }
  if (r.table && typeof r.table === 'object') {
    const t = r.table as Record<string, unknown>;
    if (Array.isArray(t.headers) && Array.isArray(t.rows)) {
      const headers = t.headers.map((h) => String(h));
      const rows = t.rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((c) => String(c)));
      if (headers.length > 0) section.table = { headers, rows };
    }
  }

  // A section with no content at all is useless.
  if (!section.heading && !section.paragraphs && !section.bullets && !section.table) {
    return null;
  }
  return section;
}

export function parseDocumentSpec(raw: string, fallbackFormat: ArtifactFormat = 'docx'): ParseResult {
  if (!raw || !raw.trim()) return { ok: false, error: 'Empty model output' };

  const block = extractJsonBlock(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(block);
  } catch {
    try {
      obj = JSON.parse(repairTruncatedJson(block));
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Parsed value is not an object' };
  const o = obj as Record<string, unknown>;

  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '';
  if (!title) return { ok: false, error: 'Missing document title' };

  const type: ArtifactFormat = o.type === 'pdf' ? 'pdf' : o.type === 'docx' ? 'docx' : fallbackFormat;

  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections = sectionsRaw
    .map(normalizeSection)
    .filter((s): s is DocSection => s !== null);

  if (sections.length === 0) {
    return { ok: false, error: 'No usable sections in spec' };
  }

  const spec: DocumentSpec = { type, title, sections };
  if (typeof o.subtitle === 'string' && o.subtitle.trim()) spec.subtitle = o.subtitle.trim();

  return { ok: true, spec };
}
