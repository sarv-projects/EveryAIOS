import { inTauri, invoke } from "./tauri";

/** LM Studio-style local picker row. */
export interface LocalModelRow {
  name: string;
  runtime: "ollama" | "llamafile" | string;
  provider: string;
  sizeBytes: number;
  contextWindow: number;
  fits: boolean;
  score: number;
  warnCtx: boolean;
  softCtx: boolean;
}

export async function listLocalModels(): Promise<{
  models: LocalModelRow[];
  ctxFloor: number;
  ctxSoft: number;
}> {
  if (!inTauri()) return { models: [], ctxFloor: 15_000, ctxSoft: 20_000 };
  return invoke("local_models");
}

export async function ensureLocal(runtime: string, model?: string): Promise<void> {
  await invoke("local_ensure", { runtime, model: model ?? null });
}
