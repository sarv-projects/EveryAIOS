import { describe, expect, test } from "bun:test";
import { applyCuaStopIfPresent, stopReasonFromToolArgs } from "./cua-stop";

describe("P60.7 BLOCKED ≠ FAILED (live consumer)", () => {
  test("stopReasonFromToolArgs reads permission vs failed", () => {
    expect(stopReasonFromToolArgs({})).toBeUndefined();
    expect(stopReasonFromToolArgs({ stopReason: "permission" })).toBe("permission");
    expect(stopReasonFromToolArgs({ blocked: true })).toBe("blocked");
  });

  test("applyCuaStopIfPresent calls execution/cua_stop", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyCuaStopIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, blocked: true };
    }, { cuaRoot: "/tmp/cua", nodeId: "n1", stopReason: "permission" });
    expect(applied).toEqual({ applied: true, reason: "permission" });
    expect(calls).toEqual([
      {
        method: "execution/cua_stop",
        params: { root: "/tmp/cua", nodeId: "n1", reason: "permission" },
      },
    ]);
  });
});
