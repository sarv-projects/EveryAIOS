'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, CornerDownRight, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { sendUserMessage } from '@/lib/bridge'
import { cn } from '@/lib/utils'

interface ChatOverlayProps {
  /** The open document's title (shown in the injected-context chip). */
  title: string
  /** Extracted document text injected as a J6 `<user_document>` (cache-boundary-safe). */
  context: string
  /** Close the overlay. */
  onClose: () => void
}

interface LocalTurn {
  role: 'user' | 'assistant'
  text: string
}

/**
 * P4.7 — chat overlay on an open document. A floating, document-scoped ask
 * panel: every send injects the open document's text below the prompt's cache
 * boundary (`sendUserMessage(text, { title, content })`) so the model answers
 * against the document without dirtying the stable prefix. The streaming
 * answer lands in the app's single chat surface (one-surface-at-a-time); the
 * overlay keeps a local record of what was asked.
 */
export default function ChatOverlay({ title, context, onClose }: ChatOverlayProps) {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<LocalTurn[]>([])
  const activeSessionId = useAppStore((s) => s.activeSessionId)

  const send = async () => {
    const text = input.trim()
    if (!text) return
    setTurns((t) => [
      ...t,
      { role: 'user', text },
      { role: 'assistant', text: 'Asked — see the chat panel for the scoped answer.' },
    ])
    setInput('')
    try {
      await sendUserMessage(text, { title, content: context })
    } catch {
      /* the main chat panel surfaces the error; the overlay stays put */
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="absolute bottom-14 right-3 z-30 flex w-[360px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-orange-400" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            Ask about {title}
          </span>
          <Badge className="shrink-0 bg-emerald-500/15 text-[9px] text-emerald-300">
            doc context
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close chat overlay"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* turns */}
        <div className="scroll-thin flex max-h-56 min-h-[6rem] flex-col gap-2 overflow-y-auto p-3">
          {turns.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
              <BookOpen className="h-5 w-5 text-muted-foreground/40" />
              <p className="text-[11px] text-muted-foreground">
                Ask a question scoped to this document.
              </p>
              <p className="font-mono text-[9px] text-muted-foreground/50">
                {Math.round(context.length / 4).toLocaleString()} tok context injected
              </p>
            </div>
          ) : (
            turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] rounded-md border px-2.5 py-1.5 text-[11px] leading-relaxed',
                  t.role === 'user'
                    ? 'self-end border-orange-500/30 bg-orange-500/10 text-foreground'
                    : 'self-start border-border bg-zinc-900/60 text-muted-foreground',
                )}
              >
                {t.role === 'assistant' && (
                  <CornerDownRight className="mr-1 inline h-3 w-3 text-emerald-400" />
                )}
                {t.text}
              </div>
            ))
          )}
        </div>

        {/* composer */}
        <div className="flex items-center gap-1.5 border-t border-border p-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder={`Ask about ${title}…`}
            className="min-w-0 flex-1 rounded border border-border bg-zinc-950 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-orange-500/60 focus:outline-none"
          />
          <Button
            size="sm"
            disabled={!input.trim() || !activeSessionId}
            className="h-7 gap-1 px-2 text-[10px]"
            onClick={() => void send()}
          >
            <Send className="h-3 w-3" />
            Ask
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
