'use client'

import { useId, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileCode2,
  ShieldAlert,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useAppStore, type MCQInterrupt } from '@/lib/store'
import { cn } from '@/lib/utils'
import { tierFor, TIER_LABEL, isHighBlast, confirmWord, confirmSatisfied } from '@/lib/interrupts'

function DiffView({ diff }: { diff: NonNullable<MCQInterrupt['diff']> }) {
  return (
    <div className="space-y-2">
      {diff.map((d, i) => (
        <div key={i} className="overflow-hidden rounded-md border border-border">
          <div className="flex items-center gap-1.5 border-b border-border bg-zinc-900/60 px-2 py-1">
            <FileCode2 aria-hidden className="h-3 w-3 text-muted-foreground" />
            <span className="truncate font-mono text-[10px] text-foreground">{d.file}</span>
          </div>
          <div className="font-mono text-[10px] leading-relaxed">
            {d.removed.map((line, j) => (
              <div
                key={`r-${j}`}
                className="border-l-2 border-rose-500/60 bg-rose-500/10 px-2 py-0.5 text-rose-300"
              >
                <span className="select-none text-rose-500/60">- </span>
                {line}
              </div>
            ))}
            {d.added.map((line, j) => (
              <div
                key={`a-${j}`}
                className="border-l-2 border-emerald-500/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-300"
              >
                <span className="select-none text-emerald-500/60">+ </span>
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function McqOptions({
  options,
  selected,
  onSelect,
}: {
  options: NonNullable<MCQInterrupt['options']>
  selected: string | null
  onSelect: (v: string) => void
}) {
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Answer options">
      {options.map((o, i) => {
        const isSel = selected === o.value
        const letter = String.fromCharCode(65 + i)
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={isSel}
            onClick={() => onSelect(o.value)}
            className={cn(
              'flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              isSel
                ? 'border-brand/60 bg-brand/10'
                : 'border-border bg-background/40 hover:border-brand/30 hover:bg-accent/40',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[9px]',
                isSel ? 'border-brand bg-brand text-white' : 'border-muted-foreground/40 text-muted-foreground',
              )}
              aria-hidden
            >
              {letter}
            </span>
            <span className="text-[11px] leading-relaxed text-foreground">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function AutonomyBody({
  mcq,
  selected,
  onSelect,
}: {
  mcq: MCQInterrupt
  selected: string | null
  onSelect: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      {mcq.autonomyAction && (
        <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground">
          {mcq.autonomyAction}
        </div>
      )}
      {mcq.autonomyReason && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{mcq.autonomyReason}</p>
      )}
      {mcq.options && <McqOptions options={mcq.options} selected={selected} onSelect={onSelect} />}
    </div>
  )
}

function BudgetBar({ used, cap }: { used: number; cap: number }) {
  const pct = Math.min(100, (used / cap) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span className="text-foreground">${used.toFixed(2)}</span>
        <span className="text-muted-foreground">/ ${cap.toFixed(2)} cap</span>
      </div>
      <Progress
        value={pct}
        className="h-1.5 bg-muted/40 [&>[data-slot=progress-indicator]]:bg-brand"
      />
      <p className="font-mono text-[10px] text-muted-foreground">{pct.toFixed(0)}% of session budget used</p>
    </div>
  )
}

export interface ConsentSummary {
  action: string
  resource: string
  scope: string
  reversibility: string
}

function firstSentence(value: string): string {
  return value.trim().split(/(?<=[.!?])\s+/)[0] ?? value.trim()
}

/**
 * Human-readable consent facts. This is a projection of the interrupt the
 * agent supplied; it never grants access or changes a Guard policy.
 */
export function consentSummary(mcq: MCQInterrupt, highBlast = false): ConsentSummary {
  const title = mcq.title.trim() || firstSentence(mcq.description) || 'Complete the requested action'
  const files = (mcq.diff ?? []).map((d) => d.file.trim()).filter(Boolean)
  const requestText = `${mcq.title} ${mcq.description}`.toLowerCase()
  const mentionsRecipient = /\b(send|email|message|share|publish|post|upload|transfer|recipient)\b/.test(
    requestText,
  )
  const resource = files.length > 0
    ? `The change preview names ${files.join(', ')}.`
    : 'The resource named in this request.'
  const scope = mentionsRecipient
    ? 'This request and its named recipient only; Guard checks the exact destination before anything leaves.'
    : files.length > 0
      ? 'Limited to the resource and changes shown in the preview.'
      : 'This one request only; no extra access is granted by the card.'
  const reversibility = highBlast
    ? 'Hard to undo — type the resource name to confirm before Guard is asked to approve.'
    : 'Guard checks whether this can be undone; no undo is promised by this card.'
  return { action: title, resource, scope, reversibility }
}

function ConsentFacts({ summary }: { summary: ConsentSummary }) {
  return (
    <dl className="grid gap-1.5 rounded-md border border-brand/20 bg-background/45 px-2.5 py-2 text-[10px] leading-relaxed sm:grid-cols-[8.5rem_1fr] sm:gap-x-2" aria-label="What Guard will check">
      <dt className="font-medium text-foreground">Action</dt>
      <dd className="text-muted-foreground">{summary.action}</dd>
      <dt className="font-medium text-foreground">Data / resource</dt>
      <dd className="text-muted-foreground">{summary.resource}</dd>
      <dt className="font-medium text-foreground">Scope / recipient</dt>
      <dd className="text-muted-foreground">{summary.scope}</dd>
      <dt className="font-medium text-foreground">Reversibility</dt>
      <dd className="text-muted-foreground">{summary.reversibility}</dd>
    </dl>
  )
}

function InterruptTechnicalDetails({ mcq, highBlast }: { mcq: MCQInterrupt; highBlast: boolean }) {
  const [open, setOpen] = useState(false)
  const generatedId = useId()
  const id = `interrupt-details-${generatedId.replace(/:/g, '')}`
  return (
    <div className="mt-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${open ? 'Hide' : 'Show'} technical details for this request`}
      >
        Technical details
        <ChevronDown
          aria-hidden
          className={cn('h-3 w-3 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div id={id} className="mt-1 space-y-1 rounded-md border border-border/60 bg-background/50 p-2 font-mono text-[9px] text-muted-foreground">
          <div>Kind: {mcq.kind}</div>
          <div>High-blast check: {highBlast ? 'required' : 'not triggered'}</div>
          {mcq.urgency && <div>Urgency: {mcq.urgency}</div>}
          {mcq.approvalNonce && <div className="break-all">Approval nonce: {mcq.approvalNonce}</div>}
        </div>
      )}
    </div>
  )
}

export default function McqInterruptCard({ mcq }: { mcq: MCQInterrupt }) {
  const respondMcq = useAppStore((s) => s.respondMcq)
  const [selected, setSelected] = useState<string | null>(mcq.options?.[0]?.value ?? null)
  // WP4 — "danger looks different". An irreversible effect cannot be approved
  // with the same reflex click as a routine one: the user retypes the name of
  // the thing being changed. Guard remains the only authority for the effect.
  const tier = tierFor(mcq)
  const highBlast = isHighBlast(`${mcq.title} ${mcq.description ?? ''}`)
  const word = highBlast ? confirmWord(mcq) : ''
  const [typed, setTyped] = useState('')
  const gateOpen = confirmSatisfied(mcq, typed)
  const summary = consentSummary(mcq, highBlast)
  const titleId = `interrupt-title-${mcq.id}`

  return (
    <Card className="enter-approval gap-0 overflow-hidden border-brand/40 bg-brand/5 p-0" aria-labelledby={titleId}>
      <div className="flex items-start gap-2.5 border-b border-brand/20 px-3 py-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
          <ShieldAlert aria-hidden className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 id={titleId} className="truncate text-sm font-medium text-foreground">
              {mcq.kind === 'mcq' ? 'Questions' : mcq.title}
            </h4>
            <Badge
              variant="outline"
              className={cn(
                'text-[9px]',
                tier === 'needs-you'
                  ? 'border-brand/40 bg-brand/10 text-brand'
                  : 'border-border bg-background/40 text-muted-foreground',
              )}
            >
              {TIER_LABEL[tier]}
            </Badge>
            {mcq.urgency && mcq.urgency !== 'low' && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px]',
                  mcq.urgency === 'high'
                    ? 'live-dot border-rose-500/50 bg-rose-500/10 text-rose-400'
                    : 'border-warning/50 bg-warning/10 text-warning',
                )}
              >
                {mcq.urgency === 'high' ? 'High priority' : 'Medium priority'}
              </Badge>
            )}
          </div>
          {mcq.description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{mcq.description}</p>
          )}
        </div>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        {mcq.kind !== 'mcq' && <ConsentFacts summary={summary} />}

        {mcq.kind === 'diff' && mcq.diff && <DiffView diff={mcq.diff} />}

        {mcq.kind === 'autonomy' && (
          <AutonomyBody mcq={mcq} selected={selected} onSelect={setSelected} />
        )}

        {mcq.kind === 'permission' && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1.5">
            <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Guard will review this request in its approval window. Nothing runs until that decision is recorded.
            </p>
          </div>
        )}

        {highBlast && (
          <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-2.5">
            <p className="text-[11px] leading-relaxed text-rose-200">
              This one is hard to undo. Type <code className="rounded bg-rose-500/15 px-1 font-mono text-rose-100">{word}</code> to confirm before asking Guard.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={`Type ${word} to confirm`}
              placeholder={word}
              className="mt-1.5 h-7 w-full rounded border border-rose-500/40 bg-background px-2 font-mono text-[11px] text-foreground outline-none focus:border-rose-400"
            />
          </div>
        )}

        {mcq.kind === 'mcq' && mcq.options && (
          <McqOptions options={mcq.options} selected={selected} onSelect={setSelected} />
        )}

        {mcq.kind === 'budget' && mcq.budget && <BudgetBar used={mcq.budget.used} cap={mcq.budget.cap} />}

        <InterruptTechnicalDetails mcq={mcq} highBlast={highBlast} />
      </div>

      <div className="space-y-1.5 border-t border-brand/20 bg-zinc-950/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mcq.kind === 'autonomy' ? (
            <>
              <Button
                size="sm"
                className="h-7 gap-1.5 bg-brand px-3 text-[11px] text-white hover:bg-brand-hover"
                onClick={() => respondMcq(mcq.id, selected ?? mcq.options?.[0]?.value ?? 'do-once')}
              >
                <Zap aria-hidden className="h-3 w-3" />
                Continue elevated
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2.5 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={() => respondMcq(mcq.id, 'reject')}
                title="Deny the elevation and keep the current safety level"
                aria-label="Deny elevation and keep the current safety level"
              >
                <X aria-hidden className="h-3 w-3" />
                Keep current level
              </Button>
            </>
          ) : mcq.kind === 'mcq' ? (
            <>
              <Button
                size="sm"
                className="h-7 gap-1.5 bg-brand px-3 text-[11px] text-white hover:bg-brand-hover"
                onClick={() => respondMcq(mcq.id, selected ?? mcq.options?.[0]?.value ?? 'skip')}
              >
                <Check aria-hidden className="h-3 w-3" />
                Continue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2.5 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={() => respondMcq(mcq.id, 'takeover')}
              >
                <X aria-hidden className="h-3 w-3" />
                Stop
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={!gateOpen}
                title={gateOpen ? 'Open Guard for the final approval decision' : `Type “${word}” to enable this`}
                className="h-7 gap-1.5 bg-brand px-3 text-[11px] text-white hover:bg-brand-hover disabled:opacity-40"
                onClick={() => respondMcq(mcq.id, 'approve')}
              >
                <Check aria-hidden className="h-3 w-3" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2.5 text-[11px] text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                onClick={() => respondMcq(mcq.id, 'reject')}
                title="Deny this request in Guard; the action will not run"
              >
                <X aria-hidden className="h-3 w-3" />
                Deny
              </Button>
            </>
          )}
        </div>
        <p className="text-[9px] leading-relaxed text-muted-foreground">
          Guard is the approval authority. Deny stops this request without granting a lasting permission.
        </p>
      </div>
    </Card>
  )
}
