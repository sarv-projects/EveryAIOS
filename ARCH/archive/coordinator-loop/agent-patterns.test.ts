import { describe, expect, it } from "bun:test";
import { classifyIntent, handlerFor } from "./intent";
import { parseMentions, resolveMentions, registerContextProvider } from "./context-providers";
import {
  applySearchReplace,
  parseApplyPatch,
} from "./edit-strategies";
import {
  decideMode,
  architectSplit,
  oracleChecks,
  detectPrematureStop,
  composePrompt,
  resolveModelAlias,
  applyDistro,
  findDistro,
  acpAuthMode,
} from "./agent-patterns";

describe("intent classification (P11.5.10)", () => {
  it("routes edit prompts to edit", () => {
    const i = classifyIntent("refactor the auth module and fix the bug in login.ts");
    expect(i.kind).toBe("edit");
    expect(i.confidence).toBeGreaterThan(0.4);
  });
  it("routes leading questions to ask", () => {
    const i = classifyIntent("what is the difference between a monad and a functor?");
    expect(i.kind).toBe("ask");
  });
  it("routes run/install to terminal", () => {
    const i = classifyIntent("run the test suite and show failures");
    expect(i.kind).toBe("terminal");
  });
  it("routes research/plan to agent", () => {
    const i = classifyIntent("research vector DBs and plan a migration for our search index");
    expect(i.kind).toBe("agent");
  });
  it("routes compile/lint to build", () => {
    const i = classifyIntent("fix the typecheck error in api.ts");
    expect(i.kind).toBe("build");
  });
  it("exposes a dispatch handler for every kind", () => {
    for (const k of ["agent", "edit", "ask", "terminal", "build"] as const) {
      expect(handlerFor(k).length).toBeGreaterThan(0);
    }
  });
  it("produces a deterministic rewrite", () => {
    const i = classifyIntent("Can you fix the bug?");
    expect(i.rewrite).toBe("fix the bug?");
  });
});

describe("context providers (P11.5.10)", () => {
  it("parses @mentions with and without queries", () => {
    const mentions = parseMentions('check @Codebase src/auth and @URL "https://example.com" for docs');
    expect(mentions.map((m) => m.id)).toContain("codebase");
    expect(mentions.map((m) => m.id)).toContain("url");
    const cb = mentions.find((m) => m.id === "codebase")!;
    expect(cb.query).toBe("src/auth");
    const url = mentions.find((m) => m.id === "url");
    expect(url?.query).toBe("https://example.com");
  });
  it("resolves registered providers and skips unregistered", async () => {
    registerContextProvider("codebase", async (q) => ({
      provider: "codebase",
      query: q,
      content: `symbols for ${q}`,
      tokens: 4,
    }));
    const { payloads } = await resolveMentions("@Codebase src", new Map());
    // resolveMentions with an explicit (empty) map — provider not registered
    expect(payloads.length).toBe(0);
  });
  it("resolves via the default registry", async () => {
    registerContextProvider("docs", async (q) => ({
      provider: "docs",
      query: q,
      content: `docs: ${q}`,
      tokens: 3,
    }));
    const { payloads, mentions } = await resolveMentions("@Docs oauth");
    expect(mentions.length).toBe(1);
    expect(payloads[0]?.content).toBe("docs: oauth");
  });
});

describe("edit strategies (P11.5.9)", () => {
  it("exact SEARCH/REPLACE", () => {
    const r = applySearchReplace("const a = 1;\nconst b = 2;\n", "const b = 2;", "const b = 3;");
    expect(r.ok).toBe(true);
    expect(r.result).toBe("const a = 1;\nconst b = 3;\n");
  });
  it("whitespace-flex match (indent-insensitive)", () => {
    const r = applySearchReplace("  const a = 1;\n    const b = 2;\n", "const b = 2;", "const b = 3;");
    expect(r.ok).toBe(true);
  });
  it("ellipsis wildcard matches middle", () => {
    const src = "fn main() {\n  setup();\n  teardown();\n}\n";
    const r = applySearchReplace(src, "fn main() {\n...\n}\n", "fn main() { /* rewritten */ }\n");
    expect(r.ok).toBe(true);
    expect(r.result).toContain("/* rewritten */");
  });
  it("refuses when the search block is absent", () => {
    const r = applySearchReplace("nothing here", "zzz_missing_block_zzz", "x");
    expect(r.ok).toBe(false);
  });
  it("parses ApplyPatch add/update/delete", () => {
    const doc = [
      "*** Add File: new.ts",
      "export const x = 1;",
      "",
      "*** Update File: old.ts",
      "export const y = 2;",
      "",
      "*** Delete File: gone.ts",
      "",
    ].join("\n");
    const { ops, errors } = parseApplyPatch(doc);
    expect(errors).toEqual([]);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({ op: "add", path: "new.ts" });
    expect(ops[1]).toMatchObject({ op: "update", path: "old.ts" });
    expect(ops[2]).toMatchObject({ op: "delete", path: "gone.ts" });
  });
  it("reports no-blocks error", () => {
    const { ops, errors } = parseApplyPatch("just some text");
    expect(ops).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("agent patterns (P11.5.10)", () => {
  it("Plan/Act: explicitPlan enters plan mode", () => {
    const d = decideMode("build the thing", { explicitPlan: true });
    expect(d.mode).toBe("plan");
    expect(d.planRequest).toContain("Plan first");
  });
  it("Plan/Act: plan signal without explicit flag", () => {
    const d = decideMode("plan the migration");
    expect(d.mode).toBe("plan");
  });
  it("architect two-pass splits prompts", () => {
    const a = architectSplit("add auth", { reasoningModel: "claude-sonnet", editorModel: "gpt-5-codex", reviewBeforeEdit: true });
    expect(a.reasoningPrompt).toContain("Do NOT edit");
    expect(a.editPrompt("the plan")).toContain("the plan");
  });
  it("oracle structural pre-checks", () => {
    expect(oracleChecks("a", "a").passed).toBe(true);
    expect(oracleChecks("a", "").passed).toBe(false);
  });
  it("autopilot: finish_reason length → premature", () => {
    const s = detectPrematureStop("here is the code: ```python\nx = 1", "length");
    expect(s.isPrematureStop).toBe(true);
  });
  it("autopilot: unbalanced fence detected", () => {
    expect(detectPrematureStop("```\nconst a = 1;").isPrematureStop).toBe(true);
  });
  it("autopilot: balanced output is not premature", () => {
    expect(detectPrematureStop("const a = 1;").isPrematureStop).toBe(false);
  });
  it("prompt TSX respects the token budget", () => {
    const prompt = composePrompt(
      [
        { kind: "text", text: "system: you are helpful" },
        { kind: "data", name: "facts", value: "x".repeat(400), capTokens: 50 },
        { kind: "data", name: "docs", value: "y".repeat(2000), capTokens: 400 },
      ],
      { maxTokens: 300, volatileFirst: true },
    );
    expect(prompt.length).toBeLessThan(300 * 4 + 200);
    expect(prompt).toContain("you are helpful");
  });
  it("MODEL_ALIASES resolution", () => {
    const r = resolveModelAlias("claude", { claude: "anthropic/claude-sonnet-4" }, "openai");
    expect(r).toMatchObject({ provider: "anthropic", model: "claude-sonnet-4", usedAlias: true });
    const bare = resolveModelAlias("gpt-5", {}, "openai");
    expect(bare).toMatchObject({ provider: "openai", model: "gpt-5" });
  });
  it("custom distribution merge (user wins)", () => {
    const distro = {
      id: "dev",
      displayName: "Dev",
      providers: ["openai", "anthropic"],
      aliases: { claude: "anthropic/claude-sonnet-4" },
      brand: {},
      skills: ["office"],
    };
    const merged = applyDistro(distro, {
      providers: ["ollama"],
      aliases: { claude: "ollama/qwen2.5:0.5b" },
    });
    expect(merged.providers).toContain("openai");
    expect(merged.aliases.claude).toBe("ollama/qwen2.5:0.5b"); // user wins
  });
  it("findDistro returns null for unknown", () => {
    expect(findDistro({ presets: [] }, "nope")).toBeNull();
  });
  it("ACP seam never harvests (doc 57)", () => {
    const a = acpAuthMode();
    expect(a.blocked).toContain("blocked");
  });
});
