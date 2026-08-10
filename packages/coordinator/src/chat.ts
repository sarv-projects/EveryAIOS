/**
 * P1.4 — streaming chat loop (B1 base), the "sidecar proposes" half.
 *
 * Wires the reused `@personal-ai/core-engine` ConversationEngine (A-1, ARCH 11)
 * into the coordinator and exposes it as a JSON-RPC `chat/stream` method:
 *
 *   chat/stream          → { accepted, streamId }  (engine runs detached)
 *   chat/ttft|batch|done → notifications while streaming
 *   chat/cancel          → abort signal → provider bridge aborts
 *   chat/error           → provider/engine failures, incl. the J11
 *                          "stopped: $X limit" budget-kill surface
 *
 * ## Budget-aware, NOT credit-aware (the mobile-hook strip, A-10/C-3/C-4)
 * The APP's StreamSession has a `creditAware`/`shouldContinueStreaming` mode
 * (mobile credits). Desktop has NO credits — those hooks are dead config and
 * are deliberately never imported here. Instead, the hard $ budget (J11) lives
 * in Rust (`everyaios-vault::SessionBudget`); when the broker refuses a call
 * or the relay kills an over-budget session, the surfaced error carries
 * `code: "budget_exceeded"` and the message `stopped: $X limit`. This module
 * maps that error through untouched so the UI shows the exact string.
 */

import { ConversationEngine } from "@personal-ai/core-engine";
import type { StreamChunk, TurnInput } from "@personal-ai/core-engine";
import { StreamSession, assembleChatPrompt } from "@personal-ai/core-ai";

/** Minimal B1-base turn parameters (P1.5 owns full system-prompt assembly). */
export interface ChatStreamParams {
  sessionId: string;
  streamId: string;
  text: string;
  surface?: "chat" | "reader" | "bubble" | "automation";
  agentId?: string;
  provider?: string;
  model?: string;
}

/** Events the coordinator forwards to the UI as `chat/<type>` notifications. */
export type ChatEvent =
  | { type: "ttft"; streamId: string; latencyMs: number }
  | { type: "batch"; streamId: string; text: string; tokenCount: number }
  | { type: "reasoning"; streamId: string; text: string }
  | { type: "stage"; streamId: string; stage: string }
  | { type: "tool_call"; streamId: string; toolId: string }
  | { type: "tool_result"; streamId: string; toolId: string }
  | {
      type: "done";
      streamId: string;
      turnId: string;
      fullText: string;
      totalTokens: number;
      usage?: { promptTokens: number; completionTokens: number };
    }
  | { type: "error"; streamId: string; code: string; message: string }
  | { type: "cancelled"; streamId: string };

/** Provider request the bridge turns into a provider stream. */
export interface ProviderRequest {
  provider: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** Stream identity for bridge queue routing (set by the run loop). */
  streamId?: string;
  /** Session identity — the broker's ledger + J11 budget key (Rust). */
  sessionId?: string;
}

/**
 * The provider seam. The production implementation (`FrameProviderBridge`)
 * consumes `chat/provider_chunk` notifications that Rust pushes into the
 * coordinator's stdin (the broker holds the keys — the sidecar never does);
 * tests inject a scripted bridge.
 */
export interface ProviderBridge {
  streamChat(
    req: ProviderRequest,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk, void>;
}

/** A push/pull async queue for provider chunks (the IPC back-pressure seam). */
export class PendingQueue<T> {
  private queue: T[] = [];
  private waiters: Array<(v: T | undefined) => void> = [];
  private closed = false;

  push(v: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w(v);
    else this.queue.push(v);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters.splice(0)) w(undefined);
  }

  next(): Promise<T | undefined> {
    const head = this.queue.shift();
    if (head !== undefined) return Promise.resolve(head);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

/** Provider chunk payload pushed by Rust (mirror of `chat/provider_chunk`). */
export interface ProviderChunk {
  streamId: string;
  delta?: string;
  finish?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Present when the provider stream ended (generator may close). */
  ended?: boolean;
}

/**
 * The production bridge: an async generator fed by `chat/provider_chunk`
 * notifications arriving on the coordinator's stdin (written by the Rust
 * relay while the broker streams). One queue per stream.
 */
export class FrameProviderBridge implements ProviderBridge {
  private queues = new Map<string, PendingQueue<StreamChunk>>();

  /**
   * @param requestFn outbound JSON-RPC request (Rust dispatches
   * `provider/stream` — the broker runs there with the keys). Tests inject a
   * fake; the coordinator wires `sendRequest` from the run loop.
   */
  constructor(
    private readonly requestFn: (method: string, params: unknown) => Promise<unknown> = async () => ({}),
  ) {}

  /** Called by the run loop for each `chat/provider_chunk` notification. */
  handleChunk(chunk: ProviderChunk): void {
    let q = this.queues.get(chunk.streamId);
    if (!q) {
      q = new PendingQueue<StreamChunk>();
      this.queues.set(chunk.streamId, q);
    }
    if (chunk.ended) {
      q.close();
      this.queues.delete(chunk.streamId);
      return;
    }
    if (chunk.delta !== undefined) {
      q.push({ type: "text", text: chunk.delta });
    }
    if (chunk.usage) {
      q.push({
        type: "done",
        ...(chunk.usage.promptTokens !== undefined
          ? { usage: { promptTokens: chunk.usage.promptTokens, completionTokens: chunk.usage.completionTokens ?? 0 } }
          : {}),
      });
    }
  }

  async *streamChat(
    req: ProviderRequest,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk, void> {
    // One queue per stream, shared with handleChunk (which may create it
    // first — Rust pushes chunks right after the request frame).
    const key = req.streamId ?? "default";
    let q = this.queues.get(key);
    if (!q) {
      q = new PendingQueue<StreamChunk>();
      this.queues.set(key, q);
    }
    try {
      // The compiled prompt lives here, so the sidecar must ASK Rust to run
      // the provider call (the broker holds the keys — the sidecar never
      // does). A refusal (e.g. J11 budget) throws here and surfaces as a
      // chat/error through the engine.
      await this.requestFn("provider/stream", {
        provider: req.provider,
        model: req.model,
        sessionId: req.sessionId,
        streamId: key,
        messages: req.messages,
      });
      for (;;) {
        if (signal.aborted) return;
        const chunk = await q.next();
        if (chunk === undefined) return;
        yield chunk;
        if (chunk.type === "done") return;
      }
    } finally {
      q.close();
      this.queues.delete(key);
    }
  }
}

/** Active stream controllers (cancellation registry). */
const active = new Map<string, AbortController>();

/** Cancel a running stream: abort propagates engine → provider bridge. */
export function cancelChatStream(streamId: string): boolean {
  const c = active.get(streamId);
  if (!c) return false;
  c.abort();
  return true;
}

/** Number of active streams (tests/diagnostics). */
export function activeStreamCount(): number {
  return active.size;
}

let turnCounter = 0;

/**
 * Run one chat turn through the real ConversationEngine, forwarding its
 * events as [`ChatEvent`]s (token deltas batched at 33ms by StreamSession).
 * Detached by the `chat/stream` handler; emits via `emit`.
 */
export async function runChatStream(
  params: ChatStreamParams,
  emit: (e: ChatEvent) => void,
  bridge: ProviderBridge,
  batchIntervalMs = 33,
): Promise<void> {
  const { sessionId, streamId, text } = params;
  const surface = params.surface ?? "chat";
  const provider = params.provider ?? "nvidia";
  const model = params.model ?? "meta/llama";

  const controller = new AbortController();
  active.set(streamId, controller);

  // StreamSession (core-ai A-10): TTFT + 33ms batch flush. Checkpoints are
  // persistence-relevant (P2+) and not forwarded on the wire yet.
  // NB: StreamSession.complete() snapshots only the un-flushed buffer (batch
  // flushes clear it), so the authoritative full text is accumulated here.
  const batcher = new StreamSession(streamId, (ev) => {
    switch (ev.type) {
      case "ttft":
        emit({ type: "ttft", streamId, latencyMs: ev.latencyMs });
        break;
      case "batch":
        emit({ type: "batch", streamId, text: ev.text, tokenCount: ev.tokenCount });
        break;
      case "error":
        emit({ type: "error", streamId, code: "stream", message: ev.error });
        break;
      default:
        break;
    }
  }, { batchIntervalMs });

  const engine = new ConversationEngine({
    // Minimal B1-base prompt assembly; P1.5 owns the full 12-segment
    // cache-affine pipeline (core-ai system-prompt.ts).
    generatePrompt: async (input: TurnInput) => {
      // exactOptionalPropertyTypes: never pass `undefined` explicitly.
      const opts: NonNullable<Parameters<typeof assembleChatPrompt>[0]> = {};
      if (input.agentId) opts.agentId = input.agentId;
      const system = assembleChatPrompt(opts);
      return `${system}\n\n<user>\n${input.text}\n</user>`;
    },
    streamProvider: async function* (prompt, signal) {
      const req: ProviderRequest = {
        provider,
        model,
        streamId,
        sessionId,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text },
        ],
      };
      for await (const chunk of bridge.streamChat(req, signal)) {
        if (signal.aborted) return;
        yield chunk;
      }
    },
    // Persistence lands with the audit/memory wiring (P2+); the turnId keeps
    // the loop contract real today.
    persistTurn: async (input) =>
      `${input.sessionId ?? "sess"}:${++turnCounter}`,
    extractMemory: async () => {
      /* core-memory fusion lands in P2 (C1–C12) */
    },
  });

  const input: TurnInput = { text, surface, sessionId };

  let turnId = "";
  let fullText = "";
  let usage: { promptTokens: number; completionTokens: number } | undefined;

  try {
    for await (const ev of engine.run(input, controller.signal)) {
      switch (ev.type) {
        case "compiling":
        case "routed":
        case "streaming_start":
        case "extracting_memory":
          emit({ type: "stage", streamId, stage: ev.type });
          break;
        case "token":
          fullText += ev.text;
          batcher.pushToken(ev.text);
          break;
        case "reasoning":
          emit({ type: "reasoning", streamId, text: ev.text });
          break;
        case "tool_call":
          emit({ type: "tool_call", streamId, toolId: ev.toolId });
          break;
        case "tool_result":
          emit({ type: "tool_result", streamId, toolId: ev.toolId });
          break;
        case "risk_assessment":
          // Surfaced as a stage chip; payload-level risk UI lands in P11.
          emit({ type: "stage", streamId, stage: `risk:${ev.assessment.band}` });
          break;
        case "streaming_done":
          usage = ev.usage;
          break;
        case "done":
          turnId = ev.turnId;
          break;
        case "trajectory":
        case "artifact_generated":
          // Trajectory → audit (P2); artifacts → H1 cards (later).
          break;
        case "error":
          if (controller.signal.aborted) {
            emit({ type: "cancelled", streamId });
          } else {
            emit({
              type: "error",
              streamId,
              code: isBudgetError(ev.error) ? "budget_exceeded" : "engine",
              message: ev.error,
            });
          }
          return;
      }
    }

    batcher.complete();

    if (controller.signal.aborted) {
      emit({ type: "cancelled", streamId });
    } else {
      emit({
        type: "done",
        streamId,
        turnId,
        fullText,
        totalTokens: batcher.getTokenCount(),
        ...(usage ? { usage } : {}),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({
      type: "error",
      streamId,
      code: isBudgetError(message) ? "budget_exceeded" : "engine",
      message,
    });
  } finally {
    batcher.destroy();
    active.delete(streamId);
  }
}

/** J11 budget-kill detection: the broker's "stopped: $X limit" message. */
function isBudgetError(message: string): boolean {
  return message.includes("stopped:") && message.includes("limit");
}
