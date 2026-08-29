/**
 * P1.2 — smoke-import of `@personal-ai/core-providers` into the coordinator
 * sidecar. Proves the workspace dep resolves, its public surface is intact,
 * and its synchronous catalog functions behave — without any network call
 * (validateApiKey/streamCompletion stay uncalled on purpose).
 *
 * The dep is a pnpm workspace link to the vendored `packages/core-providers`
 * (copied in from the reference APP repo — this repo is self-contained).
 */
import { describe, expect, test } from "bun:test";
import {
  AI_PROVIDER_GROUPS,
  ANTHROPIC_KNOWN_MODELS,
  PROVIDER_CATALOG,
  ProviderVault,
  fetchAvailableModels,
  fetchProviderPricing,
  filterProvidersBySection,
  formatPricingLine,
  getModelsForProvider,
  getProviderById,
  getRecommendedProviders,
  modelSupportsReasoning,
  modelSupportsVision,
  streamAnthropicCompletion,
  streamCompletion,
  validateAnthropicApiKey,
  validateApiKey,
} from "@personal-ai/core-providers";

describe("core-providers smoke-import (APP workspace dep)", () => {
  test("module resolves and the catalog is populated", () => {
    expect(PROVIDER_CATALOG.length).toBeGreaterThan(0);
    expect(AI_PROVIDER_GROUPS.length).toBeGreaterThan(0);
  });

  test("every provider the desktop broker targets is in the catalog", () => {
    // Mirror of everyaios-vault broker.rs DEFAULT_BASE_URLS. Known id drift
    // (documented 2026-08-10): the broker's provider key is "nvidia" while
    // the APP catalog id is "nvidia-nim" — SAME base URL
    // (https://integrate.api.nvidia.com/v1), different identifiers. If the
    // catalog id is ever renamed to "nvidia", drop the alias below.
    const brokerKeyToCatalogId: Record<string, string> = {
      nvidia: "nvidia-nim",
      openai: "openai",
      anthropic: "anthropic",
      deepseek: "deepseek",
      groq: "groq",
    };
    for (const [brokerKey, catalogId] of Object.entries(brokerKeyToCatalogId)) {
      const entry = getProviderById(catalogId);
      expect(entry, `catalog entry for broker key ${brokerKey}`).toBeDefined();
    }
  });

  test("getProviderById finds a provider and returns undefined for junk", () => {
    const openai = getProviderById("openai");
    expect(openai).toBeDefined();
    expect(openai!.id).toBe("openai");
    expect(getProviderById("definitely-not-a-provider")).toBeUndefined();
  });

  test("selector helpers return shaped results without I/O", () => {
    expect(getRecommendedProviders().length).toBeGreaterThan(0);
    const openai = getProviderById("openai");
    expect(openai).toBeDefined();
    // ProviderGroup is a string-literal union from @personal-ai/core-domain;
    // the entry's group must be a member of the AI groups array.
    expect(AI_PROVIDER_GROUPS.includes(openai!.group)).toBe(true);
    expect(openai!.groupLabel.length).toBeGreaterThan(0);
    const aiSection = filterProvidersBySection("ai");
    expect(aiSection.length).toBeGreaterThan(0);
    const models = getModelsForProvider("openai");
    expect(Array.isArray(models)).toBe(true);
  });

  test("every documented value export is present and correctly typed", () => {
    // Functions exist (and are not called — no network).
    expect(typeof streamCompletion).toBe("function");
    expect(typeof fetchAvailableModels).toBe("function");
    expect(typeof validateApiKey).toBe("function");
    expect(typeof streamAnthropicCompletion).toBe("function");
    expect(typeof validateAnthropicApiKey).toBe("function");
    expect(typeof fetchProviderPricing).toBe("function");
    expect(typeof formatPricingLine).toBe("function");
    expect(typeof modelSupportsVision).toBe("function");
    expect(typeof modelSupportsReasoning).toBe("function");
    // Class export.
    expect(typeof ProviderVault).toBe("function");
    // Constants.
    expect(ANTHROPIC_KNOWN_MODELS.length).toBeGreaterThan(0);
  });
});
