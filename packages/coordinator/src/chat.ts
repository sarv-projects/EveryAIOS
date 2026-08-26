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
import { StreamSession } from "@personal-ai/core-ai";
import { chunkText, estimateTokens } from "@personal-ai/core-files";
import { buildDesktopSystemPrompt, CACHE_BOUNDARY, type PersonaId } from "./prompt";
import { notifyAgui } from "./agui";
import {
  listedToolsToOpenAI,
  resolveActiveTools,
  sortToolsStable,
  ToolExecutor,
  type ListedTool,
  type OpenAIFunctionTool,
} from "./tools";
import { classifyTask, selectModelForTask, type TaskKind } from "./router";
import { recordObservation, currentObservations } from "./observations";
import { hintsFor } from "./catalog";
import { budgetJson, refRegistry } from "./budget";
import { assertAllLogged, ContextTrace, type ContextSource } from "./context-trace";
import { runStage, type WaterfallHooks } from "./waterfall";
export { evaluateGuard, useTicket, guardGate } from "./guard";
export { assertAllLogged, ContextTrace, type ContextSource } from "./context-trace";
export { composeHooks, runStage, type WaterfallHooks } from "./waterfall";

/** Minimal B1-base turn parameters (P1.5 owns full system-prompt assembly). */
export interface ChatStreamParams {
  sessionId: string;
  streamId: string;
  text: string;
  surface?: "chat" | "reader" | "bubble" | "automation";
  agentId?: string;
  provider?: string;
  model?: string;
  /** P1.5 — persona tone overlay (core-ai PERSONA_PRESETS). */
  personaId?: PersonaId;
  /** P1.5 — Hermes SOUL.md identity block (Slot #1, injection-scanned). */
  soulMd?: string;
  /** P1.5 — approved style-memory facts (stable prefix, segment 7). */
  styleMemoryBlock?: string;
  /** P1.5 — RAG scope labels (buildRagSystemPrompt scope lock). */
  sourceLabels?: string[];
  /** P1.5 — user-attached documents (J6 <user_document> wrapping). */
  userDocuments?: Array<{ title: string; content: string }>;
  /** P5/P6 project-scope isolation key (H2). */
  projectId?: string;
  /** P30.11 — interceptable turn/step waterfall hooks (default: pass-through). */
  hooks?: WaterfallHooks;
}

/** Events the coordinator forwards to the UI as `chat/<type>` notifications. */
export type ChatEvent =
  | { type: "ttft"; streamId: string; latencyMs: number }
  | { type: "batch"; streamId: string; text: string; tokenCount: number }
  | { type: "reasoning"; streamId: string; text: string }
  | { type: "stage"; streamId: string; stage: string }
  | {
      type: "tool_call";
      streamId: string;
      toolId: string;
      args?: Record<string, unknown>;
      risk?: string;
    }
  | { type: "tool_result"; streamId: string; toolId: string; result?: unknown }
  | {
      type: "done";
      streamId: string;
      turnId: string;
      fullText: string;
      totalTokens: number;
      usage?: { promptTokens: number; completionTokens: number };
    }
  | {
      type: "error";
      streamId: string;
      code: string;
      message: string;
      retryable?: boolean;
      toolId?: string;
      args?: Record<string, unknown>;
    }
  | { type: "cancelled"; streamId: string }
  | {
      /** P41.4 — K1 verification receipt (inline in the editor's Diff rail):
       * model-reported pass/fail per plan-task check, never claimed as
       * executed. `passed: null` = the report was ambiguous. */
      type: "verification";
      streamId: string;
      taskId: string;
      checks: string[];
      report: string;
      passed: boolean | null;
    }
  | {
      type: "memory_extracted";
      streamId: string;
      sessionId: string;
      facts: string[];
    }
  | {
      /** Monitoring-run verdict (P6.4): the "notify vs silent" split. Emitted
       * after `scheduler/monitor` evaluates a monitoring job's observation. */
      type: "monitor";
      streamId: string;
      jobId: string;
      changed: boolean;
      notified: boolean;
      stopped: boolean;
      current: string;
      notifications: number;
    };

/** One chat-completions message, including native tool-result turns. */
export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

/** Provider request the bridge turns into a provider stream. */
export interface ProviderRequest {
  provider: string;
  model: string;
  messages: ProviderMessage[];
  /** Stream identity for bridge queue routing (set by the run loop). */
  streamId?: string;
  /** Session identity — the broker's ledger + J11 budget key (Rust). */
  sessionId?: string;
  /**
   * OpenAI function defs serialized once from the Rust ToolRegistry
   * (`listedToolsToOpenAI`). Forwarded as the broker `tools` body.
   */
  tools?: OpenAIFunctionTool[];
  tool_choice?: "auto" | "none" | "required" | Record<string, unknown>;
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
  /** Native or extracted tool call (S0.3). */
  toolCall?: {
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
    arguments?: string;
  };
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
    if (chunk.toolCall) {
      q.push(toolCallChunk(chunk.toolCall));
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
      const payload: Record<string, unknown> = {
        provider: req.provider,
        model: req.model,
        sessionId: req.sessionId,
        streamId: key,
        messages: req.messages,
      };
      if (req.tools !== undefined) payload.tools = req.tools;
      if (req.tool_choice !== undefined) payload.tool_choice = req.tool_choice;
      await this.requestFn("provider/stream", payload);
      const useTools = !!(req.tools && req.tools.length > 0);
      if (!useTools) {
        for (;;) {
          if (signal.aborted) return;
          const chunk = await q.next();
          if (chunk === undefined) return;
          yield chunk;
          if (chunk.type === "done") return;
        }
      }
      const buffered: StreamChunk[] = [];
      let sawTool = false;
      for (;;) {
        if (signal.aborted) return;
        const chunk = await q.next();
        if (chunk === undefined) break;
        if (chunk.type === "tool_call") sawTool = true;
        buffered.push(chunk);
        if (chunk.type === "done") break;
      }
      // B5 fallback: local JSON-mode text that Rust did not already promote
      // to a toolCall chunk (Rust stream_provider does this first).
      if (!sawTool) {
        const text = buffered
          .filter((c): c is Extract<StreamChunk, { type: "text" }> => c.type === "text")
          .map((c) => c.text)
          .join("");
        const calls = extractJsonToolCalls(text);
        if (calls.length > 0) {
          for (const c of calls) {
            yield { type: "tool_call", id: c.id, args: c.args };
          }
          const done = buffered.find((c) => c.type === "done");
          if (done) yield done;
          return;
        }
      }
      for (const chunk of buffered) {
        yield chunk;
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
  /**
   * Outbound JSON-RPC request to Rust (P5.1 memory persistence). When
   * present, extracted facts are written to the Rust memory store via
   * `memory/write` (best-effort — a failure never blocks the stream). Tests
   * omit it, so the memory event is emitted but no request is sent.
   */
  request?: (method: string, params: unknown) => Promise<unknown>,
): Promise<void> {
  const { sessionId, streamId, text } = params;
  const surface = params.surface ?? "chat";
  // P1.9 (A6/A7): explicit provider/model lock wins; otherwise the
  // task→model router picks after tool resolution (below).
  let provider = params.provider;
  let model = params.model;

  const controller = new AbortController();
  active.set(streamId, controller);
  if (request) {
    void request("execution/begin", {
      trigger: surface === "automation" ? "scheduler" : "chat",
      sessionId,
      objective: text,
      contextSnapshot: { sessionId, streamId },
    }).catch(() => {
      /* kernel optional */
    });
  }

  // StreamSession (core-ai A-10): TTFT + 33ms batch flush. Checkpoints are
  // persistence-relevant (P2+) and not forwarded on the wire yet.
  // NB: StreamSession.complete() snapshots only the un-flushed buffer (batch
  // flushes clear it), so the authoritative full text is accumulated here.
  const batcher = new StreamSession(streamId, (ev) => {
    switch (ev.type) {
      case "ttft":
        ttftMs = ev.latencyMs;
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

  const toolExecutor = request ? new ToolExecutor(request) : undefined;
  let openaiTools: OpenAIFunctionTool[] | undefined;
  let catalogIndex: string[] = [];
  const riskById = new Map<string, string>();
  // P30.8 — "model-visible means logged": every block injected below is
  // recorded on the trace at injection time and proven present in the final
  // prompt (assertAllLogged) before the turn completes.
  const contextTrace = new ContextTrace();
  const injectedBlocks: { source: ContextSource; content: string }[] = [];
  if (toolExecutor) {
    try {
      const listed: ListedTool[] = sortToolsStable(await toolExecutor.listTools());
      catalogIndex = listed.map((t) => t.id);
      const active = resolveActiveTools(listed, text);
      openaiTools = listedToolsToOpenAI(active);
      for (const t of listed) riskById.set(t.id, t.risk);
    } catch {
      /* tool/list missing — native defs omitted; text-only turn still runs */
    }
  }

  // P1.9: when the client left provider/model unset, route via the task→model
  // router. A tools-capable tier is required when the turn resolved native
  // tools; otherwise a plain chat tier (cheapest ≥16K ctx) wins.
  if (provider === undefined || model === undefined) {
    const task: TaskKind = openaiTools && openaiTools.length > 0 ? "tools" : classifyTask(text);
    const sel = selectModelForTask({
      task,
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
      // P36/P0-5 — feed the RouteDecision consensus scorer the observations
      // recorded by *prior* turns of this process (health/cost/latency), so
      // the next routing decision reflects live provider outcomes.
      observations: currentObservations(),
    });
    provider = sel.provider;
    model = sel.model;
    emit({ type: "stage", streamId, stage: `routed:${sel.provider}/${sel.model} · ${sel.reason}` });
  }
  // Narrow to `string` for the provider closure (fallback is unreachable in
  // practice — the router always returns a provider/model).
  const finalProvider = provider ?? "nvidia";
  const finalModel = model ?? "meta/llama";

  // P1.3 (A9) — semantic/result cache on read-only turns only. A turn that
  // resolved no tools cannot mutate state, so a cached response is safe to
  // serve. Mutation turns (tools resolved) bypass the cache entirely.
  const readOnlyTurn = !openaiTools || openaiTools.length === 0;
  if (request && readOnlyTurn) {
    try {
      const cached = (await request("memory/cache_get", { prompt: text })) as {
        hit?: boolean;
        response?: string;
      };
      if (cached?.hit && typeof cached.response === "string") {
        emit({ type: "stage", streamId, stage: "cache:hit:semantic" });
        emit({ type: "batch", streamId, text: cached.response, tokenCount: estimateTokens(cached.response) });
        emit({
          type: "done",
          streamId,
          turnId: `${sessionId}:${++turnCounter}`,
          fullText: cached.response,
          totalTokens: estimateTokens(cached.response),
        });
        active.delete(streamId);
        return;
      }
    } catch {
      /* cache miss / handler absent — fall through to a live turn */
    }
  }

  const engine = new ConversationEngine({
    // P1.5 — full 12-segment cache-affine pipeline (core-ai system-prompt.ts
    // + desktop SOUL.md identity slot + J6 <user_document> wrapping). The
    // stable prefix above CACHE_BOUNDARY is byte-identical across turns.
    generatePrompt: async (input: TurnInput) => {
      // exactOptionalPropertyTypes: only set keys that are actually present.
      const opts: Parameters<typeof buildDesktopSystemPrompt>[0] = {};
      const agentId = input.agentId ?? params.agentId;
      if (agentId !== undefined) opts.agentId = agentId;
      if (params.personaId !== undefined) opts.personaId = params.personaId;
      if (params.soulMd !== undefined) opts.soulMd = params.soulMd;
      if (params.styleMemoryBlock !== undefined) opts.styleMemoryBlock = params.styleMemoryBlock;
      if (params.sourceLabels !== undefined) opts.sourceLabels = params.sourceLabels;
      if (params.userDocuments !== undefined) opts.userDocuments = params.userDocuments;
      let system = buildDesktopSystemPrompt(opts);
      // P5.3 per-turn planner injection: fetch the core warm set from Rust
      // and inject it BELOW the cache boundary so the stable prefix stays
      // byte-identical across turns (C7 warm-set injection).
      if (request) {
        try {
          const plan = (await request("memory/plan", { personaTokens: 0 })) as {
            coreFacts?: string[];
          };
          const facts = plan?.coreFacts ?? [];
          if (facts.length > 0) {
            const block = `<memory_warm_set>\n${facts.join("\n")}\n</memory_warm_set>`;
            contextTrace.record("memory_warm_set", block);
            injectedBlocks.push({ source: "memory_warm_set", content: block });
            system = injectBelowBoundary(system, block);
          }
        } catch {
          /* memory/plan is best-effort — a missing handler never blocks the turn */
        }
      }
      // H2 capability index: names only, below the cache boundary so the
      // stable prefix stays byte-identical as the catalog grows. Full
      // schemas are the resolved subset on ProviderRequest.tools.
      if (catalogIndex.length > 0) {
        const block = `<tool_index>\n${catalogIndex.join("\n")}\n</tool_index>`;
        contextTrace.record("tool_index", block);
        injectedBlocks.push({ source: "tool_index", content: block });
        system = injectBelowBoundary(system, block);
      }
      const userBlock = `<user>\n${input.text}\n</user>`;
      contextTrace.record("user", userBlock);
      injectedBlocks.push({ source: "user", content: userBlock });
      contextTrace.record("system", system);
      injectedBlocks.push({ source: "system", content: system });
      return `${system}\n\n${userBlock}`;
    },
    streamProvider: async function* (prompt, signal, extras) {
      const messages: ProviderMessage[] = [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ];
      const previous = extras?.previousToolResults ?? [];
      for (let i = 0; i < previous.length; i++) {
        const r = previous[i]!;
        const callId = `call_${i}_${r.toolId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: {
                name: r.toolId,
                arguments: JSON.stringify(r.args ?? {}),
              },
            },
          ],
        });
        messages.push({
          role: "tool",
          tool_call_id: callId,
          content:
            typeof r.result === "string" ? r.result : JSON.stringify(r.result ?? null),
        });
      }
      const req: ProviderRequest = {
        provider: finalProvider,
        model: finalModel,
        streamId,
        sessionId,
        messages,
        ...(openaiTools && openaiTools.length > 0
          ? { tools: openaiTools, tool_choice: "auto" as const }
          : {}),
      };
      // P30.8 — invariant: every recorded block is present in what we send.
      const logged = assertAllLogged(contextTrace, injectedBlocks, prompt);
      if (!logged.ok) {
        emit({
          type: "error",
          streamId,
          code: "context_not_logged",
          message: `model-visible block(s) not reconstructable from the trace: ${logged.missing.join(", ")}`,
        });
      }
      emit({ type: "stage", streamId, stage: `context:logged:${contextTrace.count()}` });
      for await (const chunk of bridge.streamChat(req, signal)) {
        if (signal.aborted) return;
        yield chunk;
      }
    },
    // Persistence lands with the audit/memory wiring (P2+); the turnId keeps
    // the loop contract real today.
    persistTurn: async (input) =>
      `${input.sessionId ?? "sess"}:${++turnCounter}`,
    ...(toolExecutor
      ? {
          executeTool: async (toolId: string, args: Record<string, unknown>) => {
            const ctx: { sessionId: string; agentId?: string } = { sessionId };
            if (params.agentId !== undefined) ctx.agentId = params.agentId;
            emit({ type: "stage", streamId, stage: `tool:${toolId}:running` });
            // P30.11 — preExecute hook: veto (ctx.veto) blocks the call.
            if (hooks) {
              const hookCtx = await runStage("preExecute", hooks, {
                stage: "preExecute",
                streamId,
                toolId,
                args,
              });
              if (hookCtx.veto === true) {
                return { ok: false, error: `blocked by preExecute hook (${toolId})` };
              }
            }
            try {
              const result = await toolExecutor.executeTool(toolId, args, ctx);
              emit({ type: "stage", streamId, stage: `tool:${toolId}:done` });
              if (hooks) {
                await runStage("postExecute", hooks, {
                  stage: "postExecute",
                  streamId,
                  toolId,
                  result,
                });
              }
              return result;
            } catch (toolErr) {
              const message = toolErr instanceof Error ? toolErr.message : String(toolErr);
              emit({
                type: "error",
                streamId,
                code: "tool_failed",
                message,
                retryable: true,
                toolId,
                args,
              });
              throw toolErr;
            }
          },
        }
      : {}),
    // P5.1 core-memory import: the sidecar extracts declarative fact
    // candidates from the turn and emits them (the UI/audit show them; the
    // Rust store persists them on the `memory/write` dispatch, which lands
    // with the memory-store wiring). Deterministic — no LLM round-trip.
    extractMemory: async (_input, response) => {
      const facts = extractFacts(response);
      if (facts.length > 0) {
        emit({ type: "memory_extracted", streamId, sessionId, facts });
        // P5.1: persist to the Rust memory store (best-effort). The Rust
        // relay answers `memory/write`; a missing/refusing handler is
        // tolerated so the stream never blocks on memory.
        if (request) {
          const writeBody: Record<string, unknown> = {
            sessionId,
            facts,
            source: "chat",
            sourceId: sessionId,
          };
          if (params.projectId !== undefined) writeBody.projectId = params.projectId;
          void request("memory/write", writeBody)
            .then(() => request("memory/tick", { text: response }).catch(() => undefined))
            .catch(() => {
              /* memory persistence is best-effort */
            });
        }
      }
    },
  });

  const input: TurnInput = { text, surface, sessionId };
  const hooks = params.hooks;

  // P30.11 — preStep hook (observe / short-circuit before the engine runs).
  if (hooks) {
    const ctx = await runStage("preStep", hooks, { stage: "preStep", streamId, sessionId, text });
    if (ctx.abort === true) {
      emit({ type: "done", streamId, turnId: `${sessionId}:${++turnCounter}:aborted`, fullText: "", totalTokens: 0 });
      active.delete(streamId);
      return;
    }
  }

  let turnId = "";
  let fullText = "";
  let aguiArtifactCounter = 0;
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  let ttftMs = 0;

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
        case "tool_call": {
          const risk = riskById.get(ev.toolId);
          emit({
            type: "tool_call",
            streamId,
            toolId: ev.toolId,
            args: ev.args,
            ...(risk !== undefined ? { risk } : {}),
          });
          // P11.5.11 — AG-UI live transport: every tool call also rides the
          // AG-UI channel as `tool_call_created` (the UI's generative surface
          // consumes these without a second protocol).
          notifyAgui("tool_call_created", streamId, {
            call_id: ev.toolId,
            name: ev.toolId,
            args: (ev.args ?? {}) as Record<string, unknown>,
            state: "running",
          });
          break;
        }
        case "tool_result":
          // P39.1: oversized tool results become ref + bounded preview.
          emit({
            type: "tool_result",
            streamId,
            toolId: ev.toolId,
            result: budgetJson(ev.result, refRegistry),
          });
          notifyAgui("tool_call_result", streamId, {
            call_id: ev.toolId,
            name: ev.toolId,
            args: {},
            state: "done",
          });
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
          notifyAgui("done", streamId, { turn_id: ev.turnId, session_id: sessionId });
          break;
        case "artifact_generated": {
          // P11.5.11 — artifacts ride the AG-UI channel as `artifact_created`
          // (the UI's make-live + version-selector surface consumes them).
          notifyAgui("artifact_created", streamId, {
            artifact_id: `art-${streamId}-${++aguiArtifactCounter}`,
            version: 1,
            kind: ev.artifact.format === "mermaid" ? "mermaid" : "markdown",
            payload: {
              title: ev.artifact.title,
              format: ev.artifact.format,
              uri: ev.artifact.uri ?? null,
              preview: ev.artifact.preview ?? null,
            },
          });
          break;
        }
        case "trajectory":
          // Trajectory → audit (P2).
          break;
        case "error":
          // P36 — record the failed outcome so the scorer deprioritizes this
          // provider:model on the next turn (budget kills excluded — that is
          // a session constraint, not a provider-health signal).
          if (!isBudgetError(ev.error)) {
            recordObservation(finalProvider, finalModel, {
              ok: false,
              latencyMs: ttftMs,
              costScore: hintsFor(finalProvider, finalModel).costScore,
            });
          }
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

    // P30.11 — postStep hook (final observe / rewrite before the done event).
    if (hooks) {
      await runStage("postStep", hooks, {
        stage: "postStep",
        streamId,
        turnId,
        fullText,
      });
    }

    if (controller.signal.aborted) {
      emit({ type: "cancelled", streamId });
    } else {
      // P36 — record the successful outcome (health 1, latency, cost
      // estimate) so the next routing decision sees a live observation.
      recordObservation(finalProvider, finalModel, {
        ok: true,
        latencyMs: ttftMs,
        tokens: batcher.getTokenCount(),
        costScore: hintsFor(finalProvider, finalModel).costScore,
      });
      emit({
        type: "done",
        streamId,
        turnId,
        fullText,
        totalTokens: batcher.getTokenCount(),
        ...(usage ? { usage } : {}),
      });
      // P1.3 (A9) — store a successful read-only turn's response so the next
      // identical prompt is served from the semantic cache (never mutation
      // turns). Best-effort: a missing handler never blocks the done event.
      if (request && readOnlyTurn && fullText.length > 0) {
        void request("memory/cache_put", {
          prompt: text,
          response: fullText,
          readOnly: true,
        }).catch(() => {
          /* cache write is best-effort */
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // P36 — the catch path is a provider/engine failure too (not a cancel).
    if (!isBudgetError(message)) {
      recordObservation(finalProvider, finalModel, {
        ok: false,
        latencyMs: ttftMs,
        costScore: hintsFor(finalProvider, finalModel).costScore,
      });
    }
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

function toolCallChunk(tc: NonNullable<ProviderChunk["toolCall"]>): StreamChunk {
  const id = tc.id ?? tc.name ?? "";
  let args: Record<string, unknown> = tc.args ?? {};
  if (tc.arguments !== undefined) {
    try {
      const parsed: unknown = JSON.parse(tc.arguments);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      args = { _raw: tc.arguments };
    }
  }
  return { type: "tool_call", id, args };
}

/**
 * B5 / local JSON-mode: pull tool calls out of grammar-enforced JSON text.
 * Mirrors `everyaios_vault::extract_json_tool_calls`.
 */
export function extractJsonToolCalls(
  text: string,
): Array<{ id: string; args: Record<string, unknown> }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      // Fence/brace repair (mirrors everyaios-memory::repair_tool_json).
      const repaired = unfenced
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/'/g, unfenced.includes('"') ? "'" : '"');
      try {
        parsed = JSON.parse(repaired.slice(
          repaired.indexOf("{"),
          repaired.lastIndexOf("}") + 1,
        ));
      } catch {
        return [];
      }
    }
  }
  return toolCallsFromValue(parsed);
}

function toolCallsFromValue(
  v: unknown,
): Array<{ id: string; args: Record<string, unknown> }> {
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.tool_calls)) {
    return o.tool_calls.flatMap(toolCallsFromValue);
  }
  const fn = o.function;
  const fnName =
    fn && typeof fn === "object" && !Array.isArray(fn)
      ? (fn as { name?: unknown }).name
      : undefined;
  const name =
    (typeof o.tool === "string" && o.tool) ||
    (typeof o.name === "string" && o.name) ||
    (typeof fnName === "string" ? fnName : "");
  if (!name) return [];
  const fnArgs =
    fn && typeof fn === "object" && !Array.isArray(fn)
      ? (fn as { arguments?: unknown }).arguments
      : undefined;
  const raw = o.args ?? o.arguments ?? fnArgs;
  let args: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      } else {
        args = { _raw: raw };
      }
    } catch {
      args = { _raw: raw };
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    args = raw as Record<string, unknown>;
  }
  return [{ id: name, args }];
}

export interface ToolRetryParams {
  sessionId: string;
  streamId: string;
  toolId: string;
  args: Record<string, unknown>;
  agentId?: string;
}

/** S0.5 — re-run one tool through the same Guard-2 exec→commit path. */
export async function runToolRetry(
  params: ToolRetryParams,
  emit: (e: ChatEvent) => void,
  request: (method: string, params: unknown) => Promise<unknown>,
): Promise<void> {
  const { sessionId, streamId, toolId, args } = params;
  emit({ type: "tool_call", streamId, toolId, args });
  emit({ type: "stage", streamId, stage: `tool:${toolId}:running` });
  try {
    const ex = new ToolExecutor(request);
    const ctx: { sessionId: string; agentId?: string } = { sessionId };
    if (params.agentId !== undefined) ctx.agentId = params.agentId;
    const result = await ex.executeTool(toolId, args, ctx);
    // P39.1: oversized tool results become ref + bounded preview.
    emit({ type: "tool_result", streamId, toolId, result: budgetJson(result, refRegistry) });
    emit({ type: "stage", streamId, stage: `tool:${toolId}:done` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: "tool_result", streamId, toolId, result: { error: message } });
    emit({
      type: "error",
      streamId,
      code: "tool_failed",
      message,
      retryable: true,
      toolId,
      args,
    });
  }
}

/**
 * P5.1 core-memory import — deterministic fact-candidate extraction. Splits
 * the response into sentences, keeps the short declarative ones (12..280
 * chars, not a question), and returns up to `maxFacts` candidates. The richer
 * classifier (`everyaios-memory::classify`) decides memory/fact/event/document
 * class on the Rust side; this is the sidecar's zero-round-trip import step.
 */
export function extractFacts(text: string, maxFacts = 8): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/^["'\-\u2013\u2014\u2022*]+|["'\-\u2013\u2014\u2022*]+$/g, ""))
    .filter((s) => s.length >= 12 && s.length <= 280 && !s.endsWith("?"))
    .slice(0, maxFacts);
}

/**
 * P5.3 — inject a block directly BELOW the cache boundary marker, so
 * `stablePrefixOf()` is unchanged (the warm set varies per turn and must
 * never dirty the cached prefix). Falls back to appending when the prompt
 * has no boundary marker.
 */
export function injectBelowBoundary(prompt: string, block: string): string {
  const idx = prompt.indexOf(CACHE_BOUNDARY);
  if (idx === -1) return `${prompt}\n\n${block}`;
  const end = idx + CACHE_BOUNDARY.length;
  return `${prompt.slice(0, end)}\n${block}\n${prompt.slice(end)}`;
}

/**
 * P5.1 core-files import — turn a file's text into declarative fact
 * candidates using the core-files chunker + token estimator, capped so an
 * oversized file never floods the memory store.
 */
export function fileToFacts(text: string, mime: string, maxTokens = 600): string[] {
  const chunks = chunkText(text, mime);
  const facts: string[] = [];
  let budget = maxTokens;
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk);
    if (budget - cost < 0) break;
    facts.push(...extractFacts(chunk));
    budget -= cost;
  }
  return facts.slice(0, 16);
}
