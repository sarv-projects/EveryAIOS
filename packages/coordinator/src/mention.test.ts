import { describe, expect, test } from "bun:test";
import {
  MentionRegistry,
  builtinMentionSeed,
  extractMentions,
  routeMention,
  stripMentions,
} from "./mention";

describe("P30.5 mention-driven sessions", () => {
  test("extracts handles, not sentence punctuation", () => {
    const hits = extractMentions("hey @claude, can you review this? @everyaios too.");
    expect(hits.map((h) => h.handle)).toEqual(["claude", "everyaios"]);
    // trailing comma is not part of the handle
    expect(hits[0]!.mention).toBe("@claude");
  });

  test("strips mentions, keeps the instruction", () => {
    expect(stripMentions("  @claude run the tests please  ")).toBe("run the tests please");
    expect(stripMentions("no mention here")).toBe("no mention here");
  });

  test("routes to the known agent's session", () => {
    const reg = new MentionRegistry(builtinMentionSeed());
    const plan = routeMention(
      { text: "@claude audit the dependencies", source: "slack", threadId: "t1" },
      reg,
    );
    expect(plan.opensSession).toBe(true);
    expect(plan.agentId).toBe("claude-code");
    expect(plan.instruction).toBe("audit the dependencies");
    expect(plan.sessionTitle).toContain("claude-code");
  });

  test("unknown mentions open no session", () => {
    const reg = new MentionRegistry(builtinMentionSeed());
    const plan = routeMention(
      { text: "@nobody please help", source: "email", threadId: "t2" },
      reg,
    );
    expect(plan.opensSession).toBe(false);
    expect(plan.agentId).toBe("");
  });

  test("registering a custom handle (P32.2 name-your-agent)", () => {
    const reg = new MentionRegistry(builtinMentionSeed());
    reg.register("mira", "everyaios-native");
    const plan = routeMention({ text: "@mira summarize this", source: "telegram", threadId: "t3" }, reg);
    expect(plan.opensSession).toBe(true);
    expect(plan.agentId).toBe("everyaios-native");
  });
});
