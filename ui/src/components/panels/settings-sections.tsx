'use client'

import { useState } from 'react'
import { Check, HeartPulse, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { Row, SectionShell } from './settings-shared'

// === General ===
export function GeneralSection() {
  const [startup, setStartup] = useState('last')
  const [tray, setTray] = useState(true)
  const [telemetry, setTelemetry] = useState(false)
  const powerMode = useAppStore((s) => s.powerMode)
  const setPowerMode = useAppStore((s) => s.setPowerMode)
  const devMode = useAppStore((s) => s.devMode)
  const setDevMode = useAppStore((s) => s.setDevMode)

  return (
    <SectionShell title="General" desc="App behavior, mode, language and tray">
      <Row label="Mode" desc="Simple hides the technical cockpit; Pro shows the full workspace">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs', !powerMode ? 'text-orange-300' : 'text-muted-foreground')}>Simple</span>
          <Switch checked={powerMode} onCheckedChange={setPowerMode} />
          <span className={cn('text-xs', powerMode ? 'text-orange-300' : 'text-muted-foreground')}>Pro</span>
        </div>
      </Row>
      <Row label="Developer Mode" desc="Show the full debug telemetry strip (sidecar, IPC, vault, audit, db)">
        <Switch checked={devMode} onCheckedChange={setDevMode} />
      </Row>
      <Row label="Language">
        <Select defaultValue="en">
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="On startup">
        <Select value={startup} onValueChange={setStartup}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last">Restore last session</SelectItem>
            <SelectItem value="new">Open new session</SelectItem>
            <SelectItem value="blank">Show blank state</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Row label="Minimize to tray" desc="Keep the agent running when the window is closed">
        <Switch checked={tray} onCheckedChange={setTray} />
      </Row>
      <Row label="Anonymous telemetry" desc="Crash + usage stats, never content">
        <Switch checked={telemetry} onCheckedChange={setTelemetry} />
      </Row>
    </SectionShell>
  )
}

// === Appearance ===
export function AppearanceSection() {
  const [theme, setTheme] = useState('dark')
  const [scale, setScale] = useState(14)
  const [density, setDensity] = useState('comfortable')

  return (
    <SectionShell title="Appearance" desc="Theme, font scale and density">
      <Row label="Theme">
        <div className="flex gap-1.5">
          {['light', 'dark', 'system'].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                'rounded-md border px-3 py-1 text-xs capitalize transition-colors',
                theme === t
                  ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                  : 'border-border bg-background/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Font scale">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[scale]} min={11} max={18} step={1} onValueChange={(v) => setScale(v[0])} />
          <span className="w-12 font-mono text-xs text-orange-300">{scale}px</span>
        </div>
      </Row>
      <Row label="Density">
        <Select value={density} onValueChange={setDensity}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="compact">Compact</SelectItem>
            <SelectItem value="comfortable">Comfortable</SelectItem>
            <SelectItem value="spacious">Spacious</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </SectionShell>
  )
}

// === Models & BYOK ===
const PROVIDERS = [
  { id: 'p1', name: 'OpenAI', model: 'gpt-4o', status: 'healthy', priority: 1 },
  { id: 'p2', name: 'Anthropic', model: 'claude-sonnet-4.5', status: 'healthy', priority: 2 },
  { id: 'p3', name: 'Google', model: 'gemini-2.5-pro', status: 'healthy', priority: 3 },
  { id: 'p4', name: 'DeepSeek', model: 'deepseek-v3', status: 'unverified', priority: 4 },
  { id: 'p5', name: 'Ollama (local)', model: 'llama3:70b', status: 'offline', priority: 5 },
]

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'healthy'
      ? 'bg-emerald-500/15 text-emerald-300'
      : status === 'unverified'
        ? 'bg-yellow-500/15 text-yellow-300'
        : 'bg-zinc-500/15 text-zinc-400'
  return (
    <Badge className={cn('text-[9px] capitalize', tone)}>
      {status === 'healthy' && <Check className="h-3 w-3" />}
      {status}
    </Badge>
  )
}

export function ModelsSection() {
  return (
    <SectionShell
      title="API Keys (BYOK)"
      desc="Bring-your-own-key providers — health checks and priority. The agent runtime + model picker lives under Agents & Models."
      action={
        <Button size="sm" className="h-8 bg-orange-500 text-black hover:bg-orange-400">
          <Plus className="h-3.5 w-3.5" />
          Add key
        </Button>
      }
    >
      <ul className="space-y-1.5">
        {PROVIDERS.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-orange-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <Badge variant="secondary" className="text-[9px]">#{p.priority}</Badge>
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">{p.model}</div>
            </div>
            <StatusPill status={p.status} />
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]">
                <HeartPulse className="h-3 w-3" />
                Health
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]">Priority</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-red-400 hover:bg-red-500/10">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
