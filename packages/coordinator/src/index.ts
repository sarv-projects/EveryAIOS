#!/usr/bin/env bun
// NOTE: For Bun compiled binaries, heap is limited via BUN_JSC_heapSize env var.
// The ProcessSupervisor (Rust side) should set BUN_JSC_heapSize=536870912 (512MB)
// when spawning this process. For Node.js: --max-old-space-size=512.
// For dev: `bun --smol run src/index.ts`
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

import { FrameDecoder, encodeJson } from "./frame";
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

/** Must stay in lock-step with `everyaios_ipc::PROTOCOL_VERSION` (Rust, = 1). */
export const PROTOCOL_VERSION = 1;

/** Capabilities this side supports; advertised at handshake (all default-off). */
export interface Capabilities {
  streamDeltas?: boolean;
  passByReference?: boolean;
  [key: string]: unknown;
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  streamDeltas: false,
  passByReference: true,
};

export const VERSION = "0.1.0";

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
  run();
}
