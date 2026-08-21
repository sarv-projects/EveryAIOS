'use client'

import { CheckCircle2, Circle, Folder, Sparkles } from 'lucide-react'
import ChatComposer from '@/components/chat/chat-composer'
import { useAppStore, type Session } from '@/lib/store'
import { cn } from '@/lib/utils'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function statusLine(s: Session) {
  if (s.status === 'action-required') return 'Waiting for approval'
  if (s.status === 'running') return 'Running'
  if (s.status === 'completed') return 'Completed'
  if (s.status === 'scheduled') return s.preview || 'Scheduled'
  if (s.status === 'paused') return 'Paused'
  if (s.status === 'failed') return 'Failed'
  return s.preview
}

export default function HomeLaunchpad() {
  const sessions = useAppStore((s) => s.sessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const continueWork = sessions.slice(0, 4)

  const examples = [
    'Clean up my Downloads folder',
    'Get me ready for tomorrow’s meeting',
    'Research this company and make a presentation',
    'Organize these files — I don’t know where they belong',
  ]

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <div className="mb-1 text-xs text-muted-foreground">{greeting()}.</div>
        <h1 className="mb-6 text-lg font-semibold tracking-tight">What would you like to get done?</h1>
        <div className="w-full max-w-2xl">
          <ChatComposer centered />
        </div>
        <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-1.5">
          {examples.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setComposerValue(label)}
              className="rounded-full border border-border bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>

        {continueWork.length > 0 && (
          <div className="mt-10 w-full max-w-2xl">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Continue working
            </div>
            <ul className="space-y-1">
              {continueWork.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSession(s.id)}
                    className="flex w-full items-start gap-2.5 rounded-md border border-transparent px-2 py-2 text-left hover:border-border hover:bg-accent/40"
                  >
                    {s.status === 'completed' ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Circle
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5',
                          s.status === 'action-required' && 'text-orange-400',
                          s.status === 'running' && 'text-blue-400',
                          s.status === 'scheduled' && 'text-violet-400',
                        )}
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block text-[13px] text-foreground">{s.title}</span>
                      <span className="block text-[11px] text-muted-foreground">{statusLine(s)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export function ActivityPanel() {
  const sessions = useAppStore((s) => s.sessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const live = sessions.filter((s) => s.status === 'running' || s.status === 'action-required' || s.status === 'scheduled')
  const done = sessions.filter((s) => s.status === 'completed' || s.status === 'failed' || s.status === 'paused')
  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-[11px] text-muted-foreground">Everything currently happening or recently completed.</p>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        <Section title="Now" items={live} onPick={setActiveSession} />
        <Section title="Recently finished" items={done} onPick={setActiveSession} />
      </div>
    </div>
  )
}

function Section({ title, items, onPick }: { title: string; items: Session[]; onPick: (id: string) => void }) {
  return (
    <section className="mb-6">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="flex w-full items-start gap-2 rounded-md border border-border/50 bg-background/30 px-3 py-2 text-left hover:border-orange-500/30"
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 text-orange-400" />
                <span>
                  <span className="block text-[13px]">{s.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{statusLine(s)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function ProjectsPanel() {
  const sessions = useAppStore((s) => s.sessions)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const folders = Array.from(new Set(sessions.map((s) => s.folder).filter(Boolean))) as string[]
  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Projects</h2>
        <p className="text-[11px] text-muted-foreground">Persistent bodies of work — folders EveryAIOS has used.</p>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
        {folders.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No projects yet. Start work from Home.</p>
        ) : (
          <ul className="space-y-1">
            {folders.map((f) => {
              const inFolder = sessions.filter((s) => s.folder === f)
              return (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => inFolder[0] && setActiveSession(inFolder[0].id)}
                    className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-background/30 px-3 py-2 text-left hover:border-orange-500/30"
                  >
                    <Folder className="h-4 w-4 text-orange-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px]">{f}</span>
                      <span className="text-[10px] text-muted-foreground">{inFolder.length} work item{inFolder.length === 1 ? '' : 's'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
