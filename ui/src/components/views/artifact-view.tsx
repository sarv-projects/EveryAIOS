'use client'

// P15-H29 — the artifact preview surface (bolt.diy Preview.tsx pattern).
//
// A live viewport for local dashboard artifacts: device frames (iPhone SE →
// large laptop), a port dropdown for multiple running servers, and a
// screenshot selector slot (AG-UI screenshot events land here). Outside the
// webview the view renders a demo artifact server so the surface is
// explorable; real servers arrive via `artifact_serve`.

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MonitorSmartphone, RotateCcw, ExternalLink } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import {
  demoActionChecklist,
  startArtifactServer,
  stopArtifactServer,
} from '@/lib/artifact'
import { cn } from '@/lib/utils'

interface DevicePreset {
  id: string
  label: string
  width: number
  height: number
}

/** bolt.diy's device ladder: iPhone SE → large laptop. */
const DEVICES: DevicePreset[] = [
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-15', label: 'iPhone 15', width: 393, height: 852 },
  { id: 'ipad', label: 'iPad', width: 768, height: 1024 },
  { id: 'laptop', label: 'MacBook', width: 1440, height: 900 },
]

const DEMO_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>q3-dashboard (demo)</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f7f7f4; color: #1c1c1a; }
  header { padding: 12px 16px; border-bottom: 1px solid #e5e3dc; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: #f54e00; }
  h1 { font-size: 14px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px 16px; }
  .card { border: 1px solid #e5e2d9; border-radius: 10px; padding: 10px 12px; background: #fff; }
  .k { font-size: 10px; color: #8a877d; text-transform: uppercase; letter-spacing: 0.06em; }
  .v { font-size: 20px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .bar { height: 6px; border-radius: 999px; background: #f54e00; margin-top: 8px; }
</style></head>
<body>
  <header><span class="dot"></span><h1>Q3 revenue · live preview</h1></header>
  <div class="grid">
    <div class="card"><div class="k">Revenue</div><div class="v">$1.8M</div><div class="bar" style="width:72%"></div></div>
    <div class="card"><div class="k">Users</div><div class="v">71K</div><div class="bar" style="width:58%"></div></div>
    <div class="card"><div class="k">CAC</div><div class="v">$24.10</div><div class="bar" style="width:34%"></div></div>
  </div>
</body>
</html>`

export default function ArtifactView() {
  const artifactServer = useAppStore((s) => s.artifactServer)
  const artifactActions = useAppStore((s) => s.artifactActions)
  const patchArtifactServer = useAppStore((s) => s.patchArtifactServer)
  const setArtifactActions = useAppStore((s) => s.setArtifactActions)
  const notify = useAppStore((s) => s.notify)

  const [device, setDevice] = useState<DevicePreset>(DEVICES[3]!)
  const [screenshots] = useState<string[]>([])
  const [shotIndex, setShotIndex] = useState(-1)
  const [serving, setServing] = useState(false)

  const frame = useMemo(() => {
    if (shotIndex >= 0 && screenshots[shotIndex]) {
      return (
        <img
          src={screenshots[shotIndex]}
          alt="artifact screenshot"
          className="h-full w-full object-contain"
        />
      )
    }
    if (artifactServer?.status !== 'serving') {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#141412] text-muted-foreground">
          <MonitorSmartphone className="h-6 w-6 opacity-50" />
          <span className="text-[11px]">No artifact server running</span>
          <span className="max-w-60 text-center font-mono text-[9px] opacity-60">
            an agent-built dashboard appears here once it serves on 127.0.0.1
          </span>
        </div>
      )
    }
    // Demo servers render the bundled demo page inline; real servers are
    // fetched from the loopback port (server-served content, sandboxed).
    return (
      <iframe
        title="artifact preview"
        srcDoc={artifactServer.demo ? DEMO_HTML : undefined}
        src={artifactServer.demo ? undefined : artifactServer.url}
        sandbox="allow-scripts"
        className="h-full w-full border-0 bg-white"
      />
    )
  }, [artifactServer, screenshots, shotIndex])

  // Demo bootstrap: seed the store so the surface is live in preview mode.
  useEffect(() => {
    if (!artifactServer && !serving) {
      setServing(true)
      void startArtifactServer('preview-demo').then((server) => {
        patchArtifactServer(server)
        setArtifactActions(demoActionChecklist())
      })
    }
  }, [artifactServer, serving, patchArtifactServer, setArtifactActions])

  const stop = async () => {
    if (artifactServer) await stopArtifactServer(artifactServer.port)
    patchArtifactServer(null)
    setArtifactActions([])
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Toolbar: device frames · port dropdown · screenshot selector · stop */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MonitorSmartphone className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-xs font-medium text-foreground">Artifact preview</span>
        {artifactServer?.status === 'serving' && (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/40 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"
          >
            <span className="live-dot size-1 rounded-full bg-emerald-400" />
            {artifactServer.url}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Port dropdown (bolt.diy PortDropdown): one entry per server. */}
          <select
            value={artifactServer?.port ?? ''}
            onChange={(e) => {
              const port = Number(e.target.value)
              if (port && artifactServer) {
                patchArtifactServer({ ...artifactServer, port, url: `http://127.0.0.1:${port}/` })
              }
            }}
            className="h-7 rounded-md border border-border bg-background px-2 font-mono text-[10px] text-foreground"
            aria-label="preview port"
          >
            <option value="" disabled>
              port
            </option>
            {(artifactServer?.status === 'serving' ? [artifactServer] : []).map((s) => (
              <option key={s.port} value={s.port}>
                :{s.port}
              </option>
            ))}
          </select>

          {/* Device frames */}
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                title={d.label}
                onClick={() => setDevice(d)}
                className={cn(
                  'rounded px-1.5 py-1 text-[9px] text-muted-foreground transition-colors',
                  device.id === d.id && 'bg-orange-500/15 text-orange-300'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Screenshot selector */}
          {screenshots.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-muted-foreground"
              onClick={() => setShotIndex((shotIndex + 1) % screenshots.length)}
              title={`screenshot ${shotIndex + 1}/${screenshots.length}`}
            >
              {shotIndex >= 0 ? 'shot view' : 'screenshots'}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[10px]"
            onClick={() => notify('Preview opened in browser')}
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[10px] text-rose-300"
            onClick={() => void stop()}
          >
            <RotateCcw className="h-3 w-3" />
            Stop
          </Button>
        </div>
      </div>

      {/* Checkpoint summary (the runner's checklist, rendered inline) */}
      {artifactActions.length > 0 && (
        <div className="flex items-center gap-3 border-b border-border/60 bg-background/40 px-3 py-1.5">
          <MonitorSmartphone className="h-3 w-3 text-muted-foreground" />
          {artifactActions.map((a) => (
            <span key={a.index} className="flex items-center gap-1 font-mono text-[9px]">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  a.state === 'complete' && 'bg-emerald-400',
                  a.state === 'running' && 'animate-pulse bg-orange-400',
                  a.state === 'failed' && 'bg-rose-400',
                  (a.state === 'pending' || a.state === 'aborted') && 'bg-muted-foreground/40'
                )}
              />
              <span className="text-muted-foreground">{a.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* Device-framed viewport (bolt.diy: iPhone SE → large laptop) */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#141412] p-4">
        <div
          className="overflow-hidden rounded-lg border border-border/60 bg-white shadow-2xl transition-all duration-300"
          style={{ width: device.width * 0.55, height: device.height * 0.55 }}
        >
          {frame}
        </div>
      </div>
    </div>
  )
}