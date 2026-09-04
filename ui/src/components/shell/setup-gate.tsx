'use client'

/**
 * P50.4.1/4.9 — First-run provider setup gate.
 *
 * Completes the casual-user path: no provider configured → choose a path
 * (BYOK cloud key or local model) → validate/apply → first real response.
 * No generic "agent error": if the user tries to chat without a model this
 * gate opens instead (via `sendUserMessage`'s guard and the chat empty
 * state). Privacy/network destinations are stated explicitly (P50.4.9):
 * keys live in the local SQLCipher vault; chat traffic goes only to the
 * chosen provider's API; model downloads come from huggingface.co; local
 * inference never leaves the machine.
 */

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { inTauri, invoke } from '@/lib/tauri'
import { listLocalModels, type LocalModelRow } from '@/lib/local-models'
import { cn } from '@/lib/utils'

const CLOUD_PROVIDERS = [
  'openai',
  'anthropic',
  'deepseek',
  'groq',
  'nvidia',
  'openrouter',
  'google',
]

export function SetupGate() {
  const setupOpen = useAppStore((s) => s.setupOpen)
  const closeSetup = useAppStore((s) => s.closeSetup)
  const setProviderKeysConfigured = useAppStore((s) => s.setProviderKeysConfigured)
  const setLocalRuntime = useAppStore((s) => s.setLocalRuntime)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const setSettingsSection = useAppStore((s) => s.setSettingsSection)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const notify = useAppStore((s) => s.notify)

  const [mode, setMode] = useState<'choose' | 'cloud' | 'local'>('choose')
  const [provider, setProvider] = useState('openai')
  const [keyId, setKeyId] = useState('default')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [runtimes, setRuntimes] = useState<LocalModelRow[]>([])
  const [connecting, setConnecting] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)

  // Probe installed local runtimes (Ollama/llamafile) whenever the gate opens.
  // A failed probe is surfaced, never silently rendered as "no Ollama".
  useEffect(() => {
    if (!setupOpen) return
    setMode('choose')
    setError(null)
    setProbeError(null)
    setDone(false)
    void listLocalModels()
      .then((r) => {
        setRuntimes(r.models ?? [])
        setProbeError(null)
      })
      .catch((e) => {
        setRuntimes([])
        setProbeError(
          e instanceof Error
            ? `Local runtime probe failed: ${e.message}`
            : 'Local runtime probe failed — the local-model service did not respond',
        )
      })
  }, [setupOpen])

  const saveKey = async () => {
    if (!secret.trim()) {
      setError('Paste your API key first — it never leaves this device except to the provider you choose.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The key is written into the SQLCipher vault (opaque handle only in
      // the UI); the routing feed picks the provider up from the vault key
      // set (P50.3.6 credential gate).
      await invoke('vault_key_add', { provider, keyId, value: secret })
      setProviderKeysConfigured(true)
      setSecret('')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The vault rejected the key')
    } finally {
      setBusy(false)
    }
  }

  const connectOllama = async () => {
    setConnecting(true)
    setError(null)
    try {
      const { invoke: inv } = await import('@/lib/tauri')
      await inv('local_ensure', { runtime: 'ollama', model: null })
      const r = await listLocalModels()
      setRuntimes(r.models ?? [])
      notify('Ollama is connected — pick a model below to start.')
      setMode('local')
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — install Ollama or download a model from Hugging Face instead.`
          : 'Ollama could not be started',
      )
    } finally {
      setConnecting(false)
    }
  }

  const useLocal = (row: LocalModelRow) => {
    setLocalRuntime(row.runtime, row.contextWindow)
    setDone(true)
  }

  const startChatting = () => {
    closeSetup()
    setCenterScreen('chat')
    setComposerValue('')
    if (done) notify('Provider configured — say hello to your first model.')
  }

  const startWithLocalSetup = () => {
    closeSetup()
    setSettingsSection('local')
    setCenterScreen('settings')
  }

  if (!setupOpen) return null

  return (
    <Dialog open onOpenChange={() => closeSetup()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex flex-col gap-3 p-6">
          {done ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h2 className="text-sm font-semibold">You&apos;re set up</h2>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your model is configured. The next message goes to a real provider through the
                Guard-2 ticket path — no demo, no seeded reply.
              </p>
              <Button className="mt-2 h-8 w-full bg-orange-500 text-xs text-black hover:bg-orange-400" onClick={startChatting}>
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                Start chatting
              </Button>
            </>
          ) : mode === 'choose' ? (
            <>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-orange-400" />
                <h2 className="text-sm font-semibold">Set up your first model</h2>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Everything runs locally or through a provider you own. There is no EveryAIOS
                server — you stay in control of where your data goes.
              </p>
              <div className="mt-1 space-y-2">
                <button
                  type="button"
                  onClick={() => setMode('cloud')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left text-xs transition-colors hover:border-orange-500/40 hover:bg-accent"
                >
                  <span className="flex items-center justify-between">
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <KeyRound className="h-3.5 w-3.5 text-orange-300" />
                        Cloud provider (bring your own key)
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        OpenAI · Anthropic · DeepSeek · NVIDIA … — key stored encrypted in the local
                        vault; chat traffic goes only to that provider&apos;s API.
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('local')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left text-xs transition-colors hover:border-orange-500/40 hover:bg-accent"
                >
                  <span className="flex items-center justify-between">
                    <span>
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <Cpu className="h-3.5 w-3.5 text-orange-300" />
                        Local model (fully offline)
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        Download from Hugging Face or connect Ollama — inference never leaves this
                        machine.
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </span>
                </button>
              </div>
              <div className="mt-3 flex items-start gap-1.5 rounded border border-dashed border-border/60 px-2 py-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                <span>
                  No demo data, no founder server. Until a provider is configured, sending a chat
                  message opens this screen instead of failing with a generic agent error.
                </span>
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => closeSetup()}>
                  Explore first
                </Button>
              </div>
            </>
          ) : mode === 'cloud' ? (
            <>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-orange-400" />
                <h2 className="text-sm font-semibold">Add a provider key</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLOUD_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={cn(
                      'rounded border px-2 py-1 font-mono text-[10px]',
                      provider === p
                        ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                        : 'border-border/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px]"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="key id (default)"
              />
              <input
                type="password"
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px]"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="sk-…"
                autoFocus
              />
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                The key is encrypted at rest in the SQLCipher vault and only ever sent to{' '}
                <span className="font-mono text-foreground/80">api.{provider}.com</span>-class
                endpoints you configure. It never reaches the coordinator as plaintext.
              </p>
              <div className="mt-1 flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => setMode('choose')}>
                  Back
                </Button>
                <Button
                  className="h-8 bg-orange-500 text-xs text-black hover:bg-orange-400"
                  disabled={busy}
                  onClick={() => void saveKey()}
                >
                  {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                  Save key
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-orange-400" />
                <h2 className="text-sm font-semibold">Local model</h2>
              </div>
              {runtimes.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    Detected runtimes on this machine — pick one:
                  </p>
                  {runtimes.map((row) => (
                    <button
                      key={`${row.runtime}:${row.name}`}
                      type="button"
                      onClick={() => useLocal(row)}
                      className="w-full rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left text-xs hover:border-orange-500/40"
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{row.name}</span>
                        <span
                          className={cn(
                            'rounded px-1 font-mono text-[9px]',
                            row.fits ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
                          )}
                        >
                          {row.fits ? 'fits' : 'too big'}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {row.runtime} · {row.sizeBytes ? `${(row.sizeBytes / 1e9).toFixed(1)} GB` : '—'} · ctx{' '}
                        {row.contextWindow.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {probeError
                    ? 'Ollama/llamafile not reachable right now.'
                    : 'No Ollama/llamafile runtimes detected yet.'}
                </p>
              )}
              {probeError && <p className="text-[11px] text-amber-300">{probeError}</p>}
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              <div className="space-y-1.5">
                <Button
                  className="h-8 w-full bg-orange-500 text-xs text-black hover:bg-orange-400"
                  disabled={connecting}
                  onClick={() => void connectOllama()}
                >
                  {connecting ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Plug className="mr-1 h-3 w-3" />
                  )}
                  Connect Ollama (start `ollama serve`)
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-full text-xs"
                  onClick={startWithLocalSetup}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Download a model from Hugging Face
                </Button>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Downloads come from <span className="font-mono">huggingface.co</span> (the only
                  network destination) and are verified by sha256 before being registered. Running
                  the model happens entirely on this machine.
                </p>
              </div>
              <div className="mt-1 flex justify-start">
                <Button variant="ghost" size="sm" onClick={() => setMode('choose')}>
                  Back
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}