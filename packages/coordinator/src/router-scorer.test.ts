/**
 * P36 / P0-5 — integration tests: `selectModelForTask` honors live
 * observations (excludes failed providers, health-gates the planner tier,
 * falls back to cost-sort when nothing is healthy). These import `./router`
 * + `./catalog`, so they need the APP workspace deps and run in CI (the pure
 * scorer math is locked by `./scorer.test.ts`, which runs anywhere).
 */
import { describe, expect, it } from "bun:test";
import { obsKey, selectModelForTask, type ProviderObservation } from "./router";
import { catalogModels } from "./catalog";

const obs = (p: string, m: string, o: Partial<ProviderObservation>): ProviderObservation => ({
  provider: p,
  model: m,
  ok: true,
  health: 1,
  cost: 0.5,
  latencyMs: 200,
  ...o,
});

describe("selectModelForTask with observations", () => {
  it("excludes a provider whose observation failed, even if it is the only listed one", () => {
    const observations: Record<string, ProviderObservation> = Object.fromEntries(
      catalogModels("nvidia").map((m) => [
        obsKey("nvidia", m.id),
        obs("nvidia", m.id, { ok: false, health: 0, cost: 0.1, latencyMs: 10 }),
      ]),
    );
    const sel = selectModelForTask({
      task: "chat",
      providers: ["nvidia", "openai"],
      observations,
    });
    expect(sel.provider).toBe("openai");
  });

  it("planner tier health-gates then picks the most capable healthy candidate", () => {
    const sel = selectModelForTask({
      task: "chat",
      providers: ["nvidia", "openai"],
      preferPowerful: true,
      observations: {
        [obsKey("openai", "gpt-4o")]: obs("openai", "gpt-4o", { health: 1, cost: 5, latencyMs: 500 }),
      },
    });
    expect(sel.provider).toBe("openai");
    expect(sel.model).toBe("gpt-4o");
    expect(sel.reason).toContain("health gate");
  });

  it("falls back to cost-sort when every observed candidate scored 0", () => {
    const sel = selectModelForTask({
      task: "chat",
      providers: ["nvidia"],
      observations: Object.fromEntries(
        catalogModels("nvidia").map((m) => [
          obsKey("nvidia", m.id),
          obs("nvidia", m.id, { ok: false, health: 0 }),
        ]),
      ),
    });
    // Never a crash: the turn still gets a model (cheapest nvidia default).
    expect(sel.provider).toBe("nvidia");
  });
});
