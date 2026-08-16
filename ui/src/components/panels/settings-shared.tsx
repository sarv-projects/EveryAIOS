'use client'

import { Label } from '@/components/ui/label'

export function SectionShell({
  title,
  desc,
  action,
  children,
}: {
  title: string
  desc?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {desc && (
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              {desc}
            </p>
          )}
        </div>
        {action && <div className="shrink-0 sm:ml-3">{action}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border/50 bg-background/30 px-3 py-2">
      <div className="min-w-0">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {desc && <p className="mt-0.5 text-[10px] text-muted-foreground">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function LinkChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs text-foreground/80 hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-300">
      {icon}
      {label}
    </button>
  )
}
