'use client'

import { FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function OfficeDocxView() {
  return (
    <div className="flex h-full w-full flex-col bg-zinc-900">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="font-mono text-xs font-medium text-foreground">
            exec-summary.docx
          </span>
          <Badge
            variant="outline"
            className="gap-1 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300"
          >
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-orange-500" />
            Live
          </Badge>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          block-patch
        </Badge>
      </header>

      <ScrollArea className="scroll-thin min-h-0 flex-1">
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
            <div className="rounded border-l-2 border-orange-500 bg-orange-500/5 px-3 py-2">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-orange-300">
                Agent editing · typing
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
      </ScrollArea>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        <span>Page 1/3</span>
        <span>Words: 847</span>
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
