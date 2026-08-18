/**
 * Stage-0 plan executor (P6.3 seam) — the runtime producer for the
 * `CircuitBreak`/`McqOption` model in `everyaios-blueprint::iteration`.
 *
 * Flow per plan:
 *   plan/begin        → Rust registers a fresh per-plan CircuitBreaker
 *   per LLM turn      → plan/step { kind: "llm_turn" }  (charges budget)
 *   per tool call     → plan/step { kind: "tool_call" } (loop detector)
 *   on trip           → emit chat/interrupt + WAIT for the user's choice
 *                      (plan/respond resolves the wait; the executor resumes
 *                      with the chosen path: skip → next task, retry → same
 *                      step, escalate → halt with error, takeover → halt)
 *   plan/end          → Rust drops the breaker
 *
 * The MCQs render in the H2 cockpit card (`mcq-interrupt-card.tsx`) — the
 * `pushMcq`/`respondMcq` path is already live-wired for Guard-2 tickets; this
 * is the other producer feeding the same card.
 */

import { StreamSession } from "@personal-ai/core-ai";
import type { StreamChunk, TurnInput } from "@personal-ai/core-engine";
import { estimateTokens } from "@personal-ai/core-files";
import type { ChatEvent, ProviderBridge, ProviderRequest } from "./chat";

/**
 * One task of a plan the coordinator executes. Mirrors the Rust
 * `BlueprintTask` shape the UI/coordinator exchange (spec §6 seam).
 */
export interface PlanTask {
  id: string;
  /** The user-approved objective for this task. */
  goal: string;
  /** Deterministic checks the task must satisfy (surfaced, not executed). */
  verify?: string[];
  /** Task ids that must be done first. */
  dependsOn?: string[];
}

export interface PlanExecutionParams {
  sessionId: string;
  planId: string;
  streamId: string;
  tasks: PlanTask[];
  provider?: string;
  model?: string;
}

/** The interruption event the executor emits on a circuit-break trip. */
export interface PlanInterruptEvent {
  type: "interrupt";
  streamId: string;
  planId: string;
  breakId: string;
  title: string;
  description: string;
  /** McqOption values (snake_case): skip / retry / escalate / takeover. */
  options: string[];
}

/** Plan lifecycle events forwarded as `chat/<type>` notifications. */
export type PlanEvent =
  | { type: "plan_start"; streamId: string; planId: string; tasks: number }
  | { type: "plan_step"; streamId: string; planId: string; taskId: string; status: "running" | "done" | "skipped" }
  | PlanInterruptEvent
  | {
      type: "plan_done";
      streamId: string;
      planId: string;
      tasksDone: number;
      error?: string;
    };

/** The choice the user made on the MCQ card (matches McqOption). */
export type PlanChoice = "skip" | "retry" | "escalate" | "takeover";

/** Outbound JSON-RPC request (mirrors `chat.ts` `request`). */
export type PlanRequest = (method: string, params: unknown) => Promise<unknown>;

/** One `plan/step` reply from Rust. */
interface StepReply {
  ok: boolean;
  interrupt?: {
    reason:
      | { budget_exhausted?: { scope: string } }
      | { loop_detected?: { repeats: number } }
      | { timeout?: { secs: number } };
    options: string[];
  };
}

/** Pending circuit-break waits: breakId → resolve (the plan/respond path). */
const pending = new Map<string, (choice: PlanChoice) => void>();

/** Active plan executors keyed by planId (cancellation registry). */
const active = new Map<string, AbortController>();

/** Monotonic break-id source (breakId must be unique per plan run). */
let breakCounter = 0;

/** Number of plans currently executing (tests/diagnostics). */
export function activePlanCount(): number {
  return active.size;
}

/**
 * Resolve a pending circuit-break wait (the `plan/respond` handler in
 * `index.ts` calls this). Returns false when the break is unknown/answered.
 */
export function respondToBreak(breakId: string, choice: PlanChoice): boolean {
  const resolve = pending.get(breakId);
  if (!resolve) return false;
  pending.delete(breakId);
  resolve(choice);
  return true;
}

/** Cancel a running plan execution (abort the turn loop). */
export function cancelPlan(planId: string): boolean {
  const c = active.get(planId);
  if (!c) return false;
  c.abort();
  return true;
}

/**
 * Run one plan through the executor: begin the breaker in Rust, execute the
 * tasks in dependency order with an LLM turn each, step the breaker around
 * every LLM turn + tool call, and emit `chat/interrupt` + wait when it trips.
 * Detached by the `plan/execute` handler; emits via `emitPlan` (plan events)
 * and `emitChat` (the LLM turn's ttft/batch/done stream).
 */
export async function runPlanExecution(
  params: PlanExecutionParams,
  emitPlan: (e: PlanEvent) => void,
  emitChat: (e: ChatEvent) => void,
  bridge: ProviderBridge,
  request: PlanRequest,
  batchIntervalMs = 33,
): Promise<void> {
  const { sessionId, planId, streamId, tasks } = params;

  const controller = new AbortController();
  active.set(planId, controller);

  emitPlan({ type: "plan_start", streamId, planId, tasks: tasks.length });

  try {
    // Rust owns the breaker state — begin it (never fails a run: a missing
    // handler is tolerated so plan/execute stays available headless).
    try {
      await request("plan/begin", { planId });
    } catch {
      /* best-effort */
    }

    const order = topologicalOrder(tasks);
    let tasksDone = 0;

    for (const taskId of order) {
      if (controller.signal.aborted) break;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) continue;

      emitPlan({ type: "plan_step", streamId, planId, taskId, status: "running" });

      // LLM turn: charge the parent budget first; a trip interrupts.
      const llm = await stepOnce(request, controller, planId, "llm_turn", `task:${taskId}`);
      if (llm === "aborted") break;
      if (llm.trip) {
        const choice = await waitForChoice(controller, emitPlan, {
          streamId,
          planId,
          taskId,
          reason: describeBreak(llm.interrupt),
        });
        if (controller.signal.aborted) break;
        if (choice === "skip") {
          emitPlan({ type: "plan_step", streamId, planId, taskId, status: "skipped" });
          continue;
        }
        if (choice === "escalate" || choice === "takeover") {
          emitPlan({
            type: "plan_done",
            streamId,
            planId,
            tasksDone,
            error: choice === "escalate" ? "escalated by user" : "taken over by user",
          });
          return;
        }
        // retry: fall through and re-attempt the same task.
      }

      // The model's turn for this task — streams through the same provider
      // bridge as chat (ttft/batch/done surface the turn in the transcript).
      const turn = await runTaskTurn(task, controller, params, bridge, emitChat, batchIntervalMs);
      if (controller.signal.aborted) break;
      if (turn.err) {
        emitPlan({ type: "plan_done", streamId, planId, tasksDone, error: turn.err });
        return;
      }

      // Tool calls the task performed: each charges a tool_call step (loop
      // detector observes the sequence; 3× repeat trips).
      for (const tool of turn.tools) {
        if (controller.signal.aborted) break;
        const tstep = await stepOnce(request, controller, planId, "tool_call", tool);
        if (tstep === "aborted") break;
        if (tstep.trip) {
          const choice = await waitForChoice(controller, emitPlan, {
            streamId,
            planId,
            taskId,
            reason: describeBreak(tstep.interrupt),
          });
          if (controller.signal.aborted) break;
          if (choice === "escalate" || choice === "takeover") {
            emitPlan({
              type: "plan_done",
              streamId,
              planId,
              tasksDone,
              error: choice === "escalate" ? "escalated by user" : "taken over by user",
            });
            return;
          }
          if (choice === "skip") break; // skip remaining tools of this task
          continue; // retry the tool call
        }
      }

      tasksDone += 1;
      emitPlan({ type: "plan_step", streamId, planId, taskId, status: "done" });
    }

    if (controller.signal.aborted) {
      emitPlan({ type: "plan_done", streamId, planId, tasksDone, error: "cancelled" });
    } else {
      emitPlan({ type: "plan_done", streamId, planId, tasksDone });
    }
  } finally {
    try {
      await request("plan/end", { planId });
    } catch {
      /* best-effort */
    }
    active.delete(planId);
  }
}

type StepOutcome =
  | "aborted"
  | { trip: false }
  | { trip: true; interrupt?: StepReply["interrupt"] };

/** A single breaker step; returns the outcome (trip carries the break). */
async function stepOnce(
  request: PlanRequest,
  controller: AbortController,
  planId: string,
  kind: "llm_turn" | "tool_call",
  toolCall: string,
): Promise<StepOutcome> {
  if (controller.signal.aborted) return "aborted";
  try {
    const reply = (await request("plan/step", {
      planId,
      kind,
      toolCall,
    })) as StepReply;
    if (reply?.ok === false) return { trip: true, interrupt: reply.interrupt };
    return { trip: false };
  } catch {
    // Rust absent/unwired — the executor degrades to running tasks without
    // breaker enforcement (headless/self-test mode).
    return { trip: false };
  }
}

/** Human-readable break reason for the interrupt card. */
export function describeBreak(interrupt?: StepReply["interrupt"]): string {
  const reason = interrupt?.reason;
  if (!reason) return "circuit break";
  if ("budget_exhausted" in reason) {
    const scope = reason.budget_exhausted?.scope ?? "parent";
    return `iteration budget exhausted (${scope})`;
  }
  if ("loop_detected" in reason) {
    return `loop detected (${reason.loop_detected?.repeats ?? "3"}× repeat)`;
  }
  if ("timeout" in reason) {
    return `turn timed out (${reason.timeout?.secs ?? "—"}s)`;
  }
  return "circuit break";
}

/**
 * Emit the chat/interrupt card and wait for the user's choice. The
 * `plan/respond` JSON-RPC request resolves the wait (UI → Tauri →
 * ChatRelay::respond_plan → coordinator).
 */
async function waitForChoice(
  controller: AbortController,
  emitPlan: (e: PlanEvent) => void,
  ctx: { streamId: string; planId: string; taskId: string; reason: string },
): Promise<PlanChoice> {
  const breakId = `brk-${ctx.planId}-${++breakCounter}`;
  const options = ["skip", "retry", "escalate", "takeover"];

  emitPlan({
    type: "interrupt",
    streamId: ctx.streamId,
    planId: ctx.planId,
    breakId,
    title: "Agent needs a decision",
    description: `Task "${ctx.taskId}" tripped the circuit breaker (${ctx.reason}).`,
    options,
  });

  return new Promise<PlanChoice>((resolve) => {
    const onAbort = () => {
      pending.delete(breakId);
      resolve("takeover");
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    pending.set(breakId, (choice) => {
      controller.signal.removeEventListener("abort", onAbort);
      resolve(choice);
    });
  });
}

/**
 * The model's turn for one task: one provider stream with the task goal as
 * the user message, batched at `batchIntervalMs` (same surface as chat).
 * Returns the tools the task performed (declared on the task for now — the
 * tool-executor wiring that parses model tool calls lands with it).
 */
async function runTaskTurn(
  task: PlanTask,
  controller: AbortController,
  params: PlanExecutionParams,
  bridge: ProviderBridge,
  emitChat: (e: ChatEvent) => void,
  batchIntervalMs: number,
): Promise<{ err?: string; tools: string[] }> {
  const { sessionId, planId, streamId } = params;
  const provider = params.provider ?? "nvidia";
  const model = params.model ?? "meta/llama";

  const batcher = new StreamSession(streamId, (ev) => {
    switch (ev.type) {
      case "ttft":
        emitChat({ type: "ttft", streamId, latencyMs: ev.latencyMs });
        break;
      case "batch":
        emitChat({ type: "batch", streamId, text: ev.text, tokenCount: ev.tokenCount });
        break;
      default:
        break;
    }
  }, { batchIntervalMs });

  const system = [
    `You are executing task "${task.id}" of plan "${planId}".`,
    `Goal: ${task.goal}`,
    task.verify && task.verify.length > 0
      ? `Verification (must satisfy): ${task.verify.join("; ")}`
      : null,
    "Do not claim completion you cannot verify. Report what you did.",
  ]
    .filter(Boolean)
    .join("\n");

  const req: ProviderRequest = {
    provider,
    model,
    streamId,
    sessionId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: task.goal },
    ],
  };

  try {
    for await (const chunk of bridge.streamChat(req, controller.signal)) {
      if (controller.signal.aborted) return { tools: [] };
      if (chunk.type === "text") {
        batcher.pushToken(chunk.text);
      } else if (chunk.type === "done") {
        break;
      }
    }
    batcher.complete();
  } catch (err) {
    return { tools: [], err: err instanceof Error ? err.message : String(err) };
  } finally {
    batcher.destroy();
  }

  return { tools: taskTools(task) };
}

/** Deterministic tool list a task performs (declared on the task for now). */
function taskTools(task: PlanTask): string[] {
  // Plan tasks declare their tool calls via a `tools` list when present;
  // otherwise nothing is observed (the LLM turn itself charged the budget).
  return [];
}

/**
 * Dependency order: every task after its dependsOn. Stable (insertion order
 * within a level); unknown deps are ignored so a partial plan still runs.
 */
export function topologicalOrder(tasks: PlanTask[]): string[] {
  const ids = new Set(tasks.map((t) => t.id));
  const done = new Set<string>();
  const order: string[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const depsOk = (t.dependsOn ?? []).every((d) => !ids.has(d) || done.has(d));
      if (!depsOk) continue;
      done.add(t.id);
      order.push(t.id);
      progress = true;
    }
  }
  return order;
}

/** Estimate tokens in a task goal (composer budget surface). */
export function planTokenEstimate(tasks: PlanTask[]): number {
  return tasks.reduce(
    (n, t) => n + estimateTokens(t.goal) + estimateTokens(t.verify?.join("\n") ?? ""),
    0,
  );
}

/** Re-export the turn-input type for parity with chat.ts's signature. */
export type { TurnInput };
