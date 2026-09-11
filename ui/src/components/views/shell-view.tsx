'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Plus, Square, X, ChevronDown, Eye, EyeOff, ShieldAlert } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'
import { useTheme } from '@/components/theme-provider'
import {
  backendLabel,
  decodeChunk,
  onTerminalEvent,
  terminalConfirmUnsafe,
  terminalKill,
  terminalProfiles,
  terminalResize,
  terminalSetDefault,
  terminalSpawn,
  terminalStatus,
  terminalWrite,
  type TerminalProfile,
  type TerminalProfilesResponse,
} from '@/lib/terminal'

interface Tab {
  id: string
  profileName: string
  backend: TerminalProfile['backend']
  ptyId: string | null
  exitCode: number | null
  error: string | null
}

interface TermHandle {
  term: Terminal
  fit: FitAddon
  observer: ResizeObserver
}

/**
 * H36 (P54) — profile-backed terminal. The `+` dropdown lists the profiles
 * Rust actually detected on this machine (PowerShell, cmd, Git Bash, each WSL
 * distro, `$SHELL`/`/etc/shells` entries) — never a hardcoded two-shell list.
 * Rendering is xterm.js over raw PTY bytes, so full-screen TUI apps work and
 * resize reaches the child process. Sessions live in the shell: switching tabs
 * or unmounting this view does not kill them.
 *
 * Splits are not implemented yet (TODO P54.4 keeps that part open); tabs are.
 */
export default function ShellView() {
  const { theme } = useTheme()
  const [registry, setRegistry] = useState<TerminalProfilesResponse | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [interactive, setInteractive] = useState(true)

  const terms = useRef<Map<string, TermHandle>>(new Map())
  /** tabId → live ptyId, readable from the xterm `onData` closure (which is
   * registered once, at mount, before the spawn resolves). */
  const ptyRef = useRef<Map<string, string>>(new Map())
  const tabsRef = useRef<Tab[]>([])
  tabsRef.current = tabs
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  const booted = useRef(false)

  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  // Theme: xterm needs explicit colors — inherit the cockpit's light/dark.
  const themeOption = useMemo(
    () =>
      theme === 'light'
        ? { background: '#faf7f0', foreground: '#2a2622', cursor: '#b4552d', selectionBackground: '#e6ddcc' }
        : { background: '#0b0b0d', foreground: '#e7e3dc', cursor: '#f59e0b', selectionBackground: '#3f3a33' },
    [theme],
  )

  // --- profile registry -----------------------------------------------------
  useEffect(() => {
    let cancelled = false
    void terminalProfiles()
      .then((r) => {
        if (!cancelled) setRegistry(r)
      })
      .catch((e) => {
        if (!cancelled) setRegistryError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const defaultProfileName = useMemo(() => {
    if (!registry) return null
    const offered = registry.profiles.filter((p) => p.offered)
    return (
      offered.find((p) => p.profileName === registry.defaultProfile)?.profileName ??
      offered.find((p) => p.isDefault)?.profileName ??
      offered[0]?.profileName ??
      null
    )
  }, [registry])

  // --- one xterm per tab ----------------------------------------------------
  const mountTerm = useCallback(
    (tab: Tab, el: HTMLDivElement | null) => {
      if (!el) return
      if (terms.current.has(tab.id)) return
      const term = new Terminal({
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12.5,
        lineHeight: 1.25,
        cursorBlink: true,
        convertEol: false,
        scrollback: 5000,
        theme: themeOption,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(el)
      try {
        fit.fit()
      } catch {
        /* container not laid out yet — the observer retries */
      }
      const observer = new ResizeObserver(() => {
        try {
          fit.fit()
        } catch {
          return
        }
        const t = tabsRef.current.find((x) => x.id === tab.id)
        if (t?.ptyId && term.rows > 0 && term.cols > 0) {
          void terminalResize(t.ptyId, term.rows, term.cols)
        }
      })
      observer.observe(el)
      // Keystrokes → raw PTY bytes. Read-only mode (watch) suppresses input.
      // Registered once here; the ptyId is looked up live because this runs
      // before `terminal_spawn` resolves.
      term.onData((d) => {
        const ptyId = ptyRef.current.get(tab.id)
        if (!interactiveRef.current || !ptyId) return
        void terminalWrite(ptyId, d)
      })
      terms.current.set(tab.id, { term, fit, observer })
    },
    [themeOption],
  )

  useEffect(() => {
    for (const h of terms.current.values()) h.term.options.theme = themeOption
  }, [themeOption])

  useEffect(() => {
    const map = terms.current
    return () => {
      for (const h of map.values()) {
        h.observer.disconnect()
        h.term.dispose()
      }
      map.clear()
    }
  }, [])

  // --- output stream --------------------------------------------------------
  useEffect(() => {
    return onTerminalEvent((ev) => {
      const tab = tabsRef.current.find((t) => t.ptyId === ev.ptyId)
      if (!tab) return
      const handle = terms.current.get(tab.id)
      if (ev.kind === 'data') {
        const bytes = decodeChunk(ev.data)
        if (bytes) handle?.term.write(bytes)
        return
      }
      if (ev.kind === 'exit') {
        handle?.term.write(
          `\r\n\x1b[2m[process exited${typeof ev.code === 'number' ? ` with code ${ev.code}` : ''}]\x1b[0m\r\n`,
        )
        ptyRef.current.delete(tab.id)
        setTabs((prev) =>
          prev.map((t) => (t.id === tab.id ? { ...t, exitCode: ev.code ?? 0, ptyId: null } : t)),
        )
        return
      }
      handle?.term.write(`\r\n\x1b[31m[terminal error]\x1b[0m\r\n`)
    })
  }, [])

  // --- spawn ----------------------------------------------------------------
  const openProfile = useCallback(
    (profile: TerminalProfile) => {
      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const tab: Tab = {
        id,
        profileName: profile.profileName,
        backend: profile.backend,
        ptyId: null,
        exitCode: null,
        error: null,
      }
      setTabs((prev) => [...prev, tab])
      setActiveId(id)

      if (!inTauri()) {
        // Preview: no PTY exists. Say so in the pane rather than faking one.
        setTimeout(() => {
          terms.current
            .get(id)
            ?.term.write(
              'Preview mode — the integrated terminal needs the desktop shell.\r\n' +
                `Profile "${profile.profileName}" was not spawned.\r\n`,
            )
        }, 0)
        return
      }

      const handle = terms.current.get(id)
      const rows = handle?.term.rows || 24
      const cols = handle?.term.cols || 80
      void terminalSpawn(profile.profileName, rows, cols)
        .then((ptyId) => {
          ptyRef.current.set(id, ptyId)
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ptyId } : t)))
          // Hand the child the real fitted size once it exists.
          const h = terms.current.get(id)
          if (h) {
            try {
              h.fit.fit()
            } catch {
              /* not laid out yet */
            }
            if (h.term.rows > 0 && h.term.cols > 0) {
              void terminalResize(ptyId, h.term.rows, h.term.cols)
            }
          }
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e)
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, error: msg } : t)))
          terms.current.get(id)?.term.write(`\x1b[31m${msg}\x1b[0m\r\n`)
        })
    },
    [],
  )

  // On first mount: reattach live PTYs if any, else spawn the default profile.
  // The session is owned by the shell (`AppState.terminal`), so a view unmount
  // does not kill it — reopening this view must show the same processes, not
  // an extra duplicate one.
  useEffect(() => {
    if (!registry || booted.current) return
    booted.current = true
    void (async () => {
      try {
        const { ptys } = await terminalStatus()
        const live = ptys.filter((p) => p.running)
        if (live.length > 0) {
          const next: Tab[] = live.map((p, i) => ({
            id: `tab-live-${i}-${p.ptyId}`,
            profileName: p.profileId,
            backend: p.backend,
            ptyId: p.ptyId,
            exitCode: null,
            error: null,
          }))
          for (const t of next) if (t.ptyId) ptyRef.current.set(t.id, t.ptyId)
          setTabs(next)
          setActiveId(next[0].id)
          // Honest limitation: bytes produced while this view was closed were
          // emitted with no listener, so they cannot be replayed (no ring
          // buffer yet). Say so instead of showing a seamless scrollback.
          setTimeout(() => {
            for (const t of next) {
              terms.current
                .get(t.id)
                ?.term.write(
                  '\x1b[2m[reattached to a live session — output produced while this view was closed is not replayed]\x1b[0m\r\n',
                )
            }
          }, 0)
          return
        }
      } catch {
        /* status is best-effort — fall through to a fresh spawn */
      }
      const def = registry.profiles.find((p) => p.profileName === defaultProfileName)
      if (def) openProfile(def)
    })()
  }, [registry, defaultProfileName, openProfile])

  const closeTab = (tab: Tab) => {
    if (tab.ptyId) void terminalKill(tab.ptyId)
    ptyRef.current.delete(tab.id)
    const handle = terms.current.get(tab.id)
    if (handle) {
      handle.observer.disconnect()
      handle.term.dispose()
      terms.current.delete(tab.id)
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tab.id)
      if (activeId === tab.id) setActiveId(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  const offered = registry?.profiles.filter((p) => p.offered) ?? []
  const blocked = registry?.profiles.filter((p) => !p.offered) ?? []

  // Ctrl+` focuses the active terminal (the global handler switches the view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        const h = activeId ? terms.current.get(activeId) : null
        h?.term.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId])

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <TerminalIcon className="h-3.5 w-3.5 text-orange-400" />
            Terminal
          </span>
          {active && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              {active.profileName}
              <span className="text-muted-foreground">· {backendLabel(active.backend)}</span>
            </Badge>
          )}
          {active?.exitCode !== null && active?.exitCode !== undefined && (
            <span className="text-[10px] text-muted-foreground">exited {active.exitCode}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInteractive((v) => !v)}
            aria-pressed={!interactive}
            title={
              interactive
                ? 'Interactive — your keystrokes reach the shell (human_gesture)'
                : 'Read-only — watching output; keystrokes are not sent'
            }
            className={cn(
              'flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px]',
              interactive ? 'text-emerald-300' : 'text-amber-300',
            )}
          >
            {interactive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {interactive ? 'Interactive' : 'Read-only'}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="New terminal"
                className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                <ChevronDown className="h-2.5 w-2.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Detected profiles{registry ? ` · ${registry.platform}` : ''}
              </DropdownMenuLabel>
              {registryError && (
                <DropdownMenuItem disabled className="text-[11px] text-rose-400">
                  detection failed: {registryError}
                </DropdownMenuItem>
              )}
              {!registry && !registryError && (
                <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
                  detecting…
                </DropdownMenuItem>
              )}
              {offered.map((p) => (
                <DropdownMenuItem
                  key={p.profileName}
                  onSelect={() => openProfile(p)}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="truncate">{p.profileName}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {backendLabel(p.backend)}
                    {p.profileName === registry?.defaultProfile ? ' · default' : ''}
                  </span>
                </DropdownMenuItem>
              ))}
              {blocked.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-400">
                    <ShieldAlert className="h-3 w-3" /> Unsafe until confirmed
                  </DropdownMenuLabel>
                  {blocked.map((p) => (
                    <DropdownMenuItem
                      key={p.profileName}
                      onSelect={(e) => {
                        e.preventDefault()
                        void terminalConfirmUnsafe(p.profileName).then((confirmed) => {
                          setRegistry((prev) => (prev ? { ...prev, unsafeConfirmed: confirmed } : prev))
                          // Re-run detection so the profile flips to offered.
                          void terminalProfiles().then(setRegistry)
                        })
                      }}
                      className="flex items-center justify-between gap-2 text-[12px] text-amber-300"
                    >
                      <span className="truncate">{p.profileName}</span>
                      <span className="shrink-0 text-[10px]">Confirm…</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {active && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      void terminalSetDefault(active.profileName).then(() =>
                        terminalProfiles().then(setRegistry),
                      )
                    }}
                    className="text-[12px]"
                  >
                    Set “{active.profileName}” as default profile
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {active && (
            <button
              type="button"
              onClick={() => closeTab(active)}
              aria-label="Close terminal tab"
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-rose-400"
            >
              <Square className="h-3 w-3" />
            </button>
          )}
        </div>
      </header>

      {tabs.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-zinc-900 px-2 py-1 scroll-thin">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px]',
                t.id === activeId ? 'bg-zinc-800 text-foreground' : 'text-muted-foreground',
              )}
            >
              <button type="button" onClick={() => setActiveId(t.id)} className="max-w-[16rem] truncate">
                {t.profileName}
                {t.ptyId === null && t.exitCode !== null ? ' (exited)' : ''}
              </button>
              <button
                type="button"
                aria-label={`Close ${t.profileName}`}
                onClick={() => closeTab(t)}
                className="opacity-0 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {tabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center font-mono text-xs text-muted-foreground">
            <TerminalIcon className="h-5 w-5 text-orange-400" />
            {registryError ? (
              <span className="text-rose-400">Terminal detection failed: {registryError}</span>
            ) : (
              <span>
                No terminal open — press <kbd className="rounded border px-1">+</kbd> to pick a profile.
                {!inTauri() && ' Preview mode: spawning is disabled.'}
              </span>
            )}
          </div>
        )}
        {tabs.map((t) => (
          <div
            key={t.id}
            ref={(el) => mountTerm(t, el)}
            className={cn('h-full w-full', t.id !== activeId && 'hidden')}
            onClick={() => terms.current.get(t.id)?.term.focus()}
          />
        ))}
      </div>
    </div>
  )
}
