/**
 * Text chunking + token estimation — vendored from `@personal-ai/core-files`
 * (`indexing/chunking.ts`), matching the APP implementation verbatim.
 *
 * Why vendored instead of imported: the coordinator imports only
 * `chunkText`/`estimateTokens` from core-files but pays for the whole
 * package's import graph (pako, pdfjs-dist, onnxruntime-node …). That barrel
 * coupling is what silently failed 74 coordinator tests when a transitive
 * dep (`pako`) was missing in the sibling APP workspace. These two functions
 * are pure, deterministic text logic with no package dependencies — the P29
 * Tier 2c direction ("chunking glue stays Rust") ported to the sidecar as a
 * self-contained module, with the exact byte-for-byte behavior of the APP so
 * provider cache prefixes and token budgets are unchanged.
 *
 * The Rust `everyaios_memory::approx_tokens` (chars ≅ 4/token) is the same
 * core heuristic; this module is the sidecar's zero-IPC mirror so the hot
 * engine loop never round-trips to Rust for token counts.
 */

const CHARS_PER_TOKEN = 4;
const FIXED_CHUNK_TOKENS = 600;
const MIN_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 800;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** Approximate token count, matching `core-files` `estimateTokens`. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const words = text.trim().split(/\s+/).length;
  const charEstimate = Math.ceil(text.length / CHARS_PER_TOKEN);
  const wordEstimate = Math.ceil(words * 1.3);
  return Math.max(1, Math.ceil((charEstimate + wordEstimate) / 2));
}

/** Split text into bounded chunks, matching `core-files` `chunkText`. */
export function chunkText(text: string, mime: string): string[] {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return [];
  }

  if (isSemanticMime(mime)) {
    return chunkMarkdownSemantic(normalized);
  }

  return chunkFixedSize(normalized, FIXED_CHUNK_TOKENS);
}

function isSemanticMime(mime: string): boolean {
  return (
    mime === 'text/markdown' ||
    mime === 'text/html' ||
    mime === 'application/epub+zip' ||
    mime.endsWith('+markdown')
  );
}

function chunkFixedSize(text: string, targetTokens: number): string[] {
  const maxChars = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const chunks: string[] = [];
  let start = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 50000;

  while (start < text.length) {
    if (++iterations > MAX_ITERATIONS) break;
    let end = Math.min(start + targetChars, text.length);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      if (paragraphBreak > start + targetChars / 2) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = findSentenceBreak(text, start, end);
        if (sentenceBreak > start) {
          end = sentenceBreak;
        }
      }
    }

    let slice = text.slice(start, end).trim();
    if (slice.length > maxChars) {
      slice = slice.slice(0, maxChars).trim();
    }
    if (slice.length > 0) {
      chunks.push(slice);
    }

    if (end <= start) {
      end = Math.min(start + maxChars, text.length);
      const forced = text.slice(start, end).trim();
      if (forced.length > 0) {
        chunks.push(forced);
      }
    }

    start = end;
  }

  return mergeSmallChunks(chunks);
}

function findSentenceBreak(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const matches = [...window.matchAll(/[.!?]\s+/g)];
  if (matches.length === 0) {
    return -1;
  }
  const last = matches[matches.length - 1]!;
  return start + last.index! + last[0].length;
}

function chunkMarkdownSemantic(text: string): string[] {
  const sections = splitMarkdownSections(text);
  const chunks: string[] = [];
  let buffer = '';

  for (const section of sections) {
    const candidate = buffer.length > 0 ? `${buffer}\n\n${section}` : section;
    const tokens = estimateTokens(candidate);

    if (tokens <= MAX_CHUNK_TOKENS) {
      buffer = candidate;
      if (estimateTokens(buffer) >= MIN_CHUNK_TOKENS) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      continue;
    }

    if (buffer.trim().length > 0) {
      chunks.push(buffer.trim());
      buffer = '';
    }

    if (estimateTokens(section) <= MAX_CHUNK_TOKENS) {
      buffer = section;
      if (estimateTokens(buffer) >= MIN_CHUNK_TOKENS) {
        chunks.push(buffer.trim());
        buffer = '';
      }
      continue;
    }

    chunks.push(...chunkFixedSize(section, FIXED_CHUNK_TOKENS));
  }

  if (buffer.trim().length > 0) {
    chunks.push(buffer.trim());
  }

  return mergeSmallChunks(chunks);
}

function splitMarkdownSections(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (HEADING_RE.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections.filter((section) => section.length > 0);
}

function mergeSmallChunks(chunks: string[]): string[] {
  if (chunks.length <= 1) {
    return chunks;
  }

  const merged: string[] = [];
  let pending = '';

  for (const chunk of chunks) {
    const candidate = pending.length > 0 ? `${pending}\n\n${chunk}` : chunk;
    if (estimateTokens(candidate) < MIN_CHUNK_TOKENS) {
      pending = candidate;
      continue;
    }
    merged.push(candidate.trim());
    pending = '';
  }

  if (pending.length > 0) {
    if (merged.length > 0 && estimateTokens(pending) < MIN_CHUNK_TOKENS) {
      const last = merged.pop()!;
      merged.push(`${last}\n\n${pending}`.trim());
    } else {
      merged.push(pending.trim());
    }
  }

  return merged;
}