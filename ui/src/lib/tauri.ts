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

export { listen };

export type UnlistenFn = () => void;

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
    | "planDone"
    | "monitor"
    | "verification";
  streamId?: string;
  latencyMs?: number;
  text?: string;
  tokenCount?: number;
  turnId?: string;
  fullText?: string;
  totalTokens?: number;
  code?: string;
  message?: string;
  stage?: string;
  toolId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  retryable?: boolean;
  risk?: string;
  error?: string;
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
  jobId?: string;
  changed?: boolean;
  notified?: boolean;
  stopped?: boolean;
  current?: string;
  notifications?: number;
  /** P41.4 — K1 verification receipt (Diff rail). */
  taskId?: string;
  checks?: string[];
  report?: string;
  passed?: boolean | null;
}

/** Pause every scheduled job bound to a chat (delete-session cascade). */
export async function schedulerPauseSession(sessionId: string): Promise<number> {
  return tauriInvoke<number>("scheduler_pause_session", { sessionId });
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
  /** P4.7 — documents to inject below the cache boundary (J6 wrapping). */
  userDocuments?: { title: string; content: string }[];
}): Promise<string> {
  return tauriInvoke<string>("chat_stream", args);
}

/** P1.4: cancel a running stream (abort → Rust → sidecar → provider). */
export async function chatCancel(streamId: string): Promise<void> {
  return tauriInvoke("chat_cancel", { streamId });
}

/** S0.5: re-run a failed tool through the same Guard-2 ticket path. */
export async function chatToolRetry(args: {
  sessionId: string;
  streamId: string;
  toolId: string;
  args: Record<string, unknown>;
  agentId?: string;
}): Promise<void> {
  return tauriInvoke("chat_tool_retry", args);
}

/** P6.3 Stage-0: run a blueprint plan through the coordinator's plan executor
 * (which steps the Rust-owned circuit breaker per LLM turn / tool call and
 * emits `chat/interrupt` on a trip). Resolves once the coordinator acks. */
export async function planExecute(args: {
  sessionId: string;
  planId: string;
  tasks: unknown[];
  provider?: string;
  model?: string;
}): Promise<string> {
  return tauriInvoke<string>("plan_execute", args);
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

// ---------------------------------------------------------------------------
// P3.2 — cockpit / ambient flight-deck (H2, doc 33 §9.5).
// ---------------------------------------------------------------------------

/** One live agent card (mirrors `everyaios_audit::cockpit::AgentCard`). */
export interface AgentCard {
  agent_id: string;
  display_name: string;
  model: string;
  status: string; // Running | Done | Waiting | Idle
  last_tool: string;
  last_summary: string;
  last_ts_ms: number;
  tokens_in: number;
  tokens_out: number;
}

/** An open interrupt the user must answer. */
export interface InterruptCard {
  agent_id: string;
  kind: string; // approval | mcq | stop
  prompt: string;
  options: string[];
}

/** Full cockpit snapshot (mirrors `CockpitState`). */
export interface CockpitState {
  agents: AgentCard[];
  interrupts: InterruptCard[];
  quiet: boolean;
}

/** Poll the live cockpit state (agent cards + interrupts + quiet flag). */
export async function cockpitSnapshot(): Promise<CockpitState> {
  if (!inTauri()) return demoCockpit();
  return invoke<CockpitState>("cockpit_snapshot");
}

/** STOP: kill the agent loop (control-channel `agent/stop`). */
export async function agentStop(sessionId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke<void>("agent_stop", { sessionId });
}

/** UNDO: request revert of the last action (control-channel `agent/undo`). */
export async function agentUndo(sessionId: string): Promise<void> {
  if (!inTauri()) return;
  return invoke<void>("agent_undo", { sessionId });
}

function demoCockpit(): CockpitState {
  const now = Date.now();
  return {
    agents: [
      {
        agent_id: "agent-1",
        display_name: "Default Agent",
        model: "claude-sonnet-4",
        status: "Running",
        last_tool: "file.open",
        last_summary: "Opened Q3-Financials.xlsx",
        last_ts_ms: now - 2_000,
        tokens_in: 12_400,
        tokens_out: 3_200,
      },
      {
        agent_id: "agent-2",
        display_name: "Research Sub-Agent",
        model: "gpt-4o",
        status: "Waiting",
        last_tool: "browser.search",
        last_summary: "Searching competitor pricing…",
        last_ts_ms: now - 8_000,
        tokens_in: 4_100,
        tokens_out: 980,
      },
    ],
    interrupts: [
      {
        agent_id: "agent-1",
        kind: "approval",
        prompt: "Allow shell.exec `npm test`?",
        options: ["Allow", "Deny"],
      },
    ],
    quiet: false,
  };
}
