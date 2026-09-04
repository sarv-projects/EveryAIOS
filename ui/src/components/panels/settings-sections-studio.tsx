'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  Cpu,
  Globe,
  HardDrive,
  Mic,
  Plus,
  QrCode,
  Radio,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { inTauri } from '@/lib/tauri'
import { type PermissionMode, usePref } from '@/lib/ui-prefs'
import { Row, SectionShell } from './settings-shared'

function Honest({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[10px] leading-relaxed text-amber-200/90">
      {children}
    </p>
  )
}

function RadioCard({
  selected,
  title,
  desc,
  onSelect,
}: {
  selected: boolean
  title: string
  desc: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-orange-500/60 bg-orange-500/10'
          : 'border-border/50 bg-background/30 hover:border-border hover:bg-accent/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border',
          selected ? 'border-orange-400' : 'border-muted-foreground/40',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[10px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  )
}

export function NotificationsSection() {
  const [chat, setChat] = usePref('notify.chat', true)
  const [quest, setQuest] = usePref('notify.quest', true)
  const [wiki, setWiki] = usePref('notify.wiki', true)
  const [banner, setBanner] = usePref('notify.banner', true)
  const [sound, setSound] = usePref('notify.sound', true)
  const [volume, setVolume] = usePref('notify.volume', 80)
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Notifications" desc="System toasts when a chat, task, or wiki job needs you">
      <Row label="Chat notifications" desc="When a turn completes or needs attention">
        <Switch checked={chat} onCheckedChange={setChat} />
      </Row>
      <Row label="Task notifications" desc="When a long-running job finishes or waits">
        <Switch checked={quest} onCheckedChange={setQuest} />
      </Row>
      <Row label="Repo wiki notifications" desc="When generated project docs finish">
        <Switch checked={wiki} onCheckedChange={setWiki} />
      </Row>
      <Row label="Banner" desc="Windows / OS notification banner">
        <Switch checked={banner} onCheckedChange={setBanner} />
      </Row>
      <Row label="Sound">
        <Switch checked={sound} onCheckedChange={setSound} />
      </Row>
      <Row label="Volume">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[volume]} min={0} max={100} step={1} onValueChange={(v) => setVolume(v[0])} />
          <span className="w-10 font-mono text-xs text-orange-300">{volume}%</span>
        </div>
      </Row>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-foreground">Sound effects</div>
        {[
          ['Task completed', 'done'],
          ['Waiting for action', 'ask'],
          ['Abnormally stopped', 'fail'],
        ].map(([label, id]) => (
          <div key={id} className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-3 py-2">
            <span className="flex items-center gap-2 text-xs">
              <Bell className="h-3.5 w-3.5 text-orange-400" />
              {label}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled title="No audio engine in this build — notification sounds are a staged surface">
                Preview
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled title="No audio engine in this build — custom sounds are a staged surface">
                Replace
              </Button>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

export function VoiceSection() {
  const [input, setInput] = usePref('voice.input', true)
  const [tts, setTts] = usePref('voice.tts', false)
  const [pushToTalk, setPushToTalk] = usePref('voice.ptt', false)
  const [device, setDevice] = usePref('voice.device', 'default')
  const [noise, setNoise] = usePref('voice.noise', true)
  const [autoSend, setAutoSend] = usePref('voice.autoSend', true)
  const [speed, setSpeed] = usePref('voice.speed', 'normal')
  const [voiceName, setVoiceName] = usePref('voice.name', 'default')
  const [realtime, setRealtime] = usePref('voice.realtime', false)
  const [print, setPrint] = usePref('voice.print', false)
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Voice" desc="Mic, noise, shortcuts, and spoken replies">
      <Honest>
        Voice is confirmed v1 scope (H15 VAD/STT + H28 TTS, promoted 2026-08-31) — the capture/read-aloud stack is
        not wired in this build yet. These controls are the staged v1 surface (prefs persist and will drive the
        stack); the composer mic is disabled with a truthful status rather than “coming soon”.
      </Honest>
      <div className="text-xs font-medium text-foreground">General</div>
      <Row label="Input device" desc="Microphone used for voice input">
        <Select value={device} onValueChange={setDevice}>
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">System default</SelectItem>
            <SelectItem value="dji">External USB / DJI mic</SelectItem>
            <SelectItem value="headset">Headset</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="External mic auto-send" desc="Send when a USB / DJI-style mic stops recording">
        <Switch checked={autoSend} onCheckedChange={setAutoSend} />
      </Row>
      <div className="pt-1 text-xs font-medium text-foreground">Voice input</div>
      <Row label="Voice input" desc="Hold or tap the composer mic">
        <Switch checked={input} onCheckedChange={setInput} />
      </Row>
      <Row label="Shortcut" desc="Stays in sync with Keyboard shortcuts">
        <div className="flex items-center gap-1.5">
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">Ctrl+Shift+R</kbd>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => useAppStore.getState().setSettingsSection('keyboard')}>
            Edit
          </Button>
        </div>
      </Row>
      <Row label="Voiceprint noise reduction" desc="Filter other speakers in the room">
        <Switch checked={noise} onCheckedChange={setNoise} />
      </Row>
      <Row label="Term correction" desc="Names, project names, jargon for recognition">
        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled title="Term correction lands with the v1 STT stack — not wired yet">
          No terms yet
        </Button>
      </Row>
      <Row label="History" desc="Up to 100 voice inputs from the last 30 days">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled title="Voice history records once the v1 capture stack records — not wired yet">
          View history
        </Button>
      </Row>
      <div className="pt-1 text-xs font-medium text-foreground">Realtime voice</div>
      <Row label="Realtime voice">
        <Switch checked={realtime} onCheckedChange={setRealtime} />
      </Row>
      <Row label="Spoken voice">
        <Select value={voiceName} onValueChange={setVoiceName}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Speaking speed">
        <Select value={speed} onValueChange={setSpeed}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="slow">Slow</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="fast">Fast</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Voiceprint recognition" desc="Prefer your voice in live sessions">
        <Switch checked={print} onCheckedChange={setPrint} />
      </Row>
      <Row label="Read replies aloud">
        <Switch checked={tts} onCheckedChange={setTts} />
      </Row>
      <Row label="Push-to-talk">
        <Switch checked={pushToTalk} onCheckedChange={setPushToTalk} />
      </Row>
      <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled title="Microphone test needs the v1 capture pipeline — not wired yet">
        <Mic className="h-3.5 w-3.5" /> Test microphone
      </Button>
    </SectionShell>
  )
}

export function MobileSection() {
  // Remote session handoff + mobile companion is post-v1 (capabilities.yaml
  // H18, ARCH/09 ⚪). Per P50.4.7 the section renders a truthful post-v1
  // surface: the pairing preview stays visible as a forward-looking cue, but
  // no persisted dead switches pretend remote pairing works today.
  return (
    <SectionShell title="Mobile" desc="Pair a phone to resume a session on the LAN">
      <Honest>
        Remote session handoff + mobile companion is post-v1 (H18) — not built. This preview shows the intended
        pairing flow; no toggle below is live yet.
      </Honest>
      <div className="flex items-center gap-4 rounded-md border border-border/50 bg-background/30 p-4">
        <div className="grid h-28 w-28 place-items-center rounded-md border border-dashed border-border bg-background/40">
          <QrCode className="h-12 w-12 text-muted-foreground/50" />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium">Connect this workspace with mobile</div>
          <p className="max-w-sm text-[10px] text-muted-foreground">
            Install the phone app, sign in with the same vault, then scan. No founder server.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 bg-orange-500 text-black hover:bg-orange-400" disabled title="Post-v1 (H18) — remote pairing backend not wired">
              <Smartphone className="h-3.5 w-3.5" /> Install mobile
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled title="Post-v1 (H18) — pairing backend not wired">
              Refresh code
            </Button>
          </div>
        </div>
      </div>
      <Row label="Allow remote sessions" desc="Post-v1 (H18) — phone view/continue is not built; switch inert">
        <Switch disabled />
      </Row>
      <Row label="Allow phone to control this device" desc="Post-v1 (H18) — control is not built; switch inert">
        <Switch disabled />
      </Row>
      <Row label="Keep the computer awake" desc="Unrelated to pairing — stays available as a native concern">
        <Switch disabled title="Wake-lock is a post-v1 pairing concern — not wired"/>
      </Row>
    </SectionShell>
  )
}

export function ChatAutoRunSection() {
  const permissionMode = useAppStore((s) => s.permissionMode)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const [ctx, setCtx] = usePref('chat.ctx', 4096)
  const [cloudNet, setCloudNet] = usePref('chat.cloudNet', true)
  const [queue, setQueue] = usePref('chat.queue', true)
  return (
    <SectionShell title="Chat & Auto-run" desc="How much the agent may do without asking — and local context">
      <Honest>
        Modes are stored and shown on the composer. The executor still uses Guard-2 Ask for mutations until this preference is honored at ticket mint (open).
      </Honest>
      <div className="space-y-1.5">
        <div className="text-xs font-medium">Auto-run</div>
        <RadioCard
          selected={permissionMode === 'sandbox'}
          title="🛡 Sandbox"
          desc="Plan + read-only. Every mutation is denied."
          onSelect={() => setPermissionMode('sandbox')}
        />
        <RadioCard
          selected={permissionMode === 'ask'}
          title="👀 Ask"
          desc="Default. Safe reads auto-allow; mutations show a Guard-2 card."
          onSelect={() => setPermissionMode('ask')}
        />
        <RadioCard
          selected={permissionMode === 'auto'}
          title="⚡ Auto"
          desc="Low-risk workspace writes auto-allow. Destructive, secrets, money, and new domains still ask."
          onSelect={() => setPermissionMode('auto')}
        />
        <RadioCard
          selected={permissionMode === 'full'}
          title="🚀 Maximum"
          desc="Maximum autonomy within hard floors — never a Guard bypass. Destructive / secret / financial / R4 still ask."
          onSelect={() => setPermissionMode('full')}
        />
      </div>
      <Row label="Local context window" desc="Soft cap used when a local runtime is selected (Ollama-style)">
        <Select value={String(ctx)} onValueChange={(v) => setCtx(Number(v))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2048, 4096, 8192, 16384, 32768].map((n) => (
              <SelectItem key={n} value={String(n)}>{n.toLocaleString()} tok</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Cloud / network for local models" desc="Let a local runtime fetch tokenizer files">
        <Switch checked={cloudNet} onCheckedChange={setCloudNet} />
      </Row>
      <Row label="Queue follow-up turns" desc="Stack messages while a turn is running">
        <Switch checked={queue} onCheckedChange={setQueue} />
      </Row>
    </SectionShell>
  )
}

// P50.2.x — removed: PermissionsSection (duplicate of ChatAutoRunSection's
// four RadioCards plus a config button with no editor). The permissions
// settings route renders ChatAutoRunSection (see settings-panel SectionBody).

export function BrowserNetworkSection() {
  const [engine, setEngine] = usePref('browser.engine', 'builtin')
  const [protect, setProtect] = usePref('browser.protect', 'off')
  const [http2, setHttp2] = usePref('browser.http2', true)
  const [proxy, setProxy] = usePref('browser.proxy', '')
  const [localLinks, setLocalLinks] = usePref('browser.localLinks', 'inapp')
  const [webLinks, setWebLinks] = usePref('browser.webLinks', true)
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Browser & Network" desc="Where the agent opens pages, protection, HTTP, required domains">
      <div className="text-xs font-medium">Browser</div>
      <Row label="Browser automation" desc="Which surface receives agent clicks">
        <Select value={engine} onValueChange={setEngine}>
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="builtin">Browse tab</SelectItem>
            <SelectItem value="system">System Chrome / Edge</SelectItem>
            <SelectItem value="ask">Ask each time</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Browser protection" desc="Stop the agent from running browser tools on its own">
        <Select value={protect} onValueChange={setProtect}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="ask">Ask</SelectItem>
            <SelectItem value="block">Block</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Open local links in Browse" desc="localhost URLs open in the in-app tab">
        <Switch checked={localLinks === 'inapp'} onCheckedChange={(v) => setLocalLinks(v ? 'inapp' : 'system')} />
      </Row>
      <Row label="Open web links in Browse" desc="http/https open in the in-app tab">
        <Switch checked={webLinks} onCheckedChange={setWebLinks} />
      </Row>
      <div className="pt-1 text-xs font-medium">Network</div>
      <Row label="HTTP compatibility" desc="HTTP/2 for low-latency streams; drop to HTTP/1.1 behind some VPNs">
        <Select value={http2 ? 'h2' : 'h1'} onValueChange={(v) => setHttp2(v === 'h2')}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="h2">HTTP/2</SelectItem>
            <SelectItem value="h1">HTTP/1.1</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="HTTPS / SOCKS proxy" desc="e.g. http://127.0.0.1:7890">
        <Input value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="none" className="h-8 w-56 font-mono text-xs" />
      </Row>
      <Row label="Required domains" desc="Must be reachable for models and MCP">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => {
            const domains = 'huggingface.co, api hosts of your configured providers, your MCP server URLs'
            void navigator.clipboard
              ?.writeText(domains)
              .then(() => notify('Required-domains hint copied'))
              .catch(() => notify(domains))
          }}
        >
          Copy · Show
        </Button>
      </Row>
      <Row label="Network diagnostics">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() =>
            void (async () => {
              try {
                const { doctorReport } = await import('@/lib/doctor')
                const report = await doctorReport()
                const bad = report.checks.filter((c) => c.status !== 'ok')
                notify(
                  bad.length === 0
                    ? `Diagnostic: all ${report.checks.length} checks ok`
                    : `Diagnostic: ${bad.length} attention — ${bad.map((c) => c.name).join(', ')} (see Doctor)`,
                  bad.length === 0 ? 'default' : 'error',
                )
                if (bad.length > 0) useAppStore.getState().setSettingsSection('doctor')
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Diagnostic failed', 'error')
              }
            })()
          }
        >
          <Globe className="h-3.5 w-3.5" /> Run diagnostic
        </Button>
      </Row>
    </SectionShell>
  )
}

export function IndexingSection() {
  const [lsp, setLsp] = usePref('index.lsp', true)
  const [lspWt, setLspWt] = usePref('index.lspWorktree', true)
  const [grep, setGrep] = usePref('index.grep', true)
  const [hier, setHier] = usePref('index.hierIgnore', false)
  const [sym, setSym] = usePref('index.symlinks', false)
  const [maxLocal, setMaxLocal] = usePref('index.maxLocal', 8)
  const [maxRemote, setMaxRemote] = usePref('index.maxRemote', 2)
  const [pct] = usePref('index.pct', 100)
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Code intelligence & indexing" desc="Grep index, ignore rules, LSP counts, extra docs">
      <Honest>LSP runner is crate-landed (`everyaios-codeintel`). This panel does not start rust-analyzer/pyright until those binaries are install-gated.</Honest>
      <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span>Code index</span>
          <span className="font-mono text-emerald-300">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-6 px-0 text-[10px]"
          disabled
          title="Workspace reindex lands with the P20 SeekStorm/FTS path — not wired yet"
        >
          Reindex
        </Button>
      </div>
      <div className="text-xs font-medium">Codebase</div>
      <Row label="Index repositories for instant grep" desc="Local only. Speeds filename and content search">
        <Switch checked={grep} onCheckedChange={setGrep} />
      </Row>
      <div className="text-xs font-medium">Ignore files</div>
      <Row label="Hierarchical ignore" desc="Apply ignore files to all subdirectories">
        <Switch checked={hier} onCheckedChange={setHier} />
      </Row>
      <Row label="Ignore symlinks during discovery" desc="Skip symlink loops. Enable only when ignore files are reachable without them">
        <Switch checked={sym} onCheckedChange={setSym} />
      </Row>
      <Row label="Edit ignore file">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() =>
            void (async () => {
              const st = useAppStore.getState()
              if (!inTauri()) {
                notify('Ignore-file editing needs the Tauri shell', 'error')
                return
              }
              const folder = st.taskFolder
              if (!folder) {
                notify('Attach a workspace folder first (chat empty state → Open folder)', 'error')
                return
              }
              const path = `${folder.replace(/\/+$/, '')}/.everyaiosignore`
              try {
                const { fsReadFile } = await import('@/lib/fs')
                const f = await fsReadFile(path).catch(() => ({ content: '' }))
                window.dispatchEvent(
                  new CustomEvent('everyaios:open-file', { detail: { path, content: f.content } }),
                )
                st.setActiveView('code')
              } catch (e) {
                notify(e instanceof Error ? e.message : 'Could not open the ignore file', 'error')
              }
            })()
          }
        >
          Edit ignore
        </Button>
      </Row>
      <div className="text-xs font-medium">LSP</div>
      <Row label="Enable language servers" desc="Diagnostics in the Code view">
        <Switch checked={lsp} onCheckedChange={setLsp} />
      </Row>
      <Row label="Enable LSPs for worktrees" desc="Agent checkouts get their own servers">
        <Switch checked={lspWt} onCheckedChange={setLspWt} />
      </Row>
      <Row label="Max local LSP workspaces">
        <Select value={String(maxLocal)} onValueChange={(v) => setMaxLocal(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 4, 8, 16].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Max remote LSP workspaces">
        <Select value={String(maxRemote)} onValueChange={(v) => setMaxRemote(Number(v))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0, 1, 2, 4].map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Docs for AI Q&A" desc="URL or local upload as extra context">
        <Button
          size="sm"
          className="h-7 bg-orange-500 text-black hover:bg-orange-400"
          disabled
          title="Document ingestion for retrieval lands with the P20 index — not wired yet"
        >
          <Plus className="h-3.5 w-3.5" /> Add docs
        </Button>
      </Row>
    </SectionShell>
  )
}

// P50.2.6 — removed: McpMarketSection + MCP_DIRECTORY (static 5-row catalog
// with a fake attach). The MCP surface is the live Connectors panel
// (vault OAuth + attached servers + store catalog); the settings MCP route
// renders it (see settings-panel SectionBody).

const PLUGIN_CATS = ['Featured', 'Code review', 'Coding', 'Database', 'Design', 'DevOps', 'Knowledge', 'Workflow', 'Installed']

export function MarketplaceSection() {
  const [cat, setCat] = useState('Featured')
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell
      title="Marketplace"
      desc="Plugins that bundle MCPs, skills, and agents. Installed list is empty until you add one."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          disabled
          title="Plugin authoring lands with the post-v1 marketplace fetch — not wired yet"
        >
          Create plugin
        </Button>
      }
    >
      <div className="flex flex-wrap gap-1">
        {PLUGIN_CATS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              'rounded-md border px-2 py-1 text-[10px]',
              cat === c ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { name: 'Superpowers', desc: 'TDD, systematic debug, parallel dispatch, plan writing' },
          { name: 'Knowledge', desc: 'Q&A over your repo wiki + uploaded docs' },
          { name: 'STAROps', desc: 'Agentic ops from data queries' },
          { name: 'Design libraries', desc: 'Brand tokens + composable design skills' },
        ].map((p) => (
          <div key={p.name} className="rounded-md border border-border/50 bg-background/30 p-3">
            <div className="text-xs font-medium">{p.name}</div>
            <p className="mt-1 text-[10px] text-muted-foreground">{p.desc}</p>
            <Button
              size="sm"
              className="mt-2 h-6 bg-orange-500 px-2 text-[10px] text-black hover:bg-orange-400"
              disabled
              title="Marketplace fetch is not wired — skill_store loads local SKILL.md files (see Skills)"
            >
              Install
            </Button>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground">User · this machine · custom — no plugins installed.</div>
    </SectionShell>
  )
}

const EXPERTS = [
  { id: 'researcher', name: 'Researcher', desc: 'Read-only research, code location, environment inspect, reports. Scout child by default.' },
  { id: 'engineer', name: 'Full-stack engineer', desc: 'Implement and modify frontend and backend. Writers=1 unless you raise the cap.' },
  { id: 'qa', name: 'QA', desc: 'Tests, builds, validation evidence.' },
  { id: 'reviewer', name: 'Code reviewer', desc: 'Risks and improvement notes. No writes.' },
  { id: 'ui', name: 'UI operator', desc: 'Browser and UI end-to-end. Computer-use still E9 / CDP.' },
  { id: 'explore', name: 'Explore', desc: 'General-purpose browse of a tree. Depth ≤2.' },
  { id: 'debug', name: 'Debug engineer', desc: 'Reproduce failures, find root cause, suggest a fix. Writes only after a ticket.' },
  { id: 'general', name: 'General purpose', desc: 'Default subagent when no specialist matches.' },
]

export function ExpertsSection() {
  const notify = useAppStore((s) => s.notify)
  const [on, setOn] = usePref<Record<string, boolean>>(
    'experts.on',
    Object.fromEntries(EXPERTS.map((e) => [e.id, e.id !== 'ui'])),
  )
  return (
    <SectionShell title="Experts / subagents" desc="Built-in roles. Switching models in chat only affects the lead agent.">
      <Honest>B3 subagents are specified (depth ≤2, concurrency ≤6). This list is the UI for those roles — spawn is not a live fan-out from this screen.</Honest>
      <ul className="space-y-1.5">
        {EXPERTS.map((e) => (
          <li key={e.id} className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2">
            <div>
              <div className="text-xs font-medium">{e.name}</div>
              <p className="text-[10px] text-muted-foreground">{e.desc}</p>
            </div>
            <Switch
              checked={!!on[e.id]}
              onCheckedChange={(v) => setOn({ ...on, [e.id]: v })}
            />
          </li>
        ))}
      </ul>
      <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center">
        <div className="text-xs text-muted-foreground">No custom expert yet</div>
        <div className="mt-2 flex justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            onClick={() =>
              void (async () => {
                const st = useAppStore.getState()
                if (!inTauri()) {
                  notify('Bundle import needs the Tauri shell', 'error')
                  return
                }
                try {
                  const { open } = await import('@tauri-apps/plugin-dialog')
                  const picked = await open({
                    multiple: false,
                    title: 'Import an agent bundle (agent.toml)',
                    filters: [{ name: 'Agent bundle', extensions: ['toml'] }],
                  })
                  if (typeof picked !== 'string') return
                  const { fsReadFile } = await import('@/lib/fs')
                  const { agentRegistrySave } = await import('@/lib/agent-registry')
                  const f = await fsReadFile(picked)
                  if (f.binary) {
                    notify('That file is binary — pick an agent.toml', 'error')
                    return
                  }
                  const id = await agentRegistrySave(f.content)
                  notify(`Imported agent bundle as “${id}”`)
                } catch (e) {
                  notify(e instanceof Error ? e.message : 'Import failed', 'error')
                }
              })()
            }
          >
            Import
          </Button>
          <Button
            size="sm"
            className="h-7 bg-orange-500 text-[10px] text-black hover:bg-orange-400"
            onClick={() => useAppStore.getState().setCenterScreen('agents')}
          >
            + New
          </Button>
        </div>
      </div>
    </SectionShell>
  )
}

// P50.2.x — removed: SkillsSection (always-empty `rows = []` plus a sync
// toast). The skills surface is the live SkillsPanel (signed store
// install/uninstall); the settings skills route renders it (see
// settings-panel SectionBody).

export function LaunchCliSection() {
  const notify = useAppStore((s) => s.notify)
  const agents = [
    { id: 'claude-code', name: 'Claude Code', desc: 'ACP coding agent', cmd: 'everyaios acp launch claude-code' },
    { id: 'codex', name: 'Codex', desc: 'ACP coding agent', cmd: 'everyaios acp launch codex' },
    { id: 'grok-build', name: 'Grok Build', desc: 'ACP coding agent', cmd: 'everyaios acp launch grok-build' },
    { id: 'opencode', name: 'OpenCode', desc: 'ACP coding agent', cmd: 'everyaios acp launch opencode' },
  ]
  return (
    <SectionShell title="Launch" desc="Copy a command and run it in your terminal. Same ACP agents as the picker — not a second product.">
      <Honest>F8 install + J17 launch exist as Tauri commands. These cards copy a suggested CLI string; the shell does not spawn from this list until you paste it.</Honest>
      <ul className="space-y-2">
        {agents.map((a) => (
          <li key={a.id} className="rounded-md border border-border/50 bg-background/30 px-3 py-2">
            <div className="text-xs font-medium">{a.name}</div>
            <p className="text-[10px] text-muted-foreground">{a.desc}</p>
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-border/40 bg-background/40 px-2 py-1 font-mono text-[10px]">
              <span className="truncate">{a.cmd}</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => {
                void navigator.clipboard?.writeText(a.cmd).catch(() => undefined)
                notify(`Copied ${a.cmd}`)
              }}>
                Copy
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

export function CommandsSection() {
  const [draft, setDraft] = useState('')
  const [cmds, setCmds] = usePref<string[]>('commands.user', ['/help', '/undo', '/export'])
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Commands" desc="Slash commands in the composer. Tray shortcuts live here too.">
      <ul className="divide-y divide-border/40 rounded-md border border-border/50">
        {cmds.map((c) => (
          <li key={c} className="flex items-center justify-between px-3 py-1.5 font-mono text-[11px]">
            {c}
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setCmds(cmds.filter((x) => x !== c))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="/name" className="h-8 font-mono text-xs" />
        <Button size="sm" className="h-8" onClick={() => {
          if (!draft.trim()) return
          setCmds([...cmds, draft.trim()])
          setDraft('')
        }}>
          Add
        </Button>
      </div>
      <Row label="CUE / tray shortcuts" desc="Tab to accept, import, rename">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          disabled
          title="Tray shortcut editing lands with the OS-tray runner — not wired yet"
        >
          Edit tray
        </Button>
      </Row>
    </SectionShell>
  )
}

export function HooksSection() {
  const [name, setName] = useState('')
  const [event, setEvent] = usePref('hooks.event', 'PreToolUse')
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell
      title="Hooks"
      desc="Task-lifecycle commands. PreToolUse may deny only — it cannot skip a Guard-2 ticket."
      action={
        <Button
          size="sm"
          className="h-7 bg-orange-500 text-black hover:bg-orange-400"
          disabled
          title="Hook execution lands with the I6 runner — the event/command form above is the staged surface"
        >
          <Plus className="h-3.5 w-3.5" /> Add hook
        </Button>
      }
    >
      <Honest>Empty hooks is the default. Changes apply to new sessions.</Honest>
      <Row label="Event">
        <Select value={event} onValueChange={setEvent}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['PreToolUse', 'PostToolUse', 'PostToolBatch', 'UserPromptSubmit', 'Stop', 'SessionStart'].map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row label="Command">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="path/to/script" className="h-8 w-64 font-mono text-xs" />
      </Row>
      <div className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">
        No hooks configured
      </div>
    </SectionShell>
  )
}

export function WorktreeSection() {
  const [path, setPath] = usePref('worktree.path', '~/.everyaios/worktrees')
  const [cap, setCap] = usePref('worktree.gb', 20)
  return (
    <SectionShell title="Worktree" desc="Disk for isolated agent checkouts">
      <Row label="Root">
        <Input value={path} onChange={(e) => setPath(e.target.value)} className="h-8 w-72 font-mono text-xs" />
      </Row>
      <Row label="Disk cap">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[cap]} min={1} max={200} step={1} onValueChange={(v) => setCap(v[0])} />
          <span className="w-12 font-mono text-xs text-orange-300">{cap} GB</span>
        </div>
      </Row>
      <Honest>Isolated worktree-per-agent is P20 / P7.8. This cap is a preference, not an enforcer yet.</Honest>
    </SectionShell>
  )
}

export function RulesSection() {
  const [agents, setAgents] = usePref('rules.agents', '# AGENTS.md\n\n- Prefer small diffs.\n- Never commit secrets.\n')
  const [claude, setClaude] = usePref('rules.claude', '# CLAUDE.md\n\nProject conventions live here.\n')
  const [mem, setMem] = usePref('rules.memoryOn', true)
  return (
    <SectionShell title="Rules & memory" desc="AGENTS.md and CLAUDE.md are project instructions the lead agent reads on folder open">
      <Row label="Memory" desc="Off = this session does not write long-term facts">
        <Switch checked={mem} onCheckedChange={setMem} />
      </Row>
      <div className="space-y-1">
        <div className="text-xs font-medium">AGENTS.md</div>
        <Textarea value={agents} onChange={(e) => setAgents(e.target.value)} className="min-h-[120px] font-mono text-[11px]" />
      </div>
      <div className="space-y-1">
        <div className="text-xs font-medium">CLAUDE.md</div>
        <Textarea value={claude} onChange={(e) => setClaude(e.target.value)} className="min-h-[80px] font-mono text-[11px]" />
      </div>
      <p className="text-[10px] text-muted-foreground">Edits stay in localStorage until the workspace file write is ticketed.</p>
    </SectionShell>
  )
}

export function CloudEnvSection() {
  const [pkg, setPkg] = usePref('cloud.pkg', 'none')
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Cloud environments" desc="Optional remote packages. Local-first default is none.">
      <Row label="Environment package">
        <Select value={pkg} onValueChange={setPkg}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (this machine)</SelectItem>
            <SelectItem value="node">Node LTS image</SelectItem>
            <SelectItem value="python">Python 3.12 image</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[10px]"
        disabled
        title="Remote package pull is not built — local-first default is this machine"
      >
        Pull package
      </Button>
    </SectionShell>
  )
}

// P50.2.x — removed: ImportSection (six buttons whose parsers were never
// built — every click ended in an error toast). Migration import returns
// with the parser backend; until then the route falls back to General
// (see settings-panel SectionBody).

// P50.2.x — removed: UsageSection (static Requests/Tokens/USD zeros that
// duplicated AnalyticsPanel + UxMetricsSection). The usage route renders the
// live UxMetricsSection (see settings-panel SectionBody).

export function ResourcesSection() {
  const notify = useAppStore((s) => s.notify)
  const [disk, setDisk] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const { doctorReport } = await import('@/lib/doctor')
        const report = await doctorReport()
        const diskCheck = report.checks.find((c) => c.name.toLowerCase().includes('disk'))
        if (alive) setDisk(diskCheck?.detail ?? null)
      } catch {
        if (alive) setDisk(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return (
    <SectionShell title="Resources" desc="Disk from the Doctor report. Process CPU/memory are not sampled in this build.">
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          { label: 'CPU', val: '—', Icon: Cpu, title: 'Process CPU is not sampled in this build' },
          { label: 'Memory', val: '—', Icon: Radio, title: 'Process memory is not sampled in this build' },
          { label: 'Disk', val: disk ?? '—', Icon: HardDrive, title: 'From the Doctor disk check' },
        ]).map(({ label, val, Icon, title }) => (
            <div key={label} className="rounded-md border border-border/50 bg-background/30 px-3 py-3" title={title}>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Icon className="h-3 w-3" /> {label}
              </div>
              <div className="font-mono text-sm">{val}</div>
            </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[10px]"
        onClick={() => useAppStore.getState().setSettingsSection('doctor')}
      >
        Open Doctor
      </Button>
    </SectionShell>
  )
}

export function BetaSection() {
  const [beta, setBeta] = usePref('beta.on', false)
  const [solo, setSolo] = usePref('beta.solo', false)
  return (
    <SectionShell title="Beta" desc="Preview flags. Off by default.">
      <Row label="Beta channel">
        <Switch checked={beta} onCheckedChange={setBeta} />
      </Row>
      <Row label="SOLO / unattended long jobs" desc="Preference only — tray keep-alive is not enforced yet">
        <Switch checked={solo} onCheckedChange={setSolo} />
      </Row>
    </SectionShell>
  )
}

export function CustomProvidersBlock() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const notify = useAppStore((s) => s.notify)
  return (
    <div className="mt-4 space-y-2 rounded-md border border-border/50 bg-background/20 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5 text-orange-400" />
        Add custom provider
      </div>
      <p className="text-[10px] text-muted-foreground">
        Stores the key in the vault under a slugged provider id (OpenAI-compatible transports).
        A custom base-URL override applies once user-config provider IPC lands — until then the
        known endpoint for that provider is used.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. DeepSeek)" className="h-8 text-xs" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/v1" className="h-8 font-mono text-xs" />
        <Input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="API key" className="h-8 font-mono text-xs" />
      </div>
      <Button
        size="sm"
        className="h-7 bg-orange-500 text-black hover:bg-orange-400"
        disabled={busy}
        onClick={() =>
          void (async () => {
            if (!name.trim() || !url.trim() || !key) {
              notify('Name, base URL, and key are all required', 'error')
              return
            }
            if (!inTauri()) {
              notify('Custom providers need the Tauri shell (vault write)', 'error')
              return
            }
            setBusy(true)
            try {
              const { invoke } = await import('@/lib/tauri')
              const provider = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
              await invoke('vault_key_add', { provider, keyId: 'default', value: key })
              useAppStore.getState().setProviderKeysConfigured(true)
              setName('')
              setUrl('')
              setKey('')
              notify(`Stored key for custom provider “${provider}” in the vault`)
            } catch (e) {
              notify(e instanceof Error ? e.message : 'Custom provider save failed', 'error')
            } finally {
              setBusy(false)
            }
          })()
        }
      >
        {busy ? 'Saving…' : 'Add provider'}
      </Button>
    </div>
  )
}

export function GeneralExtras() {
  const [proxy, setProxy] = usePref('general.proxy', '')
  const [tray, setTray] = usePref('general.tray', true)
  const [archive, setArchive] = usePref('general.archiveDays', 30)
  const [md, setMd] = usePref('general.mdOpen', 'editor')
  const [keymap, setKeymap] = usePref('general.keymap', 'default')
  return (
    <>
      <Row label="HTTPS / SOCKS proxy">
        <Input value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="optional" className="h-8 w-56 font-mono text-xs" />
      </Row>
      <Row label="Keep running in tray">
        <Switch checked={tray} onCheckedChange={setTray} />
      </Row>
      <Row label="Archive idle sessions after">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[archive]} min={7} max={365} step={1} onValueChange={(v) => setArchive(v[0])} />
          <span className="w-12 font-mono text-xs text-orange-300">{archive}d</span>
        </div>
      </Row>
      <Row label="Open markdown with">
        <Select value={md} onValueChange={setMd}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">Code editor</SelectItem>
            <SelectItem value="preview">Preview</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Keymap">
        <Select value={keymap} onValueChange={setKeymap}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">EveryAIOS</SelectItem>
            <SelectItem value="vscode">VS Code</SelectItem>
            <SelectItem value="cursor">Cursor-like</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </>
  )
}


