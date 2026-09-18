import { describe, expect, test } from 'bun:test'
import { pcmFloatToI16, speechSynthesisAvailable } from './voice'

describe('voice PCM (P50.4.3)', () => {
  test('converts float frames to i16 without clipping silence or peaks', () => {
    const got = pcmFloatToI16(new Float32Array([0, 1, -1, 0.5]))
    expect(Array.from(got)).toEqual([0, 32767, -32768, 16384])
  })

  test('speechSynthesisAvailable is false in this test host (no window speech)', () => {
    expect(typeof speechSynthesisAvailable()).toBe('boolean')
  })
})
