'use client'

import { useState } from 'react'
import { FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { OfficeOpenBar } from './office-open-bar'
import { pdfOpen, type PdfPayload } from '@/lib/office'

const FORM_FIELDS = [
  { label: 'Party A:', value: 'Acme Holdings, Inc.', top: 18 },
  { label: 'Party B:', value: 'EveryAIOS, LLC', top: 26 },
  { label: 'Effective Date:', value: '2026-10-01', top: 34 },
  { label: 'Contract Value:', value: '$ 1,800,000.00 USD', top: 42, highlight: true },
]

export default function OfficePdfView() {
  const [page, setPage] = useState(2)
  const [zoom, setZoom] = useState(100)
  const [payload, setPayload] = useState<PdfPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = async (path: string) => {
    try {
      setError(null)
      setPayload(await pdfOpen(path))
      setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open PDF')
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-zinc-900">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-red-400" />
          <span className="max-w-[240px] truncate font-mono text-xs font-medium text-foreground">
            {payload?.path ?? 'contract.pdf'}
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
        <Badge variant="secondary" className="text-[10px]">
          lopdf
        </Badge>
      </header>

      <OfficeOpenBar onOpen={open} livePath={payload?.path} />

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-[10px] text-red-400">
          ⚠ {error}
        </div>
      )}

      <ScrollArea className="scroll-thin min-h-0 flex-1 bg-zinc-950/40">
        <div className="flex justify-center p-4">
          {payload ? (
            <div className="w-full max-w-3xl space-y-2">
              {payload.texts[page - 1] != null && (
                <div className="rounded-sm bg-[#fbfbf9] p-6 font-mono text-[11px] leading-relaxed text-zinc-800 shadow-xl">
                  {payload.texts[page - 1]}
                </div>
              )}
            </div>
          ) : (
          <div
            className="relative rounded-sm bg-[#fbfbf9] shadow-xl"
            style={{ width: `${(612 * zoom) / 100}px`, height: `${(792 * zoom) / 100}px` }}
          >
            <div className="absolute inset-0 p-8 text-zinc-800">
              <div className="mb-1 text-[9px] uppercase tracking-widest text-zinc-400">
                Master Services Agreement
              </div>
              <h1 className="mb-3 text-lg font-bold text-zinc-900">
                Section 4 — Compensation &amp; Payment Terms
              </h1>

              <div className="space-y-1.5 text-[11px] leading-relaxed">
                <p>
                  This Master Services Agreement (&quot;Agreement&quot;) is entered into
                  between the parties identified below, effective as of the Effective Date set
                  forth herein.
                </p>

                {FORM_FIELDS.map((f) => (
                  <div
                    key={f.label}
                    className={cn(
                      'relative rounded border px-2 py-1',
                      f.highlight
                        ? 'border-orange-500 bg-yellow-300/40'
                        : 'border-yellow-400 bg-yellow-200/60'
                    )}
                    style={{ marginTop: '8px' }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-zinc-700">{f.label}</span>
                      <span className="flex-1 border-b border-dotted border-zinc-400 font-mono">
                        {f.value}
                        {f.highlight && (
                          <span className="caret-blink ml-0.5 inline-block h-3 w-0.5 bg-orange-500 align-middle" />
                        )}
                      </span>
                    </div>
                    <span className="absolute -right-5 top-0 text-[8px] text-zinc-500">
                      <MessageSquare className="h-3 w-3" />
                    </span>
                  </div>
                ))}

                <p className="pt-2">
                  4.2 <span className="font-semibold">Payment Schedule.</span> Invoices shall
                  be issued on a monthly basis and are due net-thirty (30) days from the date
                  of issuance.
                </p>
                <p>
                  4.3 <span className="font-semibold">Late Payment.</span> Any payment not
                  received within fifteen (15) days of the due date shall accrue interest at
                  1.5% per month.
                </p>
              </div>

              <div className="absolute bottom-8 left-8 right-8 flex justify-between text-[9px] text-zinc-400">
                <span>Acme Holdings, Inc.</span>
                <span>EveryAIOS, LLC</span>
              </div>
              <div className="absolute bottom-2 left-0 right-0 text-center text-[8px] text-zinc-400">
                Page {page} of 8 · CONFIDENTIAL
              </div>
            </div>

            <div className="absolute right-2 top-2 rounded bg-orange-500/90 px-1.5 py-0.5 font-mono text-[8px] text-black">
              ANNOTATION · §4.1
            </div>
          </div>
          )}
        </div>
      </ScrollArea>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Page</span>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="text-foreground">
            {page} / {payload ? payload.pages : 8}
          </span>
          <button
            onClick={() => setPage(Math.min(payload ? payload.pages : 8, page + 1))}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="text-foreground">Zoom: {zoom}%</span>
          <button
            onClick={() => setZoom(Math.min(200, zoom + 10))}
            className="rounded p-0.5 hover:bg-accent hover:text-foreground"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
        </div>
      </footer>
    </div>
  )
}
