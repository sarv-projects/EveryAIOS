import { afterEach, describe, expect, test } from "bun:test";
import {
  createSchedulerRequestKey,
  schedulerFireEvent,
  schedulerRunNow,
} from "./scheduler";

type Captured = { command: string; args?: Record<string, unknown> };

function installShell(capture: (entry: Captured) => void): void {
  ;(globalThis as { window?: unknown }).window = {
    __TAURI_INTERNALS__: {
      invoke: async (command: string, args?: Record<string, unknown>) => {
        capture({ command, args });
        return command === "scheduler_fire_event" ? [] : true;
      },
    },
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("scheduler ingress request keys", () => {
  test("manual and event calls preserve an explicit caller key", async () => {
    const calls: Captured[] = [];
    installShell((entry) => calls.push(entry));

    await schedulerRunNow("job-explicit", "manual-request-1");
    await schedulerFireEvent("repo_change", { path: "README.md" }, "event-request-1");

    expect(calls[0]?.args).toEqual({ id: "job-explicit", idempotencyKey: "manual-request-1" });
    expect(calls[1]?.args).toEqual({
      kind: "repo_change",
      payload: { path: "README.md" },
      idempotencyKey: "event-request-1",
    });
  });

  test("a failed one-shot manual request reuses its key on retry", async () => {
    let attempts = 0;
    const keys: unknown[] = [];
    ;(globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: {
        invoke: async (_command: string, args?: Record<string, unknown>) => {
          attempts += 1;
          keys.push(args?.idempotencyKey);
          if (attempts === 1) throw new Error("temporary native failure");
          return true;
        },
      },
    };

    await expect(schedulerRunNow("job-retry")).rejects.toThrow("temporary native failure");
    await schedulerRunNow("job-retry");

    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toEqual(expect.any(String));
  });

  test("a successful one-shot request releases its key for a distinct next action", async () => {
    const keys: unknown[] = [];
    installShell((entry) => keys.push(entry.args?.idempotencyKey));

    await schedulerRunNow("job-distinct");
    await schedulerRunNow("job-distinct");

    expect(keys[0]).toEqual(expect.any(String));
    expect(keys[1]).toEqual(expect.any(String));
    expect(keys[0]).not.toBe(keys[1]);
  });

  test("invalid explicit keys fail before the native boundary", async () => {
    let invoked = false;
    ;(globalThis as { window?: unknown }).window = {
      __TAURI_INTERNALS__: {
        invoke: async () => {
          invoked = true;
          return true;
        },
      },
    };

    await expect(schedulerRunNow("job-invalid", "   ")).rejects.toThrow(/idempotency key/);
    expect(invoked).toBe(false);
  });

  test("fresh UI keys are caller-generated and never timestamp-only", () => {
    const first = createSchedulerRequestKey("test");
    const second = createSchedulerRequestKey("test");
    expect(first).toMatch(/^test:/);
    expect(second).toMatch(/^test:/);
    expect(first).not.toBe(second);
  });
});
