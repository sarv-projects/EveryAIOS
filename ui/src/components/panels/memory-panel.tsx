'use client'

import { useState } from 'react'
import {
  Brain, Folder, GitBranch, Lightbulb, Network, Pencil,
  Plus, ThumbsDown, ThumbsUp, Trash2, User,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mockMemory, type MemoryItem } from '@/lib/store'
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

export default function MemoryPanel() {
  const [items, setItems] = useState(mockMemory)
  const [activeCat, setActiveCat] = useState('all')

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
          >
            <Plus className="h-3.5 w-3.5" />
            Add knowledge
          </Button>
        </div>
        <Tabs defaultValue="knowledge" className="mt-3">
          <TabsList className="h-7">
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
          <div className="space-y-3 p-4">
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
          </div>
        </div>
      </div>
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
