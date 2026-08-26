import { describe, expect, test } from 'bun:test'
import { isGoogleDocUrl } from '@/components/views/office-open-bar'

describe('P33.6 — Google Docs/Sheets read-path routing', () => {
  test('detects docs/sheets/drive links', () => {
    expect(isGoogleDocUrl('https://docs.google.com/document/d/abc/edit')).toBe(true)
    expect(isGoogleDocUrl('https://sheets.google.com/spreadsheets/d/xyz')).toBe(true)
    expect(isGoogleDocUrl('https://drive.google.com/file/d/123/view')).toBe(true)
  })

  test('ignores local paths and non-Google URLs', () => {
    expect(isGoogleDocUrl('/home/user/Q3.xlsx')).toBe(false)
    expect(isGoogleDocUrl('Q3-Financials.xlsx')).toBe(false)
    expect(isGoogleDocUrl('https://example.com/report.pdf')).toBe(false)
    expect(isGoogleDocUrl('not a url')).toBe(false)
    expect(isGoogleDocUrl('')).toBe(false)
  })

  test('rejects lookalike hosts (hostname match, not substring)', () => {
    expect(isGoogleDocUrl('https://docs.google.com.evil.example/x')).toBe(false)
    expect(isGoogleDocUrl('https://google.com.evil.example/docs')).toBe(false)
  })
})
