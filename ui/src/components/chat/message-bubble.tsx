'use client'

import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Download,
  GitFork,
  Pencil,
  Quote,
  RotateCw,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { ChatError, ChatMessage } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import ArtifactCard from './artifact-card'
import { staggerStyle } from '@/lib/stagger'
import McqInterruptCard from './mcq-interrupt-card'
import ProgressSteps from './progress-steps'
import ToolChips from './tool-chip'

function CodeBlock({ children, className, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) {
  const [copied, setCopied] = useState(false)
  // Detect block code (inside <pre>) vs inline code by checking className or children type
  const isBlock = String(children).includes('\n') || (className && className.includes('language-'))

  if (!isBlock) {
    return (
      <code
        className={cn(
          'rounded bg-zinc-800/70 px-1 py-0.5 font-mono text-[11px] text-orange-300',
          className
        )}
        {...props}
      >
        {children}
      </code>
    )
  }

  const codeContent = String(children).replace(/\n$/, '')

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-md border border-border bg-zinc-950">
      <div className="flex items-center justify-between border-b border-border/40 bg-zinc-900/60 px-2 py-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          {(className?.replace('language-', '') || 'code')}
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(codeContent)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-2.5 w-2.5 text-emerald-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-2.5 w-2.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-2 font-mono text-[11px] scroll-thin">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  )
}

const mdComponents = {
  code: CodeBlock,
  pre: ({ children }: React.ComponentProps<'pre'>) => <>{children}</>,
  strong: ({ children, ...props }: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.ComponentProps<'em'>) => (
    <em className="italic text-muted-foreground" {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
    <ul className="my-1 list-disc space-y-0.5 pl-5" {...props}>
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.ComponentProps<'li'>) => (
    <li className="text-[12px] leading-relaxed text-foreground/90" {...props}>
      {children}
    </li>
  ),
  p: ({ children, ...props }: React.ComponentProps<'p'>) => (
    <p className="text-[12px] leading-relaxed text-foreground/90 [&:not(:first-child)]:mt-2" {...props}>
      {children}
    </p>
  ),
  a: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a
      className="text-orange-300 underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
}

/** Live clock for in-flight work (reasoning/turn/tool). Ticks at ~4 Hz while
 * `active` and renders the settled duration once `end` is set. */
function useLiveElapsed(start?: number, end?: number, active?: boolean): string {
  const [, force] = useState(0)
  const startMs = start ?? 0
  const endMs = end ?? 0
  useEffect(() => {
    if (!active || !startMs || endMs) return
    const t = setInterval(() => force((v) => v + 1), 250)
    return () => clearInterval(t)
  }, [active, startMs, endMs])
  const base = endMs && endMs >= startMs ? endMs : startMs ? Date.now() : 0
  const totalMs = base > 0 && base >= startMs ? base - startMs : 0
  if (totalMs < 1000) return totalMs > 0 ? '<1s' : ''
  const s = Math.floor(totalMs / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function Reasoning({
  items,
  startedAt,
  endedAt,
}: {
  items: string[]
  startedAt?: number
  endedAt?: number
}) {
  const [open, setOpen] = useState(false)
  const live = !endedAt
  // Auto-open while the model is actively thinking; the user can still
  // collapse it (the open state is theirs once toggled).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      if (live) setOpen(true)
    }
  }, [live])
  const elapsed = useLiveElapsed(startedAt, endedAt, live)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Brain
            className={cn('h-3 w-3 text-violet-300', live && 'animate-pulse')}
          />
          {live ? 'Thinking' : 'Reasoning'}
          {elapsed && (
            <span className="font-mono text-[9px] text-muted-foreground/50">
              {elapsed}
            </span>
          )}
          {live && <span className="h-1 w-1 animate-pulse rounded-full bg-violet-300" />}
          <ChevronRight
            className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2">
        {items.map((r, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="h-px w-3 shrink-0 bg-violet-300/40" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-violet-300/60">
                Thought {i + 1}
              </span>
              {live && i === items.length - 1 && (
                <span className="h-1 w-1 animate-pulse rounded-full bg-violet-300" />
              )}
            </div>
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
              {r.trim()}
            </p>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function TimeStamp({ ts }: { ts: string }) {
  let label = ''
  try {
    const d = new Date(ts)
    label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    label = ts
  }
  return <span className="font-mono text-[9px] text-muted-foreground/80">{label}</span>
}

/** P52.21 — one message rendered as Markdown (per-message export shares this). */
export function messageMarkdown(m: ChatMessage): string {
  const role =
    m.role === 'user' ? '## You' : m.role === 'assistant' ? '## Assistant' : '## System'
  const lines = [role, '', m.content]
  if (m.error) lines.push('', `> ⛔ ${m.error.layer} error: ${m.error.detail}`)
  for (const t of m.toolCalls ?? []) {
    lines.push('', `- tool \`${t.toolId}\` — ${t.status}${t.error ? `: ${t.error}` : ''}`)
  }
  if (m.artifacts && m.artifacts.length > 0) {
    lines.push('', `- artifacts: ${m.artifacts.map((a) => a.name).join(', ')}`)
  }
  return lines.join('\n')
}

/** Shared action icon-button classes for the union bar. */
const baseBtn =
  'h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/70 transition-all hover:bg-accent hover:text-foreground opacity-0 group-hover/msg:opacity-100 focus:opacity-100'

/** P51.21/P52.22 — shared same-history retry: truncate below `messageId` and
 * re-ask the exact user prompt that produced it (reads in place, never
 * appends a duplicate ask). False when no user turn precedes the message. */
async function regenerateTurn(messageId: string): Promise<boolean> {
  const st = useAppStore.getState()
  const sess = st.sessions.find((s) => s.messages.some((m) => m.id === messageId))
  if (!sess) return false
  const { sendUserMessage } = await import('@/lib/bridge')
  const prompt = st.rewindBeforeAssistant(sess.id, messageId)
  if (prompt) {
    await sendUserMessage(prompt, undefined, { bypassQueue: true })
    return true
  }
  const priorUser = [...sess.messages]
    .slice(0, sess.messages.findIndex((m) => m.id === messageId))
    .reverse()
    .find((m) => m.role === 'user')
  if (!priorUser) return false
  await sendUserMessage(priorUser.content)
  return true
}

const ERROR_LAYER_LABEL: Record<ChatError['layer'], string> = {
  provider: 'Provider',
  guard: 'Guard',
  tool: 'Tool',
  agent: 'Agent',
  budget: 'Budget',
  runtime: 'Runtime',
}

/** P51.7/P51.21 — layer-named error card for a failed assistant turn. The
 * partial answer stays above; the card says which layer failed, why, and
 * offers the matched actions (Retry when the failure is retryable, Copy). */
function TurnErrorCard({ message }: { message: ChatMessage }) {
  const notify = useAppStore((s) => s.notify)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const err = message.error
  if (!err) return null
  const copy = () => {
    navigator.clipboard?.writeText(err.detail)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const retry = () => {
    void (async () => {
      setBusy(true)
      try {
        const ok = await regenerateTurn(message.id)
        if (!ok) notify('Nothing to retry — no user turn before this message', 'error')
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Retry failed', 'error')
      } finally {
        setBusy(false)
      }
    })()
  }
  return (
    <div className="mt-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3 w-3 shrink-0 text-rose-400" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-rose-300">
          {ERROR_LAYER_LABEL[err.layer]} error
        </span>
        {err.code && (
          <span className="rounded bg-rose-500/15 px-1 font-mono text-[9px] text-rose-300/80">
            {err.code}
          </span>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-rose-100/80">
        {err.detail}
      </p>
      <div className="mt-1.5 flex items-center gap-1">
        {err.retryable && (
          <button
            onClick={retry}
            disabled={busy}
            className="inline-flex h-5 items-center gap-1 rounded bg-rose-500/20 px-1.5 text-[10px] text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
          >
            <RotateCw className={cn('h-2.5 w-2.5', busy && 'animate-spin')} />
            Retry
          </button>
        )}
        <button
          onClick={copy}
          className="inline-flex h-5 items-center gap-1 rounded bg-rose-500/10 px-1.5 text-[10px] text-rose-200/90 transition-colors hover:bg-rose-500/20"
        >
          {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
          {copied ? 'Copied' : 'Copy error'}
        </button>
      </div>
    </div>
  )
}

/** P52.24/P52.22 — assistant-message action bar: copy · quote-to-composer ·
 * same-history regenerate · fork · export-as-Markdown. Speak stays honest:
 * voice output is a staged v1 surface (see the mic control) — the button
 * explains, never pretends to read aloud. */
function AssistantActions({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const notify = useAppStore((s) => s.notify)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const forkFromMessage = useAppStore((s) => s.forkFromMessage)

  const copy = () => {
    navigator.clipboard?.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const quote = () => {
    setComposerValue(`> ${message.content.replace(/\n+/g, '\n> ').slice(0, 400)}\n\n`)
    notify('Quoted — keep typing or press Enter to send')
  }
  const exportMd = () => {
    const blob = new Blob([messageMarkdown(message)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `message-${message.id.slice(-8)}.md`
    a.click()
    URL.revokeObjectURL(url)
    notify('Message exported as Markdown')
  }

  // P52.22 — same-history regenerate: drop this answer (and anything below)
  // and re-ask the exact user prompt that produced it, so the corrected run
  // reads in place. Falls back to a plain re-ask if the seam is unavailable.
  const regenerate = () => {
    void (async () => {
      setRegenerating(true)
      try {
        const ok = await regenerateTurn(message.id)
        if (!ok) notify('Nothing to regenerate — no user turn before this message', 'error')
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Regenerate failed', 'error')
      } finally {
        setRegenerating(false)
      }
    })()
  }

  return (
    <div className="flex items-center gap-0.5 px-1">
      <button className={baseBtn} onClick={copy} title="Copy message">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
      <button className={baseBtn} onClick={quote} title="Quote into composer">
        <Quote className="h-3 w-3" />
      </button>
      <button className={baseBtn} onClick={regenerate} title="Regenerate — drop this answer and re-ask its prompt">
        <RotateCw className={cn('h-3 w-3', regenerating && 'animate-spin')} />
      </button>
      <button
        className={baseBtn}
        onClick={() => forkFromMessage(message.id)}
        title="Fork conversation from here"
      >
        <GitFork className="h-3 w-3" />
      </button>
      <button className={baseBtn} onClick={exportMd} title="Export this message as Markdown">
        <Download className="h-3 w-3" />
      </button>
      {/* Voice output is v1-staged (H28) — the button is honest about it. */}
      <button
        className={cn(baseBtn, 'cursor-not-allowed opacity-30 hover:bg-transparent hover:text-muted-foreground/70')}
        title="Read aloud is a v1 deliverable — the voice stack is not wired in this build"
        aria-disabled
        tabIndex={-1}
      >
        <Volume2 className="h-3 w-3" />
      </button>
    </div>
  )
}

/** P52.22 — inline correction of a user message. Editing rewinds the
 * transcript to just before that ask (truncate-below, no rewrite of what
 * came above) and hands the corrected text to the composer as a fresh real
 * turn — so the fix is visible, never a silent history edit. */
function UserEditInline({
  sessionId,
  message,
  onDone,
}: {
  sessionId: string
  message: ChatMessage
  onDone: () => void
}) {
  const notify = useAppStore((s) => s.notify)
  const [draft, setDraft] = useState(message.content)
  const save = () => {
    const st = useAppStore.getState()
    const text = draft.trim()
    if (!text) {
      notify('Message cannot be empty', 'error')
      return
    }
    // Truncate below this ask and re-dispatch the corrected text.
    if (st.rewindToUserMessage(sessionId, message.id) === null) {
      notify('Could not edit — this message is not the last turn', 'error')
      return
    }
    void (async () => {
      try {
        const { sendUserMessage } = await import('@/lib/bridge')
        await sendUserMessage(text, undefined, { bypassQueue: true })
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Re-ask failed', 'error')
      }
    })()
    onDone()
  }
  return (
    <div className="w-full">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') {
            e.stopPropagation()
            onDone()
          }
        }}
        className="max-h-48 w-full resize-y rounded-md border border-border bg-background/60 px-2 py-1.5 text-[12px] leading-relaxed text-foreground focus:border-orange-500/50 focus:outline-none"
        rows={Math.min(6, Math.max(2, message.content.split('\n').length))}
      />
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={save}
          className="rounded bg-orange-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-orange-600"
        >
          Edit & re-ask
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          ⌘⏎ send · esc cancel
        </span>
      </div>
    </div>
  )
}


interface Props {
  message: ChatMessage
  /** When true, append a blinking orange caret to the streamed text */
  streaming?: boolean
}

// P45.9 — memoized: store updates are immutable (untouched messages keep
// identity), so a shallow compare re-renders only the message whose object
// changed (the one streaming). Custom comparison is avoided: `streaming` is a
// primitive per-message flag, so the default shallow prop compare is exact.
const MessageBubble = memo(function MessageBubble({ message, streaming }: Props) {
  // P52.22 — user-message inline edit (rewind + re-ask). State lives at the
  // top so every bubble (any role) renders the same hook order.
  const [editing, setEditing] = useState(false)

  if (message.role === 'system') {
    return (
      <div className="fade-up my-2 flex justify-center">
        <div className="rounded-full border border-border bg-background/40 px-3 py-1 text-center text-[11px] italic text-muted-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role === 'user') {
    const sessionId = useAppStore.getState().activeSessionId
    return (
      <div className="fade-up flex flex-row-reverse gap-2.5">
        <Avatar className="h-6 w-6 shrink-0 border border-border bg-secondary">
          <AvatarFallback className="bg-secondary text-muted-foreground">
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex max-w-[78%] flex-col items-end gap-1">
          {editing ? (
            <div className="w-full rounded-2xl rounded-tr-sm border border-orange-500/30 bg-secondary px-2 py-2">
              <UserEditInline
                sessionId={sessionId}
                message={message}
                onDone={() => setEditing(false)}
              />
            </div>
          ) : (
            <div className="rounded-2xl rounded-tr-sm bg-secondary px-3 py-2 text-[12px] leading-relaxed text-foreground">
              {message.content}
            </div>
          )}
          <div className="flex items-center gap-1">
            <TimeStamp ts={message.timestamp} />
            {/* P52.22 — correct an ask in place (rewind + re-ask). */}
            <button
              className="rounded p-0.5 text-muted-foreground/70 hover:text-foreground"
              title="Edit this ask — rewinds the conversation to here and re-asks the corrected text"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="rounded p-0.5 text-muted-foreground/70 hover:text-foreground"
              title="Fork from here"
              onClick={() => useAppStore.getState().forkFromMessage(message.id)}
            >
              <GitFork className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // assistant
  return (
    <div className="group/msg fade-up flex gap-2.5">
      <Avatar className="h-6 w-6 shrink-0 border border-orange-500/30 bg-orange-500/15">
        <AvatarFallback className="bg-transparent text-orange-400">
          <Sparkles className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="max-w-full rounded-2xl rounded-tl-sm border border-border bg-card/60 px-3 py-2">
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeHighlight]}
              components={mdComponents}
            >
              {message.content}
            </ReactMarkdown>
            {streaming && (
              <span className="caret-blink ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 rounded-sm bg-orange-400" />
            )}
          </div>

          {message.reasoning && message.reasoning.length > 0 && (
            <Reasoning
              items={message.reasoning}
              startedAt={message.reasoningStartedAt}
              endedAt={message.endedAt}
            />
          )}
        </div>

        {message.error && <TurnErrorCard message={message} />}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolChips calls={message.toolCalls} />
        )}

        {message.steps && message.steps.length > 0 && (
          <ProgressSteps steps={message.steps} />
        )}

        {message.artifacts && message.artifacts.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {message.artifacts.map((a, i) => (
              // P35.2 — entrance stagger on artifact cards.
              <div key={a.id} className="enter-stagger" style={staggerStyle(i)}>
                <ArtifactCard artifact={a} />
              </div>
            ))}
          </div>
        )}

        {message.mcq && <McqInterruptCard mcq={message.mcq} />}

        <div className="flex items-center gap-2 px-1">
          <TimeStamp ts={message.timestamp} />
          {message.ttfbMs !== undefined && message.endedAt && (
            <span className="font-mono text-[9px] text-muted-foreground/50">
              first token {(message.ttfbMs / 1000).toFixed(1)}s
            </span>
          )}
          {message.pinned && (
            <span className="font-mono text-[9px] text-orange-300/70">pinned</span>
          )}
          <AssistantActions message={message} />
        </div>
      </div>
    </div>
  )
})

export default MessageBubble
