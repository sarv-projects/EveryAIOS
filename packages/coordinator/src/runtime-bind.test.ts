import { describe, expect, test } from "bun:test";
import { applyRuntimeBindIfPresent, runtimeBindFromToolArgs } from "./runtime-bind";

describe("P60.1 five-way split (live consumer)", () => {
  test("runtimeBindFromToolArgs keeps harness and model independent", () => {
    expect(runtimeBindFromToolArgs({})).toBeNull();
    expect(runtimeBindFromToolArgs({ model: "local-vl", role: "worker" })).toEqual({
      harness: "inbuilt",
      model: "local-vl",
      role: "worker",
    });
    expect(
      runtimeBindFromToolArgs({ harness: "acp:other", model: "frontier", chief: "inbuilt" }),
    ).toEqual({
      harness: "acp:other",
      model: "frontier",
      chief: "inbuilt",
    });
  });

  test("applyRuntimeBindIfPresent calls execution/runtime_bind", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyRuntimeBindIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, planes: 5 };
    }, { model: "local-vl", harness: "inbuilt", role: "worker" });
    expect(applied.applied).toBe(true);
    expect(calls[0]?.method).toBe("execution/runtime_bind");
  });
});
