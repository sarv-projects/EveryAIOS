'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Terminal as TerminalIcon,
  Plus,
  Square,
  X,
  ChevronDown,
  Columns2,
  Eye,
  EyeOff,
  History,
  Minimize2,
  Rows2,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { Terminal, type ILink } from '@xterm/xterm'
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
  computeXtermTheme,
  cwdLeaf,
  decodeChunk,
  isInteractiveOrigin,
  onTerminalEvent,
  originLabel,
  terminalCommands,
  terminalConfirmUnsafe,
  terminalKill,
  terminalProfiles,
  terminalReplay,
  terminalResize,
  terminalSetDefault,
  terminalSpawn,
  terminalStatus,
  terminalWrite,
  type TerminalCommandRecord,
  type TerminalOriginId,
  type TerminalProfile,
  type TerminalProfilesResponse,
} from '@/lib/terminal'

interface Tab {
  id: string
  profileName: string
  backend: TerminalProfile['backend']
  origin: TerminalOriginId
  label: string | null
  ptyId: string | null
  exitCode: number | null
  error: string | null
  /** Live shell-reported working directory (shell integration). */
  cwd: string
  /** Latest trusted command the shell reported finishing. */
  lastCommand: TerminalCommandRecord | null
}

interface TermHandle {
  term: Terminal
  fit: FitAddon
  observer: ResizeObserver
  disposer: () => void
}

/**
 * H36 (P54/P67/P68) — profile-backed terminal at VS Code grade.
 *
 * - The `+` dropdown lists the profiles Rust actually detected on this machine
 *   (PowerShell, cmd, Git Bash, each WSL distro, `$SHELL`/`/etc/shells`), never
 *   a hardcoded two-shell list.
 * - Full-screen TUI apps work (raw PTY + xterm); resize reaches the child.
 * - **Provenance**: human tabs, agent `script.run` runs and durable task runs
 *   all appear in this view — agent/task tabs render as read-only labelled
 *   tabs so "watch the agent work" is a real property, not a claim.
 * - **Shell integration**: the shell reports cwd changes and per-command exit
 *   codes (OSC 633). Exit codes render as decorations, the cwd shows in the
 *   header, and `#terminalLastCommand` chat context is fed from the same
 *   records.
 * - **Sessions live in the shell**: switching tabs or unmounting does not kill
 *   them. Bytes produced while this view was closed are *replayed* from the
 *   PTY host's bounded ring (P68.8), and a replay that lost earlier bytes to
 *   the rolling window says so instead of showing a seamless scrollback.
 * - **Splits** (P68.8): the pane area holds up to two panes over the one PTY
 *   plane. A split never spawns a second kind of terminal — it shows a second
 *   *session* side by side (or stacked), so watching a human tab and an agent
 *   tab at once stays the same product surface.
 */
export default function ShellView() {
  const { theme } = useTheme()
  const dark = theme !== 'light'
  const [registry, setRegistry] = useState<TerminalProfilesResponse | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  /** Read-only is forced by provenance; the toggle only gates *human* tabs. */
  const [interactive, setInteractive] = useState(true)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findUp, setFindUp] = useState(false)
  const [commands, setCommands] = useState<TerminalCommandRecord[]>([])
  const [commandsOpen, setCommandsOpen] = useState(false)
  /** P68.8 — pane split direction. `null` = a single pane. */
  const [splitDir, setSplitDir] = useState<'row' | 'col' | null>(null)
  /** P68.8 — the tab shown in the second pane. Never the same as `activeId`. */
  const [secondaryId, setSecondaryId] = useState<string | null>(null)
  /** P68.8 — which pane owns the keyboard. */
  const [focusedPane, setFocusedPane] = useState<'primary' | 'secondary'>('primary')

  const terms = useRef<Map<string, TermHandle>>(new Map())
  /** tabId → live ptyId, readable from the xterm `onData` closure (which is
   * registered once, at mount, before the spawn resolves). */
  const ptyRef = useRef<Map<string, string>>(new Map())
  const cwdRef = useRef<Map<string, string>>(new Map())
  /** P68.8 — tabId → replay cursor (`seq`) already written to that terminal.
   * Kept per tab so a second replay fetches only what is new. */
  const seqRef = useRef<Map<string, number>>(new Map())
  const findState = useRef({ open: false, text: '', up: false })
  findState.current = { open: findOpen, text: findText, up: findUp }
  const tabsRef = useRef<Tab[]>([])
  tabsRef.current = tabs
  /** The detected registry, readable from callbacks that must not re-create
   * themselves on every detection refresh. */
  const registryRef = useRef<TerminalProfilesResponse | null>(null)
  registryRef.current = registry
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive
  const booted = useRef(false)

  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  // Theme: xterm needs explicit colors — computed from the live semantic
  // tokens so light/dark and the accent token are followed (P66.5/P68).
  const themeOption = useMemo(() => computeXtermTheme(dark), [dark])

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
        linkHandler: null,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(el)

      // P68 — web/secure links (OSC 8 + text URLs). Web links open externally;
      // nothing executes from a click inside the terminal.
      // P68 — web links (OSC 8 + text URLs) over the scrollback. Links open
      // externally; nothing executes from a click inside the terminal.
      try {
        term.registerLinkProvider({
          provideLinks: (
            bufferLineNumber: number,
            callback: (links: ILink[] | undefined) => void,
          ) => {
            const line = term.buffer.active.getLine(bufferLineNumber)
            if (!line) {
              callback(undefined)
              return
            }
            const text = line.translateToString(true)
            const re = /https?:\/\/[^\s)"']+/g
            const links: ILink[] = []
            let m: RegExpExecArray | null
            while ((m = re.exec(text)) !== null) {
              const start = m.index
              const end = start + m[0].length
              const uri = m[0]
              links.push({
                text: uri,
                range: {
                  start: { x: start + 1, y: bufferLineNumber },
                  end: { x: end, y: bufferLineNumber },
                },
                activate: (_e: unknown, uri: string) => {
                  window.open(uri, '_blank', 'noopener')
                },
              })
            }
            callback(links.length > 0 ? links : undefined)
          },
        })
      } catch {
        /* link provider unsupported — links degrade silently */
      }

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
        if (!ptyId) return
        // Provenance gate: agent/task tabs are watch-only by construction —
        // the terminal itself is never writable for a non-human origin.
        const t = tabsRef.current.find((x) => x.id === tab.id)
        if (t && !isInteractiveOrigin(t.origin)) return
        if (t && t.origin === 'human' && !interactiveRef.current) return
        void terminalWrite(ptyId, d)
      })
      const disposer = () => {
        observer.disconnect()
        term.dispose()
      }
      terms.current.set(tab.id, { term, fit, observer, disposer })
    },
    [themeOption],
  )

  useEffect(() => {
    for (const h of terms.current.values()) h.term.options.theme = themeOption
  }, [themeOption])

  useEffect(() => {
    const map = terms.current
    return () => {
      for (const h of map.values()) h.disposer()
      map.clear()
    }
  }, [])

  // --- find -----------------------------------------------------------------
  // Search-as-you-type over the scrollback via the buffer API (no addon
  // dependency). Matches scroll into view; direction toggles from the input.
  useEffect(() => {
    if (!findOpen || !findText.trim() || !activeId) return
    const handle = terms.current.get(activeId)
    if (!handle) return
    const { term } = handle
    const needle = findText.toLowerCase()
    const buf = term.buffer.active
    const scanLine = (y: number): number | null => {
      const line = buf.getLine(y)
      if (!line) return null
      const idx = line.translateToString(true).toLowerCase().indexOf(needle)
      return idx >= 0 ? idx : null
    }
    const cursor = term.rows // start below the viewport
    let hit: { y: number; x: number } | null = null
    const dir = findUp ? -1 : 1
    for (let i = 1; i <= buf.length; i++) {
      const y = (dir === 1 ? cursor + i : buf.length - i + cursor) % Math.max(1, buf.length)
      const x = scanLine(y)
      if (x !== null) {
        hit = { y, x }
        break
      }
    }
    if (hit) {
      try {
        term.scrollToLine(Math.min(hit.y, buf.length - term.rows))
        term.selectLines(hit.y, hit.y)
      } catch {
        /* selection API unavailable */
      }
    }
  }, [findOpen, findText, findUp, activeId, tabs])

  // --- output stream --------------------------------------------------------
  useEffect(() => {
    return onTerminalEvent((ev) => {
      const tab = tabsRef.current.find((t) => t.ptyId === ev.ptyId)
      const tabId = tab?.id
      const handle = tabId ? terms.current.get(tabId) : undefined
      if (ev.kind === 'data') {
        const bytes = decodeChunk(ev.data)
        if (bytes) handle?.term.write(bytes)
        return
      }
      if (ev.kind === 'command' && ev.command) {
        if (tabId) {
          setTabs((prev) =>
            prev.map((t) => (t.id === tabId ? { ...t, lastCommand: ev.command! } : t)),
          )
          if (tabId === activeId) {
            setCommands((prev) => [...prev.slice(-49), ev.command!])
          }
        }
        // P68 — exit-code decoration next to the finished command (trust gate:
        // untrusted records are not decorated as fact).
        if (handle && ev.command.trusted && typeof ev.command.exitCode === 'number') {
          const ok = ev.command.exitCode === 0
          const color = ok ? '\x1b[32m' : '\x1b[31m'
          handle.term.write(
            `\r\n${color}● exit ${ev.command.exitCode}${ev.command.cwd ? ` · ${cwdLeaf(ev.command.cwd)}` : ''}\x1b[0m\r\n`,
          )
        }
        return
      }
      if (ev.kind === 'cwd' && tabId && ev.cwd) {
        cwdRef.current.set(tabId, ev.cwd)
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, cwd: ev.cwd! } : t)))
        return
      }
      if (ev.kind === 'exit') {
        handle?.term.write(
          `\r\n\x1b[2m[process exited${typeof ev.code === 'number' ? ` with code ${ev.code}` : ''}]\x1b[0m\r\n`,
        )
        ptyRef.current.delete(tabId ?? '')
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, exitCode: ev.code ?? 0, ptyId: null } : t)),
        )
        return
      }
      handle?.term.write(`\r\n\x1b[31m[terminal error]\x1b[0m\r\n`)
    })
  }, [activeId])

  // --- spawn ----------------------------------------------------------------
  const openProfile = useCallback(
    (profile: TerminalProfile, cwd?: string) => {
      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const tab: Tab = {
        id,
        profileName: profile.profileName,
        backend: profile.backend,
        origin: 'human',
        label: null,
        ptyId: null,
        exitCode: null,
        error: null,
        cwd: cwd ?? '',
        lastCommand: null,
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
        return id
      }

      const handle = terms.current.get(id)
      const rows = handle?.term.rows || 24
      const cols = handle?.term.cols || 80
      void terminalSpawn(profile.profileName, rows, cols, cwd)
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
      // The id is returned so a split can place the new tab in a pane without
      // re-deriving which tab it just created.
      return id
    },
    [],
  )

  /**
   * P68.8 — write a session's retained output into a tab that is (re)attaching.
   *
   * Bytes go through the same decoder as a live `data` frame, so xterm keeps
   * owning VT interpretation. Two facts are never faked: a replay that lost
   * bytes to the rolling window is labelled as truncated, and a session with
   * nothing retained says so rather than showing an empty-but-plausible pane.
   *
   * The tab's xterm is created during the re-render that follows the reattach,
   * so the first attempt can legitimately lose the race; retry briefly instead
   * of dropping the replay.
   */
  const replayInto = useCallback(async (tabId: string, ptyId: string, reset = false) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const handle = terms.current.get(tabId)
      if (handle) {
        if (reset) seqRef.current.delete(tabId)
        const from = seqRef.current.get(tabId)
        let replayed: Awaited<ReturnType<typeof terminalReplay>> = null
        try {
          replayed = await terminalReplay(ptyId, from)
        } catch {
          handle.term.write(
            '\x1b[2m[reattached to a live session — its retained output could not be read]\x1b[0m\r\n',
          )
          return
        }
        if (!replayed) return
        seqRef.current.set(tabId, replayed.seq)
        const kib = Math.max(1, Math.round(replayed.capacity / 1024))
        if (replayed.dropped > 0) {
          handle.term.write(
            `\x1b[2m[replayed from a rolling ${kib} KiB buffer — ${replayed.dropped} earlier byte${
              replayed.dropped === 1 ? '' : 's'
            } had already scrolled out]\x1b[0m\r\n`,
          )
        } else if (!replayed.data) {
          handle.term.write(
            '\x1b[2m[reattached to a live session — no output retained to replay]\x1b[0m\r\n',
          )
        }
        const bytes = decodeChunk(replayed.data)
        if (bytes) handle.term.write(bytes)
        return
      }
      await new Promise((r) => window.setTimeout(r, 50))
    }
  }, [])

  // On first mount: reattach live PTYs if any, else spawn the default profile.
  // The session is owned by the shell (`AppState.terminal`), so a view unmount
  // does not kill it — reopening this view must show the same processes, not
  // an extra duplicate one. Reattach also restores agent/task provenance tabs.
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
            origin: p.origin,
            label: p.label,
            ptyId: p.ptyId,
            exitCode: null,
            error: null,
            cwd: p.cwd,
            lastCommand: null,
          }))
          for (const t of next) {
            if (t.ptyId) ptyRef.current.set(t.id, t.ptyId)
            if (t.cwd) cwdRef.current.set(t.id, t.cwd)
          }
          setTabs(next)
          setActiveId(next[0].id)
          // P68.8 — replay what the session produced while this view was
          // closed, from the PTY host's bounded ring. Blocks of output we can
          // no longer prove are labelled, never silently skipped.
          setTimeout(() => {
            for (const t of next) {
              if (t.ptyId) void replayInto(t.id, t.ptyId, true)
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
    cwdRef.current.delete(tab.id)
    seqRef.current.delete(tab.id)
    const handle = terms.current.get(tab.id)
    if (handle) {
      handle.disposer()
      terms.current.delete(tab.id)
    }
    // A closing tab can be the second pane's; the split collapses rather than
    // leaving an empty pane behind.
    if (secondaryId === tab.id) {
      setSecondaryId(null)
      setSplitDir(null)
      setFocusedPane('primary')
    }
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tab.id)
      if (activeId === tab.id) setActiveId(next[next.length - 1]?.id ?? null)
      return next
    })
  }

  /**
   * P68.8 — split the pane area and show a second session beside the active
   * one.
   *
   * The second pane is another *tab* over the same PTY plane, not a second
   * terminal implementation: reusing an existing tab avoids spawning a process
   * the user did not ask for, and with only one tab open the active profile is
   * duplicated so the split is still a real second session. A split never
   * changes a tab's provenance — an agent tab stays watch-only in either pane.
   */
  const splitActive = useCallback(
    (dir: 'row' | 'col') => {
      setSplitDir(dir)
      setFocusedPane(secondaryId ? 'secondary' : 'primary')
      if (secondaryId) return
      const other = tabsRef.current.find((t) => t.id !== activeId && t.ptyId !== null)
      if (other) {
        setSecondaryId(other.id)
        return
      }
      // No other live tab: open a second one on the active profile. The new
      // tab goes to the *second* pane, so the pane the user was already in
      // keeps its session and only the second half changes.
      const current = tabsRef.current.find((t) => t.id === activeId)
      const profile = registryRef.current?.profiles.find(
        (p) => p.profileName === (current?.profileName ?? ''),
      )
      if (!profile || !current) return
      const id = openProfile(profile)
      if (activeId) setActiveId(activeId)
      setSecondaryId(id)
      setFocusedPane('secondary')
    },
    [activeId, secondaryId, openProfile],
  )

  /** Collapse the split. Both sessions keep running — nothing is killed. */
  const unsplit = () => {
    setSplitDir(null)
    setSecondaryId(null)
    setFocusedPane('primary')
  }

  const offered = registry?.profiles.filter((p) => p.offered) ?? []
  const blocked = registry?.profiles.filter((p) => !p.offered) ?? []

  // Load the trusted command history when the active tab changes or the
  // history drawer opens (also feeds `#terminalLastCommand` parity checks).
  useEffect(() => {
    if (!activeId) return
    const ptyId = ptyRef.current.get(activeId)
    if (!ptyId) return
    void terminalCommands(ptyId, 50)
      .then((r) => setCommands(r.commands.slice(-50).reverse()))
      .catch(() => setCommands([]))
  }, [activeId, active?.lastCommand])

  // Ctrl+` focuses the active terminal (the global handler switches the view).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        const h = activeId ? terms.current.get(activeId) : null
        h?.term.focus()
      }
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && findOpen) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, findOpen])

  /** Attach an event to a fresh tab once its terminal exists. */
  const loadHistory = (tabId: string) => {
    const ptyId = ptyRef.current.get(tabId)
    if (!ptyId) return
    void terminalCommands(ptyId, 50)
      .then((r) => setCommands(r.commands.slice(-50).reverse()))
      .catch(() => setCommands([]))
  }

  const activeInteractive = active ? isInteractiveOrigin(active.origin) && interactive : false
  /** The tab in the second pane (only meaningful while split). */
  const secondary = useMemo(
    () => (splitDir ? (tabs.find((t) => t.id === secondaryId) ?? null) : null),
    [splitDir, secondaryId, tabs],
  )

  /** Clicking a tab selects it in the pane it already occupies. */
  const focusTab = (t: Tab) => {
    if (secondary && t.id === secondary.id) {
      setFocusedPane('secondary')
      terms.current.get(t.id)?.term.focus()
      return
    }
    setActiveId(t.id)
    setFocusedPane('primary')
    loadHistory(t.id)
    terms.current.get(t.id)?.term.focus()
  }

  /** Clicking inside a pane gives that pane the keyboard. */
  const focusPane = (tabId: string) => {
    setFocusedPane(secondary && tabId === secondary.id ? 'secondary' : 'primary')
    terms.current.get(tabId)?.term.focus()
  }

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <TerminalIcon className="h-3.5 w-3.5 text-primary" />
            Terminal
          </span>
          {active && (
            <Badge variant="outline" className="gap-1 text-[10px] font-normal">
              {active.profileName}
              <span className="text-muted-foreground">· {backendLabel(active.backend)}</span>
            </Badge>
          )}
          {/* Provenance chip — who owns this session. Agent/task tabs are
              watch-only; the label is the honest surface for that fact. */}
          {active && active.origin !== 'human' && (
            <Badge
              variant="outline"
              className="gap-1 border-sky-500/40 bg-sky-500/10 text-[10px] font-normal text-sky-400"
            >
              {originLabel(active.origin)}
              {active.label ? ` · ${active.label}` : ''} · read-only
            </Badge>
          )}
          {active?.cwd && (
            <span className="max-w-[16rem] truncate text-[10px] text-muted-foreground" title={active.cwd}>
              {active.cwd}
            </span>
          )}
          {active?.exitCode !== null && active?.exitCode !== undefined && (
            <span className="text-[10px] text-muted-foreground">exited {active.exitCode}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {active && active.origin === 'human' && (
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
                interactive ? 'text-emerald-500' : 'text-warning',
              )}
            >
              {interactive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {interactive ? 'Interactive' : 'Read-only'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setFindOpen((v) => !v)}
            aria-label="Find in terminal"
            aria-pressed={findOpen}
            title="Find in terminal (searches the scrollback)"
            className={cn(
              'flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground',
              findOpen && 'border-primary/50 text-foreground',
            )}
          >
            <Search className="h-3 w-3" />
            Find
          </button>

          <DropdownMenu open={commandsOpen} onOpenChange={setCommandsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Recent commands"
                title="Recent commands reported by shell integration (trusted records only)"
                className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                <History className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-96">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Recent commands{active?.cwd ? ` · ${cwdLeaf(active.cwd)}` : ''}
              </DropdownMenuLabel>
              {commands.length === 0 && (
                <DropdownMenuItem disabled className="text-[11px] text-muted-foreground">
                  {registry?.shellIntegration === false
                    ? 'Shell integration is off — enable it in Settings → Terminal'
                    : 'No trusted command records yet'}
                </DropdownMenuItem>
              )}
              {commands.map((c, i) => (
                <DropdownMenuItem
                  key={i}
                  onSelect={() => {
                    if (!active || !isInteractiveOrigin(active.origin)) return
                    const ptyId = ptyRef.current.get(active.id)
                    if (ptyId) {
                      void terminalWrite(ptyId, c.command + '\\r')
                    }
                  }}
                  className="flex flex-col items-start gap-0.5 py-1.5"
                >
                  <span className="w-full truncate font-mono text-[11px] text-foreground">$ {c.command}</span>
                  <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className={c.failed ? 'text-rose-500' : 'text-emerald-500'}>
                      exit {c.exitCode ?? '?'}
                    </span>
                    {c.cwd && <span className="truncate">{cwdLeaf(c.cwd)}</span>}
                    {!c.trusted && <span>untrusted</span>}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
                  <DropdownMenuLabel className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-warning">
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
                      className="flex items-center justify-between gap-2 text-[12px] text-warning"
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => splitActive('col')}
                aria-label="Split right"
                aria-pressed={splitDir === 'col'}
                title="Split right — show a second session beside this one"
                className={cn(
                  'rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground',
                  splitDir === 'col' && 'border-primary/40 text-foreground',
                )}
              >
                <Columns2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => splitActive('row')}
                aria-label="Split down"
                aria-pressed={splitDir === 'row'}
                title="Split down — show a second session below this one"
                className={cn(
                  'rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground',
                  splitDir === 'row' && 'border-primary/40 text-foreground',
                )}
              >
                <Rows2 className="h-3 w-3" />
              </button>
              {splitDir !== null && (
                <button
                  type="button"
                  onClick={unsplit}
                  aria-label="Unsplit panes"
                  title="Unsplit — both sessions keep running"
                  className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <Minimize2 className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => closeTab(active)}
                aria-label="Close terminal tab"
                className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-rose-400"
              >
                <Square className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </header>

      {findOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setFindUp((v) => !v)
              if (e.key === 'Escape') setFindOpen(false)
              if (e.key === 'Enter' && e.shiftKey) setFindUp(true)
            }}
            placeholder="Find in scrollback — Enter toggles direction, Esc closes"
            className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <span className="font-mono text-[10px] text-muted-foreground">{findUp ? '↑' : '↓'}</span>
        </div>
      )}

      {tabs.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2 py-1 scroll-thin">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px]',
                t.id === activeId ? 'bg-accent text-foreground' : 'text-muted-foreground',
                // The second pane's tab is highlighted differently: two panes
                // are visible at once, so the strip must say which is which.
                secondary && t.id === secondary.id && 'bg-accent/50 text-foreground',
              )}
            >
              <button type="button" onClick={() => focusTab(t)} className="max-w-[14rem] truncate">
                {t.origin !== 'human' && (
                  <span className={cn('mr-1', t.origin === 'agent' ? 'text-sky-400' : 'text-violet-400')}>
                    {t.origin === 'agent' ? '◆' : '⧗'}
                  </span>
                )}
                {t.label ?? t.profileName}
                {t.cwd && <span className="ml-1 text-muted-foreground">{cwdLeaf(t.cwd)}</span>}
                {t.ptyId === null && t.exitCode !== null ? ' (exited)' : ''}
              </button>
              <button
                type="button"
                aria-label={`Close ${t.label ?? t.profileName}`}
                onClick={() => closeTab(t)}
                className="opacity-0 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'relative min-h-0 flex-1',
          splitDir === 'col' && 'flex flex-row',
          splitDir === 'row' && 'flex flex-col',
        )}
      >
        {tabs.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center font-mono text-xs text-muted-foreground">
            <TerminalIcon className="h-5 w-5 text-primary" />
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
        {tabs.map((t) => {
          const isPrimary = t.id === activeId
          const isSecondary = Boolean(secondary && t.id === secondary.id)
          const visible = isPrimary || isSecondary
          return (
            <div
              key={t.id}
              className={cn(
                'min-h-0 min-w-0',
                splitDir
                  ? cn('flex flex-1 flex-col', !visible && 'hidden')
                  : cn('h-full w-full', !isPrimary && 'hidden'),
              )}
            >
              {splitDir && (
                <div
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground',
                    (isSecondary ? focusedPane === 'secondary' : focusedPane === 'primary')
                      ? 'bg-muted/50'
                      : 'bg-muted/20',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      (isSecondary ? focusedPane === 'secondary' : focusedPane === 'primary')
                        ? 'bg-primary'
                        : 'bg-muted-foreground/40',
                    )}
                  />
                  <span className="truncate">{t.label ?? t.profileName}</span>
                  {t.cwd && <span className="truncate">{cwdLeaf(t.cwd)}</span>}
                  <span className="flex-1" />
                  <span className="shrink-0">
                    {originLabel(t.origin)}
                    {!isInteractiveOrigin(t.origin) && ' · watch-only'}
                  </span>
                </div>
              )}
              <div
                ref={(el) => mountTerm(t, el)}
                className="min-h-0 flex-1"
                onClick={() => focusPane(t.id)}
              />
            </div>
          )
        })}
      </div>

      {/* Status line — provenance, integration quality, and the authority
          boundary, in one line. */}
      <footer className="flex items-center gap-3 border-t border-border px-3 py-1 font-mono text-[10px] text-muted-foreground">
        {active ? (
          <>
            <span>{originLabel(active.origin)} session</span>
            <span>·</span>
            <span>
              integration:{' '}
              {active.lastCommand || active.cwd
                ? 'Rich'
                : registry?.shellIntegration
                  ? 'pending'
                  : 'off'}
            </span>
            <span>·</span>
            <span>
              {active.origin === 'human'
                ? activeInteractive
                  ? 'keystrokes → human_gesture'
                  : 'read-only (toggle to type)'
                : 'agent output — input denied by provenance'}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => {
                const ptyId = active.ptyId
                if (!ptyId) return
                void terminalCommands(ptyId, 1).then((r) => {
                  const last = r.commands[0]
                  if (last && navigator.clipboard) void navigator.clipboard.writeText(last.output || last.command)
                })
              }}
              className="hover:text-foreground"
              title="Copy the last command's reported output"
            >
              copy last output
            </button>
          </>
        ) : (
          <span>no session</span>
        )}
      </footer>
    </div>
  )
}
