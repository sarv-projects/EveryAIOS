/**
 * Stage-0 plan executor tests (P6.3 seam).
 *
 * The executor is the runtime producer for the CircuitBreak model: it begins
 * the per-plan breaker in Rust (`plan/begin`), steps it per LLM turn + tool
 * call (`plan/step`), emits a `chat/interrupt` notification on a trip, and
 * resumes with the user's choice (`plan/respond`). These tests script the
 * Rust side (fake `request`) + the provider bridge (fake chunks) — no
 * network, no Rust binary.
 */
import { describe, expect, test } from "bun:test";
import type { StreamChunk } from "@personal-ai/core-engine";
import type { ChatEvent, ProviderBridge } from "./chat";
import {
  activePlanCount,
  cancelPlan,
  describeBreak,
  planTokenEstimate,
  respondToBreak,
  runPlanExecution,
  topologicalOrder,
  type PlanEvent,
  type PlanExecutionParams,
  type PlanRequest,
} from "./plan";

function collector<T>() {
  const events: T[] = [];
  return {
    events,
    plan: (e: PlanEvent) => events.push(e as unknown as T),
    chat: (e: ChatEvent) => events.push(e as unknown as T),
  };
}

/** A scripted provider bridge (no network — the tests never touch Rust). */
function scripted(chunks: StreamChunk[]): ProviderBridge {
  return {
    async *streamChat(_req, signal) {
      for (const c of chunks) {
        if (signal.aborted) return;
        yield c;
      }
    },
  };
}

/**
 * A scripted Rust breaker: `ok` for the first `okSteps` steps, then a trip
 * on the next `kind` step (repeating forever). Records every step it saw.
 */
function scriptedBreaker(opts: {
  okSteps: number;
  tripReason?: StepReply["interrupt"];
  beginFail?: boolean;
  endFail?: boolean;
}) {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let okCount = 0;
  let breakCounter = 0;
  const request: PlanRequest = (method, params) => {
    const p = params as Record<string, unknown>;
    calls.push({ method, params: p });
    if (method === "plan/begin") {
      if (opts.beginFail) return Promise.reject(new Error("no plan service"));
      return Promise.resolve({ started: true });
    }
    if (method === "plan/end") {
      if (opts.endFail) return Promise.reject(new Error("no plan service"));
      return Promise.resolve({ ended: true });
    }
    if (method === "plan/step") {
      okCount += 1;
      if (okCount > opts.okSteps) {
        const interrupt =
          opts.tripReason ?? { reason: { loop_detected: { repeats: 3 } }, options: [] };
        const id = `brk-${++breakCounter}`;
        return Promise.resolve({ ok: false, interrupt, breakId: id });
      }
      return Promise.resolve({ ok: true });
    }
    return Promise.reject(new Error(`unexpected method ${method}`));
  };
  return { request, calls };
}

interface StepReply {
  interrupt?: {
    reason:
      | { budget_exhausted?: { scope: string } }
      | { loop_detected?: { repeats: number } }
      | { timeout?: { secs: number } };
    options: string[];
  };
}

const PARAMS: PlanExecutionParams = {
  sessionId: "s1",
  planId: "p1",
  streamId: "st-1",
  tasks: [
    { id: "a", goal: "task a" },
    { id: "b", goal: "task b", dependsOn: ["a"] },
  ],
  provider: "nvidia",
  model: "meta/llama",
};

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("plan executor — topological order", () => {
  test("orders tasks after their dependencies", () => {
    expect(
      topologicalOrder([
        { id: "c", goal: "c", dependsOn: ["b"] },
        { id: "b", goal: "b", dependsOn: ["a"] },
        { id: "a", goal: "a" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  test("ignores unknown deps (partial plan still runs)", () => {
    expect(
      topologicalOrder([{ id: "x", goal: "x", dependsOn: ["ghost"] }]),
    ).toEqual(["x"]);
  });

  test("token estimate counts goals + verify blocks", () => {
    const n = planTokenEstimate([
      { id: "a", goal: "x".repeat(200), verify: ["y".repeat(100)] },
    ]);
    expect(n).toBeGreaterThan(0);
  });
});

describe("plan executor — happy path", () => {
  test("runs all tasks in order and emits plan_done", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request } = scriptedBreaker({ okSteps: 99 });
    const bridge = scripted([
      { type: "text", text: "ok" },
      { type: "done", usage: { promptTokens: 5, completionTokens: 1 } },
    ]);

    await runPlanExecution(PARAMS, plan, chat, bridge, request);

    expect(events.filter((e) => e.type === "plan_start")).toHaveLength(1);
    const steps = events.filter((e) => e.type === "plan_step") as Extract<PlanEvent, { type: "plan_step" }>[];
    // Each task emits running → done (order preserved per task).
    expect(steps.map((s) => s.taskId)).toEqual(["a", "a", "b", "b"]);
    expect(steps.filter((s) => s.status === "done").map((s) => s.taskId)).toEqual(["a", "b"]);
    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.tasksDone).toBe(2);
    expect(done.error).toBeUndefined();
    // LLM turns streamed through the provider bridge.
    expect(events.some((e) => e.type === "batch")).toBe(true);
    expect(activePlanCount()).toBe(0);
  });

  test("begins and ends the Rust breaker", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request, calls } = scriptedBreaker({ okSteps: 99 });

    await runPlanExecution(PARAMS, plan, chat, scripted([]), request);

    const methods = calls.map((c) => c.method);
    expect(methods[0]).toBe("plan/begin");
    expect(methods).toContain("plan/end");
    // One llm_turn per task.
    const steps = calls.filter((c) => c.method === "plan/step");
    expect(steps.filter((s) => s.params.kind === "llm_turn")).toHaveLength(2);
  });

  test("degrades gracefully when Rust has no plan service", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request } = scriptedBreaker({ okSteps: 99, beginFail: true, endFail: true });

    await runPlanExecution(PARAMS, plan, chat, scripted([]), request);

    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.tasksDone).toBe(2);
  });
});

describe("plan executor — circuit-break interrupt emit (P6.3)", () => {
  test("emits chat/interrupt on trip and resumes with skip", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    // Ok for task-a's llm_turn; the second llm_turn (task b) trips.
    const { request } = scriptedBreaker({
      okSteps: 1,
      tripReason: {
        reason: { budget_exhausted: { scope: "parent" } },
        options: ["skip", "retry", "escalate"],
      },
    });

    // Drive the executor in the background; it will pause at the interrupt.
    const run = runPlanExecution(PARAMS, plan, chat, scripted([]), request);

    // Wait for the interrupt event.
    const deadline = Date.now() + 2000;
    while (
      Date.now() < deadline &&
      !events.some((e) => e.type === "interrupt")
    ) {
      await tick(10);
    }

    const interrupt = events.find((e) => e.type === "interrupt") as Extract<PlanEvent, { type: "interrupt" }>;
    expect(interrupt).toBeDefined();
    expect(interrupt.planId).toBe("p1");
    expect(interrupt.breakId).toContain("brk-p1");
    expect(interrupt.options).toEqual(["skip", "retry", "escalate", "takeover"]);
    expect(interrupt.description).toContain("budget exhausted (parent)");

    // The user picks "skip" → the executor moves on to the next task.
    const resolved = respondToBreak(interrupt.breakId, "skip");
    expect(resolved).toBe(true);
    await run;

    const skipped = events.filter(
      (e) => e.type === "plan_step" && (e as { status?: string }).status === "skipped",
    );
    expect(skipped).toHaveLength(1);
    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.error).toBeUndefined();
  });

  test("escalate halts the plan with an error", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request } = scriptedBreaker({
      okSteps: 0,
      tripReason: {
        reason: { loop_detected: { repeats: 3 } },
        options: ["skip", "retry", "escalate", "takeover"],
      },
    });

    const run = runPlanExecution(PARAMS, plan, chat, scripted([]), request);
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !events.some((e) => e.type === "interrupt")) {
      await tick(10);
    }
    const interrupt = events.find((e) => e.type === "interrupt") as Extract<PlanEvent, { type: "interrupt" }>;
    expect(interrupt.description).toContain("loop detected (3× repeat)");

    respondToBreak(interrupt.breakId, "escalate");
    await run;

    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.error).toBe("escalated by user");
    expect(done.tasksDone).toBe(0);
  });

  test("takeover halts the plan", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request } = scriptedBreaker({ okSteps: 0 });

    const run = runPlanExecution(PARAMS, plan, chat, scripted([]), request);
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !events.some((e) => e.type === "interrupt")) {
      await tick(10);
    }
    const interrupt = events.find((e) => e.type === "interrupt") as Extract<PlanEvent, { type: "interrupt" }>;
    respondToBreak(interrupt.breakId, "takeover");
    await run;

    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.error).toBe("taken over by user");
  });

  test("cancel aborts a paused plan", async () => {
    const { events, plan, chat } = collector<PlanEvent | ChatEvent>();
    const { request } = scriptedBreaker({ okSteps: 0 });

    const run = runPlanExecution(PARAMS, plan, chat, scripted([]), request);
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !events.some((e) => e.type === "interrupt")) {
      await tick(10);
    }
    expect(cancelPlan("p1")).toBe(true);
    await run;

    const done = events.find((e) => e.type === "plan_done") as Extract<PlanEvent, { type: "plan_done" }>;
    expect(done.error).toBe("cancelled");
    expect(activePlanCount()).toBe(0);
  });

  test("responding to an unknown break returns false", () => {
    expect(respondToBreak("ghost", "skip")).toBe(false);
  });
});

describe("plan executor — describeBreak", () => {
  test("labels each trip reason", () => {
    expect(describeBreak({ reason: { budget_exhausted: { scope: "sub_agent" } }, options: [] })).toBe(
      "iteration budget exhausted (sub_agent)",
    );
    expect(describeBreak({ reason: { loop_detected: { repeats: 4 } }, options: [] })).toBe(
      "loop detected (4× repeat)",
    );
    expect(describeBreak({ reason: { timeout: { secs: 900 } }, options: [] })).toBe(
      "turn timed out (900s)",
    );
    expect(describeBreak(undefined)).toBe("circuit break");
  });
});
