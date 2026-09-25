'use client'

// The two inventory strips the run surface can honestly fill: the working
// folder's own listing, and the MCP server registry.
//
// Both sections appear **only** when a real command backs them:
//   • `fs_list_dir` over the working folder — real names, real sizes, real
//     mtimes. The caption says plainly that this is a folder listing, newest
//     first, and *not* a list of what this run produced (the produced files
//     live in the Files section above, which only names reported paths).
//   • `mcp_servers` — the attached/known server registry. Outside the desktop
//     shell that command answers with a demo fixture, so the section says the
//     registry is unreachable instead of printing invented servers.
//
// A section with no real backing is not rendered at all. An empty list that
// cannot be filled is a false claim of completeness.

import { useEffect, useState } from 'react'
import { Plug, PlugZap } from 'lucide-react'
import { inTauri } from '@/lib/tauri'
import { fsListDir } from '@/lib/fs'
import { mcpServers, type McpServerRow } from '@/lib/mcp'
import {
  ArtifactKindIcon,
  artifactKind,
  formatBytes,
} from '@/components/views/run-projection'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const RECENT_LIMIT = 8

export function RunFolderFiles({ workingDir }: { workingDir: string | null }) {
  const addView = useAppStore((s) => s.addView)
  const [rows, setRows] = useState<
    { name: string; size: number | null; modified: string | null; path: string }[]
  >([])

  useEffect(() => {
    // No folder attached ⇒ the section has nothing to show and says so rather
    // than listing the app's install directory.
    if (!workingDir || !inTauri()) {
      setRows([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const listing = await fsListDir(workingDir)
        if (cancelled) return
        if (!listing || !Array.isArray(listing.entries)) {
          setRows([])
          return
        }
        const files = listing.entries
          .filter((e) => !e.dir)
          .map((e) => ({
            name: e.name,
            size: e.size,
            modified: e.modified,
            path: `${workingDir.replace(/[\\/]+$/, '')}/${e.name}`,
          }))
        // Newest first. An entry with no mtime cannot be ordered, so it sorts
        // last rather than pretending to be the newest.
        files.sort((a, b) => {
          const at = a.modified ? Date.parse(a.modified) : Number.NaN
          const bt = b.modified ? Date.parse(b.modified) : Number.NaN
          if (Number.isNaN(at) && Number.isNaN(bt)) return a.name.localeCompare(b.name)
          if (Number.isNaN(at)) return 1
          if (Number.isNaN(bt)) return -1
          return bt - at
        })
        setRows(files.slice(0, RECENT_LIMIT))
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workingDir])

  if (!workingDir) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
        No folder is attached to this chat, so there is no listing to read.
      </p>
    )
  }

  return (
    <div data-testid="run-folder-files">
      <p className="mb-1.5 text-[9px] leading-relaxed text-muted-foreground">
        The working folder&rsquo;s own listing, newest first — a folder read, not a list of what this
        run produced.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground">
          {inTauri()
            ? 'No files in this folder.'
            : 'The folder listing is read from disk in the desktop app.'}
        </p>
      ) : (
        <>
          <ul className="space-y-0.5">
            {rows.map((r) => {
              const kind = artifactKind(r.name)
              return (
                <li
                  key={r.path}
                  className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-accent/40"
                >
                  <ArtifactKindIcon kind={kind} className="h-3 w-3 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/85">
                    {r.name}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/70">
                    {formatBytes(r.size) ?? '—'}
                  </span>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={() => addView('folder')}
            className="mt-1.5 inline-flex h-6 items-center rounded-md border border-border px-2 font-mono text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            Open the folder view
          </button>
        </>
      )}
    </div>
  )
}

export function RunMcpServers() {
  const [servers, setServers] = useState<McpServerRow[] | null>(null)
  const [reachable, setReachable] = useState(false)

  useEffect(() => {
    if (!inTauri()) {
      setReachable(false)
      setServers(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const rows = await mcpServers()
        if (cancelled) return
        // The IPC boundary is untrusted: a malformed payload is "unreadable",
        // never an empty-but-complete list.
        if (!Array.isArray(rows)) {
          setServers(null)
          setReachable(false)
          return
        }
        setServers(rows)
        setReachable(true)
      } catch {
        if (cancelled) return
        setServers(null)
        setReachable(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!inTauri()) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
        The MCP server registry is read from the desktop app; nothing is listed here.
      </p>
    )
  }

  if (!reachable) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
        The MCP server registry could not be read.
      </p>
    )
  }

  if ((servers ?? []).length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
        No MCP servers are configured on this machine.
      </p>
    )
  }

  return (
    <ul data-testid="run-mcp-servers" className="space-y-1">
      {(servers ?? []).map((s) => {
        const live = s.status === 'connected'
        return (
          <li
            key={s.name}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2 py-1.5',
              live ? 'border-border/60 bg-background/30' : 'border-dashed border-border/60',
            )}
          >
            {live ? (
              <PlugZap aria-hidden className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <Plug aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] text-foreground/90">{s.name}</span>
              <span className="block truncate font-mono text-[9px] tabular-nums text-muted-foreground/70">
                {live
                  ? `${s.transport} · ${s.tools} tool${s.tools === 1 ? '' : 's'} advertised`
                  : `${s.transport} · not connected`}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 rounded-full border px-1.5 py-px font-mono text-[8.5px] uppercase tracking-wide',
                live
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-border bg-background/40 text-muted-foreground',
              )}
            >
              {live ? 'connected' : 'disconnected'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
