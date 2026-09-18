import { describe, expect, test } from "bun:test";
import { applyCuaPerceiveIfPresent, layersFromToolArgs } from "./cua-perceive";

describe("P60.2 perception fusion (live consumer)", () => {
  test("layersFromToolArgs require a screenshot ref", () => {
    expect(layersFromToolArgs({ a11y: "button" })).toBeUndefined();
    expect(layersFromToolArgs({ screenshotRef: "shot:1", a11y: "lying" })).toEqual({
      screenshotRef: "shot:1",
      a11y: "lying",
    });
  });

  test("applyCuaPerceiveIfPresent calls execution/cua_perceive", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyCuaPerceiveIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true, scene: { usable: true } };
    }, { screenshotRef: "shot:1", a11y: "role=button", cuaRoot: "/tmp/cua", nodeId: "n1" });
    expect(applied.applied).toBe(true);
    expect(calls[0]?.method).toBe("execution/cua_perceive");
  });
});
