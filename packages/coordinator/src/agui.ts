/**
 * P11.5.11 (H25) — AG-UI wire protocol (doc 50): tool calls + UI updates over
 * ONE JSON channel (~16 event types). This is the typed envelope + codec that
 * sits on top of the existing P0.5 framed IPC — the coordinator encodes
 * events, the UI decodes them, and generative UI payloads ride inside
 * `artifact` events.
 *
 * Live transport (the framed-IPC hop):
 * - coordinator → Rust → UI: [`notifyAgui`] emits an `agui/event`
 *   notification (`params.line` = the encoded envelope); the Rust relay
 *   forwards it to the Tauri `agui-event` emit.
 * - UI → coordinator: the Tauri `agui_send` command writes an `agui/event`
 *   notification back; [`dispatchAguiLine`] routes it to the handlers
 *   registered via [`onAguiEvent`] (e.g. `interrupt_resolved`).
 */

import { notify } from "./frame";

/** The AG-UI event set (stable names, snake_case over the wire). */
export type AguiEventType =
  | "user_message_created"
  | "assistant_message_created"
  | "assistant_message_delta"
  | "tool_call_created"
  | "tool_call_delta"
  | "tool_call_result"
  | "agent_message"
  | "agent_state_changed"
  | "artifact_created"
  | "artifact_updated"
  | "interrupt_created"
  | "interrupt_resolved"
  | "session_created"
  | "session_updated"
  | "error"
  | "done";

export interface AguiEnvelope<T = unknown> {
  type: AguiEventType;
  /** Correlation id (maps to the framed IPC message id). */
  id: string;
  /** ISO timestamp. */
  ts: string;
  data: T;
}

export interface ToolCallData {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
  /** session/progress state for the tool (UI renders this live). */
  state?: "pending" | "running" | "done" | "error";
}

export interface ArtifactData {
  artifact_id: string;
  /** Version bumps on every artifact_updated (make-live version selector). */
  version: number;
  kind: "html" | "mermaid" | "descriptor" | "markdown";
  payload: unknown;
}

export interface InterruptData {
  interrupt_id: string;
  kind: "permission" | "mcq" | "diff" | "budget";
  title: string;
  description: string;
  options: { label: string; value: string }[];
}

const TYPES: readonly AguiEventType[] = [
  "user_message_created",
  "assistant_message_created",
  "assistant_message_delta",
  "tool_call_created",
  "tool_call_delta",
  "tool_call_result",
  "agent_message",
  "agent_state_changed",
  "artifact_created",
  "artifact_updated",
  "interrupt_created",
  "interrupt_resolved",
  "session_created",
  "session_updated",
  "error",
  "done",
];

/** Encode an event for the wire (JSON, one line — NDJSON over the frame). */
export function encodeAgui<T>(type: AguiEventType, id: string, data: T): string {
  const env: AguiEnvelope<T> = { type, id, ts: new Date().toISOString(), data };
  return JSON.stringify(env);
}

/** Decode one wire line; returns null on malformed/unknown type (never throws). */
export function decodeAgui(line: string): AguiEnvelope | null {
  try {
    const parsed = JSON.parse(line) as AguiEnvelope;
    if (typeof parsed.type !== "string" || !TYPES.includes(parsed.type as AguiEventType)) {
      return null;
    }
    if (typeof parsed.id !== "string" || typeof parsed.ts !== "string" || !("data" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Emit one AG-UI event over the framed IPC as an `agui/event` notification. */
export function notifyAgui<T>(type: AguiEventType, id: string, data: T): void {
  notify("agui/event", { line: encodeAgui(type, id, data) });
}

type AguiHandler = (env: AguiEnvelope) => void;

const handlers = new Map<AguiEventType, AguiHandler[]>();

/** Register a handler for inbound UI→coordinator AG-UI events (e.g. answers
 * to `interrupt_created` arrive as `interrupt_resolved`). */
export function onAguiEvent(type: AguiEventType, handler: AguiHandler): () => void {
  const list = handlers.get(type) ?? [];
  list.push(handler);
  handlers.set(type, list);
  return () => {
    const cur = handlers.get(type) ?? [];
    handlers.set(
      type,
      cur.filter((h) => h !== handler),
    );
  };
}

/** Route one inbound wire line to its handlers. Returns true when at least
 * one handler ran (false = unknown type / no listener / malformed). */
export function dispatchAguiLine(line: string): boolean {
  const env = decodeAgui(line);
  if (!env) return false;
  const list = handlers.get(env.type);
  if (!list || list.length === 0) return false;
  for (const h of list) h(env);
  return true;
}

/** Narrowing helpers. */
export function isToolCall(e: AguiEnvelope | null): e is AguiEnvelope<ToolCallData> {
  return e !== null && (e.type === "tool_call_created" || e.type === "tool_call_result");
}

export function isArtifact(e: AguiEnvelope | null): e is AguiEnvelope<ArtifactData> {
  return e !== null && (e.type === "artifact_created" || e.type === "artifact_updated");
}

export function isInterrupt(e: AguiEnvelope | null): e is AguiEnvelope<InterruptData> {
  return e !== null && (e.type === "interrupt_created" || e.type === "interrupt_resolved");
}
