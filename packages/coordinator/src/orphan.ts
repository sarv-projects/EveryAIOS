/**
 * Orphan prevention (J12): poll parent PID every 5s.
 * If the parent process dies (PID changes or process doesn't exist),
 * the sidecar exits cleanly to avoid dangling processes.
 */

// Bun supports process.ppid (same as Node)
const POLL_INTERVAL_MS = 5_000;

let timer: ReturnType<typeof setInterval> | null = null;
let initialParentPid: number | null = null;

/** Start polling parent PID. If parent dies, exit with code 0. */
export function startOrphanWatch(): void {
  initialParentPid = process.ppid;
  if (!initialParentPid || initialParentPid <= 1) {
    // Already orphaned or running under init — skip
    return;
  }

  timer = setInterval(() => {
    const currentPpid = process.ppid;
    // Parent died if:
    // - ppid changed (re-parented to init/systemd, typically PID 1)
    // - ppid is 0 or 1
    if (currentPpid !== initialParentPid || currentPpid <= 1) {
      console.error(
        `coordinator: parent PID changed (${initialParentPid} → ${currentPpid}), exiting (orphan prevention)`
      );
      stopOrphanWatch();
      process.exit(0);
    }
  }, POLL_INTERVAL_MS);

  // Don't keep the process alive just for this timer
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref();
  }
}

/** Stop the orphan watch (for tests/cleanup). */
export function stopOrphanWatch(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
