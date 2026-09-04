'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  CircleDollarSign,
  FileText,
  Mic,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import type { PermissionMode } from '@/lib/ui-prefs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, sessionTranscriptMarkdown, type ChatMode } from '@/lib/store'
import { cn } from '@/lib/utils'
import AgentModelPicker from './agent-model-picker'
import { sendUserMessage } from '@/lib/bridge'
import { getModelsForAgent } from '@/lib/agents'

/** v3.57 Work Mode — WHAT. Code/browser/Office/terminal are capabilities inside Build. */
const WORK_MODES: { id: ChatMode; emoji: string; label: string; hint: string }[] = [
  { id: 'auto', emoji: '🤖', label: 'Auto', hint: 'Agent chooses and may switch Plan → Build → Research as the work evolves' },
  { id: 'plan', emoji: '📐', label: 'Plan', hint: 'Analyze and propose — no mutations until you approve' },
  { id: 'build', emoji: '🔨', label: 'Build', hint: 'Execute and verify — files, browser, Office, terminal live here' },
  { id: 'research', emoji: '🔎', label: 'Research', hint: 'Investigate and cite — read-only, then you can switch to Build' },
]

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show all commands' },
  { cmd: '/mode', desc: 'Cycle work mode (Auto · Plan · Build · Research)' },
  { cmd: '/model', desc: 'Switch underlying model' },
  { cmd: '/undo', desc: 'Roll back last turn' },
  { cmd: '/clear', desc: 'Clear session messages' },
  { cmd: '/export', desc: 'Export session transcript' },
]

const MACROS: { cmd: string; desc: string; expand: string }[] = [
  { cmd: '!deploy', desc: 'Append the prod deploy checklist instruction', expand: '(follow the production deploy checklist: verify, stage, confirm before each irreversible step)' },
  { cmd: '!pnpm', desc: 'Append "use pnpm instead of npm"', expand: '(use pnpm instead of npm for every package command)' },
  { cmd: '!lintcommit', desc: 'Append "lint before committing"', expand: '(run the linter and fix findings before committing anything)' },
  { cmd: '!deploy-checklist', desc: 'Append the deploy checklist instruction', expand: '(follow the production deploy checklist: verify, stage, confirm before each irreversible step)' },
]

const MENTIONS: { cmd: string; desc: string; icon: LucideIcon }[] = [
  { cmd: '@files', desc: 'Attach a workspace file as turn context', icon: FileText },
]

function HintPopover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute bottom-full left-2 z-30 mb-1.5 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
      <div className="border-b border-border bg-zinc-900/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
        {title}
      </div>
      <div className="scroll-thin max-h-56 overflow-y-auto py-0.5">{children}</div>
    </div>
  )
}

interface HintItem { cmd: string; desc: string; icon?: LucideIcon; color?: string }

function HintRow({ item, onSelect }: { item: HintItem; onSelect: (command: string) => void }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.cmd)}
      className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent/60"
    >
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      <span className={cn('font-mono text-[11px]', item.color ?? 'text-orange-300')}>{item.cmd}</span>
      <span className="ml-auto truncate text-[10px] text-muted-foreground">{item.desc}</span>
    </button>
  )
}

const AUTONOMY: { id: PermissionMode; emoji: string; label: string; hint: string }[] = [
  { id: 'sandbox', emoji: '🛡', label: 'Sandbox', hint: 'Plan + read-only. Every mutation is denied.' },
  { id: 'ask', emoji: '👀', label: 'Ask', hint: 'Default. Safe reads auto-allow; mutations show a Guard-2 card.' },
  { id: 'auto', emoji: '⚡', label: 'Auto', hint: 'Low-risk workspace writes auto-allow. Destructive / money / secrets still ask.' },
  { id: 'full', emoji: '🚀', label: 'Maximum', hint: 'Maximum autonomy within hard floors — never skips destructive/secret/financial denies.' },
]

function WorkModeChip({ compact }: { compact?: boolean }) {
  const mode = useAppStore((s) => s.composerMode)
  const setMode = useAppStore((s) => s.setComposerMode)
  return (
    <select
      aria-label="Work mode"
      value={mode}
      onChange={(e) => setMode(e.target.value as ChatMode)}
      title={WORK_MODES.find((m) => m.id === mode)?.hint ?? 'Work mode (WHAT)'}
      className={cn(
        'rounded-md border border-border bg-background/40 font-mono text-[10px] text-foreground',
        compact ? 'h-6 max-w-[7.5rem] px-1' : 'h-6 px-1.5',
      )}
    >
      {WORK_MODES.map((m) => (
        <option key={m.id} value={m.id} title={m.hint}>
          {m.emoji} {m.label}
        </option>
      ))}
    </select>
  )
}

function AutonomyChip({ compact }: { compact?: boolean }) {
  const mode = useAppStore((s) => s.permissionMode)
  const setMode = useAppStore((s) => s.setPermissionMode)
  const notify = useAppStore((s) => s.notify)
  return (
    <select
      aria-label="Autonomy"
      value={mode}
      onChange={(e) => {
        const next = e.target.value as PermissionMode
        setMode(next)
        if (next === 'full') {
          notify('Maximum still honors hard floors — destructive, secrets, money, and Guard-2 R4 never auto-run')
        }
      }}
      title={AUTONOMY.find((m) => m.id === mode)?.hint ?? 'Autonomy (HOW MUCH)'}
      className={cn(
        'rounded-md border border-border bg-background/40 font-mono text-[10px] text-foreground',
        compact ? 'h-6 max-w-[7.5rem] px-1' : 'h-6 px-1.5',
      )}
    >
      {AUTONOMY.map((m) => (
        <option key={m.id} value={m.id} title={m.hint}>
          {m.emoji} {m.label}
        </option>
      ))}
    </select>
  )
}

function IconBtn({ icon: Icon, label, onClick, hidden, active, disabled, title }: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  hidden?: boolean
  active?: boolean
  disabled?: boolean
  title?: string
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        'h-7 w-7 text-muted-foreground hover:text-foreground',
        active && 'bg-orange-500/15 text-orange-500',
        hidden && 'hidden sm:inline-flex',
        disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground'
      )}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title ?? label}
      aria-disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  )
}

interface Props {
  budget?: { spent: number; cap: number; tokens: number }
  /** Center-lift the composer on the empty/new-chat state; bottom-pin once chat starts */
  centered?: boolean
}

export default function ChatComposer({ budget, centered }: Props) {
  const composerValue = useAppStore((s) => s.composerValue)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const notify = useAppStore((s) => s.notify)
  const activeSession = useAppStore((s) =>
    s.sessions.find((x) => x.id === s.activeSessionId)
  )

  const spent = budget?.spent ?? activeSession?.spent ?? 0
  const cap = budget?.cap ?? 5
  const tokens = budget?.tokens ?? activeSession?.tokens ?? 0

  // Context-window gauge (P1.6 parity): % of the current model's window used.
  // Amber ≥75% (start planning compaction), loud red ≥90% (loop risk).
  const selectedAgentId = useAppStore((s) => s.selectedAgentId)
  const selectedModelId = useAppStore((s) => s.selectedModelId)
  const localRuntime = useAppStore((s) => s.localRuntime)
  const localCtxWindow = useAppStore((s) => s.localCtxWindow)
  const ctxWindow =
    getModelsForAgent(selectedAgentId).find((m) => m.id === selectedModelId)
      ?.context ?? 128_000
  const ctxPct = Math.min(100, Math.round((tokens / ctxWindow) * 100))
  const ctxTone =
    ctxPct >= 90
      ? 'border-red-500/40 bg-red-500/10 text-red-400'
      : ctxPct >= 75
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
        : 'border-border bg-background/40 text-muted-foreground'

  const hint = useMemo(() => {
    const v = composerValue.trimStart()
    if (!v) return null
    if (v.startsWith('/')) return { kind: 'slash' as const, q: v.slice(1) }
    if (v.startsWith('!')) return { kind: 'macro' as const, q: v.slice(1) }
    if (v.startsWith('@')) return { kind: 'mention' as const, q: v.slice(1) }
    return null
  }, [composerValue])

  const filterBy = (q: string) => <T extends { cmd: string }>(arr: T[]) =>
    arr.filter((c) => c.cmd.includes(q))

  const hintList: { title: string; items: HintItem[] } | null = (() => {
    if (!hint) return null
    const f = filterBy(hint.q)
    if (hint.kind === 'slash')
      return { title: 'Slash commands', items: f(SLASH_COMMANDS).map((c) => ({ ...c, color: 'text-orange-300' })) }
    if (hint.kind === 'macro')
      return { title: 'Macros', items: f(MACROS).map((c) => ({ ...c, color: 'text-orange-300' })) }
    return {
      title: 'Mention',
      items: f(MENTIONS).map((c) => ({ ...c, color: 'text-sky-300' })),
    }
  })()

  // Attached file context (sent with the next turn as a user document).
  const [attachment, setAttachment] = useState<{ title: string; content: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSend = composerValue.trim().length > 0 || attachment !== null

  const pickFile = () => fileRef.current?.click()

  const onFileChosen = (file: File | undefined) => {
    if (!file) return
    if (file.size > 512 * 1024) {
      notify(`“${file.name}” is ${(file.size / 1024).toFixed(0)} KB — attachments cap at 512 KB of text`, 'error')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => notify(`Could not read “${file.name}” as text`, 'error')
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      if (!text.trim()) {
        notify(`“${file.name}” has no readable text — binary files can't attach`, 'error')
        return
      }
      setAttachment({ title: file.name, content: text.slice(0, 200_000) })
    }
    reader.readAsText(file)
  }

  const runSlash = (text: string): boolean => {
    const st = useAppStore.getState()
    const [head, ...rest] = text.trim().split(/\s+/)
    const arg = rest.join(' ')
    switch (head) {
      case '/help':
        setComposerValue('/')
        return true
      case '/mode': {
        const order: ChatMode[] = ['auto', 'plan', 'build', 'research']
        const next = order[(order.indexOf(st.composerMode) + 1) % order.length]
        st.setComposerMode(next)
        notify(`Work mode → ${next}`)
        setComposerValue(arg)
        return true
      }
      case '/model':
        st.setCenterScreen('settings')
        st.setSettingsSection('agents')
        notify('Pick the runtime and model in Agents & Models')
        setComposerValue(arg)
        return true
      case '/undo':
        void (async () => {
          try {
            const { agentUndo } = await import('@/lib/tauri')
            await agentUndo(st.activeSessionId)
            notify('Undo requested on the control channel')
          } catch (e) {
            notify(e instanceof Error ? e.message : 'Undo failed', 'error')
          }
        })()
        setComposerValue(arg)
        return true
      case '/clear':
        st.clearSessionMessages(st.activeSessionId)
        setComposerValue('')
        return true
      case '/export': {
        const sess = st.sessions.find((s) => s.id === st.activeSessionId)
        if (!sess) {
          notify('No active session to export', 'error')
          return true
        }
        const blob = new Blob([sessionTranscriptMarkdown(sess)], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${sess.title.replace(/[^\w\- ]+/g, '').trim() || 'session'}.md`
        a.click()
        URL.revokeObjectURL(url)
        notify('Transcript exported as Markdown')
        setComposerValue(arg)
        return true
      }
      default:
        return false
    }
  }

  const send = () => {
    if (!canSend) return
    const st = useAppStore.getState()
    if (st.centerScreen === 'home') {
      const cur = st.sessions.find((x) => x.id === st.activeSessionId)
      if (cur && cur.messages.length > 0) st.newSession()
      st.setCenterScreen('chat')
    }
    let text = composerValue
    // Macros expand to prompt augmentations (visible in the sent text).
    const first = text.trimStart().split(/\s+/, 1)[0]
    const macro = MACROS.find((m) => m.cmd === first)
    if (macro) text = `${text} ${macro.expand}`
    // Slash commands execute locally and never reach the model as turns.
    if (text.trimStart().startsWith('/')) {
      if (runSlash(text)) {
        setAttachment(null)
        return
      }
    }
    if (!text.trim() && !attachment) return
    const ctx = attachment
    setAttachment(null)
    void sendUserMessage(text, ctx ? { title: ctx.title, content: ctx.content } : undefined)
  }

  return (
    <div
      className={cn(
        'relative',
        centered
          ? 'rounded-xl border border-border bg-card shadow-lg'
          : 'border-t border-border bg-card/80',
      )}
    >
      {hintList && hintList.items.length > 0 && (
        <HintPopover title={hintList.title}>
          {hintList.items.map((c) => (
            <HintRow
              key={c.cmd}
              item={c}
              onSelect={(command) => {
                if (command === '@files') {
                  setComposerValue('')
                  pickFile()
                  return
                }
                setComposerValue(`${command} `)
              }}
            />
          ))}
        </HintPopover>
      )}

      {/* The chat bar is the field. Controls live in a one-line footer, not a stack above. */}
      {attachment && (
        <div className="mx-2 mt-2 flex items-center gap-1.5 rounded-md border border-orange-500/30 bg-orange-500/5 px-2 py-1 font-mono text-[10px] text-orange-200">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{attachment.title} · {(attachment.content.length / 1024).toFixed(1)} KB attached</span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="shrink-0 rounded px-1 text-muted-foreground hover:text-foreground"
            title="Remove attachment"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-nowrap items-center gap-1 px-2 pt-2 pb-1">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          aria-label="Attach a text file"
          onChange={(e) => {
            onFileChosen(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <IconBtn icon={Plus} label="Attach file" onClick={pickFile} />
        <div className="shrink-0">
          <AgentModelPicker />
        </div>
        <Textarea
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setComposerValue('')
            }
          }}
          placeholder="Tell EveryAIOS what you need…"
          className="max-h-28 min-h-[36px] min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
          rows={1}
        />
        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
          {/* P50.4.8 — voice input/output are v1-planned (spec H15/H28,
              promoted to v1 scope 2026-08-31): the stack is not wired yet, so
              the control is visibly inert with a truthful status instead of
              pretending to capture audio. Read-aloud stays in Settings as a
              staged v1 surface. */}
          <IconBtn
            icon={Mic}
            label="Voice input (v1-pending)"
            title="Voice input (VAD/STT) is a v1 deliverable — capture stack not wired in this build; the control is disabled, not coming soon"
            disabled
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40"
            disabled={!canSend}
            onClick={send}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex h-8 items-center gap-1 border-t border-border/70 px-2">
        <WorkModeChip compact />
        <AutonomyChip compact />
        <span
          className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground"
          title={`$${spent.toFixed(2)} of $${cap.toFixed(2)} · ${ctxPct}% context`}
        >
          <CircleDollarSign className="h-3 w-3 text-emerald-400" />
          <span className="text-foreground">${spent.toFixed(2)}</span>
          {ctxPct >= 75 && (
            <span className={cn('ml-1', ctxTone.includes('red') ? 'text-red-400' : 'text-amber-400')}>
              {ctxPct}% ctx
            </span>
          )}
        </span>
      </div>

      <div className="hidden items-center gap-2 px-2 pb-1 font-mono text-[9px] text-muted-foreground/70 sm:flex">
        <span>Enter send</span>
        <span>·</span>
        <span>Shift+Enter newline</span>
        <span>·</span>
        <span>Esc clear</span>
        <span className="ml-auto">@ mention · / command · ! macro</span>
      </div>

      {localRuntime && (localCtxWindow ?? ctxWindow) <= 20_000 && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
          Local {localRuntime} · {(localCtxWindow ?? ctxWindow).toLocaleString()} tok context
        </div>
      )}
    </div>
  )
}
