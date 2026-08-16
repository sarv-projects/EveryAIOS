/**
 * P1.4 — streaming chat loop (B1 base) tests.
 *
 * Covers: real ConversationEngine wiring through our deps, TTFT + 33ms batch
 * flush (StreamSession), cancellation (abort → provider bridge), the J11
 * budget-kill surface ("stopped: $X limit"), and the mobile-hook strip
 * (creditAware / shouldContinueStreaming must never appear in chat.ts).
 */
import { describe, expect, test } from "bun:test";
import type { StreamChunk } from "@personal-ai/core-engine";
import {
  activeStreamCount,
  cancelChatStream,
  extractFacts,
  FrameProviderBridge,
  runChatStream,
  type ChatEvent,
  type ChatStreamParams,
  type ProviderBridge,
  type ProviderChunk,
} from "./chat";

/** Collect emitted events for assertions. */
function collector() {
  const events: ChatEvent[] = [];
  return {
    events,
    emit: (e: ChatEvent) => {
      events.push(e);
    },
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

const PARAMS: ChatStreamParams = {
  sessionId: "s1",
  streamId: "st-1",
  text: "hello everyaios",
  surface: "chat",
  provider: "nvidia",
  model: "meta/llama",
};

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("P1.4 chat loop — ConversationEngine wiring (B1 base)", () => {
  test("one turn: TTFT once, batched text, done with turnId + fullText", async () => {
    const { events, emit } = collector();
    const bridge = scripted([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      { type: "done", usage: { promptTokens: 10, completionTokens: 2 } },
    ]);

    await runChatStream(PARAMS, emit, bridge, 10);

    // The real ConversationEngine ran (stage events prove the 3-stage loop).
    expect(events.some((e) => e.type === "stage" && e.stage === "streaming_start")).toBe(true);

    const ttfts = events.filter((e) => e.type === "ttft");
    expect(ttfts).toHaveLength(1);
    expect(ttfts[0]!.latencyMs).toBeGreaterThanOrEqual(0);

    // Batches coalesce tokens; joined text = the full provider text.
    const batches = events.filter((e) => e.type === "batch");
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.map((e) => (e as { text: string }).text).join("")).toBe("Hello");
    // StreamSession counts tokens per push → 2.
    expect((batches[0] as { tokenCount: number }).tokenCount).toBeGreaterThanOrEqual(1);

    const done = events.find((e) => e.type === "done") as
      | { turnId: string; fullText: string; totalTokens: number; usage?: unknown }
      | undefined;
    expect(done).toBeDefined();
    expect(done!.turnId).toContain("s1:");
    expect(done!.fullText).toBe("Hello");
    expect(done!.totalTokens).toBe(2);
    expect(done!.usage).toEqual({ promptTokens: 10, completionTokens: 2 });

    // No errors, no leaks of active streams.
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(activeStreamCount()).toBe(0);
  });

  test("extractFacts keeps short declarative candidates, drops questions/noise", () => {
    expect(extractFacts("Paris is the capital of France. What about Berlin? ok")).toEqual([
      "Paris is the capital of France.",
    ]);
    expect(extractFacts("Short.")).toEqual([]); // < 12 chars
    expect(extractFacts("")).toEqual([]);
    // Cap at maxFacts.
    const many = Array.from({ length: 12 }, (_, i) => `Fact number ${i} is a declarative sentence that is long enough.`).join(" ");
    expect(extractFacts(many, 3)).toHaveLength(3);
  });

  test("P5.1: a turn with a declarative response emits memory_extracted", async () => {
    const { events, emit } = collector();
    const bridge = scripted([
      { type: "text", text: "The Q3 budget was finalized at $12,400. " },
      { type: "text", text: "The marketing team approved the new slide deck." },
      { type: "done", usage: { promptTokens: 10, completionTokens: 2 } },
    ]);

    await runChatStream(PARAMS, emit, bridge, 10);

    const mem = events.filter((e) => e.type === "memory_extracted") as Array<{
      type: "memory_extracted";
      sessionId: string;
      facts: string[];
    }>;
    expect(mem.length).toBeGreaterThanOrEqual(1);
    expect(mem[0]!.sessionId).toBe("s1");
    expect(mem[0]!.facts.join(" ")).toContain("Q3 budget");
    expect(mem[0]!.facts.join(" ")).toContain("marketing team");
  });

  test("P5.1: extracted facts are persisted via memory/write (best-effort)", async () => {
    const { events, emit } = collector();
    const bridge = scripted([
      { type: "text", text: "The Q3 budget was finalized at $12,400." },
      { type: "done", usage: { promptTokens: 10, completionTokens: 2 } },
    ]);
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];

    await runChatStream(PARAMS, emit, bridge, 10, async (method, params) => {
      requests.push({ method, params: params as Record<string, unknown> });
      return { written: 1 };
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("memory/write");
    expect(requests[0]!.params).toMatchObject({ sessionId: "s1" });
    expect((requests[0]!.params.facts as string[])[0]).toContain("Q3 budget");
  });

  test("cancellation aborts the provider bridge and emits cancelled", async () => {
    const { events, emit } = collector();
    // A provider that never finishes — the engine must be killable.
    const neverEnding: ProviderBridge = {
      async *streamChat(_req, signal) {
        for (;;) {
          if (signal.aborted) return;
          await tick(5);
        }
      },
    };

    const run = runChatStream(PARAMS, emit, neverEnding, 10);
    // Let the engine reach the provider stream, then cancel.
    await tick(30);
    expect(activeStreamCount()).toBe(1);
    expect(cancelChatStream(PARAMS.streamId)).toBe(true);
    await run;

    expect(events.some((e) => e.type === "cancelled")).toBe(true);
    // A cancelled stream must NOT also emit done or an engine error.
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(activeStreamCount()).toBe(0);
    // Cancelling an unknown stream is a no-op.
    expect(cancelChatStream("nope")).toBe(false);
  });

  test("J11 budget kill surfaces 'stopped: $X limit'", async () => {
    const { events, emit } = collector();
    const budgetBridge: ProviderBridge = {
      async *streamChat() {
        throw Object.assign(new Error("session 's1' stopped: $2.00 limit (spent $2.05)"), {
          code: "budget_exceeded",
        });
      },
    };

    await runChatStream(PARAMS, emit, budgetBridge, 10);

    const error = events.find((e) => e.type === "error") as
      | { code: string; message: string }
      | undefined;
    expect(error).toBeDefined();
    expect(error!.code).toBe("budget_exceeded");
    expect(error!.message).toContain("stopped: $2.00 limit");
    expect(activeStreamCount()).toBe(0);
  });

  test("FrameProviderBridge asks Rust to run the provider call, then routes chunks", async () => {
    const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
    const bridge = new FrameProviderBridge(async (method, params) => {
      requests.push({ method, params: params as Record<string, unknown> });
      return { accepted: true };
    });
    // Rust pushes chunks as they stream; the generator consumes them in order.
    const chunks: StreamChunk[] = [];
    const pull = (async () => {
      for await (const c of bridge.streamChat(
        { provider: "nvidia", model: "m", sessionId: "s1", messages: [], streamId: "st-x" },
        new AbortController().signal,
      )) {
        chunks.push(c);
      }
    })();

    // Give the (async) provider/stream request a tick to fire.
    await tick(5);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("provider/stream");
    expect(requests[0]!.params).toMatchObject({
      provider: "nvidia",
      model: "m",
      sessionId: "s1",
      streamId: "st-x",
    });

    bridge.handleChunk({ streamId: "st-x", delta: "hi " });
    bridge.handleChunk({ streamId: "st-x", delta: "there" });
    bridge.handleChunk({
      streamId: "st-x",
      usage: { promptTokens: 12, completionTokens: 2 },
    });
    bridge.handleChunk({ streamId: "st-x", ended: true });

    await pull;
    expect(chunks).toEqual([
      { type: "text", text: "hi " },
      { type: "text", text: "there" },
      { type: "done", usage: { promptTokens: 12, completionTokens: 2 } },
    ]);
    // A chunk for an unknown stream is dropped safely.
    bridge.handleChunk({ streamId: "st-other", delta: "x" });
  });

  test("a refused provider/stream (J11 budget) surfaces as budget_exceeded", async () => {
    const { events, emit } = collector();
    const bridge = new FrameProviderBridge(async () => {
      throw new Error("session 's1' stopped: $2.00 limit (spent $2.05)");
    });
    await runChatStream(PARAMS, emit, bridge, 10);
    const error = events.find((e) => e.type === "error") as
      | { code: string; message: string }
      | undefined;
    expect(error?.code).toBe("budget_exceeded");
    expect(error?.message).toContain("stopped: $2.00 limit");
    expect(activeStreamCount()).toBe(0);
  });

  test("mobile credit hooks are stripped from the desktop loop", async () => {
    // A-10/C-3/C-4: creditAware / shouldContinueStreaming are mobile-credit
    // concepts. The desktop loop must never USE them — the check strips
    // comments (which legitimately document the strip) so only real code
    // references would fail.
    const src = await Bun.file(new URL("./chat.ts", import.meta.url)).text();
    const withoutComments = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(withoutComments).not.toContain("creditAware");
    expect(withoutComments).not.toContain("shouldContinueStreaming");
  });
});
