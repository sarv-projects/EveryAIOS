'use client'

/**
 * P50.4.8 — Capability availability matrix (settings readout).
 *
 * The mapping itself (`capabilityFor(id, ctx)`) has been live since
 * 2026-08-31; this panel is the remaining UI: a settings readout of every
 * advertised capability with its truthful `live | partial | unavailable |
 * v1-planned | post-v1` status and the reason, all derived from LIVE runtime
 * facts (never a static claim). Rows are intentionally non-interactive —
 * the matrix explains why a control is disabled; it does not pretend to
 * enable it.
 */

import { useEffect, useState } from 'react'
import { Info, ShieldQuestion } from 'lucide-react'
import {
  capabilityMatrix,
  type CapabilityStatus,
} from '@/lib/capability-status'
import { useRuntimeState } from '@/lib/runtime'
import { useAppStore } from '@/lib/store'
import { inTauri, invoke } from '@/lib/tauri'
import { registryList } from '@/lib/models-download'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<CapabilityStatus, { label: string; cls: string; dot: string }> = {
  live: { label: 'Live', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  partial: { label: 'Partial', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  unavailable: { label: 'Unavailable', cls: 'border-red-500/30 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
  'v1-planned': { label: 'V1 planned', cls: 'border-sky-500/30 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  'post-v1': { label: 'Post-v1', cls: 'border-border/60 bg-muted/40 text-muted-foreground', dot: 'bg-muted-foreground/60' },
}

export default function CapabilityMatrixPanel() {
  const runtime = useRuntimeState()
  const browserAttached = useAppStore((s) => s.browserAttached)
  const localRuntime = useAppStore((s) => s.localRuntime)
  const providerKeysConfigured = useAppStore((s) => s.providerKeysConfigured)
  const [anyConnectorConnected, setAnyConnectorConnected] = useState(false)
  const [anyLocalModel, setAnyLocalModel] = useState(false)
  const [fault, setFault] = useState<string | null>(null)

  // Live one-shot probes: attached OAuth connectors + downloaded local models
  // (the store only tracks the picked local runtime; a downloaded-but-unpicked
  // model is still a configured capability).
  useEffect(() => {
    if (!inTauri()) return
    let alive = true
    void (async () => {
      try {
        const accounts = await invoke<{ accounts?: unknown[] }>('oauth_accounts')
        if (alive) setAnyConnectorConnected((accounts?.accounts?.length ?? 0) > 0)
      } catch {
        /* not attached — stays false */
      }
      try {
        const reg = await registryList()
        if (alive) setAnyLocalModel(reg.models.length > 0)
      } catch (e) {
        if (alive) setFault(e instanceof Error ? e.message : 'registry probe failed')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const status = runtime.status
  const sidecarLive = status === 'live' || status === 'degraded'
  const vaultUnlocked =
    status !== 'preview' &&
    status !== 'booting' &&
    status !== 'vault-setup' &&
    status !== 'vault-locked'

  const rows = capabilityMatrix({
    inTauri: inTauri(),
    sidecarLive,
    vaultUnlocked,
    browserAttached,
    desktopAttached: false,
    providerRoutesAvailable: providerKeysConfigured === true,
    anyConnectorConnected,
    anyLocalModelConfigured: anyLocalModel || localRuntime !== undefined,
  })

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-[11px] text-muted-foreground">
        Every advertised capability maps to exactly one status from live runtime facts — never a
        static claim. A row marked <span className="text-amber-300">Partial</span> needs setup
        (a key, an attach, a download);{' '}
        <span className="text-sky-300">V1 planned</span> is a confirmed v1 deliverable whose stack
        is not wired yet; <span className="text-muted-foreground">Post-v1</span> is deliberately
        scoped out of v1 (spec §8 / capabilities.yaml).
      </div>
      {fault && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-[11px] text-red-300">
          {fault}
        </div>
      )}
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const style = STATUS_STYLE[row.status]
          return (
            <li
              key={row.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-background/30 px-3 py-2"
              title={row.reason}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <span className="font-mono text-[9px] text-muted-foreground">{row.id}</span>
                </div>
                <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {row.reason}
                </div>
              </div>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[9px]',
                  style.cls,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                {style.label}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex items-start gap-1.5 rounded border border-dashed border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
        {runtime.status === 'preview' ? (
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
        ) : (
          <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        <span>
          {runtime.status === 'preview'
            ? 'Plain-browser preview — statuses above reflect the preview context, not the packaged shell.'
            : `Live facts at ${new Date(runtime.updatedAt).toLocaleTimeString()} — runtime: ${runtime.status}${runtime.detail ? ` (${runtime.detail})` : ''}.`}
        </span>
      </div>
    </div>
  )
}