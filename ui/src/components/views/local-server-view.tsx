'use client'

import { useState } from 'react'
import {
  Copy,
  Play,
  Power,
  ServerCog,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * P8.5 — local OpenAI-compatible server UI (H13): expose the engine on
 * localhost as an OpenAI-compatible API and manage it from the workspace.
 */
export default function LocalServerView() {
  const [running, setRunning] = useState(false)
  const [port, setPort] = useState('8081')
  const [copied, setCopied] = useState(false)

  const baseUrl = `http://localhost:${port}/v1`
  const modelsUrl = `${baseUrl}/models`
  const chatUrl = `${baseUrl}/chat/completions`

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fade-up flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ServerCog className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">
            Local OpenAI Server
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'text-[9px]',
              running
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-slate-500/30 text-slate-400',
            )}
          >
            {running ? '● running' : '○ stopped'}
          </Badge>
        </div>
        <Button
          size="sm"
          variant={running ? 'destructive' : 'default'}
          className="h-8"
          onClick={() => setRunning((r) => !r)}
        >
          {running ? (
            <>
              <Power className="mr-1 h-3.5 w-3.5" /> Stop
            </>
            ) : (
            <>
              <Play className="mr-1 h-3.5 w-3.5" /> Start
            </>
          )}
        </Button>
      </header>

      {/* Port config */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400">Port</label>
        <Input
          value={port}
          onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
          className="h-8 w-24 font-mono text-xs"
          disabled={running}
        />
      </div>

      {/* Endpoints */}
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Endpoints
        </div>
        {[
          { label: 'Base URL', url: baseUrl },
          { label: 'Models', url: modelsUrl },
          { label: 'Chat', url: chatUrl },
        ].map((ep) => (
          <div key={ep.label} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-slate-400">{ep.label}</span>
            <code className="flex-1 truncate rounded bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-orange-300">
              {ep.url}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={() => copy(ep.url)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {copied && (
          <div className="text-[10px] text-emerald-400">Copied to clipboard</div>
        )}
      </div>

      {/* VS Code / Cursor integration hint */}
      <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-xs text-slate-300">
        <div className="flex items-center gap-1.5">
          <ToggleRight className="h-3.5 w-3.5 text-orange-400" />
          <span className="font-medium">VS Code / Cursor integration</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Point any OpenAI-compatible client at the base URL above. The server
          exposes the engine's models (BYOK + local) over localhost — no
          external relay. Credentials stay in the vault; the server proxies
          through the same guard-gated tool executor.
        </p>
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-500">
          <ToggleLeft className="h-3 w-3" />
          <span>status: {running ? 'live (preview data)' : 'preview — start the server to expose'}</span>
        </div>
      </div>
    </div>
  )
}
