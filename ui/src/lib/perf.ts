// P11.4 — Largest Contentful Paint + Time-to-Interactive measurement.
//
// LCP is read from the PerformanceObserver (target < 1s); TTI is approximated
// from navigation start → first interactive paint + main-thread quiescence
// (target < 2s after cold start). The hook exposes the last values so the
// status bar can show them without pulling a perf library in.
//
// Honest ceiling: real TTI (Long Tasks API) is available only in Chromium
// webviews; the Tauri webview supports it, so we use it when present and fall
// back to a paint-based approximation otherwise.

import { useEffect, useState } from 'react'

export interface PerfSnapshot {
  lcpMs: number | null
  ttiMs: number | null
  coldStartMs: number | null
}

const NAV_START =
  typeof performance !== 'undefined' ? performance.getEntriesByType('navigation')[0]?.startTime ?? 0 : 0

let cached: PerfSnapshot = { lcpMs: null, ttiMs: null, coldStartMs: null }

function measure() {
  const now = performance.now()

  // LCP — largest paint within the first 2.5s window.
  let lcpMs: number | null = null
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1] as PerformanceEntry & { startTime?: number }
      if (last && typeof last.startTime === 'number') {
        cached.lcpMs = Math.round(last.startTime)
        lcpMs = cached.lcpMs
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {
    /* older engines */
  }

  // TTI — Long Tasks (Chromium) → time after the last long task; fallback:
  // first meaningful paint of the shell.
  try {
    let lastLong = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        lastLong = Math.max(lastLong, e.startTime + e.duration)
      }
      cached.ttiMs = Math.round(lastLong + 200) // 200ms quiet window
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* fall back to paint approximation below */
  }

  // Fallback TTI: time to first contentful paint (available everywhere).
  if (cached.ttiMs === null) {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0] as
      | PerformanceEntry
      | undefined
    if (fcp) cached.ttiMs = Math.round(fcp.startTime)
  }

  cached.coldStartMs = Math.round(now - NAV_START)
  return cached
}

/** Kick off measurement once at app boot. */
export function startPerfMeasurement() {
  if (typeof window === 'undefined') return
  window.addEventListener('load', () => {
    // Let LCP settle (max 2.5s window) before snapshotting.
    window.setTimeout(() => measure(), 2600)
  })
}

/** Live snapshot hook for the status-bar readout. */
export function usePerfSnapshot(): PerfSnapshot {
  const [snap, setSnap] = useState<PerfSnapshot>(cached)
  useEffect(() => {
    const id = window.setTimeout(() => setSnap(measure()), 2800)
    return () => window.clearTimeout(id)
  }, [])
  return snap
}
