/**
 * Heap safety monitor (J13) — protects the coordinator sidecar from OOM.
 *
 * Strategy:
 * - Poll `process.memoryUsage().heapUsed` every 5 seconds.
 * - At 80% of max → emit `heap/warning` JSON-RPC notification.
 * - At 95% of max → emit `heap/critical` notification and exit(71) (EX_OSERR).
 * - After a configurable rotation period (default 30 min), emit `heap/rotation`
 *   and exit(0) for a clean restart by the ProcessSupervisor.
 *
 * NOTE for ProcessSupervisor (Rust side):
 *   When spawning the coordinator binary, set the environment variable
 *   `BUN_JSC_heapSize=536870912` (512 MB) to enforce the heap limit in Bun's
 *   JavaScriptCore engine. For debug builds, pass `--smol` to the bun CLI.
 *   Node.js equivalent: `--max-old-space-size=512`.
 */

import { notify } from "./frame";

/** Default max heap in megabytes (matches --max-old-space-size=512). */
const DEFAULT_MAX_HEAP_MB = 512;

/** Default forced rotation time in minutes. */
const DEFAULT_ROTATION_MINUTES = 30;

/** Polling interval in milliseconds. */
const POLL_INTERVAL_MS = 5_000;

/** Threshold ratios. */
const WARNING_RATIO = 0.80;
const CRITICAL_RATIO = 0.95;

export interface HeapMonitorOpts {
  maxHeapMB?: number;
  rotationMinutes?: number;
}

export interface HeapMonitorHandle {
  /** Stop the polling interval and rotation timer. */
  stop(): void;
  /** The polling interval timer ref (for testing). */
  pollTimer: ReturnType<typeof setInterval>;
  /** The rotation timer ref (for testing). */
  rotationTimer: ReturnType<typeof setTimeout>;
}

/**
 * Start the heap safety monitor.
 *
 * Returns a handle that can be used to stop the monitor (useful in tests).
 */
export function startHeapMonitor(opts?: HeapMonitorOpts): HeapMonitorHandle {
  const maxHeapMB = opts?.maxHeapMB ?? DEFAULT_MAX_HEAP_MB;
  const rotationMinutes = opts?.rotationMinutes ?? DEFAULT_ROTATION_MINUTES;

  const maxHeapBytes = maxHeapMB * 1024 * 1024;
  const warningThreshold = maxHeapBytes * WARNING_RATIO;
  const criticalThreshold = maxHeapBytes * CRITICAL_RATIO;

  // --- Heap polling ---
  const pollTimer = setInterval(() => {
    const heapUsed = process.memoryUsage().heapUsed;

    if (heapUsed > criticalThreshold) {
      notify("heap/critical", {
        heapUsedMB: Math.round(heapUsed / 1024 / 1024),
        maxHeapMB,
        ratio: +(heapUsed / maxHeapBytes).toFixed(3),
      });
      // EX_OSERR (71) — signals ProcessSupervisor to restart immediately.
      process.exit(71);
    } else if (heapUsed > warningThreshold) {
      notify("heap/warning", {
        heapUsedMB: Math.round(heapUsed / 1024 / 1024),
        maxHeapMB,
        ratio: +(heapUsed / maxHeapBytes).toFixed(3),
      });
    }
  }, POLL_INTERVAL_MS);

  // --- Forced rotation timer ---
  const rotationTimer = setTimeout(() => {
    notify("heap/rotation", {
      uptimeMinutes: rotationMinutes,
      reason: "scheduled rotation",
    });
    // Clean exit — ProcessSupervisor will re-launch.
    process.exit(0);
  }, rotationMinutes * 60 * 1000);

  // Unref timers so they don't keep the event loop alive when the process
  // is shutting down for other reasons.
  if (typeof pollTimer === "object" && "unref" in pollTimer) pollTimer.unref();
  if (typeof rotationTimer === "object" && "unref" in rotationTimer) rotationTimer.unref();

  return {
    stop() {
      clearInterval(pollTimer);
      clearTimeout(rotationTimer);
    },
    pollTimer,
    rotationTimer,
  };
}
