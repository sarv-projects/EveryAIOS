import { describe, expect, test } from "bun:test";
import { applyCuaMechanicalVerifyIfPresent, evidenceFromToolArgs } from "./cua-verify";

describe("P60.6 mechanical verify (live consumer)", () => {
  test("evidenceFromToolArgs prefers explicit evidence, else verifyPath", () => {
    expect(evidenceFromToolArgs({})).toBeUndefined();
    expect(evidenceFromToolArgs({ verifyPath: "/tmp/r.txt", verifyExpect: "saved" })).toEqual({
      kind: "file-contains",
      path: "/tmp/r.txt",
      expect: "saved",
    });
    expect(
      evidenceFromToolArgs({
        evidence: { kind: "command-exit", exitCode: 1 },
      }),
    ).toEqual({ kind: "command-exit", exitCode: 1 });
  });

  test("applyCuaMechanicalVerifyIfPresent calls execution/cua_verify and ignores banner ok", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyCuaMechanicalVerifyIfPresent(
      async (method, params) => {
        calls.push({ method, params });
        return { ok: false, verdict: "refuted" };
      },
      {
        cuaRoot: "/tmp/cua",
        nodeId: "save",
        verifyPath: "/tmp/record.txt",
        verifyExpect: "committed",
      },
      { ok: true, verified: true },
    );
    expect(applied.applied).toBe(true);
    expect(applied.workerClaimed).toBe(true);
    expect(calls[0]?.method).toBe("execution/cua_verify");
    const params = calls[0]?.params as { workerClaimed: boolean; evidence: { expect: string } };
    expect(params.workerClaimed).toBe(true);
    expect(params.evidence.expect).toBe("committed");
  });
});
