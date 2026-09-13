// P32.14 / WP4 — interruption-tier tests.
//
// The confirmation gate exists because "Approve" is a button people have
// learned to press. These tests pin both halves: it must fire for genuinely
// irreversible work, and it must never fire for routine work (or it just
// becomes another reflex).

import { describe, expect, test } from 'bun:test'
import {
  tierFor,
  TIER_LABEL,
  isHighBlast,
  confirmWord,
  confirmSatisfied,
  type InterruptLike,
} from './interrupts'

const permission = (title: string, description = ''): InterruptLike => ({
  kind: 'permission',
  title,
  description,
})

describe('tierFor — what kind of attention is this', () => {
  test('a blocked effect needs the user', () => {
    for (const kind of ['permission', 'plan', 'diff', 'budget', 'autonomy'] as const) {
      expect(tierFor({ kind, title: 'x' })).toBe('needs-you')
    }
  })

  test('a question is the user\u2019s call', () => {
    expect(tierFor({ kind: 'mcq', title: 'Choose how to continue' })).toBe('review')
  })

  test('both tiers have a plain label', () => {
    expect(TIER_LABEL['needs-you']).toBe('Needs you')
    expect(TIER_LABEL.review.length).toBeGreaterThan(0)
  })
})

describe('isHighBlast — irreversible or not', () => {
  test('catches hard-to-undo work', () => {
    for (const s of [
      'delete_file · notes.md',
      'Send email to 14 recipients',
      'transfer $2,400',
      'install package',
      'revoke access',
      'Overwrite report.docx',
      'rm -rf build',
      'grant permission',
    ]) {
      expect(isHighBlast(s)).toBe(true)
    }
  })

  test('leaves routine work alone', () => {
    for (const s of [
      'write_file · src/app.ts',
      'read_file · notes.md',
      'create folder',
      'rename to archive/',
      'Sum column B',
      'search the web',
    ]) {
      expect(isHighBlast(s)).toBe(false)
    }
  })
})

describe('confirmWord — the thing being acted on', () => {
  test('picks the file basename out of a permission title', () => {
    expect(confirmWord(permission('delete_file · /home/me/report.xlsx'))).toBe('report.xlsx')
  })

  test('takes the first entry when several are listed', () => {
    expect(confirmWord(permission('delete_file · /a/one.txt, /a/two.txt'))).toBe('one.txt')
  })

  test('falls back to the operation when no path is named', () => {
    expect(confirmWord(permission('transfer funds'))).toBe('transfer')
  })

  test('a Windows path still yields the basename', () => {
    expect(confirmWord(permission('delete_file · C:\\Users\\me\\deck.pptx'))).toBe('deck.pptx')
  })
})

describe('confirmSatisfied — deliberate, not a typing test', () => {
  test('routine work never needs confirmation', () => {
    expect(confirmSatisfied(permission('write_file · src/app.ts'), '')).toBe(true)
  })

  test('high-blast work stays blocked until the name is typed', () => {
    const i = permission('delete_file · /home/me/report.xlsx')
    expect(confirmSatisfied(i, '')).toBe(false)
    expect(confirmSatisfied(i, 'report')).toBe(false)
    expect(confirmSatisfied(i, 'report.xlsx')).toBe(true)
  })

  test('is case- and whitespace-insensitive', () => {
    const i = permission('delete_file · /home/me/Report.XLSX')
    expect(confirmSatisfied(i, '  report.xlsx  ')).toBe(true)
  })

  test('the description counts too — a routine op that sends still gates', () => {
    const i = permission('write_file · out.txt', 'and send it to the team')
    expect(confirmSatisfied(i, '')).toBe(false)
  })
})
