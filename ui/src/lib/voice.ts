/**
 * P50.4.3 / P50.4.4 — voice capture + read-aloud consumers.
 *
 * Capture: float PCM → i16 → Tauri `voice_vad_classify` / `voice_process_utterance`
 * (the crate's `VadDetector` + `VoicePipeline` + honest `NoopStt`).
 * Read-aloud: the platform `speechSynthesis` surface. There is no local TTS
 * engine in this build; we never invent a transcript or a spoken voice.
 */

import { invoke, inTauri } from './tauri'

export interface VoiceStatus {
  vad: boolean
  sttInstalled: boolean
  ttsEngine: string
  reason: string
}

export interface VoiceUtterance {
  text: string
  auto_send: boolean
  transcribed: boolean
}

export function pcmFloatToI16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0))
    out[i] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767)
  }
  return out
}

export function voiceStatus(): Promise<VoiceStatus> {
  if (!inTauri()) {
    return Promise.resolve({
      vad: false,
      sttInstalled: false,
      ttsEngine: typeof window !== 'undefined' && 'speechSynthesis' in window ? 'speechSynthesis' : 'none',
      reason: 'Voice capture needs the Tauri shell; read-aloud can still use the browser speech engine.',
    })
  }
  return invoke<VoiceStatus>('voice_status')
}

export function voiceVadClassify(samples: Int16Array): Promise<{ energy: number; state: string }> {
  return invoke('voice_vad_classify', { samples: Array.from(samples) })
}

export function voiceProcessUtterance(
  samples: Int16Array,
  utteranceLenMs: number,
  autoSend: boolean,
): Promise<VoiceUtterance> {
  return invoke('voice_process_utterance', {
    samples: Array.from(samples),
    utteranceLenMs,
    autoSend,
  })
}

export function speechSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

/** P50.4.4 — read the text aloud through the platform speech engine. */
export function speakText(text: string, rate = 1): boolean {
  if (!speechSynthesisAvailable() || !text.trim()) return false
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = rate
  window.speechSynthesis.speak(u)
  return true
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel()
}

/**
 * Capture ~`ms` of microphone PCM and return i16 frames for the VAD/STT
 * pipeline. Fails closed when the browser/shell denies the mic.
 */
export async function captureUtterance(ms = 2500): Promise<Int16Array> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone capture is not available in this runtime')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctx()
  const src = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  proc.onaudioprocess = (ev) => {
    chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)))
  }
  src.connect(proc)
  proc.connect(ctx.destination)
  await new Promise((r) => setTimeout(r, ms))
  proc.disconnect()
  src.disconnect()
  stream.getTracks().forEach((t) => t.stop())
  await ctx.close()
  let total = 0
  for (const c of chunks) total += c.length
  const merged = new Float32Array(total)
  let o = 0
  for (const c of chunks) {
    merged.set(c, o)
    o += c.length
  }
  return pcmFloatToI16(merged)
}
