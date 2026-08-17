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
  Plus,
  Puzzle,
  Star,
  Sparkles,
  Bookmark,
  ShieldCheck,
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

const MOCK_TABS = [
  { id: 't1', title: 'Competitor pricing', url: 'competitor.acme.com/products' },
  { id: 't2', title: 'Google', url: 'google.com/search?q=q3+revenue' },
]

const BOOKMARKS = ['Gmail', 'Drive', 'Docs', 'Sheets', 'GitHub', 'Notion', 'Calendar']

const EXTENSIONS = [
  { id: 'e1', mark: 'A', color: 'bg-sky-500/20 text-sky-300' },
  { id: 'e2', mark: 'G', color: 'bg-emerald-500/20 text-emerald-300' },
  { id: 'e3', mark: 'M', color: 'bg-violet-500/20 text-violet-300' },
  { id: 'e4', mark: 'R', color: 'bg-rose-500/20 text-rose-300' },
]

export default function BrowseView() {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [tabs, setTabs] = useState(MOCK_TABS)
  const [activeTab, setActiveTab] = useState('t1')

  const newTab = () => {
    const id = `t-${Date.now()}`
    setTabs((t) => [...t, { id, title: 'New tab', url: 'about:blank' }])
    setActiveTab(id)
  }

  const closeTab = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      if (activeTab === id && next.length) setActiveTab(next[next.length - 1].id)
      return next
    })
  }

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  return (
    <div className="flex h-full w-full flex-col">
      {/* Browser tab strip — one browser view, many pages (ARCH/12 v3.0) */}
      <div className="flex shrink-0 items-end gap-0.5 overflow-x-auto scroll-thin border-b border-border bg-sidebar/60 px-1 pt-1 no-select">
        {tabs.map((t) => (
          <div
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'group flex max-w-[150px] cursor-pointer items-center gap-1.5 rounded-t-md border border-b-0 px-2 py-1 text-[10.5px] transition-colors',
              t.id === activeTab
                ? 'border-border bg-card text-foreground'
                : 'border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Globe className={cn('h-3 w-3 shrink-0', t.id === activeTab && 'text-orange-500')} />
            <span className="flex-1 truncate">{t.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              className="rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={newTab}
          className="mb-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="New tab"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Bookmarks bar (Chrome-style) */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto scroll-thin border-b border-border bg-sidebar/40 px-2 py-0.5 no-select">
        <Bookmark className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        {BOOKMARKS.map((b) => (
          <button
            key={b}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {b}
          </button>
        ))}
      </div>

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
            {active?.url ?? 'about:blank'}
          </span>
        </div>

        {/* Extension icons + AI Mode (Chrome 141+ parity) */}
        <div className="flex shrink-0 items-center gap-0.5">
          {EXTENSIONS.map((e) => (
            <span
              key={e.id}
              className={cn('grid h-5 w-5 place-items-center rounded text-[8px] font-bold', e.color)}
              title="Extension"
            >
              {e.mark}
            </span>
          ))}
          <button
            onClick={() => setAiMode((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] transition-colors',
              aiMode
                ? 'border-orange-500/50 bg-orange-500/15 text-orange-300'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            title="Built-in AI Mode / Gemini sidebar"
          >
            <Sparkles className="h-3 w-3" />
            AI
          </button>
          <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Star / bookmark">
            <Star className="h-3.5 w-3.5" />
          </button>
          <button className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Extensions menu">
            <Puzzle className="h-3.5 w-3.5" />
          </button>
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

        {aiMode && (
          <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-card">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              <Sparkles className="h-3 w-3 text-orange-400" />
              <span className="text-[11px] font-medium text-foreground">AI Mode</span>
            </div>
            <div className="flex-1 space-y-2 p-3">
              <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-2 text-[10.5px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-orange-300">Key takeaway</span> — Acme's Pro plan is the most-cited
                pricing anchor across all 47 product pages; Enterprise is contact-only.
              </div>
              <div className="rounded-md border border-border bg-zinc-900/50 p-2 text-[10.5px] leading-relaxed text-muted-foreground">
                Ask about this page, summarize the tab, or start a multi-tab research task…
              </div>
              <div className="flex items-center gap-1 rounded-md border border-border bg-zinc-900/50 p-1.5">
                <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                <span className="text-[9px] text-muted-foreground">Grounded in this page + your session</span>
              </div>
            </div>
          </aside>
        )}

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
