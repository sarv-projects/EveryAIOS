'use client'

// What the run left behind, in one glance: the state the fold reports, the
// files it touched, the tests it ran, the paths two writers both touched, and
// the handoffs between specialists.
//
// Every number and every row here is a field of the folded `AgentCard`, which
// is itself a fold of the Work journal. Nothing is counted by this panel: an
// empty list means **the journal reported nothing of that kind**, and it is
// labelled as such rather than shown as a zero — the difference between "no
// tests ran" and "no test result was reported" is the whole point (I15).

import { useState } from 'react'
import { CheckCircle2, ChevronRight, FileWarning, GitBranch, TestTube, XCircle } from 'lucide-react'
import { runOutcome } from '@/components/views/run-projection'
import type { AgentCard } from '@/lib/agent-card'
import { cn } from '@/lib/utils'

const STATE_TONE: Record<string, string> = {
  running: 'text-brand',
  awaiting_input: 'text-warning',
  completed: 'text-success',
  failed: 'text-rose-300',
  idle: 'text-muted-foreground',
}

export function RunOutcomeStrip({ card }: { card: AgentCard }) {
  const [showAllFiles, setShowAllFiles] = useState(false)
  const outcome = runOutcome(card)
  const shownFiles = showAllFiles ? outcome.files : outcome.files.slice(0, 4)
  const hasAnything =
    outcome.files.length > 0 ||
    outcome.tests.length > 0 ||
    outcome.conflicts.length > 0 ||
    outcome.handoffs.length > 0

  if (!hasAnything) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-relaxed text-muted-foreground">
        The run reported no files, tests, conflicts, or handoffs yet. Rows appear here only when the
        journal records them.
      </p>
    )
  }

  return (
    <div data-testid="run-outcome" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] tabular-nums text-muted-foreground">
        <span className={cn('font-semibold', STATE_TONE[card.status] ?? 'text-muted-foreground')}>
          {outcome.state}
        </span>
        {outcome.files.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span>
              {outcome.files.length} file{outcome.files.length === 1 ? '' : 's'} touched
            </span>
          </>
        ) : null}
        {outcome.tests.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <TestTube aria-hidden className="h-2.5 w-2.5" />
              {outcome.testsPassed} passed
              {outcome.testsFailed > 0 ? `, ${outcome.testsFailed} failed` : ''}
            </span>
          </>
        ) : null}
        {outcome.conflicts.length > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1 text-warning">
              <FileWarning aria-hidden className="h-2.5 w-2.5" />
              {outcome.conflicts.length} write conflict
              {outcome.conflicts.length === 1 ? '' : 's'}
            </span>
          </>
        ) : null}
      </div>

      {outcome.tests.some((t) => !t.passed) ? (
        <ul className="space-y-0.5">
          {outcome.tests
            .filter((t) => !t.passed)
            .map((t) => (
              <li
                key={`failed-${t.name}`}
                className="flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/[0.07] px-1.5 py-0.5"
              >
                <XCircle aria-hidden className="h-3 w-3 shrink-0 text-rose-300" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-rose-200">
                  {t.name}
                </span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-rose-300">
                  failed
                </span>
              </li>
            ))}
        </ul>
      ) : null}

      {outcome.conflicts.length > 0 ? (
        <div>
          <p className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Two writers touched the same path
          </p>
          <ul className="space-y-0.5">
            {outcome.conflicts.map((c) => (
              <li
                key={`conflict-${c}`}
                className="truncate rounded border border-warning/40 bg-warning/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-warning"
                title={c}
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outcome.files.length > 0 ? (
        <div>
          <p className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Paths the journal recorded
          </p>
          <ul className="space-y-0.5">
            {shownFiles.map((f) => (
              <li
                key={`file-${f}`}
                className="flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-accent/40"
                title={f}
              >
                <CheckCircle2 aria-hidden className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">
                  {f}
                </span>
              </li>
            ))}
          </ul>
          {outcome.files.length > shownFiles.length ? (
            <button
              type="button"
              onClick={() => setShowAllFiles(true)}
              className="mt-0.5 inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <ChevronRight aria-hidden className="h-2.5 w-2.5" />
              Show all {outcome.files.length}
            </button>
          ) : null}
        </div>
      ) : null}

      {outcome.handoffs.length > 0 ? (
        <div>
          <p className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            <GitBranch aria-hidden className="h-2.5 w-2.5" />
            Handoffs
          </p>
          <ul className="space-y-1">
            {outcome.handoffs.map((h) => (
              <li
                key={h.artifactId}
                className="rounded border border-border/60 bg-background/30 px-1.5 py-1"
              >
                <p className="truncate font-mono text-[9.5px] text-foreground/85">
                  {h.fromAgent} → {h.toAgent}
                  <span className="ml-1 opacity-60">{h.artifactId}</span>
                </p>
                {h.summary ? (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[9.5px] leading-relaxed text-muted-foreground">
                    {h.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
