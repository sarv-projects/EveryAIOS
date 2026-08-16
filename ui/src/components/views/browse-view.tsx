'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  X,
  Globe,
  ChevronDown,
  PanelRightOpen,
  Cookie,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const PRODUCTS = [
  { name: 'Acme Pro Plan', price: '$49/mo', tag: 'Annual' },
  { name: 'Acme Team', price: '$129/mo', tag: 'Popular' },
  { name: 'Acme Enterprise', price: 'Custom', tag: 'Contact' },
  { name: 'Acme Starter', price: '$9/mo', tag: 'Free trial' },
  { name: 'Acme Plus', price: '$29/mo', tag: '' },
  { name: 'Acme Ultimate', price: '$299/mo', tag: 'Premium' },
]

export default function BrowseView() {
  const [inspectorOpen, setInspectorOpen] = useState(false)

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowRight className="h-4 w-4" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="h-4 w-4" />
        </button>

        <div className="mx-1 flex flex-1 items-center gap-2 rounded-md border border-border bg-zinc-950/60 px-3 py-1">
          <Lock className="h-3 w-3 text-emerald-400" />
          <Globe className="h-3 w-3 text-muted-foreground" />
          <span className="flex-1 truncate font-mono text-xs text-foreground">
            https://competitor.acme.com/products
            <span className="text-muted-foreground">?page=23</span>
          </span>
        </div>

        <Badge
          variant="outline"
          className="gap-1 border-red-500/40 bg-red-500/10 text-[10px] text-red-300"
        >
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" />
          Live
        </Badge>

        <button
          onClick={() => setInspectorOpen(!inspectorOpen)}
          className={cn(
            'rounded p-1 hover:bg-accent',
            inspectorOpen ? 'text-orange-400' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col bg-zinc-950/40">
          <div className="border-b border-border bg-zinc-900/60 px-4 py-2 text-xs">
            <div className="font-semibold text-foreground">Competitor pricing — Acme</div>
            <div className="text-[10px] text-muted-foreground">
              Scraped from public listing · updated 2 min ago
            </div>
          </div>
          <ScrollArea className="scroll-thin min-h-0 flex-1">
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              {PRODUCTS.map((p) => (
                <div
                  key={p.name}
                  className="rounded-lg border border-border bg-card p-3 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div className="font-medium text-foreground">{p.name}</div>
                    {p.tag && (
                      <Badge
                        variant="secondary"
                        className="bg-orange-500/15 text-[9px] text-orange-300"
                      >
                        {p.tag}
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-lg text-orange-300">{p.price}</div>
                  <button className="mt-2 w-full rounded-md border border-border bg-zinc-900 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                    View details
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {inspectorOpen && (
          <aside className="w-56 shrink-0 border-l border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <ChevronDown className="h-3 w-3" />
                Inspector · Snapshot
              </div>
            </div>
            <ScrollArea className="scroll-thin h-[calc(100%-2.5rem)]">
              <div className="p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                <div className="text-orange-300">{'<html>'}</div>
                <div className="pl-3 text-sky-300">{'<body>'}</div>
                <div className="pl-6">{'<div class="grid">'}</div>
                <div className="pl-9 text-emerald-300">{'<div class="card">'}</div>
                <div className="pl-12">{'<h3>Acme Pro Plan</h3>'}</div>
                <div className="pl-12 text-yellow-400">{'<span>$49/mo</span>'}</div>
                <div className="pl-9">{'</div>'}</div>
                <div className="pl-9 text-emerald-300">{'<div class="card"> ●</div>'}</div>
                <div className="pl-6">{'</div>'}</div>
                <div className="pl-3">{'</body>'}</div>
                <div>{'</html>'}</div>
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-zinc-900/60 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          Lightpanda → Chrome escalation on 2 pages
        </span>
        <span className="flex items-center gap-3">
          <span>23/47 crawled</span>
          <span className="flex items-center gap-1">
            <Cookie className="h-3 w-3" /> cookies from vault
          </span>
        </span>
      </footer>
    </div>
  )
}
