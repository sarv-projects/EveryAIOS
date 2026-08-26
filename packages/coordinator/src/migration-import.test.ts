import { describe, expect, test } from "bun:test";
import {
  parseAgentInstructions,
  parseChatGptExport,
  parseClaudeExport,
  parseEditorMcpConfig,
  parseOpenClawExport,
  runMigration,
} from "./migration-import";

describe("P30.14 migration importer", () => {
  test("ChatGPT export → sessions with turns", () => {
    const doc = JSON.stringify([
      {
        id: "c1",
        title: "Q3 planning",
        mapping: {
          a: { message: { author: { role: "user" }, content: { parts: ["plan the quarter"] } } },
          b: { message: { author: { role: "assistant" }, content: { parts: ["here's a plan"] } } },
          c: { message: { author: { role: "system" }, content: { parts: ["ignored"] } } },
        },
      },
    ]);
    const sessions = parseChatGptExport(doc);
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
  });

  test("Claude JSONL → session", () => {
    const doc = [
      JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hello" }] } }),
      JSON.stringify({ type: "summary" }),
    ].join("\n");
    const sessions = parseClaudeExport(doc);
    expect(sessions[0]!.turns.length).toBe(2);
  });

  test("OpenClaw markdown → user turns per header", () => {
    const sessions = parseOpenClawExport("# Goal\nwrite a script\n## Step 1\ninstalled deps\n## Step 2\ndone");
    expect(sessions[0]!.turns.length).toBe(3);
  });

  test("agent instructions → skill with frontmatter stripped", () => {
    const skill = parseAgentInstructions(
      "CLAUDE.md",
      "---\nname: repo-helper\n---\n# Repo helper\nBe diff-first.",
    );
    expect(skill.name).toBe("CLAUDE");
    expect(skill.body).toContain("Be diff-first.");
    expect(skill.body).not.toContain("name: repo-helper");
  });

  test("editor/MCP config → registry entries", () => {
    const configs = parseEditorMcpConfig("mcp.json", JSON.stringify({ github: { url: "x" } }));
    expect(configs[0]!.key).toBe("mcp.github");
  });

  test("runMigration rejects bad input with a reason", () => {
    const result = runMigration("chatgpt", "conversations.json", "not json");
    expect(result.sessions.length).toBe(0);
    expect(result.rejected[0]!.reason).toContain("JSON");
  });
});
