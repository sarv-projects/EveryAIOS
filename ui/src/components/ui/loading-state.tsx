'use client'

import type { LucideIcon } from 'lucide-react'
import { Loader2, Hourglass, PackageOpen, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * P11.2 — typed loading states. `kind` maps to the three required scenarios:
 * TTFT (first-token wait), compaction in progress, tool executing — plus a
 * generic spinner. All render a label + subtle animation and read the
 * system's reduced-motion preference via the global CSS.
 */
export type LoadingKind = 'ttft' | 'compaction' | 'tool' | 'agent' | 'generic'

const META: Record<LoadingKind, { icon: LucideIcon; label: string }> = {
  ttft: { icon: Hourglass, label: 'Waiting for the first token…' },
  compaction: { icon: PackageOpen, label: 'Compacting context…' },
  tool: { icon: Wrench, label: 'Running tool…' },
  agent: { icon: Loader2, label: 'Agent is working…' },
  generic: { icon: Loader2, label: 'Loading…' },
}

export function LoadingState({
  kind = 'generic',
  label,
  compact = false,
  className,
}: {
  kind?: LoadingKind
  label?: string
  compact?: boolean
  className?: string
}) {
  const meta = META[kind]
  const Icon = meta.icon
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2.5 text-muted-foreground',
        compact ? 'py-3' : 'h-full w-full flex-col',
        className
      )}
    >
      <Icon className={cn('shrink-0 animate-spin', compact ? 'h-3.5 w-3.5' : 'h-5 w-5')} strokeWidth={1.5} />
      <span className={cn('text-xs', !compact && 'text-center')}>{label ?? meta.label}</span>
    </div>
  )
}

/** Skeleton block (P11.4) — shimmering placeholder for async content. */
export function SkeletonBlock({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('w-full space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="shimmer h-3 rounded"
          style={{ width: `${100 - ((i * 17) % 40)}%` }}
        />
      ))}
    </div>
  )
}
