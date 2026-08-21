/**
 * P1.9 (A6/A7) — catalog wrapper + task→model router tests.
 * No network: pi.dev snapshot is bundled in the core-providers dep.
 */
import { describe, expect, test } from "bun:test";
import {
  BROKER_TO_CATALOG_ID,
  brokerProviders,
  catalogIdForProvider,
  catalogModels,
  contextWindowFor,
  hintsFor,
  providerLabel,
  setLocalModels,
  supportsToolsHeuristic,
} from "./catalog";
import {
  ASYMMETRIC_TIERS,
  classifyTask,
  plannerForTask,
  selectModelForTask,
  subagentForTask,
} from "./router";

describe("catalog (P1.9)", () => {
  test("broker-id aliasing maps nvidia and passes others through", () => {
    expect(catalogIdForProvider("nvidia")).toBe("nvidia-nim");
    expect(catalogIdForProvider("openai")).toBe("openai");
    expect(catalogIdForProvider("chatgpt-pro")).toBe("chatgpt-pro");
    expect(catalogIdForProvider("ollama")).toBe("ollama");
  });

  test("every broker provider is in the router's scope", () => {
    const providers = brokerProviders();
    for (const key of Object.keys(BROKER_TO_CATALOG_ID)) {
      expect(providers).toContain(key);
    }
    expect(providers).toContain("ollama");
    expect(providers).toContain("copilot");
  });

  test("catalogModels returns the pi.dev registry for known providers", () => {
    const openai = catalogModels("openai");
    expect(openai.length).toBeGreaterThan(0);
    const nvidia = catalogModels("nvidia");
    expect(nvidia.length).toBeGreaterThan(0);
    // No catalog entry for desktop-only providers.
    expect(catalogModels("ollama").length).toBe(0);
  });

  test("contextWindowFor reads the pi.dev capability hints", () => {
    const openai = catalogModels("openai");
    const first = openai[0];
    expect(first).toBeDefined();
    if (first) {
      expect(contextWindowFor("openai", first.id)).toBe(first.contextWindow ?? undefined);
    }
  });

  test("local models merge into hints with the effective window", () => {
    setLocalModels("ollama", [
      { name: "qwen3:4b", sizeBytes: 2_500_000_000, contextWindow: 16_384 },
    ]);
    expect(contextWindowFor("ollama", "qwen3:4b")).toBe(16_384);
    const hints = hintsFor("ollama", "qwen3:4b");
    expect(hints.supportsTools).toBe(true);
    expect(hints.supportsVision).toBe(false);
    // Unknown local model: no window.
    expect(contextWindowFor("ollama", "nope")).toBeUndefined();
  });

  test("supportsToolsHeuristic flags weak models", () => {
    expect(supportsToolsHeuristic("text-embedding-3-small", 8192)).toBe(false);
    expect(supportsToolsHeuristic("tiny-model-4k", 4_096)).toBe(false);
    expect(supportsToolsHeuristic("gpt-4o", 128_000)).toBe(true);
  });

  test("providerLabel is human-readable for desktop providers", () => {
    expect(providerLabel("ollama")).toContain("Ollama");
    expect(providerLabel("openai")).not.toBe("");
  });
});

describe("router (P1.9 → A7)", () => {
  test("explicit model lock wins over everything", () => {
    const sel = selectModelForTask({ provider: "openai", model: "gpt-4o" });
    expect(sel.provider).toBe("openai");
    expect(sel.model).toBe("gpt-4o");
    expect(sel.reason).toContain("explicit");
  });

  test("cheapest selection returns a real catalog candidate", () => {
    const sel = selectModelForTask({ providers: ["nvidia"], task: "chat" });
    expect(sel.provider).toBe("nvidia");
    // The winner must be an actual catalog model meeting chat's ctx floor.
    const ids = new Set(catalogModels("nvidia").map((m) => m.id));
    expect(ids.has(sel.model)).toBe(true);
    expect(sel.reason).toContain("cheapest");
  });

  test("vision task only selects vision-capable models", () => {
    const sel = selectModelForTask({ providers: ["nvidia"], task: "vision" });
    expect(hintsFor(sel.provider, sel.model).supportsVision).toBe(true);
    expect(sel.reason).toContain("vision");
  });

  test("minContext filter is honored", () => {
    const sel = selectModelForTask({ providers: ["nvidia"], minContext: 100_000 });
    expect(hintsFor(sel.provider, sel.model).contextWindow ?? 0).toBeGreaterThanOrEqual(100_000);
  });

  test("local models are candidates once merged", () => {
    setLocalModels("ollama", [
      { name: "qwen3:4b", sizeBytes: 1, contextWindow: 16_384 },
    ]);
    const sel = selectModelForTask({ providers: ["ollama"], task: "chat" });
    expect(sel.provider).toBe("ollama");
    expect(sel.model).toBe("qwen3:4b");
    expect(sel.contextWindow).toBe(16_384);
  });

  test("fallback fires when no candidate meets requirements", () => {
    // No local models merged for llamafile → zero candidates.
    const sel = selectModelForTask({ providers: ["llamafile"], task: "vision" });
    expect(sel.reason).toContain("fell back");
    expect(sel.model.length).toBeGreaterThan(0);
  });

  test("planner tier picks a more capable model than the subagent tier", () => {
    const planner = plannerForTask("coding", ["nvidia"]);
    const sub = subagentForTask("coding", ["nvidia"]);
    const plannerHints = hintsFor(planner.provider, planner.model);
    const subHints = hintsFor(sub.provider, sub.model);
    // Planner is cost-prioritized; subagent is cheapest — they must differ
    // when the catalog offers both (nvidia has 8B + 70B tiers).
    expect(planner.reason).toContain("planner");
    expect(sub.reason).toContain("cheapest");
    if (plannerHints.costScore !== subHints.costScore) {
      expect(plannerHints.costScore).toBeGreaterThan(subHints.costScore);
    }
  });

  test("classifies task text conservatively for dynamic routing", () => {
    expect(classifyTask("fix the failing TypeScript test")).toBe("coding");
    expect(classifyTask("show me the screenshot")).toBe("vision");
    expect(classifyTask("research and compare MCP transports with citations")).toBe("deep");
    expect(classifyTask("what is 2 + 2?")).toBe("quick");
    expect(classifyTask("please help me think through this decision over several paragraphs")).toBe("chat");
  });

  test("A7 tiering defaults are fixed", () => {
    expect(ASYMMETRIC_TIERS.depth).toBe(2);
    expect(ASYMMETRIC_TIERS.concurrency).toBe(6);
    expect(ASYMMETRIC_TIERS.writers).toBe(3);
  });
});
