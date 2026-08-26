'use client'

import { useState } from 'react'
import { Bug, Copy, Lightbulb, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/lib/store'
import {
  localFeedbackDrafts,
  renderFeedbackMarkdown,
  submitFeedback,
  type FeedbackKind,
} from '@/lib/feedback'
import { SectionShell } from './settings-shared'

// P11.6.1 — in-app beta feedback: a bug report or feature request form that
// writes a local markdown entry (Tauri `feedback_submit`) or keeps a preview
// draft + copy button. Nothing is sent anywhere automatically.
export function FeedbackSection() {
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('')
  const [sentPath, setSentPath] = useState<string | null>(null)
  const notify = useAppStore((s) => s.notify)
  const drafts = localFeedbackDrafts()

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      notify('Feedback needs a title and a description', 'error')
      return
    }
    const res = await submitFeedback({
      kind,
      title: title.trim(),
      body: body.trim(),
      category: category.trim() || undefined,
    })
    if (res.path) {
      setSentPath(res.path)
      notify(`Feedback saved — ${res.path.split('/').pop()}`)
    } else {
      notify('Feedback draft saved locally (preview mode)')
    }
    setTitle('')
    setBody('')
    setCategory('')
  }

  const copy = async () => {
    const md = renderFeedbackMarkdown({ kind, title, body, category: category.trim() || undefined })
    try {
      await navigator.clipboard.writeText(md)
      notify('Report copied — paste it into a GitHub issue')
    } catch {
      notify('Clipboard unavailable', 'error')
    }
  }

  return (
    <SectionShell
      title="Feedback"
      desc="Beta feedback: report a bug or request a feature. Reports are written to a local file (or kept as a draft in preview) — you file them yourself; nothing is sent automatically."
    >
      <div className="flex gap-1.5">
        {(
          [
            { k: 'bug' as const, label: 'Bug report', Icon: Bug },
            { k: 'feature' as const, label: 'Feature request', Icon: Lightbulb },
          ]
        ).map(({ k, label, Icon }) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? 'default' : 'outline'}
            className={`h-7 gap-1 text-[10px] ${kind === k ? 'bg-orange-500 text-black hover:bg-orange-400' : ''}`}
            onClick={() => setKind(k)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        ))}
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === 'bug' ? 'Short bug title (what broke?)' : 'Short feature title'}
        className="h-8 text-xs"
      />
      <Input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category (optional) — e.g. chat, office, guard, browser, performance"
        className="h-8 text-xs"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          kind === 'bug'
            ? 'What did you expect, what happened? Steps to reproduce, platform…'
            : 'What would this do, and what problem does it solve?'
        }
        rows={4}
        className="text-xs"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-7 gap-1 bg-orange-500 text-black hover:bg-orange-400" onClick={() => void submit()}>
          <Send className="h-3 w-3" />
          Submit
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => void copy()}>
          <Copy className="h-3 w-3" />
          Copy report
        </Button>
      </div>
      {sentPath && (
        <p className="text-[10px] text-emerald-400">Saved to {sentPath} — file it in the GitHub issue tracker when ready.</p>
      )}
      {drafts.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {drafts.length} preview draft(s) kept locally (browser preview only).
        </p>
      )}
    </SectionShell>
  )
}
