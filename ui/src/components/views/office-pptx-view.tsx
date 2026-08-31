'use client'

import { useState } from 'react'
import { Presentation, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { OfficeOpenBar } from './office-open-bar'
import OfficeFileSwitcher from './office-file-switcher'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import { pptxOpen, pptxNotes, officeOpenExternal, isOfficeFloorError, type PptxPayload } from '@/lib/office'

const SLIDES = [
  { title: 'Q3 2026 Results', active: false },
  { title: 'Agenda', active: false },
  { title: 'Q3 2026 Results', active: true, current: true },
  { title: 'Pipeline', active: false },
  { title: 'Q4 Outlook', active: false },
]

export default function OfficePptxView() {
  const [current, setCurrent] = useState(2)
  const [payload, setPayload] = useState<PptxPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Array<{ slide: number; talk: string }>>([])
  const [lastAttempted, setLastAttempted] = useState<string | null>(null)
  const running = useAppStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.status === 'running')
  const paused = useAppStore((s) => s.pausedSessions[s.activeSessionId])
  // P1.9 — read-only while the agent is running (same lock as Word).
  const locked = running && !paused

  const open = async (path: string) => {
    try {
      setError(null)
      setLastAttempted(path)
      setPayload(await pptxOpen(path))
      setCurrent(0)
      try {
        setNotes((await pptxNotes(path)).notes)
      } catch {
        setNotes([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open deck')
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Presentation className="h-4 w-4 text-orange-400" />
          <span className="max-w-[240px] truncate font-mono text-xs font-medium text-foreground">
            {payload?.path ?? (inTauri() ? 'No presentation open' : 'quarterly-deck.pptx')}
          </span>
          {payload ? (
            <Badge variant="outline" className="text-[10px] text-emerald-300">
              engine read
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300"
            >
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
              {inTauri() ? 'no file open' : 'preview'}
            </Badge>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {payload ? `Slide ${current + 1} / ${payload.slides.length}` : 'Slide 3 / 12'}
        </span>
      </header>

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />
      <OfficeFileSwitcher view="office-pptx" current={payload?.path} onOpen={open} />

      {locked && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-[10px] text-amber-300">
          Read-only while the agent is running — pause to take over
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          <span>⚠ {error}</span>
          {lastAttempted && !isOfficeFloorError(error) && (
            <button
              className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[9px] text-red-300 hover:bg-red-500/25"
              onClick={() =>
                officeOpenExternal(lastAttempted).catch((e) => setError(String(e)))
              }
            >
              Engine refused — open in LibreOffice instead
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-zinc-950/40 p-4">
          <div className="relative mx-auto aspect-video w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-gradient-to-br from-[#1d1f23] to-[#141518] shadow-lg">
            {payload && payload.slides[current] && (
              <div className="flex h-full flex-col p-8">
                <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-orange-500 to-orange-300" />
                <Badge variant="secondary" className="mb-3 w-fit bg-orange-500/15 text-[9px] text-orange-300">
                  {payload.slides[current].part}
                </Badge>
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80">
                  {payload.slides[current].text}
                </pre>
              </div>
            )}
            {!payload && !inTauri() && <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-orange-500 to-orange-300" />}
            {!payload && inTauri() && (
              <div className="flex h-full items-center justify-center p-8 text-center text-xs text-muted-foreground">
                Open a real presentation to view slides and speaker notes.
              </div>
            )}
            {!payload && !inTauri() && (
            <div className="flex h-full flex-col p-8">
              <Badge
                variant="secondary"
                className="mb-3 w-fit bg-orange-500/15 text-[9px] text-orange-300"
              >
                Q3 FY26 · Board Review
              </Badge>
              <h2 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
                Q3 2026 Results
              </h2>
              <p className="mb-4 font-mono text-sm text-orange-300">
                Revenue: $1.8M <span className="text-emerald-400">(+20% QoQ)</span>
              </p>

              <div className="mt-auto grid grid-cols-4 gap-2">
                {[60, 67, 80, 90].map((h, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1 rounded border border-border bg-zinc-900/60 p-2"
                  >
                    <div className="flex h-16 w-full items-end justify-center">
                      <div
                        className="w-3 rounded-t bg-gradient-to-t from-orange-600 to-orange-400"
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="font-mono text-[8px] text-muted-foreground">
                      Q{i + 1}
                    </span>
                  </div>
                ))}
              </div>

              <div className="absolute right-4 top-4 flex items-center gap-1 font-mono text-[9px] text-muted-foreground">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
                Agent editing
              </div>
            </div>
            )}
          </div>

          {notes[current] && (
            <div className="mt-2 rounded border border-border bg-zinc-950 p-2 font-mono text-[10px] text-muted-foreground">
              <StickyNote className="mr-1 inline h-3 w-3" />
              {notes[current]?.talk || 'No speaker notes'}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => setCurrent(Math.max(0, current - 1))}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono text-[10px] text-muted-foreground">
              {payload ? payload.slides[current]?.part : inTauri() ? 'No presentation open' : 'Editing text box · "Revenue: $1.8M (+20%)"'}
            </span>
            <button
              onClick={() =>
                setCurrent(Math.min((payload ? payload.slides.length : SLIDES.length) - 1, current + 1))
              }
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <aside className="hidden w-56 shrink-0 border-l border-border bg-card lg:block">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium">
            <StickyNote className="h-3.5 w-3.5 text-orange-400" />
            Speaker notes
          </div>
          {/* P2.11 — live speaker notes from pptx_notes when a deck is open;
              the guizang demo stays the preview-only fallback. */}
          <div className="p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {payload ? (
              <p className="whitespace-pre-wrap text-foreground/80">
                {notes.find((n) => n.slide === current + 1)?.talk || 'No speaker notes for this slide'}
              </p>
            ) : inTauri() ? (
              <p>Speaker notes unavailable until a real presentation is open.</p>
            ) : (
              <>
                <div className="mb-1 text-[9px] uppercase tracking-wide text-orange-300">
                  P4.7b · guizang SPEAKER_NOTES
                </div>
                <p className="text-foreground/80">
                  Open by acknowledging the team&apos;s execution. Land the headline: $1.8M revenue,
                  up 20% QoQ. Anchor on enterprise expansion as the primary driver.
                </p>
                <p className="mt-2 text-foreground/70">
                  Note: margin improvement (61→66%) reflects vendor renegotiation and tiered
                  pricing. Mention 35% YoY enterprise deal growth.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>

      <div className="border-t border-border bg-zinc-900/60 px-3 py-2">
        <div className="flex gap-2 overflow-x-auto scroll-thin">
          {(payload ? payload.slides : inTauri() ? [] : SLIDES).map((s, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={cn(
                'shrink-0 rounded border p-1 transition-colors',
                i === current
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-border bg-zinc-950/40 hover:border-muted-foreground'
              )}
            >
              <div className="flex aspect-video w-16 flex-col justify-center gap-0.5 rounded bg-gradient-to-br from-zinc-800 to-zinc-900 px-1 py-0.5">
                <div className="h-0.5 w-3/4 rounded bg-orange-400/60" />
                <div className="h-0.5 w-1/2 rounded bg-emerald-400/40" />
                <div className="mt-1 flex gap-0.5">
                  {[0, 1, 2, 3].map((b) => (
                    <div
                      key={b}
                      className="h-2 w-1 rounded-sm bg-zinc-600"
                      style={{ opacity: 1 - b * 0.15 }}
                    />
                  ))}
                </div>
              </div>
              <div
                className={cn(
                  'mt-1 font-mono text-[9px]',
                  i === current ? 'text-orange-300' : 'text-muted-foreground'
                )}
              >
                {i + 1}
              </div>
            </button>
          ))}
          <button
            disabled={locked}
            title={locked ? 'Read-only while the agent is running' : 'Add slide'}
            className="flex shrink-0 items-center justify-center rounded border border-dashed border-border px-3 text-orange-300 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
