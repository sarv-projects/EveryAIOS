import { describe, expect, test } from 'bun:test'
import { applyCitationMarks, citationAnchorId, formatCitationExport } from './citations'

describe('citation marks (P52.20)', () => {
  test('anchor ids are stable jump targets', () => {
    expect(citationAnchorId(1)).toBe('cite-1')
    expect(citationAnchorId(12)).toBe('cite-12')
  })

  test('marks a known url once and leaves unmarked text alone', () => {
    const cites = [{ index: 1, title: 'A', url: 'https://ex.test/a' }]
    expect(applyCitationMarks('see https://ex.test/a for more', cites)).toContain('[^1]')
    expect(applyCitationMarks('no sources here', cites)).toBe('no sources here')
    expect(applyCitationMarks('already [^1] cited https://ex.test/a', cites)).toBe(
      'already [^1] cited https://ex.test/a',
    )
  })

  test('P51.7 exportable dump includes [^n] and a Sources list', () => {
    const cites = [
      { index: 2, title: 'B', url: 'https://ex.test/b' },
      { index: 1, title: 'A', url: 'https://ex.test/a' },
    ]
    const out = formatCitationExport('see https://ex.test/a then https://ex.test/b', cites)
    expect(out).toContain('[^1]')
    expect(out).toContain('[^2]')
    expect(out).toContain('## Sources')
    expect(out.indexOf('[^1]: A')).toBeLessThan(out.indexOf('[^2]: B'))
  })
})
