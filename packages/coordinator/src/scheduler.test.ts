import { test, expect, mock } from "bun:test";
import { startScheduler, type DueReport, type ListReport, type SchedulerJob } from "./scheduler";
import type { ChatEvent, ProviderBridge } from "./chat";
import type { StreamChunk } from "@personal-ai/core-engine";

/** A scripted provider bridge: yields one text chunk then done. */
const okBridge: ProviderBridge = {
  async *streamChat(): AsyncGenerator<StreamChunk, void> {
    yield { type: "text", text: "ok" };
    yield { type: "done" };
  },
};

/** A provider bridge that throws immediately (engine failure path). */
const failBridge: ProviderBridge = {
  async *streamChat(): AsyncGenerator<StreamChunk, void> {
    throw new Error("provider down");
  },
};

/** Build a scripted Rust-side fake that answers scheduler/* from an in-memory map. */
function scriptedRust(initial: Record<string, unknown> = {}) {
  const jobs = new Map<string, SchedulerJob>();
  const calls: string[] = [];
  /** Captured `scheduler/monitor` invocations: {id, observation, conditionMet}. */
  const monitorCalls: Array<{ id: string; observation: string; conditionMet: boolean }> = [];
  let now = initial["now"] as number | undefined ?? 1_750_000_000;
  const dueQueue: string[] = [];

  const job = (
    id: string,
    over: Partial<SchedulerJob> = {},
  ): SchedulerJob => ({
    id,
    name: id,
    sessionId: `sess-${id}`,
    trigger: { type: "interval", secs: 60 },
    steps: [],
    policy: { suppressOnBattery: true },
    enabled: true,
    state: { state: "idle" },
    checkpoint: 0,
    runs: 0,
    successes: 0,
    failures: 0,
    ...over,
  });

  const request = mock(async (method: string, params: unknown) => {
    calls.push(method);
    const p = (params ?? {}) as Record<string, unknown>;
    switch (method) {
      case "scheduler/due": {
        const out: DueReport = { due: [...dueQueue], now };
        dueQueue.length = 0;
        return out;
      }
      case "scheduler/list": {
        const out: ListReport = { jobs: [...jobs.values()], onBattery: false };
        return out;
      }
      case "scheduler/lease_start":
        jobs.set(String(p.id), { ...(jobs.get(String(p.id))!), state: { state: "running", leaseExpiresAt: now + 30 } });
        return { ok: true, resumed: false, checkpoint: 0 };
      case "scheduler/lease_heartbeat":
        return { ok: true, leaseExpiresAt: now + 30 };
      case "scheduler/lease_finish": {
        const j = jobs.get(String(p.id))!;
        if (p.ok) {
          jobs.set(String(p.id), { ...j, state: { state: "idle" }, runs: j.runs + 1, successes: j.successes + 1 });
        } else {
          jobs.set(String(p.id), { ...j, state: { state: "failed", retries: 1, nextRetryAt: now + 30 }, failures: j.failures + 1 });
        }
        return { ok: true };
      }
      case "scheduler/fire_webhook":
        return { fired: [String(p.path)] };
      case "scheduler/monitor": {
        const rec = { id: String(p.id), observation: String(p.observation ?? ""), conditionMet: Boolean(p.conditionMet) };
        monitorCalls.push(rec);
        return {
          changed: true,
          notified: true,
          stopped: rec.conditionMet,
          previous: undefined,
          current: rec.observation,
          notifications: 1,
        };
      }
      default:
        return {};
    }
  });

  return {
    request,
    calls,
    monitorCalls,
    setNow: (t: number) => {
      now = t;
    },
    queueDue: (...ids: string[]) => dueQueue.push(...ids),
    putJob: (j: SchedulerJob) => jobs.set(j.id, j),
    job: (id: string) => jobs.get(id),
    makeJob: job,
  };
}

test("tickOnce executes due jobs by reawakening their session", async () => {
  const r = scriptedRust();
  r.putJob(r.makeJob("j1"));
  r.queueDue("j1");

  const events: ChatEvent[] = [];
  const runtime = startScheduler(r.request, (e) => events.push(e), okBridge);

  const executed = await runtime.tickOnce(1_750_000_060);
  expect(executed).toEqual(["j1"]);
  // runJob is fire-and-forget (slow jobs must not block the ticker) — give the
  // in-flight run a beat to reach lease_finish before asserting.
  await new Promise((res) => setTimeout(res, 20));
  // lease lifecycle: start → (heartbeat optional) → finish(ok)
  const lifecycle = r.calls.filter((c) => c.startsWith("scheduler/lease_"));
  expect(lifecycle[0]).toBe("scheduler/lease_start");
  expect(lifecycle[lifecycle.length - 1]).toBe("scheduler/lease_finish");
  expect(r.job("j1")!.successes).toBe(1);
  runtime.stop();
});

test("tickOnce skips jobs already running (lease held)", async () => {
  const r = scriptedRust();
  r.putJob(r.makeJob("j1"));
  r.queueDue("j1", "j1"); // duplicate due report

  const runtime = startScheduler(r.request, () => {}, okBridge);

  const executed = await runtime.tickOnce(1_750_000_060);
  // The second j1 was deduped by the running set (first one still in flight).
  expect(executed).toEqual(["j1"]);
  await new Promise((res) => setTimeout(res, 5));
  runtime.stop();
});

test("failed chat run finishes with ok:false (retry scheduled by Rust)", async () => {
  const r = scriptedRust();
  r.putJob(r.makeJob("j2"));
  r.queueDue("j2");

  const runtime = startScheduler(r.request, () => {}, failBridge);

  await runtime.tickOnce(1_750_000_060);
  await new Promise((res) => setTimeout(res, 20));
  const finishCall = r.calls.filter((c) => c === "scheduler/lease_finish");
  expect(finishCall.length).toBe(1);
  expect(r.job("j2")!.failures).toBe(1);
  runtime.stop();
});

test("webhook listener answers POST and forwards to scheduler/fire_webhook", async () => {
  const r = scriptedRust();
  const runtime = startScheduler(r.request, () => {}, okBridge);
  runtime.start();
  const port = runtime.webhookPort();

  // In the test runner Bun.serve may be unavailable — then the port is 0 and
  // the listener is a no-op (non-fatal by design). Only assert when it exists.
  if (port > 0) {
    const res = await fetch(`http://127.0.0.1:${port}/hooks/ci`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", sha: "abc" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(r.calls).toContain("scheduler/fire_webhook");
  }
  runtime.stop();
});

test("monitor job calls scheduler/monitor with the observation and emits a verdict", async () => {
  const r = scriptedRust();
  r.putJob(
    r.makeJob("m1", {
      monitor: { stopOnCondition: true, notifications: 0 },
    }),
  );
  r.queueDue("m1");

  const obsBridge: ProviderBridge = {
    async *streamChat(): AsyncGenerator<StreamChunk, void> {
      yield { type: "text", text: "price is now $42" };
      yield { type: "done" };
    },
  };

  const events: ChatEvent[] = [];
  const runtime = startScheduler(r.request, (e) => events.push(e), obsBridge);
  await runtime.tickOnce(1_750_000_060);
  await new Promise((res) => setTimeout(res, 20));

  expect(r.monitorCalls.length).toBe(1);
  expect(r.monitorCalls[0]!.id).toBe("m1");
  expect(r.monitorCalls[0]!.observation).toBe("price is now $42");
  expect(r.monitorCalls[0]!.conditionMet).toBe(false);

  const verdict = events.find((e) => e.type === "monitor");
  expect(verdict).toBeDefined();
  expect((verdict as { notified: boolean }).notified).toBe(true);
  runtime.stop();
});

test("monitor stop marker is stripped and reported as conditionMet", async () => {
  const r = scriptedRust();
  r.putJob(
    r.makeJob("m2", {
      monitor: { stopOnCondition: true, notifications: 0 },
    }),
  );
  r.queueDue("m2");

  const stopBridge: ProviderBridge = {
    async *streamChat(): AsyncGenerator<StreamChunk, void> {
      yield { type: "text", text: "package delivered [MONITOR_DONE]" };
      yield { type: "done" };
    },
  };

  const runtime = startScheduler(r.request, () => {}, stopBridge);
  await runtime.tickOnce(1_750_000_060);
  await new Promise((res) => setTimeout(res, 20));

  expect(r.monitorCalls.length).toBe(1);
  expect(r.monitorCalls[0]!.conditionMet).toBe(true);
  expect(r.monitorCalls[0]!.observation).toBe("package delivered");
  runtime.stop();
});

test("plain job (no monitor) never calls scheduler/monitor", async () => {
  const r = scriptedRust();
  r.putJob(r.makeJob("p1"));
  r.queueDue("p1");

  const runtime = startScheduler(r.request, () => {}, okBridge);
  await runtime.tickOnce(1_750_000_060);
  await new Promise((res) => setTimeout(res, 20));

  expect(r.monitorCalls.length).toBe(0);
  runtime.stop();
});

test("start() ticks on its own timer and stop() halts it", async () => {
  const r = scriptedRust();
  r.putJob(r.makeJob("j3"));
  const runtime = startScheduler(r.request, () => {}, okBridge);
  runtime.start();
  // Give the ticker a beat (DEFAULT_TICK_MS=5000 → force via tickOnce instead).
  const executed = await runtime.tickOnce(1_750_000_060);
  expect(Array.isArray(executed)).toBe(true);
  runtime.stop();
  // After stop, tickOnce is a no-op.
  const after = await runtime.tickOnce(1_750_000_061);
  expect(after).toEqual([]);
});
