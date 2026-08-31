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

// Vendored mirror of `@personal-ai/core-ai` StreamSession (stream-session.ts)
// and `@personal-ai/core-files` estimateTokens (chunking.ts).
import { StreamSession } from "./stream-session";
import type { StreamChunk, TurnInput } from "@personal-ai/core-engine";
import { estimateTokens } from "./chunking";
import type { ChatEvent, ProviderBridge, ProviderMessage, ProviderRequest } from "./chat";
import { listedToolsToOpenAI, resolveActiveTools, ToolExecutor, type ListedTool } from "./tools";
import { budgetJson, refRegistry } from "./budget";
export { evaluateGuard, useTicket, guardGate } from "./guard";

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
  /**
   * Allow-list of Rust ToolRegistry ids this task may call. Serialized into
   * the provider `tools` body; each model `tool_call` runs through ToolExecutor
   * (one Guard-2 ticket per call).
   */
  tools?: string[];
}

/**
 * Codex/Claude plan mode: decompose a goal into ordered tasks *without
 * executing*. Numbered lists, bullets, and "then"/";" splits become
 * multiple tasks; a short one-liner stays a single reviewable task.
 */
export function draftPlanTasks(goal: string): PlanTask[] {
  const text = goal.trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const itemized = lines
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)]|#{1,6})\s+/, "").trim())
    .filter((l) => l.length > 0);
  if (lines.length >= 2 && itemized.length >= 2) {
    return itemized.map((g, i) => ({
      id: `t${i + 1}`,
      goal: g,
      ...(i > 0 ? { dependsOn: [`t${i}`] } : {}),
    }));
  }
  const parts = text
    .split(/\s*(?:;|\bthen\b|\band then\b)\s+/i)
    .map((p) => p.replace(/^\s*(?:and\s+)?/i, "").trim())
    .filter((p) => p.length >= 8);
  if (parts.length >= 2) {
    return parts.map((g, i) => ({
      id: `t${i + 1}`,
      goal: g.replace(/[.]+$/, ""),
      ...(i > 0 ? { dependsOn: [`t${i}`] } : {}),
    }));
  }
  return [{ id: "t1", goal: text }];
}

export interface PlanExecutionParams {
  sessionId: string;
  /** P49 canonical Work identity. */
  workId?: string;
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
      /** S0.7 EV1 verification report (when eval/verify is available). */
      verification?: { verified?: boolean; status?: string };
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
    try {
      await request("execution/begin", {
        trigger: "plan",
        sessionId,
        ...(params.workId !== undefined ? { workId: params.workId } : {}),
        objective: planId,
        contextSnapshot: { sessionId, planId, streamId },
      });
    } catch {
      /* kernel optional */
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
      const turn = await runTaskTurn(
        task,
        controller,
        params,
        bridge,
        emitChat,
        request,
        batchIntervalMs,
      );
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
      let verification: { verified?: boolean; status?: string } | undefined;
      try {
        const checks = tasks.flatMap((t) => t.verify ?? []);
        const report = (await request("eval/verify", {
          taskId: planId,
          goal: tasks.map((t) => t.goal).join("; "),
          verify: checks,
        })) as { verified?: boolean; status?: string };
        verification = report;
      } catch {
        /* eval/verify is best-effort — missing handler never blocks plan_done */
      }
      emitPlan({
        type: "plan_done",
        streamId,
        planId,
        tasksDone,
        ...(verification ? { verification } : {}),
      });
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
 * the user message. Native tool_call chunks run through ToolExecutor
 * (one Guard-2 ticket each) and their results feed a verify follow-up.
 */
async function runTaskTurn(
  task: PlanTask,
  controller: AbortController,
  params: PlanExecutionParams,
  bridge: ProviderBridge,
  emitChat: (e: ChatEvent) => void,
  request: PlanRequest,
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

  const executor = new ToolExecutor(request);
  let listed: ListedTool[] = [];
  try {
    listed = await executor.listTools();
  } catch {
    /* headless */
  }
  const allowIds = taskTools(task);
  const scoped =
    allowIds.length > 0
      ? listed.filter((t) => allowIds.includes(t.id))
      : listed;
  const openaiTools =
    scoped.length > 0
      ? listedToolsToOpenAI(resolveActiveTools(scoped, task.goal))
      : allowIds.length > 0
        ? listedToolsToOpenAI(
            resolveActiveTools(
              allowIds.map((id) => ({
                id,
                family: "",
                description: id,
                readOnly: false,
                operation: "",
                risk: "",
                argsSchema: { type: "object", properties: {} },
              })),
              task.goal,
            ),
          )
        : [];

  const req: ProviderRequest = {
    provider,
    model,
    streamId,
    sessionId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: task.goal },
    ],
    ...(openaiTools.length > 0
      ? { tools: openaiTools, tool_choice: "auto" as const }
      : {}),
  };

  const called: Array<{ toolId: string; args: Record<string, unknown> }> = [];
  try {
    for await (const chunk of bridge.streamChat(req, controller.signal)) {
      if (controller.signal.aborted) return { tools: [] };
      if (chunk.type === "text") {
        batcher.pushToken(chunk.text);
      } else if (chunk.type === "tool_call") {
        if (allowIds.length === 0 || allowIds.includes(chunk.id)) {
          called.push({ toolId: chunk.id, args: chunk.args ?? {} });
        }
      } else if (chunk.type === "done") {
        break;
      }
    }

    const executed: string[] = [];
    const results: unknown[] = [];
    for (const tc of called) {
      if (controller.signal.aborted) break;
      emitChat({ type: "tool_call", streamId, toolId: tc.toolId, args: tc.args });
      emitChat({ type: "stage", streamId, stage: `tool:${tc.toolId}:running` });
      try {
        const ctx: { sessionId: string; agentId?: string } = { sessionId };
        const result = await executor.executeTool(tc.toolId, tc.args, ctx);
        results.push(result);
        executed.push(tc.toolId);
        // P39.1: oversized tool results become ref + bounded preview.
        emitChat({ type: "tool_result", streamId, toolId: tc.toolId, result: budgetJson(result, refRegistry) });
        emitChat({ type: "stage", streamId, stage: `tool:${tc.toolId}:done` });
      } catch (toolErr) {
        const message = toolErr instanceof Error ? toolErr.message : String(toolErr);
        results.push({ error: message });
        executed.push(tc.toolId);
        emitChat({
          type: "tool_result",
          streamId,
          toolId: tc.toolId,
          result: { error: message },
        });
        emitChat({
          type: "error",
          streamId,
          code: "tool_failed",
          message,
          retryable: true,
          toolId: tc.toolId,
          args: tc.args,
        });
      }
    }

    // Feed tool results into the task's verify checks via a follow-up turn.
    if (
      task.verify &&
      task.verify.length > 0 &&
      results.length > 0 &&
      !controller.signal.aborted
    ) {
      const verifyMessages: ProviderMessage[] = [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Goal: ${task.goal}`,
            `Tool results:\n${JSON.stringify(results)}`,
            `Verification (must satisfy): ${task.verify.join("; ")}`,
            "Report which checks passed or failed. Do not claim unverified completion.",
          ].join("\n"),
        },
      ];
      const verifyReq: ProviderRequest = {
        provider,
        model,
        streamId,
        sessionId,
        messages: verifyMessages,
      };
      let verifyReport = "";
      for await (const chunk of bridge.streamChat(verifyReq, controller.signal)) {
        if (controller.signal.aborted) break;
        if (chunk.type === "text") {
          batcher.pushToken(chunk.text);
          verifyReport += chunk.text;
        } else if (chunk.type === "done") break;
      }
      // P41.4 — K1 verification surfaced as a structured receipt (inline in
      // the editor's Diff rail): model-reported pass/fail per check, never
      // claimed as executed. `passed` stays null unless the report is
      // unambiguous — the honest flag.
      const lower = verifyReport.toLowerCase();
      const allPass =
        (lower.includes("pass") || lower.includes("satisfied")) &&
        !lower.includes("fail");
      const anyFail = lower.includes("fail") || lower.includes("not satisfied");
      emitChat({
        type: "verification",
        streamId,
        taskId: task.id,
        checks: task.verify,
        report: verifyReport.slice(0, 2000),
        passed: allPass ? true : anyFail ? false : null,
      } as unknown as ChatEvent);
    }

    batcher.complete();
    return { tools: executed };
  } catch (err) {
    return { tools: [], err: err instanceof Error ? err.message : String(err) };
  } finally {
    batcher.destroy();
  }
}

/** Allow-list declared on the task (empty = any registry tool the model calls). */
function taskTools(task: PlanTask): string[] {
  return task.tools ?? [];
}

/**
 * Dependency order: every task after its dependsOn. Stable (insertion order
 * within a level). **Fail-closed:** an unknown dependency or a dependency
 * cycle throws (never silently drops tasks), so a malformed plan can't
 * report a false "completed".
 */
export function topologicalOrder(tasks: PlanTask[]): string[] {
  const ids = new Set(tasks.map((t) => t.id));
  // Unknown dependency → refuse the plan (a task naming a task that doesn't
  // exist is a planning error, not a satisfied dependency).
  for (const t of tasks) {
    for (const d of t.dependsOn ?? []) {
      if (!ids.has(d)) {
        throw new Error(`task "${t.id}" depends on unknown task "${d}"`);
      }
    }
  }
  const done = new Set<string>();
  const order: string[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of tasks) {
      if (done.has(t.id)) continue;
      const depsOk = (t.dependsOn ?? []).every((d) => done.has(d));
      if (!depsOk) continue;
      done.add(t.id);
      order.push(t.id);
      progress = true;
    }
  }
  // Any task not ordered means a dependency cycle — fail, don't drop.
  if (order.length !== tasks.length) {
    const stuck = tasks.filter((t) => !done.has(t.id)).map((t) => t.id);
    throw new Error(`dependency cycle detected among tasks: ${stuck.join(", ")}`);
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
