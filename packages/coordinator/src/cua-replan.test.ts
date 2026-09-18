import { describe, expect, test } from "bun:test";
import {
  applyCuaReplanIfPresent,
  cuaReplanReasonFromResult,
  remainingFromToolArgs,
} from "./cua-replan";

describe("P59.7 Manager remaining rewrite (live consumer)", () => {
  test("remainingFromToolArgs reads planner JSON aliases", () => {
    expect(remainingFromToolArgs({ remaining: [{ id: "a" }] })).toEqual([{ id: "a" }]);
    expect(remainingFromToolArgs({ replanRemaining: [1] })).toEqual([1]);
    expect(remainingFromToolArgs({ remainingNodes: [] })).toEqual([]);
    expect(remainingFromToolArgs({ cuaRoot: "/tmp" })).toBeUndefined();
  });

  test("halt result maps to halt reason; otherwise planner", () => {
    expect(cuaReplanReasonFromResult({ code: "cua_halt", halt: true })).toBe("halt");
    expect(cuaReplanReasonFromResult({ ok: true }, "completion")).toBe("completion");
    expect(cuaReplanReasonFromResult({ ok: true })).toBe("planner");
  });

  test("applyCuaReplanIfPresent calls execution/cua_replan on the host", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const remaining = [
      {
        id: "alt",
        name: "File > Save",
        depends_on: ["open"],
        postconditions: ["saved"],
      },
    ];
    const applied = await applyCuaReplanIfPresent(
      async (method, params) => {
        calls.push({ method, params });
        return { ok: true, replanSeq: 1 };
      },
      {
        cuaRoot: "/tmp/cua-run",
        remaining,
      },
      { code: "cua_halt", halt: true },
    );
    expect(applied).toEqual({ applied: true, reason: "halt" });
    expect(calls).toEqual([
      {
        method: "execution/cua_replan",
        params: { root: "/tmp/cua-run", remaining, reason: "halt" },
      },
    ]);
    const skip = await applyCuaReplanIfPresent(async () => {
      throw new Error("must not call");
    }, { cuaRoot: "/tmp/cua-run" });
    expect(skip.applied).toBe(false);
  });
});
