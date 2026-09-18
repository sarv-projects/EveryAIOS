import { describe, expect, test } from "bun:test";
import { applySpendSplitIfPresent } from "./spend-split";

describe("P60.9 Chief spend split (live consumer)", () => {
  test("applySpendSplitIfPresent calls execution/spend_split", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applySpendSplitIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, spend: { warnNotDelegating: true, share: 0.3 } };
    }, { chiefTokens: 30, workerTokens: 70 });
    expect(applied).toEqual({ applied: true, warn: true });
    expect(calls[0]?.method).toBe("execution/spend_split");
  });
});
