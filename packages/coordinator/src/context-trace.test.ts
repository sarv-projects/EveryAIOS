import { describe, expect, test } from "bun:test";
import { ContextTrace, assertAllLogged, sha256Hex, verifyEntry } from "./context-trace";

describe("P30.8 model-visible-means-logged", () => {
  test("records blocks with content hashes", () => {
    const trace = new ContextTrace();
    trace.record("user", "<user>hi</user>");
    trace.record("system", "You are EveryAIOS.");
    expect(trace.count()).toBe(2);
    const e = trace.entriesFor("user")[0]!;
    expect(e.hash).toBe(sha256Hex("<user>hi</user>"));
    expect(e.tokens).toBeGreaterThan(0);
  });

  test("verifyEntry proves a block is present in the sent prompt", () => {
    const trace = new ContextTrace();
    trace.record("memory_warm_set", "<memory_warm_set>a</memory_warm_set>");
    const prompt = "sys\\n\\n<memory_warm_set>a</memory_warm_set>\\n<user>x</user>";
    expect(verifyEntry(trace, "memory_warm_set", "<memory_warm_set>a</memory_warm_set>", prompt)).toBe(true);
  });

  test("assertAllLogged flags a block dropped at send time", () => {
    const trace = new ContextTrace();
    trace.record("tool_index", "<tool_index>a</tool_index>");
    trace.record("user", "<user>q</user>");
    const prompt = "<user>q</user>"; // tool_index was dropped before sending
    const result = assertAllLogged(
      trace,
      [
        { source: "tool_index", content: "<tool_index>a</tool_index>" },
        { source: "user", content: "<user>q</user>" },
      ],
      prompt,
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("tool_index");
  });

  test("assertAllLogged passes when everything is present", () => {
    const trace = new ContextTrace();
    trace.record("system", "S");
    trace.record("user", "U");
    const prompt = "S\\nU";
    const result = assertAllLogged(
      trace,
      [
        { source: "system", content: "S" },
        { source: "user", content: "U" },
      ],
      prompt,
    );
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
