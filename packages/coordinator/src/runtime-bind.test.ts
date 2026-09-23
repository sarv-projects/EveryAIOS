import { describe, expect, test } from "bun:test";
import { applyRuntimeBindIfPresent, runtimeBindFromToolArgs } from "./runtime-bind";

describe("P60.1 five-way split (live consumer)", () => {
  test("runtimeBindFromToolArgs keeps harness and model independent", () => {
    expect(runtimeBindFromToolArgs({})).toBeNull();
    // P71.9g — a bind that names no harness is refused, not defaulted to a
    // built-in engine (`ADR-0005`).
    expect(runtimeBindFromToolArgs({ model: "local-vl", role: "worker" })).toBeNull();
    expect(
      runtimeBindFromToolArgs({ harness: "acp:other", model: "frontier", chief: "acme-agent" }),
    ).toEqual({
      harness: "acp:other",
      model: "frontier",
      chief: "acme-agent",
    });
  });

  test("applyRuntimeBindIfPresent calls execution/runtime_bind", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyRuntimeBindIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, planes: 5 };
    }, { model: "local-vl", harness: "acp:agent", role: "worker" });
    expect(applied.applied).toBe(true);
    expect(calls[0]?.method).toBe("execution/runtime_bind");
  });
});
