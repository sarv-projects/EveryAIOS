'use client'

import { useState } from 'react'
import { ExternalLink, Github } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { LinkChip, Row, SectionShell } from './settings-shared'

// === Privacy ===
export function PrivacySection() {
  const [audit, setAudit] = useState(30)
  const [memory, setMemory] = useState(90)

  return (
    <SectionShell title="Privacy" desc="Telemetry, audit and memory retention">
      <Row label="Anonymous telemetry" desc="Crash + usage, never content">
        <Switch defaultChecked />
      </Row>
      <Row label="Audit retention">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[audit]} min={7} max={365} step={1} onValueChange={(v) => setAudit(v[0])} />
          <span className="w-16 font-mono text-xs text-orange-300">{audit}d</span>
        </div>
      </Row>
      <Row label="Memory retention">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[memory]} min={7} max={365} step={1} onValueChange={(v) => setMemory(v[0])} />
          <span className="w-16 font-mono text-xs text-orange-300">{memory}d</span>
        </div>
      </Row>
      <Row label="Local-only mode" desc="All connectors and model calls blocked">
        <Switch />
      </Row>
    </SectionShell>
  )
}

// === Keyboard ===
const SHORTCUTS = [
  { action: 'Open command palette', keys: ['Cmd', 'K'] },
  { action: 'New work', keys: ['Cmd', 'N'] },
  { action: 'Toggle pause', keys: ['Cmd', '.'] },
  { action: 'Switch to chat', keys: ['Cmd', '1'] },
  { action: 'Switch to automations', keys: ['Cmd', '2'] },
  { action: 'Open audit', keys: ['Cmd', 'Shift', 'A'] },
]

export function KeyboardSection() {
  const notify = useAppStore((s) => s.notify)
  return (
    <SectionShell title="Keyboard" desc="Shortcut bindings">
      <ul className="divide-y divide-border/40 rounded-md border border-border/50 bg-background/30">
        {SHORTCUTS.map((s, i) => (
          <li key={i} className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-foreground">{s.action}</span>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => notify(`Edit binding for “${s.action}” — press new keys`)}
              >
                Edit
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

// === Advanced ===
const EXPERIMENTAL = [
  { name: 'Multi-agent sessions', on: false },
  { name: 'Local Whisper transcription', on: true },
  { name: 'Vision grounding (VLM)', on: false },
  { name: 'Pre-emptive memory compaction', on: true },
  { name: 'Headless CI mode', on: false },
]

export function AdvancedSection() {
  return (
    <SectionShell title="Advanced" desc="Paths, logging and experimental features">
      <Row label="Data path">
        <Input defaultValue="~/.everyaios/data" className="h-8 w-64 font-mono text-xs" />
      </Row>
      <Row label="Log level">
        <Select defaultValue="info">
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="trace">trace</SelectItem>
            <SelectItem value="debug">debug</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warn">warn</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <div className="pt-2">
        <div className="mb-2 text-xs font-medium text-foreground">Experimental features</div>
        <ul className="space-y-1.5">
          {EXPERIMENTAL.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-3 py-2"
            >
              <span className="text-xs text-foreground">{f.name}</span>
              <Switch defaultChecked={f.on} />
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  )
}

// === About ===
export function AboutSection() {
  return (
    <SectionShell title="About" desc="Version, license and links">
      <div className="rounded-lg border border-border bg-background/30 p-4">
        <div className="font-mono text-base font-semibold text-orange-300">EveryAIOS</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          v0.7.2 · build 2026.01.15
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Agentic OS desktop runtime. Self-hosted, local-first.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkChip icon={<ExternalLink className="h-3 w-3" />} label="Docs" />
          <LinkChip icon={<Github className="h-3 w-3" />} label="GitHub" />
          <LinkChip icon={<ExternalLink className="h-3 w-3" />} label="Issues" />
        </div>
        <div className="mt-4 border-t border-border/40 pt-3 text-[10px] text-muted-foreground">
          Licensed under the EveryAIOS Community License (ECL-1.0).
        </div>
      </div>
    </SectionShell>
  )
}
