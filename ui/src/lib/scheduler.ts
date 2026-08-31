// P6.4 (B7/H14) — scheduled-task bridge. Thin wrappers over the Tauri
// `scheduler_*` commands; in a plain-browser preview every call falls back to
// the demo set so the UI stays explorable. The durable state machine lives in
// Rust (`everyaios-core::SchedulerService`); these are just the wire + types.

import { invoke, inTauri } from "./tauri";
import { bridgeCall } from "./runtime";

/** Mirror of the Rust `TriggerSpec` serde shape. */
export type SchedulerTrigger =
  | { type: "cron"; expr: string }
  | { type: "interval"; secs: number }
  | { type: "event"; kind: string; filter: string }
  | { type: "webhook"; path: string; schema: string[] };

/** Mirror of the Rust `Job` serde shape. */
export interface SchedulerJob {
  id: string;
  name: string;
  sessionId: string;
  trigger: SchedulerTrigger;
  steps: unknown[];
  policy: {
    suppressOnBattery: boolean;
    maxRunsPerHour?: number;
    scope?: string;
  };
  enabled: boolean;
  state:
    | { state: "idle" }
    | { state: "running"; leaseExpiresAt: number }
    | { state: "paused"; resumeDeadline?: number }
    | { state: "failed"; retries: number; nextRetryAt?: number };
  checkpoint: number;
  nextRunAt?: number;
  lastRunAt?: number;
  runs: number;
  successes: number;
  failures: number;
}

export interface SchedulerList {
  jobs: SchedulerJob[];
  onBattery: boolean;
}

export interface NudgeSuggestion {
  goal: string;
  cron: string;
  confidence: number;
  observedAt: string[];
}

/** Demo jobs — the preview-mode fallback (mirror the real shapes). */
const DEMO_JOBS: SchedulerJob[] = [
  {
    id: "j-daily-brief",
    name: "Morning brief",
    sessionId: "s-brief",
    trigger: { type: "cron", expr: "0 8 * * *" },
    steps: [{ step: "online_search", query: "latest AI news" }],
    policy: { suppressOnBattery: true, maxRunsPerHour: 1 },
    enabled: true,
    state: { state: "idle" },
    checkpoint: 0,
    nextRunAt: undefined,
    lastRunAt: undefined,
    runs: 12,
    successes: 12,
    failures: 0,
  },
  {
    id: "j-ci-fixer",
    name: "CI Fixer",
    sessionId: "s-ci",
    trigger: { type: "event", kind: "ci_build_fail", filter: "" },
    steps: [{ step: "run_code", language: "bash", code: "# fix the build" }],
    policy: { suppressOnBattery: false, maxRunsPerHour: 4 },
    enabled: true,
    state: { state: "idle" },
    checkpoint: 0,
    runs: 7,
    successes: 5,
    failures: 2,
  },
  {
    id: "j-dep-scan",
    name: "Weekly deps scan",
    sessionId: "s-deps",
    trigger: { type: "cron", expr: "0 6 * * 1" },
    steps: [{ step: "run_code", language: "bash", code: "# npm audit" }],
    policy: { suppressOnBattery: true },
    enabled: false,
    state: { state: "idle" },
    checkpoint: 0,
    runs: 3,
    successes: 3,
    failures: 0,
  },
];

const DEMO_SUGGESTIONS: NudgeSuggestion[] = [
  {
    goal: "Morning brief",
    cron: "0 8 * * *",
    confidence: 0.9,
    observedAt: ["08:00"],
  },
];

export async function schedulerList(): Promise<SchedulerList> {
  return bridgeCall({
    operation: 'scheduler list',
    live: () => invoke<SchedulerList>('scheduler_list'),
    preview: () => ({ jobs: DEMO_JOBS, onBattery: false }),
  });
}

export async function schedulerCreate(args: {
  id: string;
  name: string;
  sessionId: string;
  trigger: SchedulerTrigger;
  steps: unknown[];
  policy?: SchedulerJob["policy"];
}): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler create',
    live: () => invoke<boolean>('scheduler_create', args),
    preview: () => true,
  });
}

export async function schedulerDelete(id: string): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler delete',
    live: () => invoke<boolean>('scheduler_delete', { id }),
    preview: () => true,
  });
}

export async function schedulerEnable(id: string, enabled: boolean): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler enable',
    live: () => invoke<boolean>('scheduler_enable', { id, enabled }),
    preview: () => true,
  });
}

export async function schedulerPause(
  id: string,
  resumeDeadline?: number,
): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler pause',
    live: () => invoke<boolean>('scheduler_pause', { id, resumeDeadline }),
    preview: () => true,
  });
}

export async function schedulerResume(id: string): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler resume',
    live: () => invoke<boolean>('scheduler_resume', { id }),
    preview: () => true,
  });
}

export async function schedulerRunNow(id: string): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler run now',
    live: () => invoke<boolean>('scheduler_run_now', { id }),
    preview: () => true,
  });
}

export async function schedulerBattery(onBattery: boolean): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler battery update',
    live: () => invoke<boolean>('scheduler_battery', { onBattery }),
    preview: () => true,
  });
}

/** Fire an event trigger (CI fail / regression / repo change / ticket / metric). */
export async function schedulerFireEvent(
  kind: string,
  payload: Record<string, unknown>,
): Promise<string[]> {
  return bridgeCall({
    operation: 'scheduler fire event',
    live: () => invoke<string[]>("scheduler_fire_event", { kind, payload }),
    preview: () => [],
  });
}

/** Nudge sentinels: repeating-pattern schedule suggestions (H14 nudge cards). */
export async function schedulerNudges(): Promise<NudgeSuggestion[]> {
  return bridgeCall({
    operation: 'scheduler nudges',
    live: () => invoke<NudgeSuggestion[]>('scheduler_nudges'),
    preview: () => DEMO_SUGGESTIONS,
  });
}

/** Record a goal observation (feeds the nudge sentinels). */
export async function schedulerNudge(goal: string, ts?: number): Promise<boolean> {
  return bridgeCall({
    operation: 'scheduler nudge',
    live: () => invoke<boolean>('scheduler_nudge', { goal, ts }),
    preview: () => true,
  });
}

/** Human label for a trigger (the H14 list rows). */
export function triggerLabel(t: SchedulerTrigger): string {
  switch (t.type) {
    case "cron":
      return t.expr;
    case "interval":
      return `every ${t.secs}s`;
    case "event":
      return `on ${t.kind.replaceAll("_", " ")}${t.filter ? ` · ${t.filter}` : ""}`;
    case "webhook":
      return `POST ${t.path}`;
  }
}
