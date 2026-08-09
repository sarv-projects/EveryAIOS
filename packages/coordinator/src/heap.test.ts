/**
 * Tests for the heap safety monitor (J13).
 */
import { describe, expect, it, afterEach, mock, spyOn } from "bun:test";
import { startHeapMonitor, type HeapMonitorHandle } from "./heap";

describe("heap monitor", () => {
  let handle: HeapMonitorHandle | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  it("starts and can be stopped (clearInterval)", () => {
    handle = startHeapMonitor({ maxHeapMB: 512, rotationMinutes: 30 });
    expect(handle.pollTimer).toBeDefined();
    expect(handle.rotationTimer).toBeDefined();

    // Stopping should not throw.
    handle.stop();
    handle = null;
  });

  it("30-minute rotation timer is set", () => {
    handle = startHeapMonitor({ maxHeapMB: 512, rotationMinutes: 30 });
    // The rotation timer should be defined (Timer object in Bun).
    expect(handle.rotationTimer).toBeDefined();
    expect(handle.rotationTimer).not.toBeNull();
  });

  it("accepts custom rotation time", () => {
    handle = startHeapMonitor({ maxHeapMB: 256, rotationMinutes: 10 });
    expect(handle.pollTimer).toBeDefined();
    expect(handle.rotationTimer).toBeDefined();
  });

  it("80% threshold triggers heap/warning notification", () => {
    // We'll spy on process.stdout.write to capture emitted notifications.
    const writes: unknown[] = [];
    const writeSpy = spyOn(process.stdout, "write").mockImplementation(
      (chunk: any, ...args: any[]) => {
        writes.push(chunk);
        return true;
      },
    );

    // Mock process.memoryUsage to return >80% of 512MB (>409MB).
    const heapUsed = 420 * 1024 * 1024; // 420 MB — above 80% threshold
    const memSpy = spyOn(process, "memoryUsage").mockReturnValue({
      heapUsed,
      heapTotal: 512 * 1024 * 1024,
      rss: 600 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    });

    // Mock process.exit to prevent actually exiting (in case critical is hit).
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as any);

    handle = startHeapMonitor({ maxHeapMB: 512, rotationMinutes: 60 });

    // Manually trigger the interval callback by advancing a tick.
    // Bun doesn't have fake timers, so we'll invoke the check directly.
    // We need to trigger the interval. The simplest is a short wait.
    // Instead, let's just call the timer's tick by using a 0-delay approach:
    // We stop the handle, and test the logic more directly.
    handle.stop();
    handle = null;

    // Since we can't easily trigger the interval in test, let's invoke
    // the internal logic by creating a monitor with a very short interval.
    // Better approach: just call the function and check it doesn't error.
    // The real validation is that when memoryUsage is above threshold,
    // a notification would be written. Let's trigger one poll cycle manually.

    // Reset writes
    writes.length = 0;

    // Create a new monitor — we'll need to trigger the interval.
    // Use a promise + setTimeout to let one interval fire.
    memSpy.mockReturnValue({
      heapUsed: 420 * 1024 * 1024,
      heapTotal: 512 * 1024 * 1024,
      rss: 600 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    });

    // Start monitor — the interval fires every 5s, but we can test by waiting.
    // For unit testing, we'll directly test the notification emission logic
    // by importing and examining the frame data.
    // Alternative: start with short poll, wait for one tick.

    // Actually the cleanest approach for Bun: temporarily override setInterval
    // to capture the callback, then invoke it.
    let pollCallback: (() => void) | null = null;
    const origSetInterval = globalThis.setInterval;
    globalThis.setInterval = ((fn: any, ms: any) => {
      pollCallback = fn;
      return origSetInterval(fn, 999999); // set a very long interval so it doesn't auto-fire
    }) as any;

    handle = startHeapMonitor({ maxHeapMB: 512, rotationMinutes: 60 });
    globalThis.setInterval = origSetInterval;

    // Now manually invoke the poll callback.
    expect(pollCallback).not.toBeNull();
    pollCallback!();

    // Check that a notification was written.
    expect(writes.length).toBeGreaterThanOrEqual(1);

    // Decode the notification from the framed bytes.
    const frame = writes[0] as Uint8Array;
    // Skip first 4 bytes (u32 LE length prefix).
    const payload = JSON.parse(new TextDecoder().decode(frame.slice(4)));
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.method).toBe("heap/warning");
    expect(payload.id).toBeUndefined(); // notification — no id
    expect(payload.params.heapUsedMB).toBe(420);
    expect(payload.params.maxHeapMB).toBe(512);

    // Cleanup
    writeSpy.mockRestore();
    memSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
