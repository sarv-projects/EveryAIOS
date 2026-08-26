import { describe, expect, it } from "bun:test";
import {
  foldFleetState,
  multiplex,
  pinAdapterVersion,
  planFleet,
  worktreeSpecs,
  type FleetMember,
} from "./fleet";

describe("planFleet + worktreeSpecs (B3/B4 isolation)", () => {
  it("gives every member an isolated worktree + branch", () => {
    const plan = planFleet(
      "/repo",
      [
        { agentId: "claude", task: "implement parser" },
        { agentId: "codex", task: "review + test" },
      ],
      "/worktrees",
      "r42",
    );
    expect(plan.members).toHaveLength(2);
    expect(plan.members[0]!.worktree).toBe("/worktrees/run-r42/agent-1-claude");
    expect(plan.members[1]!.worktree).toBe("/worktrees/run-r42/agent-2-codex");

    const specs = worktreeSpecs(plan);
    expect(specs[0]!.branch).toContain("fleet/");
    expect(specs[0]!.branch).not.toBe(specs[1]!.branch);
    expect(specs.every((s) => s.baseRepo === "/repo")).toBe(true);
  });
});

describe("multiplex (one view)", () => {
  it("fans N streams into one ordered tagged feed", () => {
    const members: FleetMember[] = [
      { agentId: "a", task: "t1", worktree: "w1" },
      { agentId: "b", task: "t2", worktree: "w2" },
    ];
    function* sA() {
      yield { kind: "started" as const, task: "t1", worktree: "w1" };
      yield { kind: "progress" as const, text: "parsing" };
      yield { kind: "done" as const, ok: true, summary: "ok" };
    }
    function* sB() {
      yield { kind: "started" as const, task: "t2", worktree: "w2" };
      yield { kind: "error" as const, message: "boom" };
    }
    const events = [...multiplex(members, [sA(), sB()])];
    expect(events[0]).toMatchObject({ agent: "a", kind: "started" });
    expect(events[3]).toMatchObject({ agent: "b", kind: "started" });
    expect(events[4]).toMatchObject({ agent: "b", kind: "error" });
  });

  it("folds into a per-agent status map", () => {
    const members: FleetMember[] = [
      { agentId: "a", task: "t1", worktree: "w1" },
      { agentId: "b", task: "t2", worktree: "w2" },
    ];
    function* sA() {
      yield { kind: "started" as const, task: "t1", worktree: "w1" };
      yield { kind: "done" as const, ok: true, summary: "ok" };
    }
    function* sB() {
      yield { kind: "started" as const, task: "t2", worktree: "w2" };
    }
    const state = foldFleetState([...multiplex(members, [sA(), sB()])]);
    expect(state.get("a")?.status).toBe("done");
    expect(state.get("b")?.status).toBe("running");
  });
});

describe("pinAdapterVersion (F8 auto-pinning)", () => {
  it("pins unpinned npx distributions", () => {
    expect(pinAdapterVersion("npx codex-acp", "1.2.3")).toBe("npx codex-acp@1.2.3");
  });

  it("refuses to float when no version is pinned", () => {
    expect(pinAdapterVersion("npx codex-acp")).toBeNull();
  });

  it("keeps already-versioned and non-npx distributions", () => {
    expect(pinAdapterVersion("npx pi-acp@0.9.0")).toBe("npx pi-acp@0.9.0");
    expect(pinAdapterVersion("uvx agent --stdio")).toBe("uvx agent --stdio");
  });
});
