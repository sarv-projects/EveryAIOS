// Tauri IPC bridge (P0.7). `invoke` proxies the Tauri v2 command bridge; in a
// plain-browser preview (vite dev without the shell) it throws, and callers
// fall back to demo data so the UI is still explorable.
//
// P1.4: chat streaming — `chat_stream` dispatches a turn through the Rust core
// (→ coordinator engine → broker), and `chat-event` emits carry the streamed
// deltas (ttft/batch/done/error/cancelled/budgetExceeded/interrupt/planDone)
// to the UI. P6.3 Stage-0: `plan_execute` runs a blueprint plan through the
// coordinator's plan executor; `plan_respond` returns a circuit-break card
// choice (the interrupt path).

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** True when running inside the Tauri webview (v2 sets this global). */
export function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Invoke a Rust command through the Tauri bridge. */
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

/** Wire events from the Rust chat relay (camelCase mirror of ChatWireEvent). */
export interface ChatWireEvent {
  type:
    | "ttft"
    | "batch"
    | "reasoning"
    | "stage"
    | "toolCall"
    | "toolResult"
    | "done"
    | "error"
    | "cancelled"
    | "budgetExceeded"
    | "interrupt"
    | "planDone";
  streamId?: string;
  latencyMs?: number;
  text?: string;
  tokenCount?: number;
  turnId?: string;
  fullText?: string;
  totalTokens?: number;
  code?: string;
  message?: string;
  sessionId?: string;
  limit?: number;
  spent?: number;
  /** P6.3 Stage-0 — circuit-break interrupt card payload. */
  planId?: string;
  breakId?: string;
  options?: string[];
  tasksDone?: number;
  title?: string;
  description?: string;
  error?: string;
}

/** P1.4: start a chat turn. Resolves with the streamId. */
export async function chatStream(args: {
  sessionId: string;
  text: string;
  provider?: string;
  model?: string;
  /** P1.5 — persona tone overlay (core-ai PERSONA_PRESETS). */
  personaId?: string;
  /** P1.5 — Hermes SOUL.md identity block (Slot #1, injection-scanned). */
  soulMd?: string;
  /** F12/J17 — selected agent id (None = inbuilt engine). */
  agentId?: string;
}): Promise<string> {
  return tauriInvoke<string>("chat_stream", args);
}

/** P1.4: cancel a running stream (abort → Rust → sidecar → provider). */
export async function chatCancel(streamId: string): Promise<void> {
  return tauriInvoke("chat_cancel", { streamId });
}

/** P6.3 Stage-0: run a blueprint plan through the coordinator's plan executor
 * (which steps the Rust-owned circuit breaker per LLM turn / tool call and
 * emits `chat/interrupt` on a trip). Resolves once the coordinator acks. */
export async function planExecute(args: {
  sessionId: string;
  planId: string;
  streamId: string;
  tasks: unknown[];
  provider?: string;
  model?: string;
}): Promise<void> {
  return tauriInvoke("plan_execute", args);
}

/** P6.3 Stage-0: return a circuit-break card choice (skip/retry/escalate/…)
 * to the waiting plan executor. Resolves once the interrupt is resolved. */
export async function planRespond(
  breakId: string,
  choice: string,
): Promise<void> {
  return tauriInvoke("plan_respond", { breakId, choice });
}

/** Subscribe to chat events; returns an unsubscribe function. */
export async function onChatEvent(
  cb: (e: ChatWireEvent) => void,
): Promise<() => void> {
  return listen<ChatWireEvent>("chat-event", (event) => cb(event.payload));
}
