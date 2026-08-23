/**
 * P11.5.12 (H27) — resumable streams (doc 50).
 *
 * The coordinator holds in-flight stream state in memory (Bun) with
 * last-token/id tracking so a dropped IPC link can reconnect and resume from
 * the last emitted token (byte-continuous) instead of restarting the turn.
 *
 * - [`StreamRegistry`] — per-streamId state: last token, token count, usage,
 *   tool calls seen, and the resume cursor.
 * - [`IdempotencyClass`] — ARCH/03 retry semantics: which calls may be safely
 *   retried after an interrupted stream (safe_retry), which are
 *   same-key-deduped by the provider (same_key), and which must be confirmed
 *   before retry (confirm_after_uncertain).
 */

/** One in-flight stream's live state (the reconnect/resume source of truth). */
export interface StreamState {
  streamId: string;
  sessionId: string;
  /** Accumulated text so far (what a reconnect replays). */
  fullText: string;
  /** Last token received (the reconnect chip shows a preview). */
  lastToken: string;
  /** Completion-token counter (usage tracking). */
  tokens: number;
  /** Tool calls already emitted this stream. */
  toolCalls: number;
  /** Whether the stream ended cleanly (done/finish). */
  completed: boolean;
  /** Whether the stream was interrupted (reconnect needed). */
  interrupted: boolean;
  /** Idempotency key for the underlying provider call (same_key dedupe). */
  idempotencyKey: string | null;
  startedAtMs: number;
  lastActivityMs: number;
}

export class StreamRegistry {
  private streams = new Map<string, StreamState>();

  begin(streamId: string, sessionId: string, idempotencyKey: string | null = null): StreamState {
    const now = Date.now();
    const state: StreamState = {
      streamId,
      sessionId,
      fullText: "",
      lastToken: "",
      tokens: 0,
      toolCalls: 0,
      completed: false,
      interrupted: false,
      idempotencyKey,
      startedAtMs: now,
      lastActivityMs: now,
    };
    this.streams.set(streamId, state);
    return state;
  }

  /** Append a token delta; returns the updated state. */
  appendToken(streamId: string, delta: string): StreamState | null {
    const s = this.streams.get(streamId);
    if (!s) return null;
    s.fullText += delta;
    if (delta.trim().length > 0) s.lastToken = delta;
    s.tokens += 1;
    s.lastActivityMs = Date.now();
    return s;
  }

  markToolCall(streamId: string): StreamState | null {
    const s = this.streams.get(streamId);
    if (!s) return null;
    s.toolCalls += 1;
    s.lastActivityMs = Date.now();
    return s;
  }

  complete(streamId: string): StreamState | null {
    const s = this.streams.get(streamId);
    if (!s) return null;
    s.completed = true;
    s.interrupted = false;
    return s;
  }

  interrupt(streamId: string): StreamState | null {
    const s = this.streams.get(streamId);
    if (!s) return null;
    s.interrupted = true;
    return s;
  }

  get(streamId: string): StreamState | null {
    return this.streams.get(streamId) ?? null;
  }

  /** The state to resume from — the last N chars of text + token cursor. */
  resumeCursor(streamId: string, tailChars = 80): { from: string; tokens: number } | null {
    const s = this.streams.get(streamId);
    if (!s || s.completed) return null;
    return { from: s.fullText.slice(-tailChars), tokens: s.tokens };
  }

  drop(streamId: string): void {
    this.streams.delete(streamId);
  }

  /** Stale interrupted streams (no activity for `staleMs`). */
  stale(now: number, staleMs = 60_000): string[] {
    const out: string[] = [];
    for (const [id, s] of this.streams) {
      if (s.interrupted && now - s.lastActivityMs > staleMs) out.push(id);
    }
    return out;
  }

  get size(): number {
    return this.streams.size;
  }
}

/** ARCH/03 idempotency classes (doc 53 §4). */
export type IdempotencyClass = "safe_retry" | "unsafe" | "same_key" | "confirm_after_uncertain";

/**
 * Classify a tool call for retry semantics. Read-only/intent-neutral calls
 * are safe to re-run; mutations are unsafe without a fresh ticket; provider
 * calls carrying an idempotency key are same-key deduped; anything that may
 * have committed server-side but we cannot verify → confirm first.
 */
export function classifyIdempotency(op: {
  readOnly?: boolean;
  idempotencyKey?: string | null;
  tool?: string;
}): IdempotencyClass {
  if (op.readOnly) return "safe_retry";
  if (op.idempotencyKey) return "same_key";
  if (op.tool === "provider/stream") return "safe_retry"; // tokens are re-playable, never committed
  return "unsafe";
}

/**
 * Decide whether an interrupted call can be retried automatically. Safe/same-key
 * calls retry; unsafe calls require a fresh Guard-2 ticket (never auto-retried).
 */
export function canAutoRetry(cls: IdempotencyClass): boolean {
  return cls === "safe_retry" || cls === "same_key";
}

/** Build the reconnect chip payload for the UI. */
export function reconnectInfo(s: StreamState | null): {
  show: boolean;
  label: string;
  lastToken: string;
  tokens: number;
} | null {
  if (!s || s.completed) return null;
  if (!s.interrupted) return null;
  return {
    show: true,
    label: `🔄 Reconnecting… (${s.tokens} tokens)`,
    lastToken: s.lastToken,
    tokens: s.tokens,
  };
}
