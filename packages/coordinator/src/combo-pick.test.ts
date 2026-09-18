import { describe, expect, test } from "bun:test";
import { applyComboPickIfPresent, comboFromToolArgs } from "./combo-pick";

describe("P60.4 cheapest reliable combo (live consumer)", () => {
  test("comboFromToolArgs is absent unless a combo flag is set", () => {
    expect(comboFromToolArgs({})).toBeNull();
    expect(comboFromToolArgs({ needsVision: true })).toEqual({
      needsVision: true,
      verifyFailed: false,
      tier: "cheap",
    });
  });

  test("applyComboPickIfPresent calls execution/runtime_pick", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyComboPickIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, tier: "vl" };
    }, { needsVision: true, tier: "cheap" });
    expect(applied).toEqual({ applied: true, tier: "vl" });
    expect(calls[0]?.method).toBe("execution/runtime_pick");
  });
});
