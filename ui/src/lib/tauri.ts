// Tauri IPC bridge (P0.7). `invoke` proxies the Tauri v2 command bridge; in a
// plain-browser preview (vite dev without the shell) it throws, and callers
// fall back to demo data so the UI is still explorable.
//
// P1.4: chat streaming — `chat_stream` dispatches a turn through the Rust core
// (→ coordinator engine → broker), and `chat-event` emits carry the streamed
// deltas (ttft/batch/done/error/cancelled/budgetExceeded) to the UI.

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
    | "budgetExceeded";
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
}

/** P1.4: start a chat turn. Resolves with the streamId. */
export async function chatStream(args: {
  sessionId: string;
  text: string;
  provider?: string;
  model?: string;
}): Promise<string> {
  return tauriInvoke<string>("chat_stream", args);
}

/** P1.4: cancel a running stream (abort → Rust → sidecar → provider). */
export async function chatCancel(streamId: string): Promise<void> {
  return tauriInvoke("chat_cancel", { streamId });
}

/** Subscribe to chat events; returns an unsubscribe function. */
export async function onChatEvent(
  cb: (e: ChatWireEvent) => void,
): Promise<() => void> {
  return listen<ChatWireEvent>("chat-event", (event) => cb(event.payload));
}
