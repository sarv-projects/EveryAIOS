/**
 * P59.16 — promote a verified CUA DAG to SKILL.md (I2).
 *
 * Fetched: Agent Skills spec (name + description required) —
 * https://agentskills.io/specification
 * Spec E.6: parameterized SKILL.md + postconditions. One-off traces do
 * not become the library until verify holds. Skills are not the orchestrator.
 */

export type HostRequest = (method: string, params?: unknown) => Promise<unknown>;

export function promoteSkillArgs(args: Record<string, unknown>): {
  name: string;
  description: string;
} | null {
  const raw = args.promoteSkill;
  if (raw === undefined || raw === false || raw === null) return null;
  if (typeof raw === "string") {
    const name = raw.trim();
    if (!name) return null;
    const description =
      typeof args.skillDescription === "string" && args.skillDescription.trim()
        ? args.skillDescription.trim()
        : name;
    return { name, description };
  }
  if (typeof raw === "object") {
    const o = raw as { name?: unknown; description?: unknown };
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return null;
    const description =
      typeof o.description === "string" && o.description.trim()
        ? o.description.trim()
        : name;
    return { name, description };
  }
  return null;
}

export async function applyCuaSkillPromoteIfPresent(
  request: HostRequest,
  args: Record<string, unknown>,
): Promise<{ applied: boolean; name?: string }> {
  const root = typeof args.cuaRoot === "string" ? args.cuaRoot : undefined;
  const skillRoot = typeof args.skillRoot === "string" ? args.skillRoot : undefined;
  const spec = promoteSkillArgs(args);
  if (!root || !skillRoot || !spec) return { applied: false };
  await request("execution/cua_promote_skill", {
    root,
    skillRoot,
    name: spec.name,
    description: spec.description,
  });
  return { applied: true, name: spec.name };
}
