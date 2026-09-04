'use client'

import { useEffect, useState } from 'react'
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
import { inTauri } from '@/lib/tauri'
import { usePref } from '@/lib/ui-prefs'

// === Privacy ===
export function PrivacySection() {
  const [audit, setAudit] = usePref('privacy.auditRetentionDays', 30)
  const [memory, setMemory] = usePref('privacy.memoryRetentionDays', 90)

  return (
    <SectionShell title="Privacy" desc="Telemetry, audit and memory retention">
      <Row label="Anonymous telemetry" desc="No telemetry sender exists in this build — nothing leaves the machine">
        <Switch checked={false} disabled title="No telemetry sender in this build" />
      </Row>
      <Row label="Audit retention" desc="Stored preference — applied by the retention job">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[audit]} min={7} max={365} step={1} onValueChange={(v) => setAudit(v[0])} />
          <span className="w-16 font-mono text-xs text-orange-300">{audit}d</span>
        </div>
      </Row>
      <Row label="Memory retention" desc="Stored preference — applied by the retention job">
        <div className="flex w-56 items-center gap-3">
          <Slider value={[memory]} min={7} max={365} step={1} onValueChange={(v) => setMemory(v[0])} />
          <span className="w-16 font-mono text-xs text-orange-300">{memory}d</span>
        </div>
      </Row>
      <Row label="Local-only mode" desc="Connector/model blocking is not built — switches nothing yet">
        <Switch checked={false} disabled title="Local-only enforcement is not built" />
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
  return (
    <SectionShell title="Keyboard" desc="Shortcut bindings (fixed set — custom bindings are not editable in this build)">
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
            </div>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

// === Advanced ===
export function AdvancedSection() {
  const [dataPath, setDataPath] = usePref('advanced.dataPath', '~/.everyaios/data')
  const [logLevel, setLogLevel] = usePref('advanced.logLevel', 'info')
  const [experimental, setExperimental] = usePref<Record<string, boolean>>('advanced.experimental', {
    'Multi-agent sessions': false,
    'Local Whisper transcription': true,
    'Vision grounding (VLM)': false,
    'Pre-emptive memory compaction': true,
    'Headless CI mode': false,
  })
  return (
    <SectionShell title="Advanced" desc="Paths, logging and experimental features (stored preferences — read by future builds)">
      <Row label="Data path" desc="Stored preference">
        <Input value={dataPath} onChange={(e) => setDataPath(e.target.value)} className="h-8 w-64 font-mono text-xs" />
      </Row>
      <Row label="Log level" desc="Stored preference">
        <Select value={logLevel} onValueChange={setLogLevel}>
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
          {Object.keys(experimental).map((name) => (
            <li
              key={name}
              className="flex items-center justify-between rounded-md border border-border/50 bg-background/30 px-3 py-2"
            >
              <span className="text-xs text-foreground">{name}</span>
              <Switch
                checked={!!experimental[name]}
                onCheckedChange={(v) => setExperimental({ ...experimental, [name]: v })}
              />
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  )
}

// === About ===
type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string; notes: string | null }
  | { phase: 'installing' }
  | { phase: 'error'; message: string }

export function AboutSection() {
  const [updater, setUpdater] = useState<UpdaterState>({ phase: 'idle' })

  async function checkForUpdates() {
    if (!inTauri()) {
      setUpdater({ phase: 'error', message: 'updates require the desktop shell' })
      return
    }
    setUpdater({ phase: 'checking' })
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ available: boolean; version?: string; notes?: string | null }>(
        'updater_check',
      )
      if (r.available && r.version) {
        setUpdater({ phase: 'available', version: r.version, notes: r.notes ?? null })
      } else {
        setUpdater({ phase: 'up-to-date' })
      }
    } catch (e) {
      setUpdater({ phase: 'error', message: String(e) })
    }
  }

  async function installUpdate() {
    if (!inTauri()) return
    setUpdater({ phase: 'installing' })
    try {
      const { invoke } = await import('@/lib/tauri')
      // On success the process relaunches, so this normally never resolves.
      await invoke('updater_install')
    } catch (e) {
      setUpdater({ phase: 'error', message: String(e) })
    }
  }

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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <LinkChip icon={<ExternalLink className="h-3 w-3" />} label="Docs" href="https://github.com/sarv-projects/EveryAIOS#readme" />
          <LinkChip icon={<Github className="h-3 w-3" />} label="GitHub" href="https://github.com/sarv-projects/EveryAIOS" />
          <LinkChip icon={<ExternalLink className="h-3 w-3" />} label="Issues" href="https://github.com/sarv-projects/EveryAIOS/issues" />
        </div>
        {/* P8.8 auto-updater surface */}
        <div className="mt-3 border-t border-border/40 pt-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={updater.phase === 'checking' || updater.phase === 'installing'} onClick={checkForUpdates}>
              {updater.phase === 'checking'
                ? 'Checking…'
                : updater.phase === 'installing'
                  ? 'Installing…'
                  : 'Check for updates'}
            </Button>
            {updater.phase === 'up-to-date' && (
              <span className="text-xs text-muted-foreground">Up to date</span>
            )}
            {(updater.phase === 'idle' || updater.phase === 'error') && (
              <span className="text-[10px] text-muted-foreground">Signed with the release key; verified before install</span>
            )}
          </div>
          {updater.phase === 'available' && (
            <div className="mt-2 rounded-md border border-border bg-background/50 p-2 text-xs">
              <span className="font-mono text-orange-300">v{updater.version}</span> available
              {updater.notes && (
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{updater.notes}</p>
              )}
              <Button size="sm" className="mt-2" onClick={installUpdate}>
                Download &amp; relaunch
              </Button>
            </div>
          )}
          {updater.phase === 'error' && (
            <p className="mt-1 text-xs text-red-400">{updater.message}</p>
          )}
        </div>
        <div className="mt-4 border-t border-border/40 pt-3 text-[10px] text-muted-foreground">
          Licensed under the EveryAIOS Community License (ECL-1.0).
        </div>
      </div>
    </SectionShell>
  )
}

// === Sync (P8.9) ===
type SyncDevice = { deviceId: string; publicKey: string; fingerprint: string; items: number }
type ServeStatus = { serving: boolean; addr?: string; outcomes?: { peer_device: string; peer_fingerprint: string; applied: number; pushed: number; conflicts: number }[] }

export function SyncSection() {
  const notify = useAppStore((s) => s.notify)
  const [device, setDevice] = useState<SyncDevice | null>(null)
  const [serve, setServe] = useState<ServeStatus>({ serving: false })
  const [port, setPort] = useState('47615')
  const [target, setTarget] = useState('192.168.1.42:47615')
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [bundlePath, setBundlePath] = useState('~/everyaios-sync.bundle')

  async function refreshDevice() {
    if (!inTauri()) return
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ deviceId: string; publicKey: string; items: number }>('sync_public_key')
      const f = await invoke<{ fingerprint: string }>('sync_fingerprint', { publicKey: r.publicKey })
      setDevice({ deviceId: r.deviceId, publicKey: r.publicKey, fingerprint: f.fingerprint, items: r.items })
    } catch (e) {
      notify(String(e))
    }
  }
  async function refreshServe() {
    if (!inTauri()) return
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<ServeStatus & { ok: boolean }>('sync_serve_status')
      setServe({ serving: r.serving, addr: r.addr, outcomes: (r as unknown as { outcomes?: ServeStatus['outcomes'] }).outcomes })
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refreshDevice()
    refreshServe()
  }, [])
  useEffect(() => {
    if (!serve.serving) return
    const id = setInterval(refreshServe, 2500)
    return () => clearInterval(id)
  }, [serve.serving])

  async function handleStart() {
    if (!inTauri()) { notify('requires desktop shell'); return }
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      const p = port ? parseInt(port, 10) : 47615
      const r = await invoke<{ addr: string }>('sync_serve_start', { port: p })
      setLast(`serving on ${r.addr}`)
      await refreshServe()
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function handleStop() {
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      await invoke('sync_serve_stop')
      setLast('server stopped')
      setServe({ serving: false })
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function handlePeerSync() {
    if (!target.trim()) { notify('enter target ip:port'); return }
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ peerDevice: string; peerFingerprint: string; applied: number; pushed: number; conflicts: number; live: number }>('sync_peer_sync', { target: target.trim() })
      setLast(`peer ${r.peerDevice} (${r.peerFingerprint}) — applied ${r.applied}, pushed ${r.pushed}, conflicts ${r.conflicts}, live ${r.live}`)
      await refreshDevice()
      await refreshServe()
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function handleRotate() {
    if (!inTauri()) return
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      await invoke('sync_keypair_generate')
      await refreshDevice()
      setLast('keypair rotated — old bundles unreadable')
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function handleExportBundle() {
    if (!inTauri()) { notify('requires desktop shell'); return }
    if (!bundlePath.trim()) { notify('enter a bundle file path'); return }
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ path: string; items: number; live: number }>('sync_export_bundle', { path: bundlePath.trim() })
      setLast(`exported ${r.items} items (${r.live} live) → ${r.path}`)
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }
  async function handleImportBundle() {
    if (!inTauri()) { notify('requires desktop shell'); return }
    if (!bundlePath.trim()) { notify('enter a bundle file path'); return }
    setBusy(true)
    try {
      const { invoke } = await import('@/lib/tauri')
      const r = await invoke<{ applied: number; pushed: number; conflicts: number; live: number }>('sync_import_bundle', { path: bundlePath.trim() })
      setLast(`imported — applied ${r.applied}, push ${r.pushed}, conflicts ${r.conflicts}, live ${r.live}`)
      await refreshDevice()
    } catch (e) { notify(String(e)) } finally { setBusy(false) }
  }

  return (
    <SectionShell title="Sync" desc="E2E-encrypted mirror — bundle + live TCP (LAN / Tailscale, port 47615, explicit trigger)">
      <div className="space-y-3">
        <Row label="Device" desc={device ? `${device.deviceId} · ${device.items} items` : 'loading…'}>
          <span className="max-w-[260px] truncate font-mono text-[10px] text-muted-foreground" title={device?.publicKey}>{device?.fingerprint ?? '—'}</span>
        </Row>
        {device && (
          <div className="rounded-md border border-border/50 bg-background/30 p-2">
            <div className="font-mono text-[10px] leading-relaxed text-muted-foreground break-all">{device.publicKey}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">Fingerprint (SHA-256 first 16 hex) — compare out-of-band before trusting a peer. Raw X25519 is MITM-able on hostile LANs; Tailscale/WireGuard is the mitigation.</div>
          </div>
        )}
        <Row label="Live server" desc={serve.serving ? `serving on ${serve.addr}` : 'stopped — start to accept LAN/Tailscale peers'}>
          <div className="flex items-center gap-2">
            <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="47615" className="h-7 w-24 font-mono text-xs" />
            {!serve.serving ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handleStart}>Start</Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handleStop}>Stop</Button>
            )}
          </div>
        </Row>
        {serve.outcomes && serve.outcomes.length > 0 && (
          <div className="rounded-md border border-border/50 bg-background/30 p-2 text-xs">
            <div className="mb-1 font-medium">Recent peers ({serve.outcomes.length})</div>
            {serve.outcomes.slice(-5).map((o, i) => (
              <div key={i} className="font-mono text-[11px] text-muted-foreground">{o.peer_device} {o.peer_fingerprint} — +{o.applied} / push {o.pushed} / conflicts {o.conflicts}</div>
            ))}
          </div>
        )}
        <Row label="Sync with peer" desc="Direct TCP to ip:port — LAN or Tailscale 100.x.y.z (explicit trigger, no auto-sync)">
          <div className="flex items-center gap-2">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="192.168.1.42:47615" className="h-7 w-56 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handlePeerSync}>Sync</Button>
          </div>
        </Row>
        <Row label="Keypair" desc="Rotate re-keys the mirror (old bundles become unreadable)">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handleRotate}>Rotate</Button>
        </Row>
        <Row label="Bundle file" desc="Encrypted export/import over the file seam — USB, LAN share, backup (no network)">
          <div className="flex items-center gap-2">
            <Input value={bundlePath} onChange={(e) => setBundlePath(e.target.value)} placeholder="~/everyaios-sync.bundle" className="h-7 w-56 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handleExportBundle}>Export</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={handleImportBundle}>Import</Button>
          </div>
        </Row>
        {last && <p className="text-xs text-muted-foreground">{last}</p>}
        <p className="text-[10px] text-muted-foreground">Live transport is TCP-only, default 47615, no discovery. Bundles are E2E-encrypted with your device key — a rotated keypair makes old bundles unreadable.</p>
      </div>
    </SectionShell>
  )
}


// === Doctor (P46.2 — H35 support primitive) ===
export function DoctorSection() {
  const [report, setReport] = useState<import('@/lib/doctor').DoctorReport | null>(null)
  const [loading, setLoading] = useState(false)

  async function run() {
    setLoading(true)
    try {
      const { doctorReport } = await import('@/lib/doctor')
      setReport(await doctorReport())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void run()
  }, [])

  const glyph = (s: string) => (s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✕')
  const tone = (s: string) =>
    s === 'ok' ? 'text-emerald-400' : s === 'warn' ? 'text-amber-400' : 'text-red-400'

  return (
    <SectionShell title="Doctor" desc="Per-subsystem readiness — a broken component is diagnosed, not a support ticket (everyaios doctor)">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading} onClick={run}>
            {loading ? 'Checking…' : 'Re-run checks'}
          </Button>
          {report && (
            <span className={`text-xs font-medium ${tone(report.overall)}`}>
              {glyph(report.overall)}{' '}
              {report.overall === 'ok'
                ? 'All subsystems ready'
                : report.overall === 'warn'
                  ? 'Ready with warnings'
                  : 'A required subsystem is broken'}
            </span>
          )}
          {report && (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{report.version}</span>
          )}
        </div>
        <ul className="divide-y divide-border/40 rounded-md border border-border/50 bg-background/30">
          {(report?.checks ?? []).map((c) => (
            <li key={c.name} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`w-4 shrink-0 text-center font-mono text-sm ${tone(c.status)}`}>
                  {glyph(c.status)}
                </span>
                <span className="w-32 shrink-0 text-xs font-medium text-foreground">{c.name}</span>
                <span className="flex-1 text-[11px] text-muted-foreground">{c.detail}</span>
              </div>
              {c.hint && (
                <div className="ml-6 mt-0.5 text-[10px] text-amber-300/80">↳ {c.hint}</div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground">
          Also available on the terminal: <code className="font-mono">everyaios doctor</code> (add{' '}
          <code className="font-mono">--json</code> for machine output). Credentials are reported as a
          count only — never a value.
        </p>
      </div>
    </SectionShell>
  )
}
