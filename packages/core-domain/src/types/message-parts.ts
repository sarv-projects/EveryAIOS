/**
 * MessagePart — typed union modelling an ordered stream of parts that make up
 * a single message (user or assistant). This is the canonical structured
 * representation of a chat message; legacy `content` (string) and side-fields
 * (`tool_calls_json`, `citations_json`, `artifact_id`, `cost_json`) are kept
 * for back-compat in schema v13 but are superseded by `parts_json`.
 *
 * The renderer is a `switch(part.type)` over the array; new part kinds get
 * added here first. Parts preserve document order so mid-stream interleaving
 * (text → tool card → text → source cards → artifact card) is possible —
 * the same model ChatGPT's mobile client uses.
 */

/** Spatial citation reference into an indexed source. */
export interface CitationRef {
  sourceId: string;
  /** FTS/vector chunk rowid inside `file_chunks` (or 0 if whole-source). */
  chunkId?: number;
  /** 1-indexed page number for PDFs/OCRed documents. */
  page?: number;
  /** Bounding box on the page in normalized [0,1] coords (l,t,r,b). */
  bbox?: [number, number, number, number];
  /** Optional human-readable quoted snippet rendered alongside the link. */
  snippet?: string;
}

/** A web search result rendered as an inline source card. */
export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
  /** Provider that contributed the result (for provenance). */
  provider?: string;
}

/** A single typed part of a message. */
export type MessagePart =
  | { type: 'text'; md: string }
  | { type: 'code'; lang: string; content: string; streaming?: boolean }
  | {
      type: 'tool_call';
      toolId: string;
      toolName: string;
      status: 'running' | 'ok' | 'denied' | 'error';
      argsJson?: string;
      resultCard?: { title: string; body: string };
      error?: string;
    }
  | { type: 'citations'; refs: CitationRef[] }
  | { type: 'source_cards'; results: WebSource[] }
  | { type: 'artifact'; artifactId: string; preview?: { kind: string; title: string } }
  | { type: 'memory_proposal'; factId: string; preview: string }
  | { type: 'image'; ref: string; alt?: string }
  | { type: 'error'; code: string; message: string; retryable: boolean }
  | { type: 'widget'; widget: WidgetData };

export type WidgetKind = 'checklist' | 'table' | 'info_card' | 'steps' | 'math_result';

export type WidgetData =
  | { kind: 'checklist'; title: string; items: Array<{ text: string; done: boolean }> }
  | { kind: 'table'; title?: string; headers: string[]; rows: string[][] }
  | { kind: 'info_card'; title: string; subtitle?: string; facts: Array<{ label: string; value: string }> }
  | { kind: 'steps'; title: string; steps: Array<{ label: string; status: 'pending' | 'done' | 'active' }> }
  | { kind: 'math_result'; expression: string; result: string; steps?: string[] };

/** Discriminated union guard helpers. */
export type MessagePartType = MessagePart['type'];

export function isTextPart(p: MessagePart): p is Extract<MessagePart, { type: 'text' }> {
  return p.type === 'text';
}

export function isCodePart(p: MessagePart): p is Extract<MessagePart, { type: 'code' }> {
  return p.type === 'code';
}

export function isToolCallPart(p: MessagePart): p is Extract<MessagePart, { type: 'tool_call' }> {
  return p.type === 'tool_call';
}

/** Serialize an ordered part array to the `parts_json` column value. */
export function encodeParts(parts: MessagePart[]): string {
  return JSON.stringify(parts);
}

const KNOWN_PART_TYPES = new Set<MessagePartType>([
  'text',
  'code',
  'tool_call',
  'citations',
  'source_cards',
  'artifact',
  'memory_proposal',
  'image',
  'error',
  'widget',
]);

function isValidPart(raw: unknown): raw is MessagePart {
  if (!raw || typeof raw !== 'object') return false;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== 'string' || !KNOWN_PART_TYPES.has(type as MessagePartType)) return false;
  // Minimal shape checks — reject obvious garbage so data is not silently dropped.
  switch (type) {
    case 'text':
      return typeof (raw as { md?: unknown }).md === 'string';
    case 'code':
      return (
        typeof (raw as { lang?: unknown }).lang === 'string' &&
        typeof (raw as { content?: unknown }).content === 'string'
      );
    case 'tool_call':
      return (
        typeof (raw as { toolId?: unknown }).toolId === 'string' &&
        typeof (raw as { toolName?: unknown }).toolName === 'string'
      );
    case 'memory_proposal':
      return (
        typeof (raw as { factId?: unknown }).factId === 'string' &&
        typeof (raw as { preview?: unknown }).preview === 'string'
      );
    case 'error':
      return (
        typeof (raw as { code?: unknown }).code === 'string' &&
        typeof (raw as { message?: unknown }).message === 'string'
      );
    default:
      return true;
  }
}

/**
 * Parse a `parts_json` column value back to a typed part array.
 * Invalid JSON / non-array → []. Individual invalid parts are skipped
 * (keeps partial valid data rather than discarding the whole message).
 */
export function decodeParts(partsJson: string | null | undefined): MessagePart[] {
  if (!partsJson) return [];
  try {
    const parsed = JSON.parse(partsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPart);
  } catch {
    return [];
  }
}
