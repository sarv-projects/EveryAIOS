/**
 * P51.28 — Crush/Zed: the model catalog omits skills with
 * `disable-model-invocation: true`. The user slash list still includes them.
 */

export interface SkillWarmRow {
  name: string;
  description: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
}

/** Lines injected below CACHE_BOUNDARY as `<skill_warm_set>`. */
export function filterModelWarmSkills(rows: SkillWarmRow[]): string[] {
  return rows
    .filter((s) => s.disableModelInvocation !== true)
    .map((s) => `${s.name}: ${s.description}`);
}

export function slashSkillNames(rows: SkillWarmRow[]): string[] {
  return rows
    .filter((s) => s.userInvocable === true || s.disableModelInvocation === true)
    .map((s) => s.name);
}
