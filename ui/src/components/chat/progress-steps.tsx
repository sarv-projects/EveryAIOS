'use client'

import {
  BarChart3,
  Check,
  Circle,
  Code,
  Download,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Pencil,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { ProgressStep } from '@/lib/store'
import { AGENT_MAP } from '@/lib/agents'
import { cn } from '@/lib/utils'

// Map step types to which agent would handle them (visual annotation)
const STEP_AGENT: Record<ProgressStep['type'], string> = {
  file: 'everyaios-native',
  edit: 'claude-code',
  chart: 'everyaios-native',
  browser: 'grok-build',
  shell: 'codex-cli',
  code: 'claude-code',
  office: 'everyaios-native',
  export: 'everyaios-native',
  tool: 'everyaios-native',
}

function StepTypeIcon({ type }: { type: ProgressStep['type'] }) {
  const cls = 'h-3 w-3'
  switch (type) {
    case 'file':
      return <FileText className={cls} />
    case 'edit':
      return <Pencil className={cls} />
    case 'chart':
      return <BarChart3 className={cls} />
    case 'browser':
      return <Globe className={cls} />
    case 'shell':
      return <Terminal className={cls} />
    case 'code':
      return <Code className={cls} />
    case 'office':
      return <FileSpreadsheet className={cls} />
    case 'export':
      return <Download className={cls} />
    case 'tool':
      return <Wrench className={cls} />
    default:
      return <Circle className={cls} />
  }
}

function StatusDot({ status }: { status: ProgressStep['status'] }) {
  if (status === 'done')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-3 w-3" />
      </span>
    )
  if (status === 'active')
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/15 text-orange-400">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    )
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground">
      <Circle className="h-2 w-2" />
    </span>
  )
}

interface Props {
  steps: ProgressStep[]
}

export default function ProgressSteps({ steps }: Props) {
  return (
    <div className="mt-2 rounded-lg border border-border bg-background/40 px-2.5 py-2">
      <ul className="space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={step.id} className="relative flex gap-2.5">
              {/* connector */}
              {!isLast && (
                <span
                  className={cn(
                    'absolute left-[10px] top-5 w-px',
                    step.status === 'done'
                      ? 'bg-emerald-500/30'
                      : 'bg-border'
                  )}
                  style={{ height: 'calc(100% + 4px)' }}
                />
              )}

              <div className="relative z-10 mt-0.5">
                <StatusDot status={step.status} />
              </div>

              <button
                type="button"
                className={cn(
                  'group flex-1 rounded-md px-2 py-1 text-left transition-colors',
                  'hover:bg-accent/60',
                  step.status === 'active' && 'bg-orange-500/5'
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'text-muted-foreground',
                      step.status === 'active' && 'text-orange-300'
                    )}
                  >
                    <StepTypeIcon type={step.type} />
                  </span>
                  <span
                    className={cn(
                      'font-mono text-[11px] leading-tight',
                      step.status === 'done' && 'text-muted-foreground line-through decoration-muted-foreground/30',
                      step.status === 'active' && 'text-foreground',
                      step.status === 'pending' && 'text-muted-foreground/80'
                    )}
                  >
                    {step.label}
                  </span>
                  {/* Agent mark annotation — which runtime handled this step */}
                  {(() => {
                    const a = AGENT_MAP[STEP_AGENT[step.type]]
                    if (!a) return null
                    return (
                      <span className={cn('ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded text-[6px] font-bold opacity-60', a.accent)}>{a.mark}</span>
                    )
                  })()}
                  {step.timestamp && (
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/60">
                      {step.timestamp}
                    </span>
                  )}
                </div>
                {step.detail && (
                  <div className="mt-0.5 pl-[18px] font-mono text-[10px] text-muted-foreground/70">
                    {step.detail}
                  </div>
                )}
                {step.output && step.status === 'active' && (
                  <div className="mt-1 ml-[18px] rounded bg-zinc-950/60 px-1.5 py-1 font-mono text-[9px] text-emerald-300/80">
                    {step.output}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
