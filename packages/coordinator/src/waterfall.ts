/**
 * P30.11 — turn/step waterfalls + `next()` hooks (deepseek-harness pattern,
 * doc 83 §1): the coordinator turn loop's stage events become interceptable
 * waterfall hooks instead of fixed switch-cases. Each stage is a hook with
 * `next()` semantics — a hook may observe, short-circuit (return a result),
 * or rewrite the payload before the next stage runs.
 *
 * The default hooks are pass-through, so a loop that doesn't install hooks
 * behaves exactly as before; the pipeline is additive.
 */

export type WaterfallStage =
  | "preStep"
  | "preRequest"
  | "onStream"
  | "preExecute"
  | "postExecute"
  | "postStep";

export interface WaterfallContext {
  stage: WaterfallStage;
  streamId: string;
  [k: string]: unknown;
}

/** The `next()` continuation — call to pass control to the next hook. */
export type Next = (ctx: WaterfallContext) => Promise<WaterfallContext> | WaterfallContext;

export type WaterfallHook = (
  ctx: WaterfallContext,
  next: Next,
) => Promise<WaterfallContext> | WaterfallContext | void;

export interface WaterfallHooks {
  preStep?: WaterfallHook;
  preRequest?: WaterfallHook;
  onStream?: WaterfallHook;
  preExecute?: WaterfallHook;
  postExecute?: WaterfallHook;
  postStep?: WaterfallHook;
}

/** Identity continuation: returns the context unchanged. */
const passThrough: Next = (ctx) => ctx;

/**
 * Run a stage through the installed hooks in order. `next` chains the
 * remaining hooks; the last hook falls through to the pass-through. A hook
 * that returns `undefined` continues (next is always called for it by the
 * chain); a hook that returns a context short-circuits the rest.
 */
export async function runStage(
  stage: WaterfallStage,
  hooks: WaterfallHooks,
  ctx: WaterfallContext,
): Promise<WaterfallContext> {
  const chain: WaterfallHook[] = [
    ...(hooks.preStep && stage === "preStep" ? [hooks.preStep] : []),
    ...(hooks.preRequest && stage === "preRequest" ? [hooks.preRequest] : []),
    ...(hooks.onStream && stage === "onStream" ? [hooks.onStream] : []),
    ...(hooks.preExecute && stage === "preExecute" ? [hooks.preExecute] : []),
    ...(hooks.postExecute && stage === "postExecute" ? [hooks.postExecute] : []),
    ...(hooks.postStep && stage === "postStep" ? [hooks.postStep] : []),
  ];
  if (chain.length === 0) return ctx;

  const run = (i: number): Promise<WaterfallContext> => {
    const hook = chain[i]!;
    const next: Next = (c) => (i + 1 < chain.length ? run(i + 1) : Promise.resolve(passThrough(c)));
    return Promise.resolve(hook(ctx, next)).then((result) => {
      if (result === undefined) return next(ctx);
      return result;
    });
  };
  return run(0);
}

/**
 * Compose multiple hook sets into one (later sets run after earlier ones for
 * the same stage). Used to merge default + user + extension hooks.
 */
export function composeHooks(...sets: WaterfallHooks[]): WaterfallHooks {
  const out: WaterfallHooks = {};
  for (const stage of [
    "preStep",
    "preRequest",
    "onStream",
    "preExecute",
    "postExecute",
    "postStep",
  ] as WaterfallStage[]) {
    const hooks = sets.map((s) => s[stage]).filter((h): h is WaterfallHook => h !== undefined);
    if (hooks.length === 0) continue;
    out[stage] = async (ctx, next) => {
      const run = (i: number): Promise<WaterfallContext> => {
        const hook = hooks[i]!;
        const n: Next = (c) => (i + 1 < hooks.length ? run(i + 1) : Promise.resolve(next(c)));
        return Promise.resolve(hook(ctx, n)).then((result) => {
          if (result === undefined) return n(ctx);
          return result;
        });
      };
      return run(0);
    };
  }
  return out;
}
