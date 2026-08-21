/**
 * Scheduled-task executor (P6.4 — B7). The coordinator proposes, Rust
 * disposes: every `scheduler/*` call goes to the Rust SchedulerService which
 * owns job state, cron math, leases, retry and battery policy. This module
 * is the *executor*: it ticks `scheduler/due`, runs due jobs by reawakening
 * their session through the chat engine (`surface: "automation"` — the
 * Hatchet-style "same conversation with context intact" heartbeat), holds the
 * lease via `lease_heartbeat`, advances the checkpoint per step, and finishes
 * with `lease_finish` (which schedules retries with backoff+jitter+clamp).
 *
 * Also hosts the F11 loopback webhook listener (Bun.serve on 127.0.0.1) that
 * validates + forwards POST bodies to `scheduler/fire_webhook`.
 */

import type { ProviderBridge, ChatEvent } from "./chat";
import { runChatStream } from "./chat";

/** Outbound JSON-RPC request to Rust. */
type Request = (method: string, params: unknown) => Promise<unknown>;

/** A due job as reported by Rust (`scheduler/due` → `{due: string[]}`). */
export interface DueReport {
  due: string[];
  now: number;
}

export interface ListReport {
  jobs: SchedulerJob[];
  onBattery: boolean;
}

/** Monitoring config on a job (mirror of the Rust `MonitorConfig` serde shape). */
export interface MonitorConfig {
  stopOnCondition: boolean;
  lastObservation?: string;
  notifications: number;
}

/** The verdict `scheduler/monitor` returns (mirror of Rust `MonitorVerdict`). */
export interface MonitorVerdict {
  changed: boolean;
  notified: boolean;
  stopped: boolean;
  previous?: string;
  current: string;
  notifications: number;
}

/** One scheduled job (mirror of the Rust `Job` serde shape). */
export interface SchedulerJob {
  id: string;
  name: string;
  sessionId: string;
  trigger:
    | { type: "cron"; expr: string }
    | { type: "interval"; secs: number }
    | { type: "event"; kind: string; filter: string }
    | { type: "webhook"; path: string; schema: string[] }
    | { type: "window"; window: "morning" | "afternoon" | "evening"; utcOffsetMinutes?: number };
  steps: unknown[];
  policy: {
    suppressOnBattery: boolean;
    maxRunsPerHour?: number;
    scope?: string;
  };
  enabled: boolean;
  state:
    | { state: "idle" }
    | { state: "running"; leaseExpiresAt: number; fence?: string }
    | { state: "paused"; resumeDeadline?: number }
    | { state: "failed"; retries: number; nextRetryAt?: number };
  checkpoint: number;
  nextRunAt?: number;
  lastRunAt?: number;
  runs: number;
  successes: number;
  failures: number;
  /** Monitoring semantics (`None` in Rust = a plain scheduled job). */
  monitor?: MonitorConfig;
}

export interface WebhookBody {
  path: string;
  body: unknown;
}

/** Poll interval for the due ticker (ms). Env-overridable for tests. */
export const DEFAULT_TICK_MS = 5_000;
/** Lease heartbeat interval (ms) — well inside Rust's 30s lease expiry. */
export const DEFAULT_HEARTBEAT_MS = 10_000;
/**
 * Stop-condition marker for monitoring jobs. The coordinator's LLM pass owns
 * the semantic "is the end condition met" judgment (the "scheduler ≠ agent"
 * split): a monitoring run's prompt asks the model to end its reply with this
 * exact marker when the monitored end condition is now true. The executor
 * strips it from the stored observation and reports `conditionMet` to
 * `scheduler/monitor`.
 */
export const MONITOR_STOP_MARKER = "[MONITOR_DONE]";

/**
 * The executor loop. Returns a handle to stop ticking (tests call `stop()`
 * and drive `tickOnce` directly).
 */
export interface SchedulerRuntime {
  start(): void;
  stop(): void;
  /** Run one due-check + execution pass (tests use this instead of the timer). */
  tickOnce(now?: number): Promise<string[]>;
  /** The loopback webhook listener's port (0 = not started). */
  webhookPort(): number;
}

export function startScheduler(
  request: Request,
  emit: (e: ChatEvent) => void,
  providerBridge: ProviderBridge,
): SchedulerRuntime {
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let webhookPort = 0;
  const running = new Set<string>();
  const fences = new Map<string, string>();

  async function tickOnce(now?: number): Promise<string[]> {
    if (stopped) return [];
    const ts = now ?? Math.floor(Date.now() / 1000);
    const report = (await request("scheduler/due", { now: ts })) as DueReport;
    const list = (await request("scheduler/list", { now: ts })) as ListReport;
    const byId = new Map(list.jobs.map((j) => [j.id, j]));
    const executed: string[] = [];
    for (const jobId of report.due) {
      if (running.has(jobId)) continue; // lease already held
      const job = byId.get(jobId);
      if (!job || !job.enabled) continue;
      running.add(jobId);
      executed.push(jobId);
      // Fire-and-forget per job — a slow job must not block the ticker.
      void runJob(job, ts).finally(() => {
        running.delete(jobId);
        fences.delete(jobId);
      });
    }
    return executed;
  }

  async function runJob(job: SchedulerJob, now: number): Promise<void> {
    let started = false;
    try {
      const start = (await request("scheduler/lease_start", {
        id: job.id,
        now,
      })) as { ok: boolean; resumed: boolean; checkpoint: number; fence?: string };
      if (!start.ok) return;
      started = true;
      const checkpoint = start.checkpoint;
      if (typeof start.fence === "string") fences.set(job.id, start.fence);
      const fence = start.fence;

      // Reawaken the job's session through the chat engine — context intact
      // (doc 67 §2: the same conversation, its history still there).
      const streamId = `automation-${job.id}-${now}`;
      let failed = false;
      // A monitoring run captures the assistant's final reply as its
      // "observation" (the state being watched) for the delta comparison.
      let observation = "";
      const emitJob = (e: ChatEvent): void => {
        // A chat/error (or cancelled) means the run did NOT complete — the
        // lease must finish with ok:false so Rust schedules the retry.
        if (e.type === "error" || e.type === "cancelled") failed = true;
        if (e.type === "done") observation = e.fullText;
        // Tag automation emissions so the UI can badge them (surface field).
        emit({ ...e, streamId });
      };
      // The checkpoint is the durable resume point — completed work is never
      // re-executed; the run continues from the last finished step.
      const resume = checkpoint > 0 ? `[resume from checkpoint ${checkpoint}] ` : "";
      const monitorDirective = job.monitor
        ? `\n\nThis is a monitoring task. Report the current state you observe. If the monitored end condition is now met, end your response with the exact marker ${MONITOR_STOP_MARKER}.`
        : "";
      await runChatStream(
        {
          sessionId: job.sessionId,
          streamId,
          text: `${resume}Run scheduled task "${job.name}"${monitorDirective}`,
          surface: "automation",
        },
        emitJob,
        providerBridge,
        33,
        request,
      );
      // Monitoring jobs evaluate the observation ("run vs notify"): Rust owns
      // WHEN + state + the deterministic delta; the coordinator's LLM pass owns
      // the semantic stop judgment (the marker above).
      if (job.monitor) {
        const conditionMet = observation.includes(MONITOR_STOP_MARKER);
        const clean = observation.replaceAll(MONITOR_STOP_MARKER, "").trim();
        const verdict = (await request("scheduler/monitor", {
          id: job.id,
          observation: clean,
          conditionMet,
        })) as MonitorVerdict;
        emit({
          type: "monitor",
          streamId,
          jobId: job.id,
          changed: verdict.changed,
          notified: verdict.notified,
          stopped: verdict.stopped,
          current: verdict.current,
          notifications: verdict.notifications,
        });
      }
      await request("scheduler/lease_finish", {
        id: job.id,
        ok: !failed,
        now: Math.floor(Date.now() / 1000),
        ...(fence !== undefined ? { fence } : {}),
      });
    } catch {
      if (started) {
        try {
          await request("scheduler/lease_finish", {
            id: job.id,
            ok: false,
            now: Math.floor(Date.now() / 1000),
            ...(fences.get(job.id) ? { fence: fences.get(job.id) } : {}),
          });
        } catch {
          /* lease may already be gone — fine */
        }
      }
    }
  }

  /** Periodic lease heartbeats for every running job (well inside 30s). */
  function startHeartbeats(): void {
    heartbeatTimer = setInterval(() => {
      if (stopped) return;
      for (const jobId of running) {
        void request("scheduler/lease_heartbeat", {
          id: jobId,
          now: Math.floor(Date.now() / 1000),
          ...(fences.get(jobId) ? { fence: fences.get(jobId) } : {}),
        }).catch(() => {});
      }
    }, DEFAULT_HEARTBEAT_MS);
    if (typeof heartbeatTimer === "object" && "unref" in heartbeatTimer) {
      (heartbeatTimer as NodeJS.Timeout).unref();
    }
  }

  /**
   * F11 loopback webhook listener: 127.0.0.1 only, POST bodies validated
   * by Rust (`scheduler/fire_webhook` checks path + required keys).
   */
  function startWebhook(): void {
    const port = process.env.EVERYAIOS_WEBHOOK_PORT
      ? Number(process.env.EVERYAIOS_WEBHOOK_PORT)
      : 0;
    try {
      const server = Bun.serve({
        port,
        hostname: "127.0.0.1",
        async fetch(req) {
          if (req.method !== "POST") {
            return new Response("method not allowed", { status: 405 });
          }
          const url = new URL(req.url);
          const raw = await req.text();
          let body: unknown;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            return new Response("invalid JSON", { status: 400 });
          }
          try {
            const out = (await request("scheduler/fire_webhook", {
              path: url.pathname,
              body,
              now: Math.floor(Date.now() / 1000),
            })) as { fired: string[] };
            return new Response(
              JSON.stringify({ ok: true, fired: out.fired }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          } catch {
            return new Response(JSON.stringify({ ok: false }), {
              status: 422,
              headers: { "content-type": "application/json" },
            });
          }
        },
      });
      webhookPort = server.port ?? 0;
    } catch {
      // No Bun.serve in the test runner / platform without it — non-fatal.
      webhookPort = 0;
    }
  }

  function start(): void {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      void tickOnce();
    }, DEFAULT_TICK_MS);
    if (typeof tickTimer === "object" && "unref" in tickTimer) {
      (tickTimer as NodeJS.Timeout).unref();
    }
    startHeartbeats();
    startWebhook();
  }

  function stop(): void {
    stopped = true;
    if (tickTimer) clearInterval(tickTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    tickTimer = null;
    heartbeatTimer = null;
  }

  return { start, stop, tickOnce, webhookPort: () => webhookPort };
}
