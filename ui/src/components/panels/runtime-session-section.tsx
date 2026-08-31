'use client'

import { useCallback, useEffect, useState } from 'react'
import { Terminal, GitBranch, Bot, RefreshCw, Play, OctagonX, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionShell } from './settings-shared'
import { useAppStore } from '@/lib/store'
import {
  workList,
  workAgentSessions,
  workPtySnapshot,
  workPtySpawn,
  workPtyClose,
  workAgentSpawn,
  workAgentOp,
  workWorktreeCreate,
  workWorktreeOp,
  type AgentSession,
  type PtySession,
  type WorkAddress,
} from '@/lib/work'

/**
 * P49.10–12 — Session Runtime panel. Live view + control of the runtime the
 * agent (and the human) drive: persistent PTYs (external agent CLIs),
 * Run-owned worktrees, and agent sessions (ephemeral child vs persistent
 * attached). The gateway owns the durable state; this panel calls the
 * `work_*` commands and shows what is running.
 */
export function RuntimeSessionSection() {
  const notify = useAppStore((s) => s.notify)
  const [works, setWorks] = useState<WorkAddress[]>([])
  const [workId, setWorkId] = useState<string>('')
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [pty, setPty] = useState<PtySession | null>(null)
  const [busy, setBusy] = useState(false)
  const [ptyId, setPtyId] = useState('agent-cli')
  const [wtBranch, setWtBranch] = useState('agent/worktree-1')

  const refresh = useCallback(async (id: string) => {
    if (!id) return
    try {
      setSessions(await workAgentSessions(id))
    } catch (e) {
      notify(String(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void (async () => {
      const w = await workList()
      setWorks(w)
      if (w.length && !workId) {
        setWorkId(w[0].workId)
        void refresh(w[0].workId)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function spawnPty() {
    if (!workId) return
    setBusy(true)
    try {
      await workPtySpawn(workId, ptyId, 24, 80)
      setPty(await workPtySnapshot(ptyId))
      notify(`PTY ${ptyId} spawned (persistent — survives client disconnect)`)
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function closePty() {
    if (!workId) return
    setBusy(true)
    try { await workPtyClose(workId, ptyId, 0); setPty(await workPtySnapshot(ptyId)) }
    catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function createWorktree() {
    if (!workId) return
    setBusy(true)
    try {
      await workWorktreeCreate({
        workId, runId: 'run-1', worktreeId: wtBranch, repoRoot: '.',
        worktreeRoot: `.worktrees/${wtBranch}`, baseRevision: 'HEAD', branch: wtBranch,
      })
      notify(`Worktree ${wtBranch} created — owned by the Run, not the agent`)
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function spawnAgent(lifetime: 'ephemeral' | 'persistent') {
    if (!workId) return
    setBusy(true)
    try {
      const asid = `agent-${Date.now().toString(36)}`
      await workAgentSpawn({ workId, runId: 'run-1', agentSessionId: asid, agentId: 'claude-code', lifetime })
      await refresh(workId)
      notify(`${lifetime} agent session ${asid} spawned`)
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function agentOp(id: string, op: 'attach' | 'detach' | 'checkpoint' | 'terminate') {
    if (!workId) return
    setBusy(true)
    try { await workAgentOp(workId, id, op); await refresh(workId) }
    catch (e) { notify(String(e)) } finally { setBusy(false) }
  }

  return (
    <SectionShell
      title="Session runtime"
      desc="Persistent PTYs, Run-owned worktrees, and agent sessions — the durable runtime the agent and you both drive (survives client disconnect)."
    >
      <div className="space-y-4">
        {/* Work selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Work</label>
          <select
            value={workId}
            onChange={(e) => { setWorkId(e.target.value); void refresh(e.target.value) }}
            className="h-8 flex-1 rounded border border-border bg-background px-2 text-xs"
          >
            {works.length === 0 && <option value="">no active work</option>}
            {works.map((w) => (
              <option key={w.workId} value={w.workId}>{w.workId}</option>
            ))}
          </select>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void refresh(workId)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {!workId && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Start a Work (send a message) to drive the session runtime.
          </div>
        )}

        {/* PTY (P49.10) */}
        <div className="rounded-lg border border-border/50 bg-background/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Terminal className="h-3.5 w-3.5 text-orange-400" /> Persistent PTY
          </div>
          <div className="flex items-center gap-2">
            <Input value={ptyId} onChange={(e) => setPtyId(e.target.value)} className="h-7 w-40 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !workId} onClick={spawnPty}>
              <Play className="h-3 w-3" /> Spawn
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-400" disabled={busy || !workId} onClick={closePty}>
              <OctagonX className="h-3 w-3" /> Close
            </Button>
            {pty && <Badge variant="outline" className="text-[9px]">{pty.state}</Badge>}
          </div>
          {pty?.output && (
            <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-900/60 p-2 font-mono text-[10px] text-emerald-300">{pty.output}</pre>
          )}
        </div>

        {/* Worktree (P49.11) */}
        <div className="rounded-lg border border-border/50 bg-background/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <GitBranch className="h-3.5 w-3.5 text-sky-400" /> Run-owned worktree
          </div>
          <div className="flex items-center gap-2">
            <Input value={wtBranch} onChange={(e) => setWtBranch(e.target.value)} className="h-7 w-48 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !workId} onClick={createWorktree}>
              <Layers className="h-3 w-3" /> Create
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy || !workId} onClick={() => void workWorktreeOp(workId, wtBranch, 'merge', 'main').then(() => notify('merged')).catch((e) => notify(String(e)))}>
              Merge → main
            </Button>
          </div>
        </div>

        {/* Agent sessions (P49.12) */}
        <div className="rounded-lg border border-border/50 bg-background/30 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Bot className="h-3.5 w-3.5 text-violet-400" /> Agent sessions
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy || !workId} onClick={() => spawnAgent('ephemeral')}>+ ephemeral</Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy || !workId} onClick={() => spawnAgent('persistent')}>+ persistent</Button>
            </div>
          </div>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-muted-foreground">No agent sessions</div>
            ) : (
              sessions.map((a) => (
                <div key={a.agentSessionId} className="flex items-center gap-2 rounded px-1.5 py-1 text-[10px] hover:bg-accent/40">
                  <Bot className="h-3 w-3 text-violet-400" />
                  <span className="font-mono text-foreground">{a.agentId}</span>
                  <Badge variant="secondary" className="text-[8px]">{a.lifetime.replace('_attached_session', '')}</Badge>
                  <Badge variant="outline" className="text-[8px]">{a.runtimeState}</Badge>
                  {a.attached && <span className="text-emerald-400">● attached</span>}
                  <div className="ml-auto flex gap-1">
                    {a.attached
                      ? <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => agentOp(a.agentSessionId, 'detach')}>detach</button>
                      : <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => agentOp(a.agentSessionId, 'attach')}>attach</button>}
                    <button className="text-[9px] text-muted-foreground hover:text-foreground" onClick={() => agentOp(a.agentSessionId, 'checkpoint')}>checkpoint</button>
                    <button className="text-[9px] text-red-400/70 hover:text-red-400" onClick={() => agentOp(a.agentSessionId, 'terminate')}>terminate</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          The Run owns the PTY + worktree, not the agent — an ephemeral child dies on detach, a
          persistent session survives + re-attaches. The agent loop drives the same gateway over
          <code className="font-mono"> work/*</code> RPC.
        </p>
      </div>
    </SectionShell>
  )
}
