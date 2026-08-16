'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Brain, Check, ChevronRight, Copy, RotateCw, Sparkles, ThumbsDown, ThumbsUp, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { ChatMessage } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import ArtifactCard from './artifact-card'
import McqInterruptCard from './mcq-interrupt-card'
import ProgressSteps from './progress-steps'

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

function Reasoning({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Brain className="h-3 w-3 text-violet-300" />
          Reasoning
          <span className="text-muted-foreground/50">· {items.length}</span>
          <ChevronRight
            className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-2">
        <ul className="space-y-1">
          {items.map((r, i) => (
            <li key={i} className="flex gap-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
              <span className="select-none text-violet-300/70">›</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
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

function MessageActions({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState<'up' | 'down' | null>(null)
  const notify = useAppStore((s) => s.notify)

  const copy = () => {
    navigator.clipboard?.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const act = (action: string) => {
    notify(action)
  }

  const baseBtn =
    'h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/70 transition-all hover:bg-accent hover:text-foreground opacity-0 group-hover/msg:opacity-100 focus:opacity-100'

  return (
    <div className="flex items-center gap-0.5 px-1">
      <button className={baseBtn} onClick={copy} title="Copy message">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
      <button
        className={cn(
          baseBtn,
          vote === 'up' && 'text-emerald-400 opacity-100 hover:text-emerald-300',
        )}
        onClick={() => {
          setVote(vote === 'up' ? null : 'up')
          if (vote !== 'up') act('Marked as helpful')
        }}
        title="Good response"
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        className={cn(
          baseBtn,
          vote === 'down' && 'text-rose-400 opacity-100 hover:text-rose-300',
        )}
        onClick={() => {
          setVote(vote === 'down' ? null : 'down')
          if (vote !== 'down') act('Marked as needs improvement')
        }}
        title="Bad response"
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
      <button className={baseBtn} onClick={() => act('Regenerating response…')} title="Regenerate">
        <RotateCw className="h-3 w-3" />
      </button>
    </div>
  )
}

interface Props {
  message: ChatMessage
}

export default function MessageBubble({ message }: Props) {
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
    return (
      <div className="fade-up flex flex-row-reverse gap-2.5">
        <Avatar className="h-6 w-6 shrink-0 border border-border bg-secondary">
          <AvatarFallback className="bg-secondary text-muted-foreground">
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
        <div className="flex max-w-[78%] flex-col items-end gap-1">
          <div className="rounded-2xl rounded-tr-sm bg-secondary px-3 py-2 text-[12px] leading-relaxed text-foreground">
            {message.content}
          </div>
          <TimeStamp ts={message.timestamp} />
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
            <ReactMarkdown components={mdComponents}>{message.content}</ReactMarkdown>
          </div>

          {message.reasoning && message.reasoning.length > 0 && (
            <Reasoning items={message.reasoning} />
          )}
        </div>

        {message.steps && message.steps.length > 0 && (
          <ProgressSteps steps={message.steps} />
        )}

        {message.artifacts && message.artifacts.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {message.artifacts.map((a) => (
              <ArtifactCard key={a.id} artifact={a} />
            ))}
          </div>
        )}

        {message.mcq && <McqInterruptCard mcq={message.mcq} />}

        <div className="flex items-center gap-2 px-1">
          <TimeStamp ts={message.timestamp} />
          {message.pinned && (
            <span className="font-mono text-[9px] text-orange-300/70">pinned</span>
          )}
          <MessageActions message={message} />
        </div>
      </div>
    </div>
  )
}
