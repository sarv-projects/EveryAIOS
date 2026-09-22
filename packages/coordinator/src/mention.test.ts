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
    const hits = extractMentions("hey @claude, can you review this? @codex too.");
    expect(hits.map((h) => h.handle)).toEqual(["claude", "codex"]);
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
    reg.register("mira", "claude-code");
    const plan = routeMention({ text: "@mira summarize this", source: "telegram", threadId: "t3" }, reg);
    expect(plan.opensSession).toBe(true);
    expect(plan.agentId).toBe("claude-code");
  });

  test("no built-in handle is seeded (ADR-0005)", () => {
    const seed = builtinMentionSeed();
    expect(seed.everyaios).toBeUndefined();
    // An @everyaios mention resolves to no agent and opens no session.
    const reg = new MentionRegistry(seed);
    const plan = routeMention({ text: "@everyaios do this", source: "slack", threadId: "t9" }, reg);
    expect(plan.opensSession).toBe(false);
    expect(plan.agentId).toBe("");
  });
});
