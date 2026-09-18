import { describe, expect, test } from 'bun:test'
import { applyCitationMarks, citationAnchorId } from './citations'

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
})
