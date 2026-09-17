/**
 * P64 Tier-1 lane tests (coordinator side only).
 *
 * Covers the four Tier-1 items without touching the native crates:
 * - P64.3 repo-map rank + budget fit + below-boundary injection, with
 *   segments 1-7 byte-stable;
 * - P64.4 sub-agent worktree shape, inherited denies, shared-gate limits,
 *   and summary-only dispatch through the Guard-2 ticket flow;
 * - P64.5 single-occurrence fail-closed edit (read, gate, ticketed write);
 * - P64.8 skill-distillation trigger on a fully successful multi-task DAG
 *   (test-gated; the skills directory is never written from TS).
 */
import { describe, expect, test } from "bun:test";
import type { StreamChunk } from "@personal-ai/core-engine";
import {
  applyExactEdit,
  assertSingleMatch,
  buildSubAgentSpec,
  checkSubAgentSpawn,
  countOccurrences,
  deriveEffectiveSubAgentTools,
  dispatchSubAgent,
  subAgentSpecFromToolArgs,
  SubAgentSpawnTracker,
  toSummaryOnlyResult,
  ToolExecutor,
  type SubAgentSpecShape,
} from "./tools";
import {
  buildDesktopSystemPrompt,
  fitRepoMapToBudget,
  rankRepoMapTags,
  renderRepoMapBlock,
  stablePrefixOf,
  type RepoMapTag,
} from "./prompt";
import { injectBelowBoundary, runChatStream, type ChatEvent, type ProviderBridge } from "./chat";
import { runPlanExecution, type PlanEvent } from "./plan";

const TAG = (symbol: string, rank: number, file = "src/a.ts", line = 1): RepoMapTag => ({
  symbol,
  kind: "fn",
  file,
  line,
  rank,
});

describe("P64.3 — repo-map rank + budget fit (deterministic, PageRank order)", () => {
  test("ranks by PageRank desc with a stable symbol/file/line tie-break", () => {
    const ranked = rankRepoMapTags([TAG("zebra", 0.5), TAG("apple", 0.5), TAG("mango", 0.9)]);
    expect(ranked.map((t) => t.symbol)).toEqual(["mango", "apple", "zebra"]);
    // Deterministic across runs: equal ranks never flip.
    expect(rankRepoMapTags([TAG("b", 0.1), TAG("a", 0.1)]).map((t) => t.symbol)).toEqual(["a", "b"]);
  });

  test("fit keeps the highest-ranked prefix that fits the token budget", () => {
    const ranked = rankRepoMapTags([
      TAG("aaa", 0.9, "src/aa.ts"),
      TAG("bbb", 0.8, "src/bb.ts"),
      TAG("ccc", 0.7, "src/cc.ts"),
    ]);
    // Tiny budget: only the top row fits; order is preserved (never dropped boundary).
    const tiny = fitRepoMapToBudget(ranked, 5);
    expect(tiny.length).toBeGreaterThanOrEqual(1);
    expect(tiny.length).toBeLessThan(ranked.length);
    expect(tiny[0]!.symbol).toBe("aaa");
    // Generous budget keeps everything in PageRank order.
    expect(fitRepoMapToBudget(ranked, 1000).map((t) => t.symbol)).toEqual(["aaa", "bbb", "ccc"]);
    // Zero budget fits nothing (fail-closed, no partial guess).
    expect(fitRepoMapToBudget(ranked, 0)).toEqual([]);
  });

  test("rendered block is injectable below the boundary without touching segs 1-7", () => {
    const base = buildDesktopSystemPrompt({ personaId: "coach" });
    const block = renderRepoMapBlock(fitRepoMapToBudget(rankRepoMapTags([TAG("run", 0.4)])), );
    expect(block).toContain("<repo_map>");
    const injected = injectBelowBoundary(base, block);
    expect(stablePrefixOf(injected)).toBe(stablePrefixOf(base));
    expect(injected.indexOf("<repo_map>")).toBeGreaterThan(injected.indexOf(stablePrefixOf(base)));
  });

  test("chat turn injects the fitted map below the boundary (byte-stable prefix)", async () => {
    const events: ChatEvent[] = [];
    let systemPrompt = "";
    const bridge: ProviderBridge = {
      async *streamChat(req) {
        systemPrompt = req.messages[0]!.content ?? "";
        yield { type: "text", text: "ok" };
        yield { type: "done" };
      },
    };
    const request = async (method: string) => {
      if (method === "memory/plan") return { coreFacts: [] };
      if (method === "codeintel/repomap") {
        return {
          tags: [
            { symbol: "zebra", kind: "fn", file: "src/z.ts", line: 3, rank: 0.1 },
            { symbol: "apple", kind: "fn", file: "src/a.ts", line: 1, rank: 0.9 },
          ],
        };
      }
      if (method === "tool/list") return { tools: [] };
      return {};
    };
    await runChatStream(
      { sessionId: "s1", streamId: "st-repomap", text: "where is apple", provider: "n", model: "m" },
      (e) => events.push(e),
      bridge,
      10,
      request,
    );
    expect(systemPrompt).toContain("<repo_map>");
    // PageRank order survives into the prompt: apple before zebra.
    expect(systemPrompt.indexOf("apple")).toBeLessThan(systemPrompt.indexOf("zebra"));
    const { CACHE_BOUNDARY } = await import("./prompt");
    expect(systemPrompt.indexOf(CACHE_BOUNDARY)).toBeLessThan(systemPrompt.indexOf("<repo_map>"));
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("chat turn without a repomap handler is unchanged (best-effort skip)", async () => {
    const events: ChatEvent[] = [];
    let systemPrompt = "";
    const bridge: ProviderBridge = {
      async *streamChat(req) {
        systemPrompt = req.messages[0]!.content ?? "";
        yield { type: "text", text: "ok" };
        yield { type: "done" };
      },
    };
    await runChatStream(
      { sessionId: "s1", streamId: "st-nomap", text: "hi", provider: "n", model: "m" },
      (e) => events.push(e),
      bridge,
      10,
      async () => ({ coreFacts: [] }),
    );
    expect(systemPrompt).not.toContain("<repo_map>");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });
});

describe("P64.4 — sub-agent worktree shape + shared-gate limits", () => {
  test("spec binds the task-<id> worktree with the canonical blocked set", () => {
    const spec = buildSubAgentSpec({ taskId: "abc", goal: "index the repo", model: "m1" });
    expect(spec.workspace).toBe(".everyaios/worktrees/task-abc");
    expect(spec.blockedTools).toEqual(["clarify", "cronjob", "delegate", "memory", "send_message"]);
    expect(spec.depth).toBe(0);
    expect(spec.parentId).toBeNull();
  });

  test("depth outside 0..2 and empty goals fail closed", () => {
    expect(() => buildSubAgentSpec({ taskId: "a", goal: "g", depth: 3 })).toThrow(/depth/);
    expect(() => buildSubAgentSpec({ taskId: "a", goal: "   " })).toThrow(/goal/);
    expect(() => buildSubAgentSpec({ taskId: "!!!", goal: "g" })).toThrow();
  });

  test("effective tools inherit denies, never the blocked set or task ledger", () => {
    // An explicitly granted task-ledger tool is kept (the grant is the only
    // way a default-denied tool appears); blocked tools never survive.
    expect(
      deriveEffectiveSubAgentTools(["read", "delegate", "todo", "edit"], ["edit"], ["read", "todo"]),
    ).toEqual(["read", "todo"]);
    // Without an explicit grant, task-ledger tools stay denied.
    expect(deriveEffectiveSubAgentTools(["todo"], [], [])).toEqual([]);
  });

  test("shared gate refuses beyond max_concurrent 3 / max_total 6 / depth 2", () => {
    expect(checkSubAgentSpawn({ depth: 1, active: 0, total: 0 }).allowed).toBe(true);
    const concurrent = checkSubAgentSpawn({ depth: 1, active: 3, total: 0 });
    expect(concurrent.allowed).toBe(false);
    if (!concurrent.allowed) expect(concurrent.reason).toContain("concurrency");
    const total = checkSubAgentSpawn({ depth: 1, active: 0, total: 6 });
    expect(total.allowed).toBe(false);
    if (!total.allowed) expect(total.reason).toContain("total");
    const depth = checkSubAgentSpawn({ depth: 2, active: 0, total: 0 });
    expect(depth.allowed).toBe(false);
  });

  test("tracker reserves and releases slots; caps throw fail-closed", async () => {
    const tracker = new SubAgentSpawnTracker();
    await tracker.begin(1);
    expect(tracker.active).toBe(1);
    expect(tracker.total).toBe(1);
    tracker.release();
    expect(tracker.active).toBe(0);
    await expect(tracker.begin(3)).rejects.toThrow(/refused|outside/);
  });

  test("tool args normalize from either first-class shape", () => {
    const a = subAgentSpecFromToolArgs({ agentId: "coder", task: "Fix the parser" });
    expect(a.goal).toBe("Fix the parser");
    expect(a.model).toBe("coder");
    const b = subAgentSpecFromToolArgs({ objective: "Scan deps", scope: ["read"] });
    expect(b.goal).toBe("Scan deps");
    expect(() => subAgentSpecFromToolArgs({ task: "  " })).toThrow(/empty/);
  });

  test("summary-only result drops transcript-shaped extras", () => {
    const out = toSummaryOnlyResult({
      task_id: "t1",
      summary: "did it",
      status: "done",
      artifacts: ["a.json"],
      transcript: "SHOULD NEVER SURVIVE",
    });
    expect(out).toEqual({ task_id: "t1", summary: "did it", status: "done", artifacts: ["a.json"] });
    expect("transcript" in out).toBe(false);
  });

  test("dispatch runs evaluate → useTicket → spawn and returns summary-only", async () => {
    const calls: string[] = [];
    const request = async (method: string, params: unknown) => {
      calls.push(method);
      if (method === "guard/evaluate") return { action: "allow", ticketId: "tkt:sub" };
      if (method === "guard/use") return { consumed: true };
      if (method === "subagent/spawn") {
        const p = params as Record<string, unknown>;
        expect(String(p.workspace)).toContain("task-t9");
        return { task_id: "t9", summary: "done", status: "done", artifacts: [], transcript: "drop me" };
      }
      throw new Error(`unexpected ${method}`);
    };
    const spec: SubAgentSpecShape = buildSubAgentSpec({ taskId: "t9", goal: "probe", tools: ["read"] });
    const out = await dispatchSubAgent(request, spec, { sessionId: "s1" });
    expect(out.task_id).toBe("t9");
    expect("transcript" in out).toBe(false);
    expect(calls).toEqual(["guard/evaluate", "guard/use", "subagent/spawn"]);
  });

  test("dispatch refuses a blocked tool grant before any ticket", async () => {
    const calls: string[] = [];
    const request = async (method: string) => {
      calls.push(method);
      return {};
    };
    const spec: SubAgentSpecShape = {
      ...buildSubAgentSpec({ taskId: "t1", goal: "g" }),
      tools: ["delegate"],
    };
    await expect(dispatchSubAgent(request, spec, { sessionId: "s" })).rejects.toThrow(/blocked tool/);
    expect(calls).toEqual([]);
  });
});

describe("P64.5 — single-occurrence fail-closed edit", () => {
  test("occurrence counting distinguishes 0 / 1 / many", () => {
    expect(countOccurrences("aaa", "b")).toBe(0);
    expect(countOccurrences("aXbXc", "X")).toBe(2);
    expect(countOccurrences("hello", "")).toBe(0);
  });

  test("gate throws on zero and ambiguous matches", () => {
    expect(() => assertSingleMatch("hello world", "missing")).toThrow(/no match/);
    expect(() => assertSingleMatch("aXbXc", "X")).toThrow(/ambiguous \(2 matches\)/);
    expect(() => assertSingleMatch("one match here", "match")).not.toThrow();
    expect(() => assertSingleMatch("x", "")).toThrow(/empty/);
  });

  test("apply reads, gates, then commits through the ticketed path", async () => {
    const calls: string[] = [];
    let written: unknown;
    const request = async (method: string, params: unknown) => {
      calls.push(method);
      if (method === "guard/evaluate") return { action: "allow", ticketId: `tkt:${calls.length}` };
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") {
        const p = params as Record<string, unknown>;
        return { action: "allow", ticketId: p.ticketId, argsHash: "h" };
      }
      if (method === "tool/commit") {
        const p = params as Record<string, unknown>;
        if (p.toolId === "file_ops.read") return { ok: true, content: "line one\nTARGET\nline three\n" };
        written = p.args;
        return { ok: true, content: "written" };
      }
      return {};
    };
    const ex = new ToolExecutor(request);
    const out = await ex.executeTool("file_ops.read", { path: "f" }, { sessionId: "s" });
    expect(out).toBeDefined();
    const editEx = new ToolExecutor(request);
    await applyExactEdit(editEx, { path: "f.txt", target: "TARGET", replacement: "NEXT" }, { sessionId: "s" });
    expect((written as Record<string, unknown>).content).toBe("line one\nNEXT\nline three\n");
    expect(calls).toContain("guard/evaluate");
    expect(calls).toContain("tool/commit");
  });

  test("apply refuses an ambiguous target before the write ticket", async () => {
    const commits: string[] = [];
    const request = async (method: string, params: unknown) => {
      if (method === "guard/evaluate") return { action: "allow", ticketId: `tkt:${commits.length}` };
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") {
        const p = params as Record<string, unknown>;
        return { action: "allow", ticketId: p.ticketId, argsHash: "h" };
      }
      if (method === "tool/commit") {
        const p = params as Record<string, unknown>;
        commits.push(String(p.toolId));
        if (p.toolId === "file_ops.read") return { ok: true, content: "X and X" };
        return { ok: true, content: "SHOULD NOT HAPPEN" };
      }
      return {};
    };
    const ex = new ToolExecutor(request);
    await expect(
      applyExactEdit(ex, { path: "f.txt", target: "X", replacement: "Y" }, { sessionId: "s" }),
    ).rejects.toThrow(/ambiguous/);
    expect(commits).not.toContain("file_ops.write");
  });
});

describe("P64.8 — skill-distillation trigger (test-gated)", () => {
  function scriptedBridge(chunks: StreamChunk[]): ProviderBridge {
    return {
      async *streamChat(_req, signal) {
        for (const c of chunks) {
          if (signal.aborted) return;
          yield c;
        }
      },
    };
  }

  function harness() {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const request = async (method: string, params: unknown) => {
      calls.push({ method, params: (params ?? {}) as Record<string, unknown> });
      if (method === "plan/begin" || method === "plan/end") return {};
      if (method === "plan/step") return { ok: true };
      if (method === "tool/list") return { tools: [] };
      if (method === "eval/verify") return { verified: true, status: "pass" };
      if (method === "execution/begin") return { id: "ex:1" };
      if (method === "skill/grow") return { id: "skill-1" };
      return {};
    };
    return { calls, request };
  }

  const tasks = [
    { id: "a", goal: "first part of the work" },
    { id: "b", goal: "second part of the work", dependsOn: ["a"] },
  ];

  test("successful multi-task DAG with the gate open calls the native seam once", async () => {
    const { calls, request } = harness();
    const plans: PlanEvent[] = [];
    await runPlanExecution(
      { sessionId: "s1", planId: "p1", streamId: "st-1", tasks, enableSkillDistill: true },
      (e) => plans.push(e),
      () => undefined,
      scriptedBridge([{ type: "text", text: "ok" }, { type: "done" }]),
      request,
    );
    expect(calls.filter((c) => c.method === "skill/grow")).toHaveLength(1);
    expect(plans.find((e) => e.type === "plan_done")).toBeDefined();
  });

  test("gate closed by default: no skill call without the flag", async () => {
    const { calls, request } = harness();
    await runPlanExecution(
      { sessionId: "s1", planId: "p1", streamId: "st-1", tasks },
      () => undefined,
      () => undefined,
      scriptedBridge([{ type: "text", text: "ok" }, { type: "done" }]),
      request,
    );
    expect(calls.some((c) => c.method === "skill/grow")).toBe(false);
  });

  test("single-task runs never distill even with the gate open", async () => {
    const { calls, request } = harness();
    await runPlanExecution(
      {
        sessionId: "s1",
        planId: "p1",
        streamId: "st-1",
        tasks: [{ id: "only", goal: "a one-liner" }],
        enableSkillDistill: true,
      },
      () => undefined,
      () => undefined,
      scriptedBridge([{ type: "text", text: "ok" }, { type: "done" }]),
      request,
    );
    expect(calls.some((c) => c.method === "skill/grow")).toBe(false);
  });
});
