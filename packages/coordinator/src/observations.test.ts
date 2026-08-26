import { describe, expect, test } from "bun:test";
import {
  currentObservations,
  hydrateObservations,
  recordObservation,
  resetObservations,
  type DurableUsageRow,
} from "./observations";

describe("observations — durable ledger hydration (ARCH/05 seam)", () => {
  test("hydrates provider/model keys from the vault ledger", () => {
    resetObservations();
    const rows: DurableUsageRow[] = [
      { tsMs: 1, provider: "openai", model: "gpt-4o", inTokens: 1000, outTokens: 500, cacheRead: 0, cacheWrite: 0, cost: 0.002 },
      { tsMs: 2, provider: "deepseek", model: "deepseek-chat", inTokens: 200, outTokens: 100, cacheRead: 0, cacheWrite: 0, cost: 0.0001 },
    ];
    expect(hydrateObservations(rows)).toBe(2);
    const obs = currentObservations();
    expect(obs["openai:gpt-4o"]).toBeDefined();
    expect(obs["deepseek:deepseek-chat"]).toBeDefined();
    // Ledger rows are successes with 0 latency (unknown) + converted cost.
    expect(obs["openai:gpt-4o"]!.ok).toBe(true);
    expect(obs["openai:gpt-4o"]!.latencyMs).toBe(0);
    // cost conversion: $0.002 / 1500 tokens * 1000 = $1.3333e-3 per 1K
    expect(obs["openai:gpt-4o"]!.cost).toBeCloseTo(0.002 / 1500 * 1000, 8);
  });

  test("live keys win — ledger rows do not overwrite this process's observations", () => {
    resetObservations();
    recordObservation("openai", "gpt-4o", { ok: false, latencyMs: 900, costScore: 2500 });
    const rows: DurableUsageRow[] = [
      { tsMs: 9, provider: "openai", model: "gpt-4o", inTokens: 100, outTokens: 10, cacheRead: 0, cacheWrite: 0, cost: 0.001 },
    ];
    expect(hydrateObservations(rows)).toBe(0); // openai:gpt-4o untouched
    const obs = currentObservations();
    expect(obs["openai:gpt-4o"]!.ok).toBe(false); // live failure preserved
    expect(obs["openai:gpt-4o"]!.latencyMs).toBe(900);
  });

  test("cap per key — ledger rows seed up to MAX_PER_KEY, newest kept", () => {
    resetObservations();
    const rows: DurableUsageRow[] = Array.from({ length: 20 }, (_, i) => ({
      tsMs: i,
      provider: "openai",
      model: "gpt-4o",
      inTokens: 1,
      outTokens: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.0001,
    }));
    expect(hydrateObservations(rows)).toBe(5); // MAX_PER_KEY
    expect(currentObservations()["openai:gpt-4o"]!.health).toBe(1);
  });

  test("empty/malformed rows are skipped", () => {
    resetObservations();
    expect(
      hydrateObservations([
        { tsMs: 1, provider: "", model: "gpt-4o", inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
        { tsMs: 2, provider: "openai", model: "", inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      ]),
    ).toBe(0);
    expect(currentObservations()).toEqual({});
  });
});