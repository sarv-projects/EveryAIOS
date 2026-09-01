import { inTauri, invoke } from "./tauri";
import { nativeCall } from './runtime';

/** Installed runtime row (ollama / llamafile) with hwfit badges. */
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

export interface HardwareProfile {
  ram_bytes?: number;
  ramBytes?: number;
  cpu_cores?: number;
  cpuCores?: number;
  gpu?: string;
}

export interface HubModel {
  id: string;
  downloads: number;
  likes: number;
  lastModified: string;
  pipelineTag: string;
  tags: string[];
  private: boolean;
}

export interface HubFile {
  path: string;
  size: number;
  type: string;
}

export interface LocalPrefs {
  guardrails: boolean;
  kvOffload: boolean;
  startOnLogin: boolean;
}

const HF = "https://huggingface.co/api/models";
const PREFS_KEY = "everyaios.local.prefs";

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${n} B`;
}

export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function relativeUpdated(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const days = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function quantFromPath(path: string): string {
  const upper = path.toUpperCase();
  for (const tag of [
    "Q8_0",
    "Q6_K",
    "Q5_K_M",
    "Q5_K_S",
    "Q4_K_M",
    "Q4_K_S",
    "Q4_0",
    "Q3_K_M",
    "IQ4_XS",
    "F16",
    "BF16",
  ]) {
    if (upper.includes(tag)) return tag;
  }
  return path.split("/").pop() ?? path;
}

export function ramBytes(hw: HardwareProfile | null): number {
  return hw?.ram_bytes ?? hw?.ramBytes ?? 0;
}

export function cpuCores(hw: HardwareProfile | null): number {
  return hw?.cpu_cores ?? hw?.cpuCores ?? 0;
}

type HubSort = "downloads" | "likes" | "lastModified";

/** Live Hugging Face Hub — no baked model names. */
export async function searchHub(
  query: string,
  sort: HubSort = "downloads",
  limit = 40,
): Promise<HubModel[]> {
  const params = new URLSearchParams({
    filter: "gguf",
    sort,
    direction: "-1",
    limit: String(limit),
  });
  const q = query.trim();
  if (q) params.set("search", q);
  const res = await fetch(`${HF}?${params.toString()}`);
  if (!res.ok) throw new Error(`Hugging Face Hub ${res.status}`);
  const rows = (await res.json()) as Array<{
    id: string;
    downloads?: number;
    likes?: number;
    lastModified?: string;
    pipeline_tag?: string;
    tags?: string[];
    private?: boolean;
  }>;
  return rows.map((m) => ({
    id: m.id,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    lastModified: m.lastModified ?? "",
    pipelineTag: m.pipeline_tag ?? "",
    tags: m.tags ?? [],
    private: m.private ?? false,
  }));
}

export async function listHubFiles(repo: string): Promise<HubFile[]> {
  const res = await fetch(`${HF}/${encodeURIComponent(repo)}/tree/main`);
  if (!res.ok) throw new Error(`Hugging Face tree ${res.status}`);
  const rows = (await res.json()) as Array<{ path?: string; size?: number; type?: string }>;
  return rows
    .filter((r) => (r.path ?? "").toLowerCase().endsWith(".gguf") || (r.path ?? "").toLowerCase().endsWith(".safetensors"))
    .map((r) => ({
      path: r.path ?? "",
      size: r.size ?? 0,
      type: r.type ?? "file",
    }));
}

export function hubCaps(m: HubModel) {
  const t = m.tags.map((x) => x.toLowerCase());
  return {
    vision: t.some((x) => x.includes("vision") || x.includes("image")),
    toolUse: t.some((x) => x.includes("tool") || x.includes("function")),
    reasoning: t.some((x) => x.includes("reason") || x.includes("r1")),
    gguf: t.some((x) => x.includes("gguf")),
    mlx: t.some((x) => x.includes("mlx")),
  };
}

export async function listLocalModels(): Promise<{
  models: LocalModelRow[];
  ctxFloor: number;
  ctxSoft: number;
  hardware?: HardwareProfile;
}> {
  if (!inTauri()) return { models: [], ctxFloor: 15_000, ctxSoft: 20_000 };
  return nativeCall('local model inventory', () => invoke("local_models"));
}

export async function ensureLocal(runtime: string, model?: string): Promise<void> {
  await nativeCall('local runtime ensure', () => invoke("local_ensure", { runtime, model: model ?? null }));
}

export async function getHardware(): Promise<HardwareProfile | null> {
  if (!inTauri()) return null;
  return nativeCall('hardware profile', () => invoke("local_hardware"));
}

export function getLocalPrefs(): LocalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...{ guardrails: false, kvOffload: true, startOnLogin: true }, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { guardrails: false, kvOffload: true, startOnLogin: true };
}

export function setLocalPrefs(prefs: LocalPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}
