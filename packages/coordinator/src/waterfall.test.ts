import { describe, expect, test } from "bun:test";
import { composeHooks, runStage, type WaterfallHooks } from "./waterfall";

const baseCtx = { stage: "preStep" as const, streamId: "s1" };

describe("P30.11 waterfall hooks", () => {
  test("no hooks → pass-through", async () => {
    const ctx = await runStage("preStep", {}, baseCtx);
    expect(ctx).toEqual(baseCtx);
  });

  test("hooks chain in order via next()", async () => {
    const order: string[] = [];
    const hooks: WaterfallHooks = {
      preStep: async (ctx, next) => {
        order.push("h1");
        const out = await next(ctx);
        order.push("h1-after");
        return out;
      },
    };
    await runStage("preStep", hooks, baseCtx);
    expect(order).toEqual(["h1", "h1-after"]);
  });

  test("a hook can short-circuit (return without next)", async () => {
    const out = await runStage(
      "preStep",
      { preStep: async (ctx) => ({ ...ctx, aborted: true }) },
      baseCtx,
    );
    expect(out.aborted).toBe(true);
  });

  test("composeHooks: a short-circuit skips later hooks", async () => {
    let laterRan = false;
    const a: WaterfallHooks = { preStep: async (ctx) => ({ ...ctx, aborted: true }) };
    const b: WaterfallHooks = {
      preStep: async (ctx, next) => {
        laterRan = true;
        return next(ctx);
      },
    };
    const merged = composeHooks(a, b);
    const out = await runStage("preStep", merged, baseCtx);
    expect(out.aborted).toBe(true);
    expect(laterRan).toBe(false);
  });

  test("a hook can rewrite the payload", async () => {
    const hooks: WaterfallHooks = {
      preStep: async (ctx, next) => next({ ...ctx, text: "rewritten" }),
    };
    const out = await runStage("preStep", hooks, baseCtx);
    expect(out.text).toBe("rewritten");
  });

  test("stage filtering: only the matching stage's hook runs", async () => {
    let preRan = 0;
    let execRan = 0;
    const hooks: WaterfallHooks = {
      preStep: async (ctx, next) => {
        preRan += 1;
        return next(ctx);
      },
      preExecute: async (ctx, next) => {
        execRan += 1;
        return next(ctx);
      },
    };
    await runStage("preStep", hooks, baseCtx);
    expect(preRan).toBe(1);
    expect(execRan).toBe(0);
  });

  test("composeHooks merges sets, later runs after earlier", async () => {
    const order: string[] = [];
    const a: WaterfallHooks = {
      preStep: async (ctx, next) => {
        order.push("a");
        return next(ctx);
      },
    };
    const b: WaterfallHooks = {
      preStep: async (ctx, next) => {
        order.push("b");
        return next(ctx);
      },
    };
    const merged = composeHooks(a, b);
    await runStage("preStep", merged, baseCtx);
    expect(order).toEqual(["a", "b"]);
  });
});
