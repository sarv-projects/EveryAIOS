/**
 * P60.1 — five-way split. Harness, model, and role are independent.
 * No CLI-named subagent type.
 *
 * P71.9g — the harness is **required**: there is no `inbuilt` fallback to fill
 * an absent name. v1's engines are external agents (`ADR-0005`), so a bind that
 * names no harness fails closed (returns `null`) exactly as one that names no
 * model does, instead of silently selecting a built-in engine.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function runtimeBindFromToolArgs(args: Record<string, unknown>): {
  harness: string;
  model: string;
  role?: string;
  chief?: string;
  chiefModel?: string;
} | null {
  const model = typeof args.model === "string" ? args.model.trim() : "";
  if (!model) return null;
  const harness =
    typeof args.harness === "string" ? args.harness.trim() : "";
  // Fail closed: no harness named is not "the built-in one" (P71.9g).
  if (!harness) return null;
  const out: {
    harness: string;
    model: string;
    role?: string;
    chief?: string;
    chiefModel?: string;
  } = {
    harness,
    model,
  };
  if (typeof args.role === "string" && args.role.trim()) out.role = args.role.trim();
  if (typeof args.chief === "string" && args.chief.trim()) out.chief = args.chief.trim();
  if (typeof args.chiefModel === "string" && args.chiefModel.trim()) {
    out.chiefModel = args.chiefModel.trim();
  }
  return out;
}

export async function applyRuntimeBindIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean }> {
  const spec = runtimeBindFromToolArgs(args);
  if (!spec) return { applied: false };
  await request("execution/runtime_bind", spec);
  return { applied: true };
}
