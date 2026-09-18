import { describe, expect, test } from "bun:test";
import { applyCuaSkillPromoteIfPresent, promoteSkillArgs } from "./cua-skill";

describe("P59.16 CUA skill promote (live consumer)", () => {
  test("promoteSkillArgs reads string or object", () => {
    expect(promoteSkillArgs({})).toBeNull();
    expect(promoteSkillArgs({ promoteSkill: "login-to-x" })).toEqual({
      name: "login-to-x",
      description: "login-to-x",
    });
    expect(
      promoteSkillArgs({
        promoteSkill: { name: "extract-invoice", description: "Pull totals from the form" },
      }),
    ).toEqual({
      name: "extract-invoice",
      description: "Pull totals from the form",
    });
  });

  test("applyCuaSkillPromoteIfPresent calls execution/cua_promote_skill", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const applied = await applyCuaSkillPromoteIfPresent(async (method, params) => {
      calls.push({ method, params });
      return { ok: true };
    }, {
      cuaRoot: "/tmp/cua",
      skillRoot: "/tmp/skills",
      promoteSkill: "login-to-x",
      skillDescription: "Login to X",
    });
    expect(applied).toEqual({ applied: true, name: "login-to-x" });
    expect(calls).toEqual([
      {
        method: "execution/cua_promote_skill",
        params: {
          root: "/tmp/cua",
          skillRoot: "/tmp/skills",
          name: "login-to-x",
          description: "Login to X",
        },
      },
    ]);
    const skip = await applyCuaSkillPromoteIfPresent(async () => {
      throw new Error("must not call");
    }, { cuaRoot: "/tmp/cua", promoteSkill: "x" });
    expect(skip.applied).toBe(false);
  });
});
