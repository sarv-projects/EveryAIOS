'use client'

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { OfficeOpenBar } from './office-open-bar'
import { docxOpen, demoDocx, type DocxPayload } from '@/lib/office'

export default function OfficeDocxView() {
  const [payload, setPayload] = useState<DocxPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  // P11.2 — office editor UX: track-changes-style display of AI edits.
  const [trackChanges, setTrackChanges] = useState(true)

  const open = async (path: string) => {
    try {
      setError(null)
      setPayload(await docxOpen(path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open document')
    }
  }

  const title = payload?.path ?? 'exec-summary.docx'
  const paragraphs = payload
    ? payload.text.split('\n').filter((l) => l.trim().length > 0)
    : null

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="max-w-[240px] truncate font-mono text-xs font-medium text-foreground">
            {title}
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
              demo
            </Badge>
          )}
        </div>
        {/* P11.2 — track-changes toggle: highlights the agent's edits like
            Word track changes (modified blocks get a border + badge). */}
        <button
          onClick={() => setTrackChanges(!trackChanges)}
          aria-pressed={trackChanges}
          className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
            trackChanges
              ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
              : 'border-border text-muted-foreground'
          }`}
        >
          {trackChanges ? 'Track changes on' : 'Track changes off'}
        </button>
        <Badge variant="secondary" className="text-[10px]">
          block-patch
        </Badge>
      </header>

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          ⚠ {error}
        </div>
      )}

      <ScrollArea className="scroll-thin min-h-0 flex-1">
        {payload ? (
          <div className="mx-auto max-w-3xl bg-[#1c1d20] p-8 sm:p-12">
            <article className="prose-invert space-y-4">
              {paragraphs!.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground/90">
                  {p}
                </p>
              ))}
            </article>
            <div className="mt-6 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
              {payload.blocks.length} block(s) · surgical OOXML read
            </div>
          </div>
        ) : (
        <div className="mx-auto max-w-3xl bg-[#1c1d20] p-8 sm:p-12">
          <article className="prose-invert space-y-4">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Q3 2026 Executive Summary
            </h1>
            <div className="font-mono text-[10px] text-muted-foreground">
              Prepared by EveryAIOS Agent · 2026-09-30
            </div>

            <h2 className="pt-2 text-lg font-semibold text-orange-300">1. Overview</h2>
            <p className="text-sm leading-relaxed text-foreground/90">
              The third quarter of 2026 marked a strong inflection for the business, with
              revenue acceleration driven by enterprise expansion across the EMEA and APAC
              regions. Customer retention remained above industry benchmarks and product
              velocity increased materially.
            </p>

            <h2 className="pt-2 text-lg font-semibold text-orange-300">
              2. Financial Highlights
            </h2>
            <ul className="space-y-1.5 text-sm text-foreground/90">
              <li className="flex gap-2">
                <span className="text-orange-400">▸</span>
                <span>Revenue reached $1.8M, up 20% quarter-over-quarter.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400">▸</span>
                <span>Gross margin improved to 66% (from 61% in Q2).</span>
              </li>
              <li className="flex gap-2">
                <span className="text-orange-400">▸</span>
                <span>Enterprise deal count grew 35% YoY.</span>
              </li>
            </ul>

            <h2 className="pt-2 text-lg font-semibold text-orange-300">
              3. Key Drivers · §3.2
            </h2>
            <div
              className={
                trackChanges
                  ? 'rounded border-l-2 border-orange-500 bg-orange-500/5 px-3 py-2'
                  : 'rounded px-3 py-2'
              }
            >
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-orange-300">
                <span>{trackChanges ? 'Agent editing · typing' : 'Inserted text'}</span>
                {trackChanges && (
                  <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-[9px] text-orange-300">
                    modified
                  </Badge>
                )}
              </div>
              <p className="overflow-hidden whitespace-nowrap text-sm leading-relaxed text-foreground">
                <span
                  className="inline-block align-bottom"
                  style={{
                    animation: 'type-in 4s steps(60) forwards',
                  }}
                >
                  Revenue grew 20% QoQ, reaching $1.8M driven by enterprise deals.
                </span>
                <span className="caret-blink ml-0.5 inline-block h-4 w-0.5 bg-orange-400 align-middle" />
              </p>
            </div>

            <h2 className="pt-2 text-lg font-semibold text-orange-300">
              4. Outlook · Q4 2026
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground/70">Lorem ipsum dolor sit amet</span> — pipeline
              expansion and partner co-sell motion expected to sustain trajectory. ▮
            </p>
          </article>
        </div>
        )}
      </ScrollArea>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        <span>{payload ? `Blocks: ${payload.blocks.length}` : 'Page 1/3'}</span>
        <span>{payload ? `Words: ${payload.text.split(/\s+/).length}` : 'Words: 847'}</span>
        <Badge
          variant="outline"
          className="gap-1 border-orange-500/40 text-[9px] text-orange-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          Modified
        </Badge>
      </footer>
    </div>
  )
}
