#!/usr/bin/env bun
// NOTE: Heap pressure is handled by this process's own heap monitor (heap.ts —
// self-restart at 80%, J13); the Rust ProcessSupervisor must NOT set
// BUN_JSC_heapSize — Bun ≥1.3 rejects it as an invalid JSC env var and exits(1)
// before running any app code (verified 2026-08-17). For Node.js:
// --max-old-space-size=512. For dev: `bun --smol run src/index.ts`
/**
 * EveryAIOS coordinator sidecar — hello-world IPC responder (P0.3).
 *
 * Speaks the exact `everyaios-ipc` wire contract:
 * - JSON-RPC 2.0 over stdio
 * - length-prefix framing `[u32 LE length][JSON payload]`
 * - ACP-style `initialize` handshake (protocolVersion + default-off
 *   capabilities, doc 45) so the contract evolves without breaking peers.
 *
 * P0.3 scope: the loop + handshake + echo. Later phases plug the real
 * `@personal-ai/core-*` engine stages (chat, memory, office, connectors)
 * into this same process.
 */

import { FrameDecoder, encodeJson, notify } from "./frame";
import { startHeapMonitor } from "./heap";
import { startOrphanWatch } from "./orphan";
import {
  ERROR_CODES,
  err,
  isRequest,
  methodNotFound,
  ok,
  type Request,
  type Response,
} from "./message";
import {
  cancelChatStream,
  FrameProviderBridge,
  runChatStream,
  type ChatEvent,
  type ChatStreamParams,
  type ProviderChunk,
} from "./chat";
import {
  cancelPlan,
  respondToBreak,
  runPlanExecution,
  type PlanChoice,
  type PlanExecutionParams,
  type PlanTask,
} from "./plan";

/** Must stay in lock-step with `everyaios_ipc::PROTOCOL_VERSION` (Rust, = 1). */
export const PROTOCOL_VERSION = 1;

/** Capabilities this side supports; advertised at handshake (all default-off). */
export interface Capabilities {
  streamDeltas?: boolean;
  passByReference?: boolean;
  [key: string]: unknown;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  // P1.4: the sidecar now streams chat token deltas (capability flips on).
  streamDeltas: true,
  passByReference: true,
};

/**
 * The production provider bridge: Rust pushes `chat/provider_chunk`
 * notifications into our stdin (the broker in Rust holds the keys); the
 * engine's streamProvider consumes them through this bridge.
 *
 * The bridge also asks Rust to run provider calls (`provider/stream` — the
 * compiled prompt lives here but the keys live there).
 */
const frameBridge = new FrameProviderBridge(sendRequest);

/** Outbound request correlation: id → pending promise (sidecar → Rust). */
const pending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();
let requestCounter = 0;

/**
 * Send a request to Rust (the core) and await its response. Responses are
 * matched by id in `run()`; the sidecar never blocks its frame loop.
 */
function sendRequest(method: string, params: unknown): Promise<unknown> {
  const id = `c${++requestCounter}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    process.stdout.write(encodeJson({ jsonrpc: "2.0", method, params, id }));
  });
}

/** Forward a chat engine event to the UI as a `chat/<type>` notification. */
function emitChatEvent(e: ChatEvent): void {
  notify(`chat/${e.type}`, e);
}

export const VERSION = "0.1.0";

/** Heartbeat interval in ms (default 10s). Env-overridable for tests. */
export const DEFAULT_HEARTBEAT_MS = 10_000;

export interface InitializeParams {
  protocolVersion?: number;
  clientName?: string;
  capabilities?: Capabilities;
}

/**
 * Handle one request object → response. Unknown methods get
 * METHOD_NOT_FOUND; notifications (no id) return `null` (nothing to send —
 * JSON-RPC 2.0 §2.2: the server MUST NOT reply to a notification).
 */
export function handleRequest(req: Request): Response | null {
  const id = req.id ?? null;

  let response: Response | null;

  switch (req.method) {
    case "initialize": {
      const p = (req.params ?? {}) as InitializeParams;
      const peerVersion = p.protocolVersion ?? 0;
      if (peerVersion !== PROTOCOL_VERSION) {
        response = err(
          id,
          ERROR_CODES.INVALID_REQUEST,
          `unsupported protocolVersion: ${peerVersion} (this side speaks ${PROTOCOL_VERSION})`,
        );
      } else {
        response = ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverName: "@everyaios/coordinator",
          serverVersion: VERSION,
          capabilities: DEFAULT_CAPABILITIES,
          status: "ready",
        });
      }
      break;
    }

    case "echo": {
      const p = (req.params ?? {}) as { text?: unknown; data?: unknown };
      response = ok(id, {
        text: p.text ?? p.data ?? null,
        echoed: true,
      });
      break;
    }

    case "session/ping": {
      response = ok(id, { pong: true, ts: Date.now(), heapMB: heapUsedMB() });
      break;
    }

    case "chat/stream": {
      // P1.4: run one turn through the reused ConversationEngine (detached).
      // The reply is immediate ({accepted}); all streaming arrives as
      // `chat/ttft|batch|done|error|cancelled` notifications.
      const p = (req.params ?? {}) as Partial<ChatStreamParams>;
      if (
        typeof p.sessionId !== "string" ||
        typeof p.streamId !== "string" ||
        typeof p.text !== "string" ||
        p.text.length === 0
      ) {
        response = err(
          id,
          ERROR_CODES.INVALID_REQUEST,
          "chat/stream requires sessionId, streamId and non-empty text",
        );
        break;
      }
      void runChatStream(
        p as ChatStreamParams,
        emitChatEvent,
        frameBridge,
        33,
        sendRequest,
      );
      response = ok(id, { accepted: true, streamId: p.streamId });
      break;
    }

    case "chat/cancel": {
      // Notification: abort signal UI → Rust relay → here → engine/provider.
      const p = (req.params ?? {}) as { streamId?: string };
      if (typeof p.streamId === "string") {
        cancelChatStream(p.streamId);
      }
      response = null; // notifications never get a reply
      break;
    }

    case "chat/provider_chunk": {
      // Notification: Rust pushes broker stream chunks here; the engine's
      // streamProvider consumes them (P1.4, provider bridge).
      const p = (req.params ?? {}) as Partial<ProviderChunk>;
      if (typeof p.streamId === "string") {
        frameBridge.handleChunk(p as ProviderChunk);
      }
      response = null;
      break;
    }

    case "plan/execute": {
      // Stage-0 (P6.3): run one blueprint plan through the plan executor
      // (detached, like chat/stream). The reply is immediate ({accepted});
      // all progress arrives as `chat/plan_start|step|interrupt|plan_done`
      // notifications, and the LLM turn streams as chat/ttft|batch|done.
      const p = (req.params ?? {}) as Partial<PlanExecutionParams>;
      if (
        typeof p.sessionId !== "string" ||
        typeof p.planId !== "string" ||
        typeof p.streamId !== "string" ||
        !Array.isArray(p.tasks) ||
        p.tasks.length === 0
      ) {
        response = err(
          id,
          ERROR_CODES.INVALID_REQUEST,
          "plan/execute requires sessionId, planId, streamId and a non-empty tasks array",
        );
        break;
      }
      void runPlanExecution(
        p as PlanExecutionParams,
        (e) => notify(`chat/${e.type}`, e as unknown as Record<string, unknown>),
        emitChatEvent,
        frameBridge,
        sendRequest,
        33,
      );
      response = ok(id, { accepted: true, planId: p.planId });
      break;
    }

    case "plan/respond": {
      // Stage-0 (P6.3): the user answered a circuit-break MCQ card (UI →
      // Tauri → ChatRelay::respond_plan → here). Resolves the executor's
      // pending wait; it resumes with the chosen path.
      const p = (req.params ?? {}) as { breakId?: string; choice?: string };
      if (typeof p.breakId !== "string" || typeof p.choice !== "string") {
        response = err(
          id,
          ERROR_CODES.INVALID_REQUEST,
          "plan/respond requires breakId and choice",
        );
        break;
      }
      const resolved = respondToBreak(p.breakId, p.choice as PlanChoice);
      response = ok(id, { resolved });
      break;
    }

    case "plan/cancel": {
      // Notification: abort a running plan execution.
      const p = (req.params ?? {}) as { planId?: string };
      if (typeof p.planId === "string") {
        cancelPlan(p.planId);
      }
      response = null; // notifications never get a reply
      break;
    }

    case "session/shutdown": {
      // Graceful stop: flush the reply (if this was a request) through the
      // write callback, then exit — process.exit() alone would truncate
      // buffered stdout.
      const reply = ok(id, { shuttingDown: true });
      if (req.id !== undefined) {
        process.stdout.write(encodeJson(reply), () => process.exit(0));
      } else {
        queueMicrotask(() => process.exit(0));
      }
      response = null;
      break;
    }

    default:
      response = methodNotFound(id, req.method);
  }

  // JSON-RPC 2.0 §2.2: never reply to a notification.
  return req.id === undefined ? null : response;
}

/** Current heap usage in MB (J13 heap-safety groundwork, P0.3.7). */
export function heapUsedMB(): number {
  try {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  } catch {
    return -1;
  }
}

/**
 * Announce readiness on boot. This is the child's first byte on stdout — the
 * Rust ProcessSupervisor treats it as the connect signal (Starting → Running)
 * and it arms the idle-watchdog clock.
 */
export function announceReady(): void {
  notify("session/ready", {
    protocolVersion: PROTOCOL_VERSION,
    serverName: "@everyaios/coordinator",
    serverVersion: VERSION,
    status: "ready",
  });
}

/**
 * Resolve the heartbeat interval from `EVERYAIOS_HEARTBEAT_MS` (tests use a
 * short interval), falling back to [`DEFAULT_HEARTBEAT_MS`].
 */
export function heartbeatIntervalMS(): number {
  const raw = process.env.EVERYAIOS_HEARTBEAT_MS;
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HEARTBEAT_MS;
}

/**
 * Start the periodic `session/heartbeat` notification (default every 10s).
 *
 * The supervisor's idle watchdog (30s of silence → kill) must never false-kill
 * a healthy-but-idle process, so the sidecar emits a heartbeat well inside the
 * idle window. Returns the timer (unref'd so it never holds the loop open).
 */
export function startHeartbeat(
  intervalMs: number = heartbeatIntervalMS(),
): NodeJS.Timeout {
  const timer = setInterval(() => {
    notify("session/heartbeat", { ts: Date.now() });
  }, intervalMs);
  if (typeof timer === "object" && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }
  return timer;
}

/** The IPC event loop: read frames from `stdin`, write responses to `stdout`. */
export function run(reader: NodeJS.ReadableStream = process.stdin): void {
  const decoder = new FrameDecoder();
  const textDecoder = new TextDecoder();

  reader.on("data", (chunk: Uint8Array) => {
    let frames: Uint8Array[];
    try {
      frames = decoder.push(chunk);
    } catch (e) {
      // Framing violation — reply with PARSE_ERROR if we can, then stop.
      const msg = e instanceof Error ? e.message : String(e);
      process.stdout.write(
        encodeJson(err(null, ERROR_CODES.PARSE_ERROR, `framing error: ${msg}`)),
      );
      return;
    }

    for (const frame of frames) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(textDecoder.decode(frame));
      } catch {
        process.stdout.write(
          encodeJson(err(null, ERROR_CODES.PARSE_ERROR, "invalid JSON payload")),
        );
        continue;
      }

      // A response to one of our outbound requests (id + result/error, no
      // method) — resolve the pending promise BEFORE the isRequest guard.
      const raw = parsed as {
        jsonrpc?: string;
        id?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      if (
        raw !== null &&
        typeof raw === "object" &&
        raw.jsonrpc === "2.0" &&
        raw.id !== undefined &&
        ("result" in raw || "error" in raw)
      ) {
        const p = pending.get(String(raw.id));
        if (p) {
          pending.delete(String(raw.id));
          if (raw.error) {
            p.reject(new Error(raw.error.message ?? "sidecar error"));
          } else {
            p.resolve(raw.result);
          }
        }
        continue;
      }

      if (!isRequest(parsed)) {
        process.stdout.write(
          encodeJson(err(null, ERROR_CODES.INVALID_REQUEST, "not a JSON-RPC 2.0 request")),
        );
        continue;
      }

      const response = handleRequest(parsed);
      if (response !== null) {
        process.stdout.write(encodeJson(response));
      }
    }
  });

  reader.on("end", () => {
    // Parent closed the pipe — exit cleanly (orphan-prevention baseline).
    process.exit(0);
  });

  reader.on("error", (e: Error) => {
    // EPIPE/EIO from a dead parent — exit rather than crash unhandled.
    console.error(`coordinator: stdin error: ${e.message}`);
    process.exit(1);
  });
}

// Only start the loop when run directly (not when imported by tests).
if (import.meta.main) {
  startOrphanWatch();
  startHeapMonitor();
  // First byte on stdout → supervisor promotes Starting → Running.
  announceReady();
  // Keeps the supervisor's idle watchdog (30s) from false-killing an idle
  // but healthy process.
  startHeartbeat();
  run();
}
