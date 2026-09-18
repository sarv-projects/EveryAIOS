/**
 * P60.2 — vision-first perception fusion on the live turn.
 * Agent-S Worker always assigns the screenshot; a11y/DOM/OCR augment.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function layersFromToolArgs(args: Record<string, unknown>): Record<string, unknown> | undefined {
  const screenshotRef =
    (typeof args.screenshotRef === "string" && args.screenshotRef) ||
    (typeof args.screenshot === "string" && args.screenshot) ||
    undefined;
  if (!screenshotRef) return undefined;
  const layers: Record<string, unknown> = { screenshotRef };
  if (typeof args.a11y === "string") layers.a11y = args.a11y;
  if (typeof args.dom === "string") layers.dom = args.dom;
  if (typeof args.ocr === "string") layers.ocr = args.ocr;
  if (typeof args.api === "string") layers.api = args.api;
  return layers;
}

export async function applyCuaPerceiveIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean }> {
  const layers = layersFromToolArgs(args);
  if (!layers) return { applied: false };
  const params: Record<string, unknown> = { layers };
  if (typeof args.cuaRoot === "string") params.root = args.cuaRoot;
  if (typeof args.nodeId === "string") params.nodeId = args.nodeId;
  await request("execution/cua_perceive", params);
  return { applied: true };
}
