/**
 * P30.9 — profile/bundle config layering + **patch overlay** (deepseek-harness
 * `cordis.patch.yml` semantics, doc 83 §1): a user-local/team patch layer
 * above shipped blueprints + skills so `.md` specs stay patchable without
 * forking. The shipped doc is the base; the patch file (`.patch.yml`-class)
 * overlays keys; `null` deletes; nested objects merge.
 *
 * The parser is deliberately a minimal YAML-subset (flat `key: value` + one
 * level of indented nesting) — enough for spec patches, zero dependencies,
 * deterministic. Unknown/blank lines are preserved as comments.
 */

export type PatchValue = string | number | boolean | null | PatchMap;
export interface PatchMap {
  [key: string]: PatchValue;
}

/** Parse a patch document (YAML-subset) into a PatchMap. */
export function parsePatchDoc(doc: string): PatchMap {
  const out: PatchMap = {};
  let lastKey: string | null = null;
  for (const raw of doc.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      const parts = line.split(":");
      const key = parts[0] ?? "";
      const k = key.trim();
      const v = parts.slice(1).join(":").trim();
      if (!k) continue;
      if (v === "") {
        out[k] = {};
        lastKey = k;
      } else {
        out[k] = parseScalar(v);
        lastKey = null;
      }
    } else if (indent > 0 && lastKey) {
      // One level of nesting under the last top-level key.
      const parent = out[lastKey];
      if (parent && typeof parent === "object") {
        const parts = line.trim().split(":");
        const key = parts[0] ?? "";
        const k = key.trim();
        const v = parts.slice(1).join(":").trim();
        if (k) parent[k] = v === "" ? {} : parseScalar(v);
      }
    }
  }
  return out;
}

function parseScalar(v: string): PatchValue {
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (v !== "" && Number.isFinite(n)) return n;
  return v.replace(/^["']|["']$/g, "");
}

/**
 * Apply a patch to a base map:
 * - `null` value → delete the key.
 * - nested object → recursive merge.
 * - scalar → replace.
 * Returns a NEW map; the base is never mutated.
 */
export function applyPatch(base: PatchMap, patch: PatchMap): PatchMap {
  const out: PatchMap = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete out[k];
      continue;
    }
    const existing = out[k];
    if (isMap(v) && isMap(existing)) {
      out[k] = applyPatch(existing, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function isMap(v: unknown): v is PatchMap {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A layered spec: base (shipped) + optional user patch → effective.
 * Loading order is deterministic; a later patch wins over an earlier one.
 */
export class LayeredSpec {
  constructor(
    private base: PatchMap,
    private patches: PatchMap[] = [],
  ) {}

  addPatch(patch: PatchMap): void {
    this.patches.push(patch);
  }

  /** The effective spec after all patches. */
  effective(): PatchMap {
    let out = this.base;
    for (const p of this.patches) out = applyPatch(out, p);
    return out;
  }

  get<T extends PatchValue = PatchValue>(key: string): T | undefined {
    return this.effective()[key] as T | undefined;
  }
}
