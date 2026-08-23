'use client'

import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, WifiOff, KeyRound, ServerCrash, Coins, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * P11.2 — typed error state. `kind` maps to the four required error
 * scenarios (network down / key revoked / provider 5xx / budget exceeded)
 * plus a generic fallback, each with its own icon + hint. `onRetry` is
 * optional (not every error is retryable — a revoked key wants Settings,
 * not another retry).
 */
export type ErrorKind = 'network' | 'keyRevoked' | 'provider5xx' | 'budget' | 'unknown'

const META: Record<ErrorKind, { icon: LucideIcon; title: string; hint: string }> = {
  network: {
    icon: WifiOff,
    title: 'Network unreachable',
    hint: 'Check your connection and try again.',
  },
  keyRevoked: {
    icon: KeyRound,
    title: 'API key revoked',
    hint: 'This key was revoked or invalidated. Add another key in Settings.',
  },
  provider5xx: {
    icon: ServerCrash,
    title: 'Provider hiccup',
    hint: 'The provider returned a 5xx. Wait a moment and retry.',
  },
  budget: {
    icon: Coins,
    title: 'Budget exceeded',
    hint: 'The session hit its spend cap. Raise the cap in Settings to continue.',
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Something went wrong',
    hint: 'Details are in the activity log.',
  },
}

export function errorMeta(kind: ErrorKind) {
  return META[kind]
}

/** Map a raw error string/code from the bridge onto an ErrorKind. */
export function classifyError(code?: string, message?: string): ErrorKind {
  const hay = `${code ?? ''} ${message ?? ''}`.toLowerCase()
  if (hay.includes('network') || hay.includes('offline') || hay.includes('econnrefused'))
    return 'network'
  if (hay.includes('revoked') || hay.includes('401') || hay.includes('unauthorized') || hay.includes('invalid_api_key'))
    return 'keyRevoked'
  if (hay.includes('5xx') || hay.includes('502') || hay.includes('503') || hay.includes('504'))
    return 'provider5xx'
  if (hay.includes('budget') || hay.includes('limit') || hay.includes('spent'))
    return 'budget'
  return 'unknown'
}

export function ErrorState({
  kind = 'unknown',
  title,
  detail,
  onRetry,
  compact = false,
  className,
}: {
  kind?: ErrorKind
  title?: string
  detail?: string
  onRetry?: () => void
  compact?: boolean
  className?: string
}) {
  const meta = META[kind]
  const Icon = meta.icon
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 text-center',
        compact ? 'py-4' : 'h-full w-full',
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <Icon className="h-4.5 w-4.5 text-destructive" strokeWidth={1.5} />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{title ?? meta.title}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {detail ?? meta.hint}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/** Inline (non-blocking) error chip for panels — keeps the surface usable. */
export function ErrorChip({ kind, onRetry }: { kind: ErrorKind; onRetry?: () => void }) {
  const meta = META[kind]
  const Icon = meta.icon
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{meta.title}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-2 hover:opacity-80">
          Retry
        </button>
      )}
    </div>
  )
}

export { HelpCircle }
