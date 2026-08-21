'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Folder, GitBranch, Lightbulb, Network, Pencil,
  Plus, ThumbsDown, ThumbsUp, Trash2, User, Sparkles, CircleDot, Flame,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mockMemory, type MemoryItem } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { id: 'all', name: 'Coding standards', icon: Folder, count: 2 },
  { id: 'deploy', name: 'Deployment', icon: GitBranch, count: 1 },
  { id: 'project', name: 'Project context', icon: Folder, count: 1 },
  { id: 'prefs', name: 'Personal prefs', icon: User, count: 1 },
  { id: 'skills', name: 'Skills', icon: Plus, count: 0 },
]

const STORES = [
  { id: 'episodic', name: 'Episodic memory', icon: Brain, sub: '47 episodes' },
  { id: 'semantic', name: 'Semantic store', icon: Network, sub: '128 facts' },
  { id: 'graph', name: 'Knowledge graph', icon: GitBranch, sub: '14 nodes' },
]

const SOURCE_TONE: Record<MemoryItem['source'], string> = {
  manual: 'bg-zinc-500/15 text-zinc-300',
  learned: 'bg-sky-500/15 text-sky-300',
  suggested: 'bg-orange-500/15 text-orange-300',
}

// Mock episodic store — time-stamped experiences (C2).
const EPISODES = [
  { id: 'e1', ts: 'today 09:12', title: 'Fixed CI failure in backend-api', detail: 'Ran npm test → 42 passed · 0 failed', tokens: 12_400 },
  { id: 'e2', ts: 'today 08:02', title: 'Morning brief delivered', detail: '12 sources · 3 highlights · 1 action item', tokens: 8_120 },
  { id: 'e3', ts: 'yesterday 17:41', title: 'Invoice batch completed', detail: '42 invoices filled + signed', tokens: 24_880 },
  { id: 'e4', ts: 'yesterday 11:03', title: 'Refactor api/users.ts → typed router', detail: 'Extracted getUsers() · +9 −3', tokens: 18_230 },
  { id: 'e5', ts: 'Mon 15:22', title: 'Scraper hit rate limit', detail: '3 pages throttled · backed off 60s', tokens: 6_010 },
  { id: 'e6', ts: 'Mon 09:30', title: 'Q3 revenue chart regenerated', detail: 'IronCalc recalc · 4 series', tokens: 9_740 },
]

// Mock semantic store — extracted facts (C3).
const FACTS = [
  { id: 'f1', fact: 'Revenue grew 20% QoQ to $1.8M in Q3', confidence: 0.97, source: 'Q3-Financials.xlsx' },
  { id: 'f2', fact: 'Churn rate is 2.1% (down from 3.4%)', confidence: 0.94, source: 'exec-summary.docx' },
  { id: 'f3', fact: 'User prefers pnpm over npm', confidence: 0.99, source: 'explicit memory' },
  { id: 'f4', fact: 'Acme Pro plan is the pricing anchor at $49/mo', confidence: 0.88, source: 'competitor crawl' },
  { id: 'f5', fact: 'Deploys happen on the main branch only', confidence: 0.91, source: 'learned' },
]

// Mock knowledge graph — nodes + edges (C5).
const GRAPH_NODES = [
  { id: 'g1', label: 'Q3 Report', kind: 'doc' },
  { id: 'g2', label: 'Revenue', kind: 'metric' },
  { id: 'g3', label: 'Enterprise', kind: 'segment' },
  { id: 'g4', label: 'Churn', kind: 'metric' },
  { id: 'g5', label: 'Acme', kind: 'competitor' },
]
const GRAPH_EDGES = [
  { from: 'g1', to: 'g2', label: 'reports' },
  { from: 'g2', to: 'g3', label: 'driven by' },
  { from: 'g1', to: 'g4', label: 'tracks' },
  { from: 'g5', to: 'g2', label: 'benchmark vs' },
]

// Mock skills — installed + suggested (C7).
const SKILLS = [
  { id: 'sk1', name: 'excel-recalc', desc: 'Deterministic formula recalc + chart regen', status: 'installed' as const, version: 'v1.2.0' },
  { id: 'sk2', name: 'pdf-fill-sign', desc: 'Form fill + signature application', status: 'installed' as const, version: 'v2.0.1' },
  { id: 'sk3', name: 'competitor-crawl', desc: 'CDP page scraping with vault session', status: 'installed' as const, version: 'v0.9.4' },
  { id: 'sk4', name: 'deploy-checklist', desc: 'Prod deploy runbook w/ guard gates', status: 'installed' as const, version: 'v1.1.0' },
  { id: 'sk5', name: 'email-triage', desc: 'Inbox triage + draft replies', status: 'suggested' as const, version: '—' },
  { id: 'sk6', name: 'meeting-notes', desc: 'Transcript → structured notes', status: 'suggested' as const, version: '—' },
]

export default function MemoryPanel() {
  const [items, setItems] = useState(mockMemory)
  const [activeCat, setActiveCat] = useState('all')
  const [tab, setTab] = useState('knowledge')
  const notify = useAppStore((s) => s.notify)

  const suggestions = items.filter((i) => i.source === 'suggested')
  const knowledge = items.filter((i) => i.source !== 'suggested')

  const toggleItem = (id: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)),
    )

  const dismiss = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id))

  const accept = (id: string) =>
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, source: 'manual', enabled: true } : i,
      ),
    )

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-foreground">Memory</h2>
            <Badge variant="secondary" className="text-[9px]">
              {items.length} items
            </Badge>
          </div>
          <Button
            size="sm"
            className="h-8 bg-orange-500 text-black hover:bg-orange-400"
            onClick={() => notify('Add knowledge — opens the composer')}
          >
            <Plus className="h-3.5 w-3.5" />
            Add knowledge
          </Button>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList className="h-7">
            <TabsTrigger value="wiki" className="text-xs">Repo wiki</TabsTrigger>
            <TabsTrigger value="knowledge" className="text-xs">Knowledge</TabsTrigger>
            <TabsTrigger value="episodic" className="text-xs">Episodic</TabsTrigger>
            <TabsTrigger value="semantic" className="text-xs">Semantic</TabsTrigger>
            <TabsTrigger value="graph" className="text-xs">Knowledge Graph</TabsTrigger>
            <TabsTrigger value="skills" className="text-xs">Skills</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left column */}
        <aside className="w-60 shrink-0 border-r border-border bg-card p-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Categories
          </div>
          <nav className="space-y-0.5">
            {CATEGORIES.map((c) => {
              const Icon = c.icon
              const isActive = activeCat === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    isActive
                      ? 'bg-orange-500/15 text-orange-300'
                      : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate text-left">{c.name}</span>
                  <Badge variant="secondary" className="text-[9px]">{c.count}</Badge>
                </button>
              )
            })}
          </nav>

          <div className="mb-2 mt-5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Stores
          </div>
          <nav className="space-y-0.5">
            {STORES.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/70 hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-orange-400/80" />
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate">{s.name}</div>
                    <div className="font-mono text-[9px] text-muted-foreground">{s.sub}</div>
                  </div>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Right column */}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-3 p-4"
          >
          {tab === 'wiki' && (
            <section className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Generated project wiki for the agent. Empty until you generate from a folder.
              </p>
              {['~/Desktop', 'this workspace'].map((name) => (
                <div key={name} className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-3 py-2">
                  <span className="font-mono text-[11px]">{name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    onClick={() => notify('Generate wiki — retrieval exists; this write is not ticketed yet')}
                  >
                    Generate
                  </Button>
                </div>
              ))}
              <div className="rounded-md border border-dashed border-border/60 px-3 py-10 text-center text-[11px] text-muted-foreground">
                Select a wiki from the list, or generate one.
              </div>
            </section>
          )}
          {tab === 'episodic' && <EpisodicTab />}
          {tab === 'semantic' && <SemanticTab />}
          {tab === 'graph' && <GraphTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'knowledge' && (
          <>
            {suggestions.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-foreground">Suggestions</span>
                  <Badge className="bg-orange-500/15 text-[9px] text-orange-300">{suggestions.length} new</Badge>
                </div>
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <SuggestionCard key={s.id} item={s} onAccept={() => accept(s.id)} onDismiss={() => dismiss(s.id)} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-2 text-xs font-medium text-foreground">
                Knowledge
              </div>
              <div className="space-y-2">
                {knowledge.map((i) => (
                  <KnowledgeCard
                    key={i.id}
                    item={i}
                    onToggle={() => toggleItem(i.id)}
                  />
                ))}
              </div>
            </section>
            </>
          )}
          </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function EpisodicTab() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-medium text-foreground">Episodic memory</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{EPISODES.length} episodes · last 7d</span>
      </div>
      <ul className="divide-y divide-border/50">
        {EPISODES.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
            <CircleDot className="h-3 w-3 shrink-0 text-orange-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{e.title}</div>
              <div className="truncate text-[10px] text-muted-foreground">{e.detail}</div>
            </div>
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{e.ts}</span>
            <span className="shrink-0 font-mono text-[9px] text-orange-300/70">{(e.tokens / 1000).toFixed(0)}K tok</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SemanticTab() {
  return (
    <div className="space-y-2">
      {FACTS.map((f) => (
        <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-foreground">{f.fact}</div>
            <div className="truncate font-mono text-[9px] text-muted-foreground">source: {f.source}</div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 font-mono text-[9px]',
              f.confidence >= 0.9 ? 'text-emerald-300' : 'text-orange-300',
            )}
          >
            {Math.round(f.confidence * 100)}%
          </Badge>
        </div>
      ))}
    </div>
  )
}

function GraphTab() {
  const [sel, setSel] = useState<string | null>('g2')
  const nodePos: Record<string, { x: number; y: number }> = {
    g1: { x: 20, y: 40 },
    g2: { x: 55, y: 25 },
    g3: { x: 82, y: 40 },
    g4: { x: 55, y: 72 },
    g5: { x: 20, y: 78 },
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-medium text-foreground">Knowledge graph</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{GRAPH_NODES.length} nodes · {GRAPH_EDGES.length} edges</span>
      </div>
      <div className="relative h-72">
        {/* edges */}
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          {GRAPH_EDGES.map((e, i) => {
            const a = nodePos[e.from]
            const b = nodePos[e.to]
            return (
              <g key={i}>
                <line
                  x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`}
                  stroke="hsl(240 6% 30%)" strokeWidth="1"
                />
                <text
                  x={`${(a.x + b.x) / 2}%`} y={`${(a.y + b.y) / 2 - 1}%`}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  style={{ fontSize: 8 }}
                >
                  {e.label}
                </text>
              </g>
            )
          })}
        </svg>
        {/* nodes */}
        {GRAPH_NODES.map((n) => {
          const p = nodePos[n.id]
          const active = sel === n.id
          return (
            <button
              key={n.id}
              onClick={() => setSel(n.id)}
              className={cn(
                'absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[9px] transition-all',
                active
                  ? 'border-orange-500/60 bg-orange-500/15 text-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.25)]'
                  : 'border-border bg-background/60 text-muted-foreground hover:border-orange-500/30 hover:text-foreground',
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <Network className="h-2.5 w-2.5" />
              {n.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SkillsTab() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SKILLS.map((s) => (
        <div
          key={s.id}
          className={cn(
            'rounded-lg border bg-card p-3.5 transition-colors hover:border-orange-500/30',
            s.status === 'suggested' ? 'border-dashed border-orange-500/40' : 'border-border',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-orange-500/15 text-orange-400">
              <Flame className="h-3.5 w-3.5" />
            </div>
            <Badge
              variant={s.status === 'suggested' ? 'outline' : 'secondary'}
              className={cn('text-[9px]', s.status === 'suggested' && 'text-orange-300')}
            >
              {s.status}
            </Badge>
          </div>
          <div className="mt-2 font-mono text-xs font-medium text-foreground">{s.name}</div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{s.desc}</p>
          <div className="mt-2 font-mono text-[9px] text-muted-foreground/60">{s.version}</div>
        </div>
      ))}
    </div>
  )
}

function SuggestionCard({
  item,
  onAccept,
  onDismiss,
}: {
  item: MemoryItem
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <div className="rounded-lg border border-dashed border-orange-500/40 bg-orange-500/[0.04] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-orange-400" />
            <h3 className="text-sm font-medium text-foreground">
              {item.title}
            </h3>
            <Badge className={cn('text-[9px]', SOURCE_TONE[item.source])}>
              {item.source}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            {item.trigger && (
              <Chip label="trigger" value={item.trigger} />
            )}
            {item.macro && <Chip label="macro" value={item.macro} />}
            <Chip label="scope" value={item.scope} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onAccept}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-background/40 text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10"
            aria-label="Accept suggestion"
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDismiss}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-background/40 text-zinc-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            aria-label="Dismiss suggestion"
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function KnowledgeCard({
  item,
  onToggle,
}: {
  item: MemoryItem
  onToggle: () => void
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors hover:border-orange-500/30',
        item.enabled ? 'border-border' : 'border-border/50 opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {item.title}
            </h3>
            <Badge className={cn('text-[9px]', SOURCE_TONE[item.source])}>
              {item.source}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            {item.trigger && <Chip label="trigger" value={item.trigger} />}
            {item.macro && <Chip label="macro" value={item.macro} />}
            <Chip label="scope" value={item.scope} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="flex size-7 items-center justify-center rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground"
            aria-label="Edit knowledge"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex size-7 items-center justify-center rounded-md border border-border bg-background/40 text-muted-foreground hover:text-red-400"
            aria-label="Delete knowledge"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <Switch
            checked={item.enabled}
            onCheckedChange={onToggle}
            aria-label="Toggle knowledge"
          />
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-background/40 px-1.5 py-0.5 font-mono">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground/80">{value}</span>
    </span>
  )
}
