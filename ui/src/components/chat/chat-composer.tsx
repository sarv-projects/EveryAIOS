'use client'

import { useMemo } from 'react'
import {
  ArrowUp,
  AtSign,
  Boxes,
  Brain,
  CheckSquare,
  CircleDollarSign,
  FileText,
  FlaskConical,
  Gauge,
  Hash,
  Mic,
  Package,
  Plus,
  RotateCcw,
  ScrollText,
  Sparkles,
  Users,
  Wrench,
  Zap,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import type { ComposerRole, PermissionMode } from '@/lib/ui-prefs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAppStore, type ChatMode } from '@/lib/store'
import { cn } from '@/lib/utils'
import AgentModelPicker from './agent-model-picker'
import { sendUserMessage } from '@/lib/bridge'
import { getModelsForAgent } from '@/lib/agents'
import { PERSONA_PRESETS, SOUL_PRESETS } from '@/lib/personas'

const MODES: { id: ChatMode; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'normal', label: 'Normal', hint: 'Balanced agent mode — default', icon: Sparkles },
  { id: 'plan', label: 'Plan', hint: 'Plan first, do later — only produces a plan', icon: CheckSquare },
  { id: 'research', label: 'Research', hint: 'Read-only — no writes, only read + cite', icon: FlaskConical },
  { id: 'quick', label: 'Quick', hint: 'Fast single-turn — no agent loop', icon: Zap },
  { id: 'code', label: 'Code', hint: 'Coder agent — diff-first, no chit-chat', icon: Wrench },
]

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show all commands' },
  { cmd: '/mode', desc: 'Switch composer mode' },
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

function HintPopover({ title, children }: { title: string; children: React.ReactNode }) {
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

function HintRow({ item }: { item: HintItem }) {
  const Icon = item.icon
  return (
    <button type="button" className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-accent/60">
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      <span className={cn('font-mono text-[11px]', item.color ?? 'text-orange-300')}>{item.cmd}</span>
      <span className="ml-auto truncate text-[10px] text-muted-foreground">{item.desc}</span>
    </button>
  )
}

const PERMISSION_LABEL: Record<PermissionMode, string> = {
  sandbox: 'Sandbox',
  ask: 'Ask',
  auto: 'Auto-approve',
  full: 'Run everything',
}

function PermissionChip({ compact }: { compact?: boolean }) {
  const mode = useAppStore((s) => s.permissionMode)
  const setMode = useAppStore((s) => s.setPermissionMode)
  const notify = useAppStore((s) => s.notify)
  return (
    <select
      value={mode}
      onChange={(e) => {
        const next = e.target.value as PermissionMode
        setMode(next)
        if (next === 'full') {
          notify('Run everything skips Guard-2 in the UI only — the executor still asks until this mode is wired')
        }
      }}
      title="Permission / auto-run"
      className={cn(
        'rounded-md border border-border bg-background/40 font-mono text-[10px] text-foreground',
        compact ? 'h-6 max-w-[7.5rem] px-1' : 'h-6 px-1.5',
      )}
    >
      {(Object.keys(PERMISSION_LABEL) as PermissionMode[]).map((id) => (
        <option key={id} value={id}>
          {PERMISSION_LABEL[id]}
        </option>
      ))}
    </select>
  )
}

const ROLE_META: { id: ComposerRole; label: string; icon: LucideIcon; hint: string }[] = [
  { id: 'agent', label: 'Agent', icon: Sparkles, hint: 'One agent plans and executes with tools' },
  { id: 'experts', label: 'Experts', icon: Users, hint: 'Specialist subagents in parallel (depth ≤2)' },
  { id: 'spec', label: 'Spec', icon: FileText, hint: 'Plan first — Q&A cards, then a markdown spec' },
]

function RoleChip({ compact }: { compact?: boolean }) {
  const role = useAppStore((s) => s.composerRole)
  const setRole = useAppStore((s) => s.setComposerRole)
  const setComposerMode = useAppStore((s) => s.setComposerMode)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const setSettingsSection = useAppStore((s) => s.setSettingsSection)
  return (
    <div className="flex overflow-hidden rounded-md border border-border bg-background/40">
      {ROLE_META.map((r) => (
        <button
          key={r.id}
          type="button"
          title={r.hint}
          onClick={() => {
            setRole(r.id)
            if (r.id === 'spec') setComposerMode('plan')
            if (r.id === 'experts') {
              setSettingsSection('experts')
            }
          }}
          className={cn(
            'flex h-6 items-center gap-1 px-1.5 text-[10px]',
            role === r.id ? 'bg-orange-500/15 text-orange-300' : 'text-muted-foreground hover:text-foreground',
            compact && 'px-1',
          )}
        >
          <r.icon className="h-3 w-3" />
          {!compact && <span className="hidden sm:inline">{r.label}</span>}
        </button>
      ))}
      {role === 'experts' && !compact && (
        <button
          type="button"
          className="h-6 px-1.5 text-[9px] text-orange-300/80 hover:text-orange-200"
          onClick={() => {
            setSettingsSection('experts')
            setCenterScreen('settings')
          }}
        >
          manage
        </button>
      )}
    </div>
  )
}

function IconBtn({ icon: Icon, label, onClick, hidden }: { icon: LucideIcon; label: string; onClick: () => void; hidden?: boolean }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        'h-7 w-7 text-muted-foreground hover:text-foreground',
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
  const composerMode = useAppStore((s) => s.composerMode)
  const setComposerMode = useAppStore((s) => s.setComposerMode)
  const notify = useAppStore((s) => s.notify)
  const powerMode = useAppStore((s) => s.powerMode)
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
  const personaId = useAppStore((s) => s.personaId)
  const setPersonaId = useAppStore((s) => s.setPersonaId)
  const soulId = useAppStore((s) => s.soulId)
  const setSoulId = useAppStore((s) => s.setSoulId)
  const streamStats = useAppStore((s) => s.streamStats)
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
          ? 'rounded-xl border border-border bg-card/60 px-3 py-2.5 shadow-lg'
          : 'border-t border-border bg-card/40 px-2 py-2'
      )}
    >
      {hintList && hintList.items.length > 0 && (
        <HintPopover title={hintList.title}>
          {hintList.items.map((c) => <HintRow key={c.cmd} item={c} />)}
        </HintPopover>
      )}

      {/* mode + agent + budget row (casual hides it — auto-detect instead) */}
      {powerMode && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <ToggleGroup
            type="single"
            value={composerMode}
            onValueChange={(v) => v && setComposerMode(v as ChatMode)}
            variant="outline"
            size="sm"
            className="h-6 shrink-0 overflow-hidden rounded-md border-border bg-background/40"
          >
            {MODES.map((m) => (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem
                    value={m.id}
                    className="h-6 gap-1 px-1.5 text-[10px] data-[state=on]:border-orange-500/60 data-[state=on]:bg-orange-500/10 data-[state=on]:text-orange-300"
                  >
                    <m.icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{m.label}</span>
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="top">{m.hint}</TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>

          <PermissionChip />
          <RoleChip />
          <AgentModelPicker />

          <select
            value={personaId}
            onChange={(e) => setPersonaId(e.target.value)}
            className="h-6 rounded-md border border-border bg-background/40 px-1.5 font-mono text-[10px] text-foreground"
            title="Persona (SOUL.md tone)"
          >
            {Object.keys(PERSONA_PRESETS).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <select
            value={soulId}
            onChange={(e) => setSoulId(e.target.value)}
            className="h-6 rounded-md border border-border bg-background/40 px-1.5 font-mono text-[10px] text-foreground"
            title="SOUL.md identity"
          >
            {Object.keys(SOUL_PRESETS).map((id) => (
              <option key={id} value={id}>
                soul:{id}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1 rounded-md border border-border bg-background/40 px-1.5 py-0.5">
              <CircleDollarSign className="h-3 w-3 text-emerald-400" />
              <span className="text-foreground">${spent.toFixed(2)}</span>
              <span className="hidden text-muted-foreground/60 md:inline">/ ${cap.toFixed(2)} cap</span>
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-border bg-background/40 px-1.5 py-0.5 lg:flex">
              <Zap className="h-3 w-3 text-orange-400" />
              <span className="text-foreground">{(tokens / 1000).toFixed(0)}K</span>
              <span className="text-muted-foreground/60">tok</span>
            </span>
            <span
              className={cn(
                'hidden items-center gap-1 rounded-md border px-1.5 py-0.5 transition-colors md:flex',
                ctxTone,
              )}
              title={`Context used: ${tokens.toLocaleString()} / ${ctxWindow.toLocaleString()} tok (${ctxPct}%)`}
            >
              <Gauge className="h-3 w-3" />
              <span>{ctxPct}%</span>
              <span className="text-muted-foreground/60">ctx</span>
            </span>
            <span
              className="hidden items-center gap-1 rounded-md border border-border bg-background/40 px-1.5 py-0.5 md:flex"
              title="Tokens per second this turn"
            >
              <Zap className="h-3 w-3 text-sky-400" />
              <span className="text-foreground">{streamStats.tokensPerSec.toFixed(1)}</span>
              <span className="text-muted-foreground/60">tok/s</span>
            </span>
            {streamStats.activeKey && (
              <span className="hidden max-w-[120px] truncate rounded-md border border-border bg-background/40 px-1.5 py-0.5 text-emerald-300 lg:inline">
                key {streamStats.activeKey}
              </span>
            )}
          </div>
        </div>
      )}

      {localRuntime && (localCtxWindow ?? ctxWindow) <= 20_000 && (
        <div className="mb-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-300">
          Local {localRuntime} context {(localCtxWindow ?? ctxWindow).toLocaleString()} tok
          {(localCtxWindow ?? ctxWindow) < 15_000
            ? ' — below the 15K agent-loop floor'
            : ' — at/under the 20K local soft cap'}
          . Agent tool loops may compact aggressively.
        </div>
      )}

      {/* input row */}
      <div className="flex items-end gap-1.5 rounded-lg border border-border bg-background/40 px-1.5 py-1 focus-within:border-orange-500/40 focus-within:ring-1 focus-within:ring-orange-500/30">
        <IconBtn icon={Plus} label="Attach file" onClick={() => notify('Attach file')} />
        <Textarea
          value={composerValue}
          onChange={(e) => setComposerValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={powerMode ? 'Tell EveryAIOS what you need — / commands, @ files' : 'Tell EveryAIOS what you need…'}
          className="max-h-36 min-h-[28px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-relaxed shadow-none focus-visible:ring-0"
          rows={1}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn icon={Mic} label="Voice input" onClick={() => notify('Voice input — coming soon')} />
          {powerMode && (
            <IconBtn icon={Volume2} label="TTS toggle" onClick={() => notify('TTS toggled')} />
          )}
          <Button
            size="icon"
            className="h-7 w-7 shrink-0 rounded-md bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40"
            disabled={!canSend}
            onClick={send}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {powerMode && (
        <div className="mt-1 flex items-center gap-1 px-1 font-mono text-[9px] text-muted-foreground/60">
          <Hash className="h-2.5 w-2.5" />
          <span>Enter to send · Shift+Enter newline · Esc clear</span>
          <span className="ml-auto flex items-center gap-1"><AtSign className="h-2.5 w-2.5" /> mention</span>
          <span className="ml-1 flex items-center gap-1"><ScrollText className="h-2.5 w-2.5" /> slash</span>
          <span className="ml-1 flex items-center gap-1"><RotateCcw className="h-2.5 w-2.5" /> !macro</span>
        </div>
      )}
    </div>
  )
}
