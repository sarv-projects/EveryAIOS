import { describe, expect, test } from "bun:test";
import { applyCuaBriefIfPresent, briefFromToolArgs, briefIsComplete } from "./cua-brief";

describe("P60.5 five-part brief (live consumer)", () => {
  test("incomplete brief is not a transcript substitute", () => {
    const incomplete = briefFromToolArgs({ brief: { goal: "do it" } });
    expect(incomplete).toBeDefined();
    expect(briefIsComplete(incomplete!)).toBe(false);
    const complete = briefFromToolArgs({
      brief: {
        goal: "map",
        constraints: "read-only",
        inputs: "path",
        postconditions: "list",
        out_of_scope: "writes",
      },
    });
    expect(briefIsComplete(complete!)).toBe(true);
  });

  test("applyCuaBriefIfPresent calls execution/cua_set_brief", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const brief = {
      goal: "map",
      constraints: "ro",
      inputs: "ws",
      postconditions: "list",
      outOfScope: "writes",
    };
    const applied = await applyCuaBriefIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true };
    }, { cuaRoot: "/tmp/cua", nodeId: "n1", brief });
    expect(applied.applied).toBe(true);
    expect(calls[0]?.method).toBe("execution/cua_set_brief");
    expect(calls[0]?.params).toEqual({ root: "/tmp/cua", nodeId: "n1", brief });
  });
});
