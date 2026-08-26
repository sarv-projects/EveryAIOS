import { describe, expect, test } from "bun:test";
import { GoalRegistry, parseGoalCommand } from "./goal";

describe("P30.13 /goal background goal", () => {
  test("parses /goal and goal: prefixes", () => {
    expect(parseGoalCommand("/goal write the quarterly report")).toEqual({
      isGoal: true,
      goal: "write the quarterly report",
    });
    expect(parseGoalCommand("goal: audit the repo")).toEqual({ isGoal: true, goal: "audit the repo" });
    expect(parseGoalCommand("hello there")).toEqual({ isGoal: false });
  });

  test("lifecycle: queued → running → pause(checkpoint) → resume → done", () => {
    const reg = new GoalRegistry(() => 1000);
    const g = reg.start("research competitors", "sess-1");
    expect(g.state).toBe("queued");
    reg.markRunning(g.id, "reading docs");
    expect(g.lastStage).toBe("reading docs");
    expect(reg.pause(g.id, "ckpt-7")).toBe(true);
    expect(g.state).toBe("paused");
    const resumed = reg.resume(g.id);
    expect(resumed?.checkpointId).toBe("ckpt-7");
    expect(g.state).toBe("running");
    expect(reg.finish(g.id, "done — 3 pages")).toBe(true);
    expect(g.state).toBe("done");
  });

  test("lost detection only from paused", () => {
    const reg = new GoalRegistry(() => 1000);
    const g = reg.start("x", "s1");
    reg.markRunning(g.id);
    expect(reg.markLost(g.id)).toBe(false); // running, not lost
    reg.pause(g.id, "c");
    expect(reg.markLost(g.id)).toBe(true);
    expect(g.state).toBe("lost");
  });

  test("activeCount and list order", () => {
    const reg = new GoalRegistry(() => 1000);
    reg.start("a", "s1");
    const b = reg.start("b", "s2");
    reg.finish(b.id, "done");
    expect(reg.activeCount()).toBe(1);
    expect(reg.list().length).toBe(2);
  });
});
