// P11.6.1 — in-app beta feedback bridge.
//
// In the Tauri shell, `feedback_submit` appends the report to
// `<data_dir>/feedback/feedback.md` (local file, never sent anywhere). In
// plain-browser preview the report is kept in localStorage and a "copy"
// button produces the same markdown so it can still be filed.

import { inTauri, invoke } from './tauri'
import { nativeCall } from './runtime'

export type FeedbackKind = 'bug' | 'feature'

export interface FeedbackReport {
  kind: FeedbackKind
  title: string
  body: string
  category?: string
}

const LOCAL_KEY = 'everyaios.feedback.drafts'

export async function submitFeedback(report: FeedbackReport): Promise<{ path?: string }> {
  if (inTauri()) {
    const path = await nativeCall('feedback submit', () => invoke<string>('feedback_submit', {
      kind: report.kind,
      title: report.title,
      body: report.body,
      category: report.category || null,
    }))
    return { path }
  }
  // Preview fallback: persist locally so the report isn't lost.
  try {
    const drafts = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as FeedbackReport[]
    drafts.push({ ...report, category: report.category || undefined })
    localStorage.setItem(LOCAL_KEY, JSON.stringify(drafts.slice(-50)))
  } catch {
    /* ignore */
  }
  return {}
}

export function localFeedbackDrafts(): FeedbackReport[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as FeedbackReport[]
  } catch {
    return []
  }
}

/** The same markdown the Rust side appends — used for the copy button. */
export function renderFeedbackMarkdown(r: FeedbackReport): string {
  return [
    `## ${r.kind} — ${r.title}`,
    '',
    `- **ts:** ${Date.now()}`,
    ...(r.category ? [`- **category:** ${r.category}`] : []),
    '',
    r.body,
    '',
    '---',
    '',
  ].join('\n')
}
