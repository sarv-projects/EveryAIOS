'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Check, Cloud, Plug, Plus, Search, Server, Zap, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type Connector } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import {
  mcpAttach,
  mcpCatalog,
  mcpServers,
  type McpCatalog,
  type McpServerRow,
} from '@/lib/mcp'
import { cn } from '@/lib/utils'
import {
  oauthAccounts,
  oauthPollDevice,
  oauthStartDevice,
  oauthStartPkce,
  oauthStatus,
  type OAuthAccount,
} from '@/lib/oauth'

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
  const [tab, setTab] = useState('native')
  const [catalog, setCatalog] = useState<McpCatalog | null>(null)
  const notify = useAppStore((s) => s.notify)
  const [oauthOn, setOauthOn] = useState(false)
  const [oauthAccts, setOauthAccts] = useState<OAuthAccount[]>([])
  const [deviceHint, setDeviceHint] = useState<string | null>(null)

  useEffect(() => {
    oauthStatus()
      .then((s) => setOauthOn(s.enabled))
      .catch(() => setOauthOn(false))
    oauthAccounts()
      .then(setOauthAccts)
      .catch(() => setOauthAccts([]))
  }, [])

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

  // P11.5.8 — the MCP servers list is live from Rust (`mcp_servers`: the
  // built-in catalog + user-attached stdio servers); demo fallback in preview.
  const [mcpList, setMcpList] = useState<McpServerRow[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachName, setAttachName] = useState('')
  const [attachCmd, setAttachCmd] = useState('')
  const [attachArgs, setAttachArgs] = useState('')
  const [attachBusy, setAttachBusy] = useState(false)

  useEffect(() => {
    let alive = true
    mcpServers()
      .then((rows) => alive && setMcpList(rows))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const refreshMcp = async () => {
    try {
      setMcpList(await mcpServers())
    } catch {
      /* shell not ready */
    }
  }

  const attachMcp = async () => {
    if (!attachName.trim() || !attachCmd.trim()) {
      notify('MCP attach: name and command are required')
      return
    }
    setAttachBusy(true)
    try {
      const args = attachArgs.split(/\s+/).filter(Boolean)
      const res = await mcpAttach(attachName.trim(), attachCmd.trim(), args)
      notify(`MCP: attached “${res.name}” (${res.tools.length} tools reconciled)`)
      setAttachOpen(false)
      setAttachName('')
      setAttachCmd('')
      setAttachArgs('')
      await refreshMcp()
    } catch (e) {
      notify(`MCP attach failed: ${String(e)}`)
    } finally {
      setAttachBusy(false)
    }
  }

  const startOauth = async (provider: string, kind: 'pkce' | 'device') => {
    try {
      if (kind === 'pkce') {
        const r = await oauthStartPkce(provider)
        window.open(r.authUrl, '_blank')
        notify(`Opened ${provider} sign-in — finish in the browser`)
      } else {
        const d = await oauthStartDevice(provider)
        setDeviceHint(`${provider}: enter ${d.userCode} at ${d.verificationUri}`)
        if (d.verificationUri) window.open(d.verificationUriComplete || d.verificationUri, '_blank')
        const tick = async () => {
          const p = await oauthPollDevice(provider)
          if (p.status === 'approved') {
            setDeviceHint(null)
            setOauthAccts(await oauthAccounts())
            notify(`${provider} connected`)
            return
          }
          if (p.status === 'expired' || p.status === 'denied') {
            setDeviceHint(`${provider}: ${p.status}`)
            return
          }
          setTimeout(() => void tick(), (p.intervalSecs ?? 5) * 1000)
        }
        void tick()
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'OAuth failed — set EVERYAIOS_OAUTH=1')
    }
  }

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
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                setTab('mcp')
                notify('Browsing the MCP registry (live fetch in the shell)')
              }}
            >
              <Search className="h-3.5 w-3.5" />
              Browse MCP servers
            </Button>
            <Button
              size="sm"
              className="h-8 bg-orange-500 text-black hover:bg-orange-400"
              onClick={() => notify('Add native connector — opens the OAuth flow in the shell')}
            >
              <Plus className="h-3.5 w-3.5" />
              Add native connector
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-foreground">Subscription OAuth</span>
          <Badge className={oauthOn ? 'bg-emerald-500/20 text-[9px] text-emerald-300' : 'bg-zinc-700 text-[9px] text-zinc-300'}>
            {oauthOn ? 'EVERYAIOS_OAUTH=1' : 'flag off'}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 text-[10px]" disabled={!oauthOn} onClick={() => void startOauth('chatgpt-pro', 'pkce')}>
            ChatGPT Pro (PKCE)
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!oauthOn} onClick={() => void startOauth('copilot', 'device')}>
            Copilot device
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={!oauthOn} onClick={() => void startOauth('qwen', 'device')}>
            Qwen device
          </Button>
        </div>
        {deviceHint && <p className="mt-2 font-mono text-[10px] text-amber-300">{deviceHint}</p>}
        {oauthAccts.length > 0 && (
          <ul className="mt-2 space-y-1">
            {oauthAccts.map((a) => (
              <li key={`${a.provider}:${a.accountId}`} className="font-mono text-[10px] text-muted-foreground">
                {a.provider} · {a.email ?? a.accountId}
              </li>
            ))}
          </ul>
        )}
      </div>

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
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-4 p-4"
        >
          {tab === 'catalog' ? (
            <ToolCatalogSection catalog={catalog} />
          ) : tab === 'native' ? (
            <>
              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-foreground">Native connectors</span>
                  <Badge variant="secondary" className="text-[9px]">OAuth tokens in local vault</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {NATIVE_SAMPLES.map((c, i) => (
                    <ConnectorCard
                      key={c.id}
                      c={c}
                      colorIdx={i}
                      onConnect={() => notify(`Connect ${c.name} — OAuth flow opens in the shell`)}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-medium text-foreground">MCP servers</span>
                <Badge variant="secondary" className="text-[9px]">model-context-protocol</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-6 border-orange-500/40 px-2 text-[9px] text-orange-300 hover:bg-orange-500/10"
                  onClick={() => setAttachOpen((v) => !v)}
                >
                  <Plus className="h-3 w-3" />
                  attach
                </Button>
              </div>

              {attachOpen && (
                <div className="mb-3 space-y-1.5 rounded-md border border-border/60 bg-background/40 p-2.5">
                  <input
                    value={attachName}
                    onChange={(e) => setAttachName(e.target.value)}
                    placeholder="Server name (e.g. My Postgres MCP)"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-orange-500/50"
                  />
                  <input
                    value={attachCmd}
                    onChange={(e) => setAttachCmd(e.target.value)}
                    placeholder="Command (e.g. npx)"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-orange-500/50"
                  />
                  <input
                    value={attachArgs}
                    onChange={(e) => setAttachArgs(e.target.value)}
                    placeholder="Args (space-separated, e.g. -y @modelcontextprotocol/server-filesystem ~)"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-orange-500/50"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 bg-orange-500 px-2 text-[10px] text-black hover:bg-orange-400"
                      disabled={attachBusy}
                      onClick={() => void attachMcp()}
                    >
                      {attachBusy ? 'Attaching…' : 'Attach server'}
                    </Button>
                  </div>
                  <p className="text-[9px] text-muted-foreground/70">
                    Spawns a user-supplied MCP server over stdio and reconciles its tools into the unified catalog (native wins).
                  </p>
                </div>
              )}

              <ul className="space-y-1.5">
                {mcpList.map((s, i) => {
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
                          onClick={() => notify(`Connect ${s.name} — use the attach form above`)}
                        >
                          Connect
                        </Button>
                      )}
                    </li>
                  )
                })}
                {mcpList.length === 0 && (
                  <li className="rounded-md border border-dashed border-border/60 px-3 py-3 text-center font-mono text-[10px] text-muted-foreground">
                    No servers attached yet — use “attach” to spawn a user-supplied MCP server.
                  </li>
                )}
              </ul>
            </section>
          )}
        </motion.div>
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
  onConnect,
}: {
  c: Connector & { lastUsed?: string }
  colorIdx: number
  onConnect?: () => void
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
            onClick={onConnect}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  )
}
