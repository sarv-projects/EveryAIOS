'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowUp,
  Boxes,
  Brain,
  CircleDollarSign,
  FileText,
  Mic,
  Volume2,
  Package,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import type { PermissionMode } from '@/lib/ui-prefs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, type ChatMode } from '@/lib/store'
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

const MACROS = [
  { cmd: '!deploy', desc: 'Run prod deploy checklist' },
  { cmd: '!pnpm', desc: 'Use pnpm instead of npm' },
  { cmd: '!lintcommit', desc: 'Lint then commit' },
  { cmd: '!deploy-checklist', desc: 'Open deploy checklist' },
]

const MENTIONS: { cmd: string; desc: string; icon: LucideIcon }[] = [
  { cmd: '@blueprints', desc: 'Reusable agent blueprints', icon: Boxes },
  { cmd: '@skills', desc: 'Installed agent skills', icon: Brain },
  { cmd: '@files', desc: 'Workspace files', icon: FileText },
  { cmd: '@packages', desc: 'Installed npm packages', icon: Package },
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

function IconBtn({ icon: Icon, label, onClick, hidden, active }: { icon: LucideIcon; label: string; onClick: () => void; hidden?: boolean; active?: boolean }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        'h-7 w-7 text-muted-foreground hover:text-foreground',
        active && 'bg-orange-500/15 text-orange-500',
        hidden && 'hidden sm:inline-flex'
      )}
      onClick={onClick}
      title={label}
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
  const [ttsEnabled, setTtsEnabled] = useState(false)
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

  const canSend = composerValue.trim().length > 0

  const send = () => {
    if (!canSend) return
    const st = useAppStore.getState()
    if (st.centerScreen === 'home') {
      const cur = st.sessions.find((x) => x.id === st.activeSessionId)
      if (cur && cur.messages.length > 0) st.newSession()
      st.setCenterScreen('chat')
    }
    const text = composerValue
    void sendUserMessage(text)
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
                setComposerValue(`${command} `)
              }}
            />
          ))}
        </HintPopover>
      )}

      {/* The chat bar is the field. Controls live in a one-line footer, not a stack above. */}
      <div className="flex flex-nowrap items-center gap-1 px-2 pt-2 pb-1">
        <IconBtn icon={Plus} label="Attach file" onClick={() => notify('Attach file')} />
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
          }}
          placeholder="Tell EveryAIOS what you need…"
          className="max-h-28 min-h-[36px] min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
          rows={1}
        />
        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
          <IconBtn icon={Mic} label="Voice input" onClick={() => notify('Voice input — coming soon')} />
          <IconBtn
            icon={Volume2}
            label={ttsEnabled ? 'Disable read aloud' : 'Read assistant replies aloud'}
            active={ttsEnabled}
            onClick={() => {
              setTtsEnabled((enabled) => !enabled)
              notify(ttsEnabled ? 'Read aloud off' : 'Read aloud on')
            }}
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
