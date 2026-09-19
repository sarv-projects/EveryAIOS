// P64.7 — rollback contract tests.
//
// These drive the real restore path (`restoreCheckpointPaths` →
// `fsUndoRestore` → the Tauri bridge) with a stubbed `__TAURI_INTERNALS__`,
// so the per-file outcome, the audit receipt threading, and the fail-closed
// cases are all exercised rather than mocked away.

import { afterEach, describe, expect, test } from 'bun:test'
import {
  isMutatingToolId,
  needsGuardApproval,
  restoreCheckpointPaths,
  restoreFullyAudited,
  shortPath,
  snapshotsForSession,
} from './checkpoints'
import { setRuntimeState } from './runtime'
import type { FsUndo } from './fs'

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

function installShell(invoke: Invoke) {
  ;(globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: { invoke } }
}

function removeShell() {
  delete (globalThis as { window?: unknown }).window
}

afterEach(() => {
  removeShell()
  // A thrown bridge call marks the shared runtime state degraded (the honest
  // propagation the UI relies on). Reset it so this file cannot leak a
  // degraded runtime into other suites in the same process.
  setRuntimeState('preview')
})

describe('restoreCheckpointPaths — fail-closed boundaries', () => {
  test('rejects an empty path list (nothing to attempt)', async () => {
    installShell(async () => ({ ok: true, auditSeq: 1 }))
    await expect(restoreCheckpointPaths([])).rejects.toThrow(/Nothing to restore/)
  })

  test('rejects outside the desktop shell — a restore is never faked in preview', async () => {
    removeShell()
    await expect(restoreCheckpointPaths(['/a.txt'])).rejects.toThrow(/desktop app/)
  })
})

describe('restoreCheckpointPaths — per-file outcomes and audit receipts', () => {
  test('restores every file and threads the shell audit sequence', async () => {
    let n = 0
    installShell(async () => ({ ok: true, auditSeq: ++n }))
    const r = await restoreCheckpointPaths(['/a.txt', '/b.txt'])
    expect(r.restored).toEqual(['/a.txt', '/b.txt'])
    expect(r.failed).toEqual([])
    expect(r.receipts).toEqual([
      { path: '/a.txt', auditSeq: 1 },
      { path: '/b.txt', auditSeq: 2 },
    ])
    expect(restoreFullyAudited(r)).toBe(true)
  })

  test('a shell that does not confirm a file lands it in failed, not restored', async () => {
    installShell(async (_cmd, args) => {
      const path = (args?.path as string) ?? ''
      return path === '/ok.txt'
        ? { ok: true, auditSeq: 7 }
        : { ok: false, auditSeq: 0 }
    })
    const r = await restoreCheckpointPaths(['/ok.txt', '/bad.txt'])
    expect(r.restored).toEqual(['/ok.txt'])
    expect(r.failed.map((f) => f.path)).toEqual(['/bad.txt'])
    expect(r.receipts).toEqual([{ path: '/ok.txt', auditSeq: 7 }])
    // Every *restored* file is audited; the failure is reported separately.
    expect(restoreFullyAudited(r)).toBe(true)
  })

  test('a thrown bridge error becomes a failed file with the real message', async () => {
    installShell(async () => {
      throw new Error('Guard: restore needs an approval ticket')
    })
    const r = await restoreCheckpointPaths(['/x.txt'])
    expect(r.restored).toEqual([])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].error).toMatch(/approval ticket/)
    expect(restoreFullyAudited(r)).toBe(false)
  })

  test('a restore with no audit sequence is reported unverified, not audited', async () => {
    installShell(async () => ({ ok: true, auditSeq: 0 }))
    const r = await restoreCheckpointPaths(['/a.txt'])
    expect(r.restored).toEqual(['/a.txt'])
    expect(r.receipts).toEqual([{ path: '/a.txt', auditSeq: 0 }])
    expect(restoreFullyAudited(r)).toBe(false)
  })
})

describe('restoreFullyAudited', () => {
  test('false with nothing restored', () => {
    expect(restoreFullyAudited({ restored: [], receipts: [] })).toBe(false)
  })
  test('false when a restored file has no receipt', () => {
    expect(restoreFullyAudited({ restored: ['/a', '/b'], receipts: [{ path: '/a', auditSeq: 1 }] })).toBe(
      false,
    )
  })
})

describe('guard + derived helpers', () => {
  test('needsGuardApproval recognizes ticket/approval/policy failures only', () => {
    expect(needsGuardApproval('restore needs an approval ticket')).toBe(true)
    expect(needsGuardApproval('blocked by guard policy')).toBe(true)
    expect(needsGuardApproval('permission denied (403)')).toBe(true)
    expect(needsGuardApproval('file not found')).toBe(false)
    expect(needsGuardApproval('The shell did not confirm the restore.')).toBe(false)
  })

  test('snapshotsForSession filters by session and returns newest first', () => {
    const undos: FsUndo[] = [
      { index: 1, sessionId: 's1', path: '/a', beforeBytes: 1 },
      { index: 5, sessionId: 's1', path: '/b', beforeBytes: 2 },
      { index: 9, sessionId: 'other', path: '/c', beforeBytes: 3 },
    ]
    const mine = snapshotsForSession(undos, 's1')
    expect(mine.map((u) => u.index)).toEqual([5, 1])
  })

  test('shortPath returns the basename', () => {
    expect(shortPath('/home/u/proj/src/app.ts')).toBe('app.ts')
    expect(shortPath('README.md')).toBe('README.md')
  })

  test('isMutatingToolId separates reads from writes/edits', () => {
    expect(isMutatingToolId('fs.read')).toBe(false)
    expect(isMutatingToolId('office.read')).toBe(false)
    expect(isMutatingToolId('search')).toBe(false)
    expect(isMutatingToolId('fs.write')).toBe(true)
    expect(isMutatingToolId('file_ops.edit')).toBe(true)
    expect(isMutatingToolId('shell')).toBe(true)
    expect(isMutatingToolId('office.xlsx_edit')).toBe(true)
  })
})
