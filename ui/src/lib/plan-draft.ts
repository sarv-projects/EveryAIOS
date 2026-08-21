/** Codex/Claude plan mode: decompose a goal into ordered tasks without executing. */

export interface DraftTask {
  id: string
  goal: string
  dependsOn?: string[]
}

export function draftPlanTasks(goal: string): DraftTask[] {
  const text = goal.trim()
  if (!text) return []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const itemized = lines
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)]|#{1,6})\s+/, '').trim())
    .filter((l) => l.length > 0)
  if (lines.length >= 2 && itemized.length >= 2) {
    return itemized.map((g, i) => ({
      id: `t${i + 1}`,
      goal: g,
      dependsOn: i > 0 ? [`t${i}`] : undefined,
    }))
  }
  const parts = text
    .split(/\s*(?:;|\bthen\b|\band then\b)\s+/i)
    .map((p) => p.replace(/^\s*(?:and\s+)?/i, '').trim())
    .filter((p) => p.length >= 8)
  if (parts.length >= 2) {
    return parts.map((g, i) => ({
      id: `t${i + 1}`,
      goal: g.replace(/[.]+$/, ''),
      dependsOn: i > 0 ? [`t${i}`] : undefined,
    }))
  }
  return [{ id: 't1', goal: text }]
}
