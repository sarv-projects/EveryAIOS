/**
 * P59.8 — Progress/Kanban projection of the Computer-use DAG.
 *
 * Fetched (MACU arXiv:2606.01533): a manager DAG of subtasks with
 * `depends_on`, a ready frontier, and replan that mutates remaining nodes
 * only. This module is the **view**: layout + “may the user edit this node?”
 * The orchestrator (Rust `ComputerUseDag`) stays the authority.
 */

export type CuaStatus = 'pending' | 'ready' | 'running' | 'verified' | 'halted' | 'blocked'

export interface CuaDagNode {
  id: string
  name: string
  info?: string
  dependsOn: string[]
  status: CuaStatus
  lastAction?: string
  postconditions?: string[]
}

export interface CuaDag {
  runId: string
  workId: string
  nodes: CuaDagNode[]
  replanSeq: number
}

export interface CuaDagLayoutNode {
  id: string
  name: string
  status: CuaStatus
  depth: number
  indexInLayer: number
  x: number
  y: number
  editable: boolean
  dependsOn: string[]
}

export interface CuaDagLayout {
  nodes: CuaDagLayoutNode[]
  edges: Array<{ from: string; to: string }>
  replanSeq: number
  readyIds: string[]
}

/** Verified nodes are done — the user may only edit remaining steps (MACU). */
export function userMayEditRemaining(status: CuaStatus): boolean {
  return status !== 'verified'
}

function asStatus(v: unknown): CuaStatus {
  const s = typeof v === 'string' ? v : ''
  if (
    s === 'pending' ||
    s === 'ready' ||
    s === 'running' ||
    s === 'verified' ||
    s === 'halted' ||
    s === 'blocked'
  ) {
    return s
  }
  return 'pending'
}

/** Map the Rust serde (snake_case) DAG into the view model. Missing file → null. */
export function dagFromWire(raw: unknown): CuaDag | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const nodesRaw = Array.isArray(o.nodes) ? o.nodes : []
  const nodes: CuaDagNode[] = []
  for (const n of nodesRaw) {
    if (!n || typeof n !== 'object' || Array.isArray(n)) continue
    const r = n as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id : ''
    if (!id) continue
    const depends = Array.isArray(r.depends_on)
      ? r.depends_on
      : Array.isArray(r.dependsOn)
        ? r.dependsOn
        : []
    nodes.push({
      id,
      name: typeof r.name === 'string' ? r.name : id,
      info: typeof r.info === 'string' ? r.info : undefined,
      dependsOn: depends.filter((d): d is string => typeof d === 'string'),
      status: asStatus(r.status),
      lastAction:
        typeof r.last_action === 'string'
          ? r.last_action
          : typeof r.lastAction === 'string'
            ? r.lastAction
            : undefined,
    })
  }
  const runId = typeof o.run_id === 'string' ? o.run_id : typeof o.runId === 'string' ? o.runId : ''
  const workId = typeof o.work_id === 'string' ? o.work_id : typeof o.workId === 'string' ? o.workId : ''
  const replanSeq =
    typeof o.replan_seq === 'number'
      ? o.replan_seq
      : typeof o.replanSeq === 'number'
        ? o.replanSeq
        : 0
  return { runId, workId, nodes, replanSeq }
}

export function readyFrontier(dag: CuaDag): string[] {
  const byId = new Map(dag.nodes.map((n) => [n.id, n]))
  return dag.nodes
    .filter((n) => n.status === 'pending')
    .filter((n) =>
      n.dependsOn.every((d) => byId.get(d)?.status === 'verified'),
    )
    .map((n) => n.id)
}

/** Layered left-to-right layout: depth = 1 + max(dep depth), stable by id. */
export function layoutCuaDag(dag: CuaDag): CuaDagLayout {
  const byId = new Map(dag.nodes.map((n) => [n.id, n]))
  const depth = new Map<string, number>()
  const visit = (id: string, stack: Set<string>): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (stack.has(id)) return 0
    stack.add(id)
    const n = byId.get(id)
    const d = n && n.dependsOn.length > 0
      ? 1 + Math.max(0, ...n.dependsOn.map((p) => visit(p, stack)))
      : 0
    stack.delete(id)
    depth.set(id, d)
    return d
  }
  for (const n of dag.nodes) visit(n.id, new Set())
  const layers = new Map<number, CuaDagNode[]>()
  for (const n of [...dag.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    const d = depth.get(n.id) ?? 0
    const list = layers.get(d) ?? []
    list.push(n)
    layers.set(d, list)
  }
  const nodes: CuaDagLayoutNode[] = []
  const edges: Array<{ from: string; to: string }> = []
  for (const [d, list] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((n, i) => {
      nodes.push({
        id: n.id,
        name: n.name,
        status: n.status,
        depth: d,
        indexInLayer: i,
        x: d * 160,
        y: i * 56,
        editable: userMayEditRemaining(n.status),
        dependsOn: n.dependsOn,
      })
      for (const from of n.dependsOn) edges.push({ from, to: n.id })
    })
  }
  return { nodes, edges, replanSeq: dag.replanSeq, readyIds: readyFrontier(dag) }
}

/** Preview a remaining-node edit. Verified nodes are refused (not rewritten). */
export function previewRemainingEdit(
  dag: CuaDag,
  nodeId: string,
  patch: { name?: string; info?: string },
): CuaDag {
  const node = dag.nodes.find((n) => n.id === nodeId)
  if (!node) throw new Error(`unknown CUA node ${nodeId}`)
  if (!userMayEditRemaining(node.status)) {
    throw new Error('verified nodes cannot be edited — replan remaining only')
  }
  return {
    ...dag,
    replanSeq: dag.replanSeq + 1,
    nodes: dag.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, name: patch.name ?? n.name, info: patch.info ?? n.info }
        : n,
    ),
  }
}
