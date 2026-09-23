import { describe, expect, test } from "bun:test";
import { FIRST_CLASS_TOOLS, isFirstClassTool, mergeFirstClassTools } from "./first-class-tools";
import type { ListedTool } from "./tools";

const native: ListedTool = {
  id: "shell.exec",
  family: "shell",
  description: "Run a shell command",
  readOnly: false,
  operation: "exec",
  risk: "R2",
  argsSchema: { type: "object" },
};

describe("P30.4 first-class tools", () => {
  test("ships the four productized tools", () => {
    expect(FIRST_CLASS_TOOLS.map((t) => t.id).sort()).toEqual(["ask", "plan", "subagent", "todo"]);
    for (const t of FIRST_CLASS_TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.argsSchema).toBeDefined();
    }
  });

  test("merge adds only missing tools, stable order", () => {
    const merged = mergeFirstClassTools([native]);
    expect(merged.map((t) => t.id)).toEqual(["shell.exec", "ask", "plan", "subagent", "todo"]);
    // Idempotent: merging again adds nothing.
    const again = mergeFirstClassTools(merged);
    expect(again.length).toBe(merged.length);
  });

  test("isFirstClassTool discriminates", () => {
    expect(isFirstClassTool("ask")).toBe(true);
    expect(isFirstClassTool("shell.exec")).toBe(false);
  });
});
