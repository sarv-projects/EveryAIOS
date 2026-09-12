// P50.3.6 — model-routing resolver tests.
//
// The chat send path must never claim a provider/model it will not use:
// - auto-route on ⇒ undefined/undefined so the coordinator's live router
//   (observations-fed `selectModelForTask`) decides per turn;
// - an explicit local runtime always wins;
// - auto-route off ⇒ the static catalog mapping for the picked model.

import { describe, expect, test } from "bun:test";
import { resolveProviderModel } from "./model-routing";

describe("P50.3.6 — resolveProviderModel", () => {
  test("auto-route on leaves provider/model undefined so the live router decides", () => {
    const sel = resolveProviderModel({ modelId: "gpt-5", autoRoute: true });
    expect(sel.provider).toBeUndefined();
    expect(sel.model).toBeUndefined();
  });

  test("an explicit local runtime always wins over auto-route", () => {
    const sel = resolveProviderModel({
      modelId: "llama3",
      localRuntime: "ollama",
      autoRoute: true,
    });
    expect(sel.provider).toBe("ollama");
    expect(sel.model).toBe("llama3");
  });

  test("auto-route off maps the picked model through the static catalog", () => {
    const sel = resolveProviderModel({ modelId: "gpt-5", autoRoute: false });
    expect(sel.provider).toBe("openai");
    expect(sel.model).toBeDefined();
  });

  test("unknown model with auto-route off falls back honestly (no fake claim)", () => {
    const sel = resolveProviderModel({ modelId: "does-not-exist", autoRoute: false });
    // The static fallback pins nvidia; it is explicit and unchanged.
    expect(sel.provider).toBe("nvidia");
    expect(sel.model).toBe("does-not-exist");
  });

  // P58.7 — a live models.dev pick carries its provider, so the resolver must
  // never re-derive one from the model id (ids collide across aggregators).
  test("a catalog pick passes its provider straight through with the real model id", () => {
    const sel = resolveProviderModel({
      modelId: "claude-sonnet-4-5",
      modelProvider: "anthropic",
      autoRoute: false,
    });
    expect(sel.provider).toBe("anthropic");
    expect(sel.model).toBe("claude-sonnet-4-5");
  });

  test("a catalog pick beats the curated mapping for a colliding id", () => {
    // `gpt-5` is a curated id *and* a real catalog id on openrouter.
    const curated = resolveProviderModel({ modelId: "gpt-5", autoRoute: false });
    const catalog = resolveProviderModel({
      modelId: "gpt-5",
      modelProvider: "openrouter",
      autoRoute: false,
    });
    expect(curated.provider).toBe("openai");
    expect(catalog.provider).toBe("openrouter");
  });

  test("auto-route still wins over a stale catalog provider", () => {
    const sel = resolveProviderModel({
      modelId: "claude-sonnet-4-5",
      modelProvider: "anthropic",
      autoRoute: true,
    });
    expect(sel.provider).toBeUndefined();
    expect(sel.model).toBeUndefined();
  });

  test("an explicit local runtime still wins over a catalog provider", () => {
    const sel = resolveProviderModel({
      modelId: "llama3",
      modelProvider: "anthropic",
      localRuntime: "ollama",
      autoRoute: false,
    });
    expect(sel.provider).toBe("ollama");
    expect(sel.model).toBe("llama3");
  });
});
