/**
 * P64 Tier-1 lane tests (coordinator side only).
 *
 * Covers the four Tier-1 items without touching the native crates:
 * - P64.3 repo-map rank + budget fit + below-boundary injection, with
 *   segments 1-7 byte-stable;
 * - P64.4 sub-agent worktree shape, inherited denies, shared-gate limits,
 *   and summary-only dispatch through the Guard-2 ticket flow;
 * - P64.5 single-occurrence fail-closed edit (read, gate, ticketed write) plus
 *   the verified-edit receipt (strategy + path + Guard-2 ticket) recorded on
 *   the bound execution, never fabricated when no ticket exists;
 * - P64.8 skill-distillation trigger on a fully successful multi-task DAG
 *   (test-gated; the skills directory is never written from TS).
 */
import { describe, expect, test } from "bun:test";
import type { StreamChunk } from "@personal-ai/core-engine";
import {
  applyEditLadder,
  applyEditBatch,
  applyExactEdit,
  executeEditAwareRound,
  applyExactOnce,
  applyFuzzyEdit,
  applyStructuredEdit,
  assertSingleMatch,
  buildSubAgentSpec,
  checkSubAgentSpawn,
  countOccurrences,
  deriveEditRisk,
  deriveEffectiveSubAgentTools,
  dispatchSubAgent,
  lexicalSymbols,
  preflightBlocks,
  subAgentSpecFromToolArgs,
  SubAgentSpawnTracker,
  toSummaryOnlyResult,
  ToolExecutor,
  type ShadowPreflightResult,
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

describe("P64.5 — verified-edit receipt provenance", () => {
  /**
   * A harness whose `tool/commit` serves the read content and reports a
   * committed write. `ticket` absent models a Guard that authorises without
   * issuing a ticket — the case that must never fabricate provenance.
   */
  function editHarness(content: string, opts: { ticket?: string } = {}) {
    const edits: Array<Record<string, unknown>> = [];
    const request = async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>;
      if (method === "guard/evaluate") {
        return opts.ticket === undefined ? { action: "allow" } : { action: "allow", ticketId: opts.ticket };
      }
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") {
        return opts.ticket === undefined
          ? { action: "allow", argsHash: "h" }
          : { action: "allow", ticketId: opts.ticket, argsHash: "h" };
      }
      if (method === "tool/commit") {
        if (p.toolId === "file_ops.read") return { ok: true, content };
        return { ok: true, content: { written: true } };
      }
      if (method === "execution/record_edit") {
        edits.push(p);
        return { kind: "verified_edit" };
      }
      return {};
    };
    return { request, edits };
  }

  test("a landed exact edit records strategy + path + the write's Guard-2 ticket", async () => {
    const { request, edits } = editHarness("line one\nTARGET\nline three\n", { ticket: "tkt-9" });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex:1");
    await applyExactEdit(ex, { path: "f.txt", target: "TARGET", replacement: "NEXT" }, { sessionId: "s" });
    expect(edits).toHaveLength(1);
    expect(edits[0]!.id).toBe("ex:1");
    expect(edits[0]!.strategy).toBe("exact");
    expect(edits[0]!.path).toBe("f.txt");
    expect(edits[0]!.ticketId).toBe("tkt-9");
  });

  test("a Guard that issues no ticket records no receipt", async () => {
    const { request, edits } = editHarness("TARGET\n");
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex:1");
    const ok = await ex.recordVerifiedEdit("exact", "f.txt", undefined);
    expect(ok).toBe(false);
    expect(edits).toHaveLength(0);
  });

  test("an unbound executor records nothing and never blocks the edit", async () => {
    const { request, edits } = editHarness("TARGET\n", { ticket: "tkt-9" });
    const ex = new ToolExecutor(request);
    const written = await applyExactEdit(
      ex,
      { path: "f.txt", target: "TARGET", replacement: "NEXT" },
      { sessionId: "s" },
    );
    expect(edits).toHaveLength(0);
    expect(written).toBeDefined();
  });

  test("a refused receipt does not fail an edit that already landed", async () => {
    const { request } = editHarness("TARGET\n", { ticket: "tkt-9" });
    const failing = async (method: string, params: unknown) => {
      if (method === "execution/record_edit") throw new Error("unknown execution ex:gone");
      return request(method, params);
    };
    const ex = new ToolExecutor(failing);
    ex.setExecutionId("ex:gone");
    const ok = await ex.recordVerifiedEdit("exact", "f.txt", "tkt-9");
    expect(ok).toBe(false);
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

describe("P64.6 — shadow preflight seam (risk-gated typecheck before commit)", () => {
    test("carries the gate inputs to Rust and reports the verdict", async () => {
      const seen: Array<{ method: string; params: unknown }> = [];
      const ex = new ToolExecutor(async (method, params) => {
        seen.push({ method, params });
        return {
          needsPreflight: true,
          verified: true,
          passed: false,
          reason: "structural edit preflights",
        };
      });
      ex.setExecutionId("ex-9");
      const out = await ex.runShadowPreflight({
        root: "/repo/.everyaios/worktrees/task-1",
        filesChanged: 4,
        structural: true,
      });
      expect(seen[0]?.method).toBe("execution/preflight");
      const params = seen[0]?.params as Record<string, unknown>;
      expect(params.id).toBe("ex-9");
      expect(params.filesChanged).toBe(4);
      expect(params.structural).toBe(true);
      expect(params.destructive).toBe(false);
      // The verdict belongs to Rust; the coordinator only reports it.
      expect(out).toEqual({
        needsPreflight: true,
        verified: true,
        passed: false,
        reason: "structural edit preflights",
      });
    });

    test("carries the staged candidate so the check sees the proposal, not the tree", async () => {
      const seen: Array<{ method: string; params: unknown }> = [];
      const ex = new ToolExecutor(async (method, params) => {
        seen.push({ method, params });
        return {
          needsPreflight: true,
          verified: true,
          passed: true,
          reason: "multi-file edit preflights in a shadow tree",
        };
      });
      ex.setExecutionId("ex-12");
      const out = await ex.runShadowPreflight({
        root: "/repo/.everyaios/worktrees/task-2",
        filesChanged: 2,
        candidateFiles: [{ path: "src/a.ts", content: "export const a = 1\n" }],
      });
      const params = seen[0]?.params as Record<string, unknown>;
      expect(params.candidateFiles).toEqual([
        { path: "src/a.ts", content: "export const a = 1\n" },
      ]);
      expect(out.passed).toBe(true);
      // No candidate → the key is omitted entirely (the legacy
      // check-the-root-as-given behaviour), never sent as `undefined`.
      const seen2: Array<{ method: string; params: unknown }> = [];
      const ex2 = new ToolExecutor(async (method, params) => {
        seen2.push({ method, params });
        return { needsPreflight: false, verified: false, passed: false, reason: "small write" };
      });
      ex2.setExecutionId("ex-13");
      await ex2.runShadowPreflight({ root: "/repo", filesChanged: 1 });
      const params2 = seen2[0]?.params as Record<string, unknown>;
      expect("candidateFiles" in params2).toBe(false);
    });

    test("with no execution bound it reports no-evidence, not a pass", async () => {
      const ex = new ToolExecutor(async () => ({}));
      const out = await ex.runShadowPreflight({ root: "/repo", filesChanged: 3 });
      expect(out.verified).toBe(false);
      expect(out.passed).toBe(false);
    });

    test("a transport failure is no-evidence, and never blocks an edit", async () => {
      const ex = new ToolExecutor(async () => {
        throw new Error("sidecar gone");
      });
      ex.setExecutionId("ex-1");
      const out = await ex.runShadowPreflight({
        root: "/repo",
        filesChanged: 3,
        destructive: true,
      });
      expect(out.verified).toBe(false);
      expect(preflightBlocks(out)).toBe(false);
    });

    test("only a preflight that ran and failed blocks the edit", () => {
      const failed: ShadowPreflightResult = {
        needsPreflight: true,
        verified: true,
        passed: false,
        reason: "cargo check failed",
      };
      expect(preflightBlocks(failed)).toBe(true);
      // A small local-write never preflights.
      expect(preflightBlocks({ ...failed, needsPreflight: false })).toBe(false);
      // Unrunnable is not a failure — it must not be turned into a refusal.
      expect(preflightBlocks({ ...failed, verified: false, passed: false })).toBe(false);
      expect(preflightBlocks({ ...failed, passed: true })).toBe(false);
  });

  /**
   * P64.6 — the production call site: a *failed* candidate preflight must
   * refuse the write, and a passing / unrunnable one must let it through.
   */
  function editPath(verdict: Partial<ShadowPreflightResult>) {
    const calls: string[] = [];
    /** Tool ids that actually reached `tool/commit` (the write path). */
    const committed: string[] = [];
    const request = async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>;
      calls.push(method);
      if (method === "guard/evaluate") return { action: "allow", ticketId: "tkt-1" };
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") return { action: "allow", ticketId: "tkt-1", argsHash: "h" };
      if (method === "tool/commit") {
        if (typeof p.toolId === "string") committed.push(p.toolId);
        if (p.toolId === "file_ops.read") return { ok: true, content: "line one\nTARGET\n" };
        return { ok: true, content: { written: true } };
      }
      if (method === "execution/preflight") return verdict;
      return {};
    };
    return { request, calls, committed };
  }

  test("a failing candidate preflight refuses the write before it lands", async () => {
    const { request, calls, committed } = editPath({
      needsPreflight: true,
      verified: true,
      passed: false,
      reason: "cargo check failed",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-20");
    await expect(
      applyExactEdit(
        ex,
        { path: "src/a.ts", target: "TARGET", replacement: "NEXT" },
        { sessionId: "s" },
        { structural: true, root: "/repo" },
      ),
    ).rejects.toThrow(/shadow preflight failed/);
    expect(calls).toContain("execution/preflight");
    // The read committed (it had to, to build the candidate) but **the write
    // never did** — the refusal lands before the mutating commit.
    expect(committed).toContain("file_ops.read");
    expect(committed).not.toContain("file_ops.write");
  });

  test("a passing candidate preflight lets the edit land", async () => {
    const { request, calls } = editPath({
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "structural edit preflights in a shadow tree",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-21");
    await applyExactEdit(
      ex,
      { path: "src/a.ts", target: "TARGET", replacement: "NEXT" },
      { sessionId: "s" },
      { structural: true, root: "/repo" },
    );
    expect(calls).toContain("tool/commit");
  });

  test("an unrunnable preflight is no evidence and never blocks the edit", async () => {
    const { request, calls } = editPath({
      needsPreflight: true,
      verified: false,
      passed: false,
      reason: "no typecheck command was discovered",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-22");
    await applyExactEdit(
      ex,
      { path: "src/a.ts", target: "TARGET", replacement: "NEXT" },
      { sessionId: "s" },
    );
    expect(calls).toContain("tool/commit");
  });

  test("deriveEditRisk: a declaration-count change is structural, a text swap is not", () => {
    // Adds a `function` — the splice moves a declaration boundary.
    expect(
      deriveEditRisk({ target: "// handler\n", replacement: "function handler() {}\n" })
        .structural,
    ).toBe(true);
    // Removes a declaration — same signal, opposite direction.
    expect(deriveEditRisk({ target: "fn old() {}\n", replacement: "" }).structural).toBe(true);
    // Renames an identifier / swaps a string — no declaration delta, no
    // bracket delta: a small local-write that verifies after, per contract.
    expect(
      deriveEditRisk({ target: "const url = \"http://a\";", replacement: "const url = \"http://b\";" }),
    ).toEqual({ structural: false, destructive: false, filesChanged: 1 });
    // `const`/`let` are deliberately not declaration signals (locals are noise).
    expect(deriveEditRisk({ target: "let x = 1;", replacement: "const x = 1;" }).structural).toBe(
      false,
    );
  });

  test("deriveEditRisk: a bracket-balance change is structural (unmatched brace)", () => {
    expect(
      deriveEditRisk({ target: "if (ok) { run(); }", replacement: "if (ok) { run();" }).structural,
    ).toBe(true);
  });

  test("a production edit earns the preflight from its own shape — no caller flag", async () => {
    // The edit changes the declaration count, so the coordinator itself must
    // derive `structural: true` — nothing in the apply args or any
    // model-visible schema declares it.
    const seen: Array<{ method: string; params: unknown }> = [];
    const { request } = editPath({
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "structural edit preflights in a shadow tree",
    });
    const wrapped = async (method: string, params: unknown) => {
      seen.push({ method, params });
      return request(method, params);
    };
    const ex = new ToolExecutor(wrapped);
    ex.setExecutionId("ex-23");
    await applyExactEdit(
      ex,
      // file body is "line one\nTARGET\n" — `TARGET` counts as no declaration,
      // `function added() {}` adds one → declaration-count delta.
      { path: "src/a.ts", target: "TARGET", replacement: "function added() {}" },
      { sessionId: "s" },
      { root: "/repo" }, // no structural/destructive — derived, not declared
    );
    const pf = seen.find((c) => c.method === "execution/preflight");
    const params = pf?.params as Record<string, unknown>;
    expect(params.structural).toBe(true);
    expect(params.destructive).toBe(false);
    expect(params.filesChanged).toBe(1);
  });

  test("deriveEditRisk: destructive is never derived from an in-place splice", () => {
    expect(deriveEditRisk({ target: "a", replacement: "" }).destructive).toBe(false);
  });

  test("a landed edit returns its preflight verdict for the checkpoint timeline", async () => {
    // P64.6/P64.7 — the result the transcript stores is what the UI derives
    // the checkpoint badge from, so the verdict must ride with the edit.
    const { request } = editPath({
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "structural edit preflights in a shadow tree",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-24");
    const out = (await applyExactEdit(
      ex,
      { path: "src/a.ts", target: "TARGET", replacement: "NEXT" },
      { sessionId: "s" },
      { structural: true, root: "/repo" },
    )) as { preflight?: Record<string, unknown> };
    expect(out.preflight).toEqual({
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "structural edit preflights in a shadow tree",
    });
  });
});

describe("P64.5 — edit ladder rungs (exact → structured → fuzzy)", () => {
  test("rung 1 wins on a byte-exact single occurrence", () => {
    expect(applyEditLadder("a XX b", "XX", "YY")).toEqual({ content: "a YY b", strategy: "exact" });
  });

  test("every rung fails closed on zero and on 2+ matches", () => {
    expect(() => applyExactOnce("hello world", "missing", "x")).toThrow(/no occurrence/);
    expect(() => applyExactOnce("aXbXc", "X", "Y")).toThrow(/ambiguous match \(2 occurrences\)/);
    // When every rung declines, the ladder reports rung 1's refusal — the most
    // actionable one — rather than the last rung's.
    expect(() => applyEditLadder("hello world", "missing", "x")).toThrow(/no occurrence/);
    expect(() => applyEditLadder("aXbXc", "X", "Y")).toThrow(/ambiguous match \(2 occurrences\)/);
  });

  test("rung 2 locates a whitespace-only difference that rung 1 cannot see", () => {
    const content = "fn  alpha( )  {\n    let x = 1;\n}\n";
    expect(() => applyExactOnce(content, "fn alpha() {\nlet x = 1;", "X")).toThrow(/no occurrence/);
    const r = applyStructuredEdit(content, "fn alpha() {\nlet x = 1;", "fn beta() {\nlet x = 2;");
    expect(r.strategy).toBe("structured");
    // The whole token window is replaced; everything outside it is untouched.
    expect(r.content).toBe("fn beta() {\nlet x = 2;\n}\n");
    // A non-whitespace difference is never papered over, and two matching
    // windows stay ambiguous — rung 2 keeps rung 1's fail-closed gate.
    expect(() => applyStructuredEdit(content, "fn gamma() {", "z")).toThrow(/no occurrence/);
    expect(() => applyStructuredEdit("a b\na b\n", "a b", "c")).toThrow(
      /ambiguous match \(2 occurrences\)/,
    );
  });

  test("rung 2 is the strictest rung that can apply a whitespace-noisy splice", () => {
    // The tokens match exactly, so the ladder stops at rung 2 and never reaches
    // the tolerant rung. While rung 2 re-ran rung 1's byte comparison this case
    // could only ever be recorded as `fuzzy`.
    expect(applyEditLadder("fn  alpha( )  {}\n", "fn alpha() {}", "fn beta() {}")).toEqual({
      content: "fn beta() {}\n",
      strategy: "structured",
    });
  });

  test("rung 3 catches what rung 2 cannot: a gap between hunks", () => {
    const gapped = "let a = 1;\nlet b = 2;\nlet c = 3;\n";
    // Rung 2's token match is contiguous, so this is beyond it...
    expect(() => applyStructuredEdit(gapped, "let a = 1;\nlet c = 3;", "x")).toThrow(
      /no occurrence/,
    );
    // ...and rung 3 lands it, recorded as fuzzy.
    expect(applyEditLadder(gapped, "let a = 1;\nlet c = 3;", "let a = 9;")).toEqual({
      content: "let a = 9;\n",
      strategy: "fuzzy",
    });
  });

  test("rung 3 is whitespace-insensitive but order-sensitive", () => {
    expect(() => applyFuzzyEdit("a\nb\n", "nope", "x")).toThrow(/no occurrence/);
    // Two identical windows → ambiguous, never a guess.
    expect(() => applyFuzzyEdit("X\nY\nX\nY\n", "X\nY", "Z")).toThrow(
      /ambiguous match \(2 occurrences\)/,
    );
    // Reordered hunks do not match: the subsequence keeps the target's order.
    expect(() => applyFuzzyEdit("Y\nX\n", "X\nY", "Z")).toThrow(/no occurrence/);
  });

  test("rung 3 replaces the whole raw window and preserves the file's ending", () => {
    // The untouched `B` line inside the window is consumed by the splice, and
    // the trailing newline survives.
    expect(applyFuzzyEdit("A\nB\nC\n", "A\nC", "X")).toEqual({ content: "X\n", strategy: "fuzzy" });
    // Indentation noise matches; the blank line outside the window survives.
    expect(
      applyFuzzyEdit("header\n\nfn   a( ) {\n  let q = 1;\n}\nfooter\n", "fn a() {\nlet q = 1;", "fn b() {\nlet q = 2;"),
    ).toEqual({
      content: "header\n\nfn b() {\nlet q = 2;\n}\nfooter\n",
      strategy: "fuzzy",
    });
  });

  test("the shape probe sees pub- and async-decorated declarations", () => {
    // A `pub` declaration must be visible, otherwise a pub-only file has an
    // empty shape and every splice into it passes the delta check untouched.
    expect(
      lexicalSymbols(
        "pub fn public_api() {}\npub struct Config {}\nasync fn worker() {}\npub async fn spawn() {}\n// fn in_a_comment() {}\n",
      ),
    ).toEqual(["fn public_api", "fn spawn", "fn worker", "struct Config"]);
  });

  test("a shape blowout is refused by rung 2 and falls through to rung 3", () => {
    // Indented so rung 1 misses and rung 2 is the rung actually under test.
    const content = "  pub fn a() {}\n  pub fn b() {}\n  pub fn c() {}\n";
    const target = "pub fn b() {}\npub fn c() {}\n";
    // Removing two declarations is a 3 → 1 shape change, refused directly.
    expect(() => applyStructuredEdit(content, target, "")).toThrow(/changed symbol shape \(3 → 1\)/);
    // Inside the ladder the refusal is not fatal: rung 3 applies the same splice
    // without the shape check, so the probe selects the recorded strategy rather
    // than hard-blocking the edit.
    expect(applyEditLadder(content, target, "")).toEqual({
      content: "  pub fn a() {}\n",
      strategy: "fuzzy",
    });
  });
});

describe("P64.5/P64.6 — a multi-file batch feeds the gate's filesChanged > 1 arm", () => {
  /** Serves one content per path and captures the gate, write, and receipt calls. */
  function batchHarness(contents: Record<string, string>, verdict: Partial<ShadowPreflightResult>) {
    const writes: Array<{ path: unknown; content: unknown }> = [];
    const preflights: Array<Record<string, unknown>> = [];
    const edits: Array<Record<string, unknown>> = [];
    const request = async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>;
      const args = (p.args ?? {}) as Record<string, unknown>;
      if (method === "guard/evaluate") return { action: "allow", ticketId: "tkt-b" };
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") return { action: "allow", ticketId: "tkt-b", argsHash: "h" };
      if (method === "tool/commit") {
        if (p.toolId === "file_ops.read") {
          return { ok: true, content: contents[String(args.path)] ?? "" };
        }
        writes.push({ path: args.path, content: args.content });
        return { ok: true, content: { written: true } };
      }
      if (method === "execution/preflight") {
        preflights.push(p);
        return verdict;
      }
      if (method === "execution/record_edit") {
        edits.push(p);
        return { kind: "verified_edit" };
      }
      return {};
    };
    return { request, writes, preflights, edits };
  }

  const TWO = [
    { path: "a.ts", target: "const A = 1;", replacement: "const A = 10;" },
    { path: "b.ts", target: "const B = 2;", replacement: "const B = 20;" },
  ];
  const TWO_CONTENTS = { "a.ts": "const A = 1;\n", "b.ts": "const B = 2;\n" };

  test("one gate call covers every file, with filesChanged = N and all candidates", async () => {
    const { request, preflights, writes, edits } = batchHarness(TWO_CONTENTS, {
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "multi-file edit preflights in a shadow tree",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-30");
    const out = await applyEditBatch(ex, TWO, { sessionId: "s" }, { root: "/repo" });
    // This single call is the multi-file arm's production input: before the
    // batch existed nothing ever sent `filesChanged > 1`.
    expect(preflights).toHaveLength(1);
    expect(preflights[0]!.filesChanged).toBe(2);
    expect(preflights[0]!.structural).toBe(false);
    expect(preflights[0]!.destructive).toBe(false);
    expect(preflights[0]!.root).toBe("/repo");
    // Every file's post-state is staged, not just the first one's.
    expect(preflights[0]!.candidateFiles).toEqual([
      { path: "a.ts", content: "const A = 10;\n" },
      { path: "b.ts", content: "const B = 20;\n" },
    ]);
    expect(writes.map((w) => w.path)).toEqual(["a.ts", "b.ts"]);
    expect(out.filesChanged).toBe(2);
    expect(out.edits).toEqual([
      { path: "a.ts", strategy: "exact" },
      { path: "b.ts", strategy: "exact" },
    ]);
    expect(out.preflight).toEqual({
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "multi-file edit preflights in a shadow tree",
    });
    // Each landed file cites its own Guard-2 ticket.
    expect(edits.map((e) => [e.path, e.strategy, e.ticketId])).toEqual([
      ["a.ts", "exact", "tkt-b"],
      ["b.ts", "exact", "tkt-b"],
    ]);
  });

  test("a failing batch preflight refuses every file — nothing is written", async () => {
    const { request, writes } = batchHarness(TWO_CONTENTS, {
      needsPreflight: true,
      verified: true,
      passed: false,
      reason: "tsc failed",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-31");
    await expect(
      applyEditBatch(ex, TWO, { sessionId: "s" }, { root: "/repo" }),
    ).rejects.toThrow(/batch edit refused: shadow preflight failed for 2 file/);
    expect(writes).toHaveLength(0);
  });

test("a batch rides the ladder per file, so one fuzzy recovery is allowed", async () => {
    const { request, preflights } = batchHarness(
      { "a.ts": "const A = 1;\n", "b.ts": "fn  beta( )  {}\n" },
      {
        needsPreflight: true,
        verified: true,
        passed: true,
        reason: "multi-file edit preflights in a shadow tree",
      },
    );
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-32");
    const out = await applyEditBatch(
      ex,
      [
        { path: "a.ts", target: "const A = 1;", replacement: "const A = 10;" },
        { path: "b.ts", target: "fn beta() {}", replacement: "fn gamma() {}" },
      ],
      { sessionId: "s" },
      { root: "/repo" },
    );
    // The second file only matched through the tolerant rung; the batch records
    // that per file instead of flattening both onto one strategy.
    expect(out.edits).toEqual([
      { path: "a.ts", strategy: "exact" },
      { path: "b.ts", strategy: "structured" },
    ]);
    expect(preflights[0]!.candidateFiles).toEqual([
      { path: "a.ts", content: "const A = 10;\n" },
      { path: "b.ts", content: "fn gamma() {}\n" },
    ]);
  });

  test("a duplicate path is refused before any read or write", async () => {
    const { request, writes } = batchHarness({ "a.ts": "const A = 1;\n" }, {});
    const ex = new ToolExecutor(request);
    await expect(
      applyEditBatch(
        ex,
        [
          { path: "a.ts", target: "const A = 1;", replacement: "x" },
          { path: " a.ts ", target: "const A = 1;", replacement: "y" },
        ],
        { sessionId: "s" },
      ),
    ).rejects.toThrow(/lists a\.ts twice/);
    expect(writes).toHaveLength(0);
  });

  test("an empty batch is refused fail-closed", async () => {
    const { request } = batchHarness(TWO_CONTENTS, {});
    const ex = new ToolExecutor(request);
    await expect(applyEditBatch(ex, [], { sessionId: "s" })).rejects.toThrow(/no edits/);
  });

  test("a mid-batch write failure reports how many files already landed", async () => {
    // The first write succeeds and the second fails: the error must state the
    // partial result rather than presenting the batch as atomic.
    const contents: Record<string, string> = TWO_CONTENTS;
    let writes = 0;
    const request = async (method: string, params: unknown) => {
      const p = (params ?? {}) as Record<string, unknown>;
      const args = (p.args ?? {}) as Record<string, unknown>;
      if (method === "guard/evaluate") return { action: "allow", ticketId: "tkt-b" };
      if (method === "guard/use") return { consumed: true };
      if (method === "tool/exec") return { action: "allow", ticketId: "tkt-b", argsHash: "h" };
      if (method === "tool/commit") {
        if (p.toolId === "file_ops.read") {
          return { ok: true, content: contents[String(args.path)] ?? "" };
        }
        writes += 1;
        if (writes === 2) return { ok: false, error: "disk full" };
        return { ok: true, content: { written: true } };
      }
      if (method === "execution/preflight") {
        return {
          needsPreflight: false,
          verified: false,
          passed: false,
          reason: "small local-write verifies after commit",
        };
      }
      return {};
    };
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-33");
    await expect(applyEditBatch(ex, TWO, { sessionId: "s" })).rejects.toThrow(
      /stopped at b\.ts: 1 of 2 file\(s\) already landed \(a\.ts\) — disk full/,
    );
  });

  test("executeEditAwareRound batches consecutive file_ops.edit", async () => {
    const { request, preflights } = batchHarness(TWO_CONTENTS, {
      needsPreflight: true,
      verified: true,
      passed: true,
      reason: "ok",
    });
    const ex = new ToolExecutor(request);
    ex.setExecutionId("ex-round");
    const out = await executeEditAwareRound(
      ex,
      [
        { toolId: "file_ops.edit", args: { path: "a.ts", old: "const A = 1;", new: "const A = 10;" } },
        { toolId: "file_ops.edit", args: { path: "b.ts", old: "const B = 2;", new: "const B = 20;" } },
      ],
      { sessionId: "s" },
      async () => {
        throw new Error("non-edit dispatch must not run");
      },
    );
    expect(preflights).toHaveLength(1);
    expect(preflights[0]!.filesChanged).toBe(2);
    expect(out).toHaveLength(2);
  });
});
