import { describe, expect, test } from "bun:test";
import {
  StreamRegistry,
  classifyIdempotency,
  canAutoRetry,
  reconnectInfo,
} from "./resumable";

describe("P11.5.12 resumable streams", () => {
  test("registry tracks tokens and accumulates byte-continuous text", () => {
    const reg = new StreamRegistry();
    reg.begin("s1", "sess-1");
    reg.appendToken("s1", "hello ");
    reg.appendToken("s1", "world");
    const s = reg.get("s1")!;
    expect(s.fullText).toBe("hello world");
    expect(s.tokens).toBe(2);
    expect(s.lastToken).toBe("world");
  });

  test("kill mid-stream → resume cursor replays the tail (byte-continuous)", () => {
    const reg = new StreamRegistry();
    reg.begin("s1", "sess-1");
    for (const t of ["the ", "quick ", "brown ", "fox"]) reg.appendToken("s1", t);
    reg.interrupt("s1");
    // Simulate reconnect: resume from the cursor, append the remaining tokens.
    const cursor = reg.resumeCursor("s1", 100)!;
    expect(cursor.from).toBe("the quick brown fox");
    expect(cursor.tokens).toBe(4);
    reg.appendToken("s1", " jumps");
    expect(reg.get("s1")!.fullText).toBe("the quick brown fox jumps");
  });

  test("completed streams return no resume cursor", () => {
    const reg = new StreamRegistry();
    reg.begin("s1", "sess-1");
    reg.appendToken("s1", "done");
    reg.complete("s1");
    expect(reg.resumeCursor("s1")).toBeNull();
  });

  test("reconnectInfo renders the chip only for interrupted streams", () => {
    const reg = new StreamRegistry();
    reg.begin("s1", "sess-1");
    reg.appendToken("s1", "partial");
    expect(reconnectInfo(reg.get("s1"))).toBeNull();
    reg.interrupt("s1");
    const info = reconnectInfo(reg.get("s1"))!;
    expect(info.show).toBe(true);
    expect(info.label).toContain("Reconnecting");
    expect(info.lastToken).toBe("partial");
  });

  test("stale interrupted streams are surfaced for cleanup", () => {
    const reg = new StreamRegistry();
    reg.begin("s1", "sess-1");
    reg.interrupt("s1");
    // Backdate via a direct poke is not possible — use a small stale window.
    const stale = reg.stale(Date.now() + 100_000, 1);
    expect(stale).toContain("s1");
  });

  test("idempotency classification (ARCH/03)", () => {
    expect(classifyIdempotency({ readOnly: true })).toBe("safe_retry");
    expect(classifyIdempotency({ idempotencyKey: "k1" })).toBe("same_key");
    expect(classifyIdempotency({ tool: "provider/stream" })).toBe("safe_retry");
    expect(classifyIdempotency({})).toBe("unsafe");
  });

  test("auto-retry gate: safe + same-key yes, unsafe no", () => {
    expect(canAutoRetry("safe_retry")).toBe(true);
    expect(canAutoRetry("same_key")).toBe(true);
    expect(canAutoRetry("unsafe")).toBe(false);
    expect(canAutoRetry("confirm_after_uncertain")).toBe(false);
  });
});
