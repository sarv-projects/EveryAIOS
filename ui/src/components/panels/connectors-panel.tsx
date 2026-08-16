'use client'

import { useEffect, useState } from 'react'
import {
  Check, Cloud, Plug, Plus, Search, Server, Zap, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Connector } from '@/lib/store'
import { mcpCatalog, type McpCatalog } from '@/lib/mcp'
import { cn } from '@/lib/utils'

const STATS = [
  { label: 'Connected', value: '5', tone: 'text-emerald-300' },
  { label: 'Available', value: '12', tone: 'text-foreground' },
  { label: 'Tools', value: '94', tone: 'text-orange-300' },
  { label: 'MCP servers', value: '3', tone: 'text-sky-300' },
]

const KIND_TONE: Record<string, string> = {
  read: 'bg-emerald-500/15 text-emerald-300',
  edit: 'bg-orange-500/15 text-orange-300',
  delete: 'bg-red-500/15 text-red-300',
  move: 'bg-amber-500/15 text-amber-300',
  search: 'bg-sky-500/15 text-sky-300',
  execute: 'bg-violet-500/15 text-violet-300',
  think: 'bg-zinc-500/15 text-zinc-300',
  fetch: 'bg-cyan-500/15 text-cyan-300',
  other: 'bg-zinc-500/15 text-zinc-300',
}

const LOGO_COLORS = [
  'bg-orange-500/80',
  'bg-emerald-500/80',
  'bg-sky-500/80',
  'bg-purple-500/80',
  'bg-pink-500/80',
  'bg-yellow-500/80',
  'bg-red-500/80',
  'bg-cyan-500/80',
  'bg-indigo-500/80',
  'bg-teal-500/80',
]

// Extended connector set — merge with store data
const NATIVE_SAMPLES: (Connector & { lastUsed?: string })[] = [
  { id: 'n1', name: 'Gmail', category: 'native', status: 'connected', tools: 3, type: 'oauth', lastUsed: '2m ago' },
  { id: 'n2', name: 'Google Calendar', category: 'native', status: 'connected', tools: 5, type: 'oauth', lastUsed: '1h ago' },
  { id: 'n3', name: 'Notion', category: 'native', status: 'disconnected', tools: 11, type: 'oauth' },
  { id: 'n4', name: 'Linear', category: 'native', status: 'disconnected', tools: 9, type: 'oauth' },
  { id: 'n5', name: 'Slack', category: 'native', status: 'connected', tools: 7, type: 'oauth', lastUsed: '5m ago' },
  { id: 'n6', name: 'GitHub', category: 'native', status: 'connected', tools: 22, type: 'oauth', lastUsed: 'just now' },
  { id: 'n7', name: 'Stripe', category: 'native', status: 'disconnected', tools: 14, type: 'apiKey' },
  { id: 'n8', name: 'Asana', category: 'native', status: 'disconnected', tools: 8, type: 'oauth' },
  { id: 'n9', name: 'Jira', category: 'native', status: 'disconnected', tools: 16, type: 'oauth' },
  { id: 'n10', name: 'Trello', category: 'native', status: 'disconnected', tools: 6, type: 'apiKey' },
]

const MCP_SERVERS: {
  name: string
  status: 'connected' | 'disconnected'
  transport: 'stdio' | 'http'
  tools: number
  desc: string
}[] = [
  { name: 'GitHub MCP', status: 'connected', transport: 'http', tools: 18, desc: 'Repo, issues, PRs' },
  { name: 'Filesystem MCP', status: 'connected', transport: 'stdio', tools: 7, desc: 'Read/write local files' },
  { name: 'Slack MCP', status: 'disconnected', transport: 'stdio', tools: 14, desc: 'Messages, channels' },
  { name: 'Postgres MCP', status: 'disconnected', transport: 'http', tools: 11, desc: 'Query + introspect' },
]

const AUTH_LABEL: Record<NonNullable<Connector['type']>, string> = {
  oauth: 'OAuth',
  apiKey: 'API key',
  stdio: 'stdio',
  http: 'http',
}

function initials(name: string) {
  const parts = name.split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

export default function ConnectorsPanel() {
  const [tab, setTab] = useState('mcp')
  const [catalog, setCatalog] = useState<McpCatalog | null>(null)

  // Live tool catalog from the Rust registry (demo fallback in preview).
  useEffect(() => {
    let alive = true
    mcpCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-orange-400" />
            <h2 className="text-sm font-semibold text-foreground">Connectors</h2>
            <Badge variant="secondary" className="text-[9px]">
              MCP-first · BYO keys · local vault
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              <Search className="h-3.5 w-3.5" />
              Browse MCP servers
            </Button>
            <Button
              size="sm"
              className="h-8 bg-orange-500 text-black hover:bg-orange-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add native connector
            </Button>
          </div>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 border-b border-border p-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
            <div className={cn('font-mono text-lg font-semibold', s.tone)}>
              {s.label === 'Tools' && catalog ? catalog.total : s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-border px-4 py-2">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-7">
            <TabsTrigger value="mcp" className="text-xs">MCP Servers</TabsTrigger>
            <TabsTrigger value="native" className="text-xs">Native</TabsTrigger>
            <TabsTrigger value="catalog" className="text-xs">Tool Catalog</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-4 p-4">
          {tab === 'catalog' ? (
            <ToolCatalogSection catalog={catalog} />
          ) : (
          <>
          {/* Native connector grid */}
          <section>
            <div className="mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-medium text-foreground">Native connectors</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {NATIVE_SAMPLES.map((c, i) => (
                <ConnectorCard key={c.id} c={c} colorIdx={i} />
              ))}
            </div>
          </section>

          {/* MCP servers */}
          <section className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-medium text-foreground">MCP servers</span>
              <Badge variant="secondary" className="text-[9px]">model-context-protocol</Badge>
            </div>
            <ul className="space-y-1.5">
              {MCP_SERVERS.map((s, i) => {
                const connected = s.status === 'connected'
                return (
                  <li
                    key={i}
                    className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2"
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-semibold',
                        'bg-orange-500/15 text-orange-300',
                      )}
                    >
                      {s.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {s.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[9px]',
                            s.transport === 'http'
                              ? 'bg-sky-500/15 text-sky-300'
                              : 'bg-emerald-500/15 text-emerald-300',
                          )}
                        >
                          {s.transport === 'http'
                            ? 'Running on HTTP'
                            : 'Running on stdio'}
                        </Badge>
                      </div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">
                        {s.desc} · {s.tools} tools
                      </div>
                    </div>
                    {connected ? (
                      <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
                        <Check className="h-3 w-3" />
                        connected
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-orange-500/40 text-[10px] text-orange-300 hover:bg-orange-500/10"
                      >
                        Connect
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
          </>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-card px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          <Cloud className="mr-1 inline h-3 w-3" />
          Connectors use OAuth tokens stored in your local vault (SQLCipher).
          The agent never sees raw tokens.
        </p>
      </footer>
    </div>
  )
}

function ToolCatalogSection({ catalog }: { catalog: McpCatalog | null }) {
  if (!catalog) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Wrench className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-[11px] text-muted-foreground">
          Loading the tool registry…
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Aggregate strip (real counts) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'total', value: catalog.total },
          { label: 'browser', value: catalog.browser },
          { label: 'storage', value: catalog.storage },
          { label: 'read-only', value: catalog.read_only },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-2.5">
            <div className="font-mono text-base font-semibold text-orange-300">{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tool list (the real registry) */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-orange-400" />
          <span className="text-xs font-medium text-foreground">
            Registered agent tools
          </span>
          <Badge variant="secondary" className="text-[9px]">
            everyaios-mcp
          </Badge>
        </div>
        <ul className="space-y-1">
          {catalog.tools.map((t) => (
            <li
              key={t.name}
              className="flex items-center gap-2.5 rounded-md border border-border/50 bg-background/30 px-3 py-1.5"
            >
              <span className="w-32 shrink-0 truncate font-mono text-[11px] font-medium text-foreground">
                {t.name}
              </span>
              <Badge className={cn('shrink-0 text-[8px]', KIND_TONE[t.kind] ?? KIND_TONE.other)}>
                {t.kind}
              </Badge>
              <span className="w-16 shrink-0 font-mono text-[9px] text-muted-foreground/60">
                {t.profile}
              </span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/80">
                {t.description}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-muted-foreground/50">
                {t.args} arg{t.args === 1 ? '' : 's'}
              </span>
              {t.read_only && (
                <Badge variant="secondary" className="shrink-0 text-[8px] text-emerald-300">
                  ro
                </Badge>
              )}
              {t.open_world && (
                <Badge variant="secondary" className="shrink-0 text-[8px] text-amber-300">
                  open
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function ConnectorCard({
  c,
  colorIdx,
}: {
  c: Connector & { lastUsed?: string }
  colorIdx: number
}) {
  const connected = c.status === 'connected'
  const color = LOGO_COLORS[colorIdx % LOGO_COLORS.length]
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors hover:border-orange-500/30',
        connected ? 'border-border' : 'border-border/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold text-black',
              color,
            )}
          >
            {initials(c.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {c.name}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[9px]">
                {c.category}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-zinc-500/15 text-[9px] text-zinc-300"
              >
                {AUTH_LABEL[c.type ?? 'oauth']}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded border border-border bg-background/40 px-1.5 py-0.5 font-mono">
            {c.tools} tools
          </span>
          <span>{c.lastUsed ?? 'not used'}</span>
        </div>
        {connected ? (
          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
            <Check className="h-3 w-3" />
            connected
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-orange-500/40 text-[10px] text-orange-300 hover:bg-orange-500/10"
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
