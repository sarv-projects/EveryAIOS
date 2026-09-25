'use client'

// One collapsible section of the run surface.
//
// A plain `<button aria-expanded aria-controls>` over a labelled region: native
// focus order, Enter/Space toggling and a visible focus ring come for free
// (WCAG 2.2 2.1.1 / 4.1.2), and no ARIA is invented for behaviour the browser
// already provides. The disclosure animates opacity only, so opening a section
// never shifts neighbouring rows (CLS = 0 for the toggle itself).

import { useId, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function RunSection({
  title,
  icon: Icon,
  meta,
  open,
  onToggle,
  children,
  tone = 'default',
}: {
  title: string
  icon?: React.ElementType
  /** Short right-aligned summary shown when the section is collapsed. */
  meta?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  tone?: 'default' | 'alert'
}) {
  const baseId = useId()
  const panelId = `${baseId}-panel`
  const buttonId = `${baseId}-button`
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <section
      data-testid={`run-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      className="border-b border-border/60"
    >
      <h3 className="m-0">
        <button
          type="button"
          id={buttonId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            'flex w-full items-center gap-2 px-4 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60',
            'hover:bg-accent/50',
          )}
        >
          <Chevron aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
          {Icon ? (
            <Icon
              aria-hidden
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                tone === 'alert' ? 'text-warning' : 'text-muted-foreground',
              )}
              strokeWidth={1.75}
            />
          ) : null}
          <span
            className={cn(
              'flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em]',
              tone === 'alert' ? 'text-warning' : 'text-foreground/80',
            )}
          >
            {title}
          </span>
          {meta ? (
            <span className="shrink-0 truncate font-mono text-[9px] tabular-nums text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </button>
      </h3>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={buttonId} className="enter-surface px-4 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/** A label/value row. `tabular-nums` keeps figures from jittering. */
export function RunFact({
  label,
  value,
  tone,
  title,
}: {
  label: string
  value: ReactNode
  tone?: string
  title?: string
}) {
  return (
    <div className="flex items-baseline gap-2 py-0.5" title={title}>
      <span className="w-[104px] shrink-0 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 flex-1 break-words font-mono text-[10.5px] tabular-nums text-foreground/90', tone)}>
        {value}
      </span>
    </div>
  )
}
