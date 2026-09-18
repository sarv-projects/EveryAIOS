import { describe, expect, test } from "bun:test";
import { applyFabricIfPresent } from "./fabric";

describe("P60.10 fabric on the node (live consumer)", () => {
  test("applyFabricIfPresent calls execution/cua_fabric", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyFabricIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, fabric: "c" };
    }, { cuaRoot: "/tmp/cua", nodeId: "n1", target: "Notepad" });
    expect(applied.applied).toBe(true);
    expect(calls[0]).toEqual({
      method: "execution/cua_fabric",
      params: { root: "/tmp/cua", nodeId: "n1", target: "Notepad" },
    });
    const skip = await applyFabricIfPresent(async () => {
      throw new Error("must not call");
    }, { cuaRoot: "/tmp/cua" });
    expect(skip.applied).toBe(false);
  });
});
