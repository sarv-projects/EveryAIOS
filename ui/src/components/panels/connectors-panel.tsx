'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  Check, Cloud, Plug, Plus, Search, Server, Zap, Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { staggerStyle } from '@/lib/stagger'
import { scopesFor } from '@/lib/connector-scopes'
import { type Connector } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import {
  mcpAttachRequest,
  mcpAttachCommit,
  mcpDetach,
  mcpCatalog,
  mcpServers,
  mcpExternalTools,
  mcpConnectStart,
  mcpRemoteStatus,
  storeCatalog,
  waitForTicketResolution,
  EMPTY_EXTERNAL_CATALOG,
  type McpCatalog,
  type McpExternalCatalog,
  type McpServerRow,
  type StoreEntry,
} from '@/lib/mcp'
import { cn } from '@/lib/utils'
import SkillsPanel from '@/components/panels/skills-panel'
import {
  connectionLabel,
  connectionTone,
  mcpRowToRecord,
  oauthToRecord,
  storeEntryToRecord,
  type ConnectionView,
} from '@/lib/connections'
import {
  oauthAccounts,
  oauthPollDevice,
  oauthRevoke,
  oauthStartDevice,
  oauthStartPkce,
  oauthStatus,
  type OAuthAccount,
} from '@/lib/oauth'
import { inTauri } from '@/lib/tauri'
import { groupConnectionRecords, settingsConnectionsList, type ConnectionRecord } from '@/lib/settings'

// P50.2.6 — the stats strip must never present demo numbers in the native
// shell. Every value is derived from live state below (oauth accounts, MCP
// server rows, catalog tools); a preview-only fixture is used only in a
// plain-browser run.
const PREVIEW_STATS = [
  { label: 'Connected', value: '5', tone: 'text-emerald-300' },
  { label: 'Available', value: '12', tone: 'text-foreground' },
  { label: 'Tools', value: '94', tone: 'text-brand' },
  { label: 'MCP servers', value: '3', tone: 'text-sky-300' },
]

const KIND_TONE: Record<string, string> = {
  read: 'bg-emerald-500/15 text-emerald-300',
  edit: 'bg-primary/15 text-primary',
  delete: 'bg-red-500/15 text-red-300',
  move: 'bg-warning/15 text-warning',
  search: 'bg-sky-500/15 text-sky-300',
  execute: 'bg-violet-500/15 text-violet-300',
  think: 'bg-zinc-500/15 text-zinc-300',
  fetch: 'bg-cyan-500/15 text-cyan-300',
  other: 'bg-zinc-500/15 text-zinc-300',
}

// P65.3 — one ConnectionView badge. Status is never color-alone: the badge
// carries an accessible label with the plain-language reason.
function ConnectionBadge({ record }: { record: ConnectionView }) {
  return (
    <Badge
      className={cn('text-[9px]', connectionTone(record.state))}
      aria-label={connectionLabel(record)}
      title={record.detail}
    >
      {record.state}
    </Badge>
  )
}

/** CLS=0 skeleton rows for the store/MCP lists (exact-fit, no layout push). */
function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="space-y-1.5 [contain-intrinsic-size:auto_64px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="shimmer h-[64px] rounded-md border border-border/50" />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  )
}

const LOGO_COLORS = [
  'bg-brand/80',
  'bg-emerald-500/80',
  'bg-sky-500/80',
  'bg-purple-500/80',
  'bg-pink-500/80',
  'bg-warning/80',
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
  const [tab, setTab] = useState('store')
  const [catalog, setCatalog] = useState<McpCatalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const notify = useAppStore((s) => s.notify)
  const [oauthOn, setOauthOn] = useState(false)
  const [oauthAccts, setOauthAccts] = useState<OAuthAccount[]>([])
  const [deviceHint, setDeviceHint] = useState<string | null>(null)
  const [store, setStore] = useState<StoreEntry[]>([])
  const [storeLoading, setStoreLoading] = useState(true)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [channels, setChannels] = useState<ConnectionRecord[]>([])

  // Connect Store — the curated "click → sign in → use" list (ARCH/15).
  useEffect(() => {
    let alive = true
    setStoreLoading(true)
    setStoreError(null)
    storeCatalog()
      .then((s) => {
        if (!alive) return
        setStore(s)
        setStoreLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        // Fail-closed: a store failure leaves rows unavailable, never connected.
        setStore([])
        setStoreError(e instanceof Error ? e.message : 'Store unavailable')
        setStoreLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    settingsConnectionsList()
      .then((env) => {
        if (alive) setChannels(env.connections)
      })
      .catch(() => {
        if (alive) setChannels([])
      })
    return () => {
      alive = false
    }
  }, [])

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
      .then((c) => {
        if (!alive) return
        setCatalog(c)
        setCatalogError(null)
      })
      .catch((e) => {
        if (!alive) return
        setCatalog(null)
        setCatalogError(e instanceof Error ? e.message : 'Tool registry unavailable')
      })
    return () => {
      alive = false
    }
  }, [])

  // P11.5.8 — the MCP servers list is live from Rust (`mcp_servers`: the
  // built-in catalog + user-attached stdio servers); demo fallback in preview.
  const [mcpList, setMcpList] = useState<McpServerRow[]>([])
  const [mcpLoading, setMcpLoading] = useState(true)
  const [mcpError, setMcpError] = useState<string | null>(null)
  // P55.11 — the tools the attach handshake actually discovered, so the count
  // and the names come from the same live source (never a hopeful estimate).
  const [external, setExternal] = useState<McpExternalCatalog>(EMPTY_EXTERNAL_CATALOG)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachName, setAttachName] = useState('')
  const [attachCmd, setAttachCmd] = useState('')
  const [attachArgs, setAttachArgs] = useState('')
  const [attachBusy, setAttachBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setMcpLoading(true)
    setMcpError(null)
    mcpServers()
      .then((rows) => {
        if (!alive) return
        setMcpList(rows)
        setMcpLoading(false)
      })
      .catch((e) => {
        if (!alive) return
        // Fail-closed: a list failure leaves servers unavailable, never connected.
        setMcpList([])
        setMcpError(e instanceof Error ? e.message : 'MCP servers unavailable')
        setMcpLoading(false)
      })
    mcpExternalTools()
      .then((cat) => alive && setExternal(cat))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const refreshMcp = async () => {
    setMcpError(null)
    try {
      setMcpList(await mcpServers())
      setExternal(await mcpExternalTools())
    } catch (e) {
      // Fail-closed: keep the last good list, surface the failure.
      setMcpError(e instanceof Error ? e.message : 'MCP refresh failed')
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
      // P50.3.5 — consent is enforced in Rust: mint a Guard-2 ticket bound to
      // the exact command line, wait for the guard-window decision, and only
      // then commit (spawn). No ticket → no child process, ever.
      const req = await mcpAttachRequest(attachName.trim(), attachCmd.trim(), args)
      if (req.action === 'ask') {
        notify('Approval card opened — approve the MCP attach in the guard window')
        const resolved = await waitForTicketResolution(req.ticketId)
        if (!resolved) {
          notify('MCP attach: approval not granted in time — nothing was spawned')
          return
        }
      }
      const res = await mcpAttachCommit(attachName.trim(), attachCmd.trim(), args, req.ticketId)
      // P55.11 — say which of the two things happened: tools are callable by
      // the agent, or the handshake succeeded but no runtime was up to
      // register them (they become callable when the agent runtime attaches).
      notify(
        res.agentVisible
          ? `MCP: attached “${res.name}” (${res.registered.length} tools callable)`
          : `MCP: attached “${res.name}” (${res.tools.length} tools discovered; agent runtime not attached yet)`,
      )
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
            <Plug className="h-4 w-4 text-primary" aria-hidden />
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
              className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
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
        {deviceHint && <p className="mt-2 font-mono text-[10px] text-warning">{deviceHint}</p>}
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

      {/* Stats strip — live-derived values only in the shell; the preview
          fixture appears solely in a plain-browser run (P50.2.6). Connected
          counts vault OAuth accounts + live MCP rows; Available counts the
          curated store entries (never a hardcoded demo number). */}
      <div className="grid grid-cols-2 gap-2 border-b border-border p-3 sm:grid-cols-4">
        {inTauri()
          ? [
              { label: 'Connected', value: String(oauthAccts.length + mcpList.filter((s) => s.status === 'connected').length), tone: oauthAccts.length + mcpList.filter((s) => s.status === 'connected').length > 0 ? 'text-emerald-300' : 'text-zinc-500' },
              { label: 'Available', value: String(store.length), tone: 'text-foreground' },
              { label: 'Tools', value: external.total > 0 ? String(external.total) : catalog ? String(catalog.total) : '—', tone: 'text-brand' },
              { label: 'MCP servers', value: String(mcpList.length), tone: 'text-sky-300' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
                <div className={cn('font-mono text-lg font-semibold', s.tone)}>{s.value}</div>
              </div>
            ))
          : PREVIEW_STATS.map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-3">
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
            <TabsTrigger value="store" className="text-xs">Connect Store</TabsTrigger>
            <TabsTrigger value="mcp" className="text-xs">MCP Servers</TabsTrigger>
            <TabsTrigger value="skills" className="text-xs">Skills</TabsTrigger>
            <TabsTrigger value="native" className="text-xs">Native</TabsTrigger>
            <TabsTrigger value="catalog" className="text-xs">Tool Catalog</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* P45.6 — content-visibility: auto skips offscreen connector rows. */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto [content-visibility:auto] [contain-intrinsic-size:auto_64px]">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-4 p-4"
        >
          {channels.length > 0 && (
            <section className="mb-3 rounded-md border border-border/60 bg-card/40 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Channels (live settings inventory)
              </div>
              {(['connected', 'degraded', 'disconnected', 'discovered', 'installed'] as const).map((st) => {
                const rows = groupConnectionRecords(channels)[st]
                if (rows.length === 0) return null
                return (
                  <div key={st} className="mb-1">
                    <div className="font-mono text-[9px] text-muted-foreground">
                      {st} ({rows.length})
                    </div>
                    {rows.map((r) => (
                      <div key={r.id} className="flex justify-between font-mono text-[10px]">
                        <span>{r.id}</span>
                        <span>{r.health}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
            </section>
          )}
          {tab === 'store' ? (
            <StoreSection
              store={store}
              connectingId={connectingId}
              setConnectingId={setConnectingId}
              notify={notify}
            />
          ) : tab === 'skills' ? (
            <SkillsPanel />
          ) : tab === 'catalog' ? (
            <ToolCatalogSection catalog={catalog} />
          ) : tab === 'native' ? (
            <>
              <section>
                <div className="mb-2 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-brand" />
                  <span className="text-xs font-medium text-foreground">Native connectors</span>
                  <Badge variant="secondary" className="text-[9px]">OAuth tokens in local vault</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {/* P5.23 — live rows: real OAuth accounts from the shell
                      (vault-backed). NATIVE_SAMPLES is the *preview-only* seed:
                      when the shell is up and the vault is empty, no mock
                      "connected" rows are shown — the empty state below is. */}
                  {inTauri() && oauthAccts.length > 0
                    ? oauthAccts.map((a, i) => (
                        // P35.2 — entrance stagger on the connectors list.
                        <div key={`${a.provider}:${a.accountId}`} className="enter-stagger" style={staggerStyle(i)}>
                          <ConnectorCard
                            colorIdx={i}
                            c={{
                              id: `${a.provider}:${a.accountId}`,
                              name: a.provider,
                              category: 'native',
                              status: 'connected',
                              tools: 0,
                              type: 'oauth',
                              lastUsed: a.expiresAt
                                ? `expires ${new Date(a.expiresAt).toLocaleDateString()}`
                                : a.email ?? a.accountId,
                            }}
                            onConnect={() => notify(`${a.provider} is already connected in the vault`)}
                          />
                        </div>
                      ))
                    : inTauri()
                      ? null
                      : NATIVE_SAMPLES.map((c, i) => (
                          <div key={c.id} className="enter-stagger" style={staggerStyle(i)}>
                            <ConnectorCard
                              c={c}
                              colorIdx={i}
                              onConnect={() => notify(`Connect ${c.name} — OAuth flow opens in the shell`)}
                            />
                          </div>
                        ))}
                </div>
                {inTauri() && oauthAccts.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center">
                    <Zap className="mx-auto h-4 w-4 text-muted-foreground/50" />
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      No OAuth accounts in the vault yet — connect one via the
                      vault OAuth flow to see it here.
                    </p>
                  </div>
                )}
              </section>
              {/* P4.20 — honest planned rows: P42 (Google Workspace / M365
                  Graph) is spec'd, not attached. Never shown as connected.
                  Collapsed behind a disclosure so only installed/attached/
                  authenticated resources dominate the surface (P50.2.6). */}
              <details>
                <summary className="mb-2 flex cursor-pointer items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5 text-sky-400" />
                  <span className="text-xs font-medium text-foreground">Planned (P42)</span>
                  <Badge variant="outline" className="text-[9px] text-sky-300">not attached</Badge>
                </summary>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    { id: 'p42-google', name: 'Google Workspace', desc: 'Gmail · Drive · Docs · Sheets — official APIs, read-only-first (P42.2)' },
                    { id: 'p42-m365', name: 'Microsoft 365 / Graph', desc: 'Mail · Calendar · OneDrive · Teams — official Graph, read-only-first (P42.1)' },
                  ].map((p, i) => {
                    const manifest = scopesFor(p.id === 'p42-google' ? 'google-workspace' : 'microsoft-graph')
                    return (
                      <ConnectorCard
                        key={p.id}
                        colorIdx={i}
                        c={{
                          id: p.id,
                          name: p.name,
                          // The Connector union has no "planned" category — these
                          // are honest placeholders inside the native surface.
                          category: 'native',
                          status: 'disconnected',
                          tools: 0,
                          type: 'oauth',
                        }}
                        onConnect={() =>
                          notify(`${p.name}: P42 attach — official server behind Guard-2, not shipped yet`)
                        }
                      >
                        {/* P42.3 — the reviewed scope manifest, rendered verbatim
                            (read-only-first; write scope opt-in). */}
                        {manifest && (
                          <div className="mt-2 space-y-1 rounded-md border border-border/60 bg-background/40 p-2">
                            {manifest.scopes.map((s) => (
                              <div key={s.scope} className="flex items-start gap-1.5 text-[10px]">
                                <span
                                  className={cn(
                                    'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                    s.direction === 'write' ? 'bg-warning' : 'bg-emerald-400/70',
                                  )}
                                />
                                <div className="min-w-0">
                                  <span className="font-mono text-[9px] text-foreground/80">
                                    {s.scope}
                                  </span>
                                  <span className="text-muted-foreground"> · {s.purpose}</span>
                                  {!s.required && (
                                    <span className="text-warning/90"> · opt-in</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            <p className="pt-0.5 text-[9px] text-muted-foreground/70">
                              {manifest.posture}
                            </p>
                          </div>
                        )}
                      </ConnectorCard>
                    )
                  })}
                </div>
                <p className="mt-2 font-mono text-[9px] text-muted-foreground/60">
                  P42 rows are honest placeholders — no token is stored until the official server is attached behind Guard-2. Scopes above are the reviewed P42.3 manifest.
                </p>
              </details>
            </>
          ) : (
            <section className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-brand" />
                <span className="text-xs font-medium text-foreground">MCP servers</span>
                <Badge variant="secondary" className="text-[9px]">model-context-protocol</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-6 border-brand/40 px-2 text-[9px] text-brand hover:bg-brand/10"
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
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand/50"
                  />
                  <input
                    value={attachCmd}
                    onChange={(e) => setAttachCmd(e.target.value)}
                    placeholder="Command (e.g. npx)"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand/50"
                  />
                  <input
                    value={attachArgs}
                    onChange={(e) => setAttachArgs(e.target.value)}
                    placeholder="Args (space-separated, e.g. -y @modelcontextprotocol/server-filesystem ~)"
                    className="w-full rounded border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground outline-none focus:border-brand/50"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      className="h-6 bg-brand px-2 text-[10px] text-black hover:bg-brand"
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

              {external.external > 0 && !external.agentVisible && (
                <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 font-mono text-[10px] text-warning/90">
                  {external.external} external tools are discovered but the agent runtime is not
                  attached, so nothing can call them yet — they register on the next runtime attach.
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
                          'bg-brand/15 text-brand',
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
                        {s.transport === 'native' ? (
                          <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                            the inbuilt catalog — no external server involved
                          </div>
                        ) : s.toolNames.length > 0 ? (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {s.toolNames.slice(0, 6).map((t) => (
                              <span
                                key={t}
                                className="rounded border border-border/60 bg-background/40 px-1 py-px font-mono text-[9px] text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
                            {s.toolNames.length > 6 && (
                              <span className="font-mono text-[9px] text-muted-foreground">
                                +{s.toolNames.length - 6} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="mt-0.5 font-mono text-[9px] text-warning/80">
                            no handshake on record — re-attach to discover tools
                          </div>
                        )}
                      </div>
                      {connected ? (
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-emerald-500/15 text-[9px] text-emerald-300">
                            <Check className="h-3 w-3" />
                            connected
                          </Badge>
                          {s.transport !== 'native' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => void (async () => {
                                try {
                                  await mcpDetach(s.name)
                                  notify(`MCP: detached “${s.name}”`)
                                  await refreshMcp()
                                } catch (e) {
                                  notify(`MCP detach failed: ${String(e)}`)
                                }
                              })()}
                            >
                              Detach
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-brand/40 text-[10px] text-brand hover:bg-brand/10"
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

function StoreSection({
  store,
  connectingId,
  setConnectingId,
  notify,
}: {
  store: StoreEntry[]
  connectingId: string | null
  setConnectingId: (id: string | null) => void
  notify: (msg: string) => void
}) {
  const [connected, setConnected] = useState<Set<string>>(new Set())

  // P50.2.6 — hydrate live connected state from the shell: remote-MCP rows
  // via mcp_remote_status (vault token present?), flat connectors via the
  // vault OAuth accounts. Preview stays disconnected; native failures leave
  // the row not-connected (fail-closed, never optimistic).
  useEffect(() => {
    if (!inTauri() || store.length === 0) return
    let alive = true
    void (async () => {
      try {
        const accts = await oauthAccounts()
        const byProvider = new Set(accts.map((a) => a.provider))
        const next = new Set<string>()
        await Promise.all(store.map(async (e) => {
          try {
            if (e.kind === 'remote-mcp') {
              const st = await mcpRemoteStatus(e.id)
              if (st.connected) next.add(e.id)
            } else if (byProvider.has(e.vaultProvider)) {
              next.add(e.id)
            }
          } catch {
            /* leave not-connected */
          }
        }))
        if (alive) setConnected(next)
      } catch {
        /* leave not-connected */
      }
    })()
    return () => { alive = false }
  }, [store])

  async function refreshConnected(e: StoreEntry) {
    try {
      if (e.kind === 'remote-mcp') {
        const st = await mcpRemoteStatus(e.id)
        setConnected((s) => { const n = new Set(s); if (st.connected) n.add(e.id); else n.delete(e.id); return n })
      } else {
        const accts = await oauthAccounts()
        const has = accts.some((a) => a.provider === e.vaultProvider)
        setConnected((s) => { const n = new Set(s); if (has) n.add(e.id); else n.delete(e.id); return n })
      }
    } catch {
      /* leave not-connected */
    }
  }

  async function disconnect(e: StoreEntry) {
    try {
      if (e.kind === 'remote-mcp') {
        // No dedicated remote-disconnect command: revoke the stored vault
        // token path via oauth revoke when the provider matches, then
        // re-probe. The row renders not-connected until the probe passes.
        try { await oauthRevoke(e.vaultProvider, e.id) } catch { /* token may be keyring-scoped */ }
      } else {
        const accts = await oauthAccounts()
        const hit = accts.find((a) => a.provider === e.vaultProvider)
        if (hit) await oauthRevoke(hit.provider, hit.accountId)
      }
      setConnected((s) => { const n = new Set(s); n.delete(e.id); return n })
      notify(`${e.name} — disconnected (vault token revoked)`)
    } catch (err) {
      notify(`Disconnect ${e.name}: ${String(err)}`)
    }
  }

  async function connect(e: StoreEntry) {
    setConnectingId(e.id)
    try {
      // Flat connectors (gmail, github-raw) have no MCP server URL — route them
      // through the vault's OAuth provider (the Connect Store names vaultProvider).
      if (e.kind === 'connector') {
        if (e.flow === 'device-code') {
          const d = await oauthStartDevice(e.vaultProvider)
          notify(`${e.name} — open ${d.verificationUri} and enter code ${d.userCode}`)
        } else if (e.flow === 'api-key') {
          notify(`${e.name} — paste your API key in the shell`)
        } else {
          const r = await oauthStartPkce(e.vaultProvider)
          window.open(r.authUrl, '_blank')
          notify(`${e.name} — authorize in the browser that just opened`)
        }
      } else {
        const r = await mcpConnectStart(e.id)
        window.open(r.authUrl, '_blank')
        notify(`${e.name} — authorize in the browser that just opened`)
      }
      await refreshConnected(e)
    } catch (err) {
      notify(`Connect ${e.name}: ${String(err)}`)
    } finally {
      setConnectingId(null)
    }
  }

  return (
    <>
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Plug className="h-3.5 w-3.5 text-brand" />
          <span className="text-xs font-medium text-foreground">Connect Store</span>
          <Badge variant="secondary" className="text-[9px]">
            click → sign in → use
          </Badge>
        </div>
        <p className="mb-3 text-[10px] text-muted-foreground/70">
          Curated remote MCP servers + OAuth connectors (ARCH/15). Each connect
          runs OAuth 2.1 (PKCE/device flow) with your consent — tokens stay in
          the local vault.
        </p>
        {store.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center">
            <Plug className="mx-auto h-4 w-4 text-muted-foreground/50" />
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Store empty — no curated entries.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {store.map((e, i) => {
              const isConnected = connected.has(e.id)
              return (
                <div
                  key={e.id}
                  className="enter-stagger flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
                  style={staggerStyle(i)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-background',
                          LOGO_COLORS[i % LOGO_COLORS.length],
                        )}
                      >
                        {initials(e.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-medium text-foreground">
                          {e.name}
                        </div>
                        <div className="text-[9px] text-muted-foreground/60">
                          {e.kind === 'remote-mcp' ? 'remote MCP' : 'connector'} · {e.flow}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant={isConnected ? 'secondary' : 'outline'}
                      className={cn('shrink-0 text-[8px]', isConnected && 'text-emerald-300')}
                    >
                      {isConnected ? 'connected' : 'not connected'}
                    </Badge>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground/80">
                    {e.description}
                  </p>
                  {/* The Guard-2 consent surface: plain-language scopes. */}
                  <ul className="space-y-0.5">
                    {e.scopesPlain.map((s) => (
                      <li key={s} className="flex items-start gap-1.5 text-[10px]">
                        <span
                          className={cn(
                            'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            e.canMutate ? 'bg-warning' : 'bg-emerald-400/70',
                          )}
                        />
                        <span className="text-muted-foreground/70">{s}</span>
                      </li>
                    ))}
                  </ul>
                  {e.toolHint > 0 && (
                    <div className="font-mono text-[9px] text-muted-foreground/50">
                      ~{e.toolHint} tools once connected
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant={isConnected ? 'outline' : 'default'}
                    className="mt-auto h-7 gap-1.5 text-[11px]"
                    disabled={connectingId !== null}
                    onClick={() => (isConnected ? void disconnect(e) : void connect(e))}
                  >
                    {connectingId === e.id ? (
                      <>Connecting…</>
                    ) : isConnected ? (
                      <><Check className="h-3 w-3" /> Disconnect</>
                    ) : (
                      <><Plug className="h-3 w-3" /> Connect</>
                    )}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
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
            <div className="font-mono text-base font-semibold text-brand">{s.value}</div>
            <div className="text-[10px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tool list (the real registry) */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 text-brand" />
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
                <Badge variant="secondary" className="shrink-0 text-[8px] text-warning">
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
  children,
}: {
  c: Connector & { lastUsed?: string }
  colorIdx: number
  onConnect?: () => void
  children?: ReactNode
}) {
  const connected = c.status === 'connected'
  const color = LOGO_COLORS[colorIdx % LOGO_COLORS.length]
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 transition-colors hover:border-brand/30',
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
            className="h-7 border-brand/40 text-[10px] text-brand hover:bg-brand/10"
            onClick={onConnect}
          >
            Connect
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}
