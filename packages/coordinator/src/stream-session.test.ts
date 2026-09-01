/**
 * Vendored `core-ai` StreamSession parity tests.
 *
 * Locks in the batching semantics the chat/plan loops depend on: TTFT fires
 * exactly once on first push, deltas coalesce into batches on a
 * {batchIntervalMs} timer, complete() flushes the remainder, destroy() is
 * silent, and getTokenCount() is the cumulative total (not per-batch).
 */
import { describe, expect, test } from "bun:test";
import { StreamSession } from "./stream-session";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("vendored StreamSession", () => {
  test("TTFT fires once on the first push, before any batch", () => {
    const events: string[] = [];
    const s = new StreamSession("s1", (e) => events.push(e.type), {
      batchIntervalMs: 5,
    });
    s.pushToken("a");
    const ttfts = events.filter((e) => e === "ttft");
    expect(ttfts).toHaveLength(1);
    // No batch yet — the flush waits for the interval.
    expect(events).toContain("ttft");
    s.destroy();
  });

  test("deltas coalesce into a single batch within one interval", async () => {
    const batches: Array<{ text: string; tokenCount: number }> = [];
    const s = new StreamSession("s1", (e) => {
      if (e.type === "batch") batches.push({ text: e.text, tokenCount: e.tokenCount });
    }, { batchIntervalMs: 5 });
    s.pushToken("Hel");
    s.pushToken("lo");
    await tick(10);
    s.destroy();
    expect(batches.length).toBe(1);
    expect(batches[0]!.text).toBe("Hello");
    // Cumulative token count, not per-batch: 2 pushes → 2.
    expect(batches[0]!.tokenCount).toBe(2);
  });

  test("complete() flushes the un-flushed remainder", async () => {
    let batchCount = 0;
    const s = new StreamSession("s1", (e) => {
      if (e.type === "batch") batchCount += 1;
    }, { batchIntervalMs: 1000 }); // long interval — nothing auto-flushes
    s.pushToken("done-text");
    await tick(5);
    expect(batchCount).toBe(0); // still buffered
    s.complete(); // forces the final flush
    expect(batchCount).toBe(1);
    expect(s.getTokenCount()).toBe(1);
    s.destroy();
  });

  test("getTokenCount is cumulative across pushes", () => {
    const s = new StreamSession("s1", () => {}, { batchIntervalMs: 1000 });
    s.pushToken("a");
    s.pushToken("b");
    s.pushToken("c");
    expect(s.getTokenCount()).toBe(3);
    s.destroy();
  });

  test("destroy() is silent and stops future events", async () => {
    const events: string[] = [];
    const s = new StreamSession("s1", (e) => events.push(e.type), {
      batchIntervalMs: 5,
    });
    s.pushToken("x");
    s.destroy();
    s.pushToken("y"); // ignored after destroy
    await tick(10);
    expect(events.filter((e) => e === "batch")).toHaveLength(0);
    s.complete(); // still silent
    expect(events.filter((e) => e === "batch")).toHaveLength(0);
  });

  // P50.3.10 — stream/event lifecycle: switching sessions must not leak
  // events from the dead session into the new one. The old session is
  // destroyed (listeners/timers cleared), a new session with the same id
  // takes over, and only the live session emits.
  test("session switch: destroyed session stops emitting; rebind delivers to the new one", async () => {
    const deadEvents: string[] = [];
    const liveEvents: string[] = [];
    const s1 = new StreamSession("sess-1", (e) => deadEvents.push(e.type), {
      batchIntervalMs: 5,
    });
    s1.pushToken("stale");
    s1.destroy(); // session switch / cancel — listeners + timers cleared

    const s2 = new StreamSession("sess-1", (e) => liveEvents.push(e.type), {
      batchIntervalMs: 5,
    });
    s2.pushToken("fresh");
    await tick(15);

    expect(deadEvents.filter((e) => e === "batch")).toHaveLength(0);
    expect(liveEvents.filter((e) => e === "batch")).toHaveLength(1);
    s2.destroy();
  });

  test("session switch: complete() on the destroyed session stays silent", async () => {
    const deadEvents: string[] = [];
    const s1 = new StreamSession("sess-2", (e) => deadEvents.push(e.type), {
      batchIntervalMs: 5,
    });
    s1.destroy();
    s1.complete();
    await tick(15);
    expect(deadEvents).toHaveLength(0);
  });
});