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
  fileToFacts,
  extractJsonToolCalls,
  FrameProviderBridge,
  injectBelowBoundary,
  runChatStream,
  runToolRetry,
  type ChatEvent,
  type ChatStreamParams,
  type ProviderBridge,
  type ProviderChunk,
} from "./chat";
import { CACHE_BOUNDARY } from "./prompt";

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
      return method === "memory/write" ? { written: 1 } : { coreFacts: [] };
    });

    // Two dispatches: the P5.3 warm-set fetch (memory/plan) + the P5.1 fact
    // persistence (memory/write).
    expect(requests.map((r) => r.method)).toContain("memory/plan");
    const writes = requests.filter((r) => r.method === "memory/write");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.params).toMatchObject({ sessionId: "s1" });
    expect((writes[0]!.params.facts as string[])[0]).toContain("Q3 budget");
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

  test("P50.5 — a broker/provider error chunk throws the stream instead of an empty success", async () => {
    const bridge = new FrameProviderBridge(async () => ({ accepted: true }));
    const pull = (async () => {
      try {
        for await (const _c of bridge.streamChat(
          { provider: "nvidia", model: "m", sessionId: "s1", messages: [], streamId: "st-err" },
          new AbortController().signal,
        )) {
          /* drain */
        }
        return null;
      } catch (e) {
        return e;
      }
    })();
    await tick(5);
    // Rust surfaces a broker failure as {streamId, error} + {streamId, ended}.
    bridge.handleChunk({
      streamId: "st-err",
      error: "provider returned 401 Unauthorized for model 'm'",
    });
    bridge.handleChunk({ streamId: "st-err", ended: true });
    const err = await pull;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("401 Unauthorized");
  });

  test("P50.5 — a provider error chunk surfaces chat/error, never an empty done", async () => {
    const { events, emit } = collector();
    const bridge = new FrameProviderBridge(async () => ({ accepted: true }));
    const run = runChatStream(
      { ...PARAMS, streamId: "st-turn-err" },
      emit,
      bridge,
      10,
    );
    await tick(10);
    bridge.handleChunk({
      streamId: "st-turn-err",
      error: "model 'meta/llama' has reached end of life",
    });
    bridge.handleChunk({ streamId: "st-turn-err", ended: true });
    await run;
    const error = events.find((e) => e.type === "error") as
      | { code: string; message: string }
      | undefined;
    expect(error?.message).toContain("end of life");
    // The failure is honest: no done, no empty success, no cache write.
    expect(events.some((e) => e.type === "done")).toBe(false);
    expect(events.filter((e) => e.type === "batch").length).toBe(0);
  });

  test("P50.5 — cancel before ANY chunk unblocks the pending queue read", async () => {
    const bridge = new FrameProviderBridge(async () => ({ accepted: true }));
    const controller = new AbortController();
    const pull = (async () => {
      const got: StreamChunk[] = [];
      for await (const c of bridge.streamChat(
        { provider: "nvidia", model: "m", sessionId: "s1", messages: [], streamId: "st-cancel" },
        controller.signal,
      )) {
        got.push(c);
      }
      return got;
    })();
    await tick(5);
    // No chunks ever arrive; the user cancels. The read must NOT hang on
    // `q.next()` waiting for a provider chunk.
    controller.abort();
    const start = Date.now();
    const got = await pull;
    expect(Date.now() - start).toBeLessThan(1_000);
    expect(got).toEqual([]);
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

  test("injectBelowBoundary keeps the stable prefix unchanged", () => {
    const prompt = `# System\nstable segment one\n${CACHE_BOUNDARY}\nvolatile segment`;
    const out = injectBelowBoundary(prompt, "<memory_warm_set>fact</memory_warm_set>");
    // The stable prefix (everything before the boundary) is byte-identical.
    expect(out.indexOf("stable segment one")).toBe(prompt.indexOf("stable segment one"));
    // The warm set lands BELOW the boundary marker.
    expect(out.indexOf(CACHE_BOUNDARY)).toBeLessThan(out.indexOf("<memory_warm_set>"));
    expect(out).toContain("<memory_warm_set>fact</memory_warm_set>");
    // No boundary marker → append at the end.
    expect(injectBelowBoundary("no marker", "B")).toBe("no marker\n\nB");
  });

  test("fileToFacts uses core-files chunking and stays within budget", () => {
    const text =
      "The Q3 budget was finalized at twelve thousand dollars. " +
      "The marketing team approved the new slide deck. ";
    const facts = fileToFacts(text, "text/markdown", 1000);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.join(" ")).toContain("Q3 budget");
    // A tiny budget yields no facts (never floods memory).
    expect(fileToFacts(text, "text/markdown", 1)).toEqual([]);
  });

  test("P5.3: memory/plan warm set is injected below the cache boundary", async () => {
    const { events, emit } = collector();
    let systemPrompt = "";
    const bridge: ProviderBridge = {
      async *streamChat(req) {
        systemPrompt = req.messages[0]!.content ?? "";
        yield { type: "text", text: "ok" };
        yield { type: "done", usage: { promptTokens: 1, completionTokens: 1 } };
      },
    };
    const request = async (method: string, _params: unknown) => {
      if (method === "memory/plan") {
        return {
          warmSetTokens: 12,
          remainingTokens: 32000,
          scopeLeakageFloor: 0,
          coreFacts: ["The Q3 budget was finalized at $12,400."],
        };
      }
      return {};
    };

    await runChatStream(PARAMS, emit, bridge, 10, request);

    expect(systemPrompt).toContain("<memory_warm_set>");
    expect(systemPrompt).toContain("The Q3 budget was finalized at $12,400.");
    expect(systemPrompt.indexOf(CACHE_BOUNDARY)).toBeLessThan(
      systemPrompt.indexOf("<memory_warm_set>"),
    );
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("H2: tool_index is injected below the cache boundary; tools body is the resolved subset", async () => {
    const { emit } = collector();
    let systemPrompt = "";
    let toolsBody: unknown;
    const request = async (method: string) => {
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "tool/list") {
        return {
          tools: [
            { id: "z_last", family: "x", description: "zzz", readOnly: true, operation: "write", risk: "low", argsSchema: {} },
            { id: "file_ops.read", family: "fileops", description: "Read a file", readOnly: true, operation: "write", risk: "low", argsSchema: {} },
          ],
        };
      }
      return {};
    };
    const bridge: ProviderBridge = {
      async *streamChat(req) {
        systemPrompt = req.messages[0]!.content ?? "";
        toolsBody = req.tools;
        yield { type: "text", text: "ok" };
        yield { type: "done" };
      },
    };
    await runChatStream(PARAMS, emit, bridge, 10, request);
    expect(systemPrompt).toContain("<tool_index>");
    expect(systemPrompt.indexOf(CACHE_BOUNDARY)).toBeLessThan(systemPrompt.indexOf("<tool_index>"));
    expect(systemPrompt).toContain("file_ops.read");
    const names = (toolsBody as Array<{ function: { name: string } }>).map((t) => t.function.name);
    expect(names).toEqual(["file_ops.read", "z_last"]);
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

  test("S0.2: provider tool_call is executed via request(tool/exec→tool/commit)", async () => {
    const { events, emit } = collector();
    const calls: string[] = [];
    const request = async (method: string, params: unknown) => {
      calls.push(method);
      const p = params as Record<string, unknown>;
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "memory/write") return {};
      if (method === "tool/exec") {
        return {
          action: "allow",
          ticketId: "tkt:1",
          argsHash: "abc",
        };
      }
      if (method === "tool/commit") {
        expect(p.toolId).toBe("search_web");
        expect(p.ticketId).toBe("tkt:1");
        return { ok: true, content: "file-body" };
      }
      return {};
    };
    let round = 0;
    const bridge: ProviderBridge = {
      async *streamChat(_req, signal) {
        if (signal.aborted) return;
        if (round === 0) {
          round += 1;
          yield {
            type: "tool_call",
            id: "search_web",
            args: { query: "q" },
          };
          yield { type: "done" };
          return;
        }
        yield { type: "text", text: "used the file" };
        yield { type: "done" };
      },
    };
    await runChatStream(PARAMS, emit, bridge, 10, request);
    expect(calls).toContain("tool/exec");
    expect(calls).toContain("tool/commit");
    expect(events.some((e) => e.type === "tool_call" && e.toolId === "search_web")).toBe(true);
    expect(events.some((e) => e.type === "tool_result" && e.toolId === "search_web")).toBe(true);
    const done = events.find((e) => e.type === "done") as { fullText?: string } | undefined;
    expect(done?.fullText).toContain("used the file");
  });

  test("S0.7 E2E: tool_call → ask ticket → approve → commit → tool_result + auditSeq", async () => {
    const { events, emit } = collector();
    const calls: string[] = [];
    const request = async (method: string, params: unknown) => {
      calls.push(method);
      const p = params as Record<string, unknown>;
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "tool/list") {
        return { tools: [{ id: "file_ops.delete", readOnly: false, risk: "high", argsSchema: {} }] };
      }
      if (method === "tool/exec") {
        return { action: "ask", ticketId: "tkt:human", argsHash: "h" };
      }
      if (method === "guard/ticket_status") {
        expect(p.ticketId).toBe("tkt:human");
        return { state: "approved" };
      }
      if (method === "tool/commit") {
        expect(p.ticketId).toBe("tkt:human");
        expect(p.toolId).toBe("file_ops.delete");
        return { ok: true, content: "deleted", auditSeq: 42, ticketId: "tkt:human" };
      }
      return {};
    };
    let round = 0;
    const bridge: ProviderBridge = {
      async *streamChat(_req, signal) {
        if (signal.aborted) return;
        if (round === 0) {
          round += 1;
          yield { type: "tool_call", id: "file_ops.delete", args: { path: "x.txt" } };
          yield { type: "done" };
          return;
        }
        yield { type: "text", text: "removed the file" };
        yield { type: "done" };
      },
    };
    await runChatStream(PARAMS, emit, bridge, 10, request);
    expect(calls).toContain("tool/exec");
    expect(calls).toContain("guard/ticket_status");
    expect(calls).toContain("tool/commit");
    expect(events.some((e) => e.type === "tool_call" && e.toolId === "file_ops.delete")).toBe(true);
    const result = events.find((e) => e.type === "tool_result") as
      | { result?: { auditSeq?: number } }
      | undefined;
    expect(result).toBeDefined();
    expect(events.some((e) => e.type === "error")).toBe(false);
    const done = events.find((e) => e.type === "done") as { fullText?: string } | undefined;
    expect(done?.fullText).toContain("removed the file");
  });

  test("S0.3: tool/list is serialized once onto ProviderRequest.tools", async () => {
    const { emit } = collector();
    const bodies: Array<Record<string, unknown>> = [];
    const request = async (method: string) => {
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "tool/list") {
        return {
          tools: [
            {
              id: "file_ops.read",
              family: "fileops",
              description: "Read a file",
              readOnly: true,
              operation: "write",
              risk: "low",
              argsSchema: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
              },
            },
          ],
        };
      }
      if (method === "tool/exec") {
        return { action: "allow", ticketId: "tkt:r", argsHash: "h" };
      }
      if (method === "tool/commit") {
        return { ok: true, content: "ok" };
      }
      return {};
    };
    const bridge: ProviderBridge = {
      async *streamChat(req, signal) {
        if (signal.aborted) return;
        bodies.push(req as unknown as Record<string, unknown>);
        yield { type: "text", text: "hi" };
        yield { type: "done" };
      },
    };
    await runChatStream(PARAMS, emit, bridge, 10, request);
    expect(bodies.length).toBeGreaterThan(0);
    const tools = bodies[0]!.tools as Array<{ type: string; function: { name: string } }>;
    expect(tools).toBeDefined();
    expect(tools.some((t) => t.type === "function" && t.function.name === "file_ops.read")).toBe(
      true,
    );
    expect(bodies[0]!.tool_choice).toBe("auto");
  });

  test("S0.3: registry tool id (file_ops.read) is not denied by the mobile catalog", async () => {
    const { events, emit } = collector();
    const request = async (method: string) => {
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "tool/list") {
        return {
          tools: [
            {
              id: "file_ops.read",
              family: "fileops",
              description: "Read",
              readOnly: true,
              operation: "write",
              risk: "low",
              argsSchema: { type: "object" },
            },
          ],
        };
      }
      if (method === "tool/exec") {
        return { action: "allow", ticketId: "tkt:f", argsHash: "h" };
      }
      if (method === "tool/commit") {
        return { ok: true, content: "file-body" };
      }
      return {};
    };
    let round = 0;
    const bridge: ProviderBridge = {
      async *streamChat(_req, signal) {
        if (signal.aborted) return;
        if (round === 0) {
          round += 1;
          yield { type: "tool_call", id: "file_ops.read", args: { path: "a.txt" } };
          yield { type: "done" };
          return;
        }
        yield { type: "text", text: "read it" };
        yield { type: "done" };
      },
    };
    await runChatStream(PARAMS, emit, bridge, 10, request);
    expect(events.some((e) => e.type === "tool_call" && e.toolId === "file_ops.read")).toBe(true);
    expect(events.some((e) => e.type === "tool_result" && e.toolId === "file_ops.read")).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("S0.3: JSON-mode local tool call is extracted and executed", async () => {
    const { events, emit } = collector();
    const request = async (method: string) => {
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "tool/list") {
        return {
          tools: [
            {
              id: "search.query",
              family: "search",
              description: "search",
              readOnly: true,
              operation: "external_network",
              risk: "medium",
              argsSchema: { type: "object" },
            },
          ],
        };
      }
      if (method === "tool/exec") {
        return { action: "allow", ticketId: "tkt:s", argsHash: "h" };
      }
      if (method === "tool/commit") {
        return { ok: true, content: "hits" };
      }
      return {};
    };
    let round = 0;
    const captured: unknown[] = [];
    const frame = new FrameProviderBridge(async (method, params) => {
      captured.push({ method, params });
    });
    const wrapping: ProviderBridge = {
      async *streamChat(req, signal) {
        if (signal.aborted) return;
        if (round === 0) {
          round += 1;
          const gen = frame.streamChat(req, signal);
          queueMicrotask(() => {
            const sid = req.streamId ?? "default";
            frame.handleChunk({
              streamId: sid,
              delta: '{"tool":"search.query","args":{"query":"q"}}',
            });
            frame.handleChunk({ streamId: sid, ended: true });
          });
          yield* gen;
          return;
        }
        yield { type: "text", text: "found it" };
        yield { type: "done" };
      },
    };
    await runChatStream({ ...PARAMS, streamId: "st-json" }, emit, wrapping, 10, request);
    expect(events.some((e) => e.type === "tool_call" && e.toolId === "search.query")).toBe(true);
    expect(events.some((e) => e.type === "tool_result" && e.toolId === "search.query")).toBe(true);
  });

  test("S0.5: runToolRetry re-enters exec→commit", async () => {
    const { events, emit } = collector();
    const methods: string[] = [];
    const request = async (method: string) => {
      methods.push(method);
      if (method === "tool/exec") {
        return { action: "allow", ticketId: "tkt:retry", argsHash: "h" };
      }
      if (method === "tool/commit") return { ok: true, content: "retried" };
      return {};
    };
    await runToolRetry(
      { sessionId: "s1", streamId: "st-1", toolId: "search.query", args: { query: "q" } },
      emit,
      request,
    );
    expect(methods).toContain("tool/exec");
    expect(methods).toContain("tool/commit");
    expect(methods).toContain("guard/evaluate");
    expect(events.some((e) => e.type === "tool_result")).toBe(true);
  });
});

describe("extractJsonToolCalls", () => {
  test("parses B5 {tool,args} and ignores unrelated JSON", () => {
    expect(extractJsonToolCalls('{"tool":"weather","args":{"city":"X"}}')).toEqual([
      { id: "weather", args: { city: "X" } },
    ]);
    expect(extractJsonToolCalls('{"city":"X"}')).toEqual([]);
  });
});
