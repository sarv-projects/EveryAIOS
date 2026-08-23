// P11.4 — performance-UX hooks.
//
// - `useDebouncedValue`: debounce search inputs (avoid a query per keystroke).
// - `useVirtualList`: windowed rendering for large lists (message history,
//   memory rows, file trees) — only `overscan` rows around the viewport are
//   mounted, with spacer rows keeping the scrollbar honest.
// - `useElementSize`: ResizeObserver wrapper for virtualization + charts.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/** Debounce a rapidly-changing value (search inputs, filter fields). */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export interface VirtualListOptions<T> {
  items: T[]
  rowHeight: number
  overscan?: number
}

export interface VirtualList<T> {
  /** Slice of items to actually render. */
  visible: T[]
  /** Total height of the spacer (px). */
  totalHeight: number
  /** Offset for the spacer before the visible slice (px). */
  startOffset: number
  /** Row index of the first visible item (for keying/anchoring). */
  startIndex: number
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  /** Jump to a specific row index (programmatic scroll). */
  scrollToIndex: (index: number) => void
}

/** Windowed rendering for long lists. Pass the scroll container's height. */
export function useVirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
}: VirtualListOptions<T>): VirtualList<T> {
  const [viewport, setViewport] = useState({ top: 0, height: 600 })
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { totalHeight, startIndex, endIndex } = useMemo(() => {
    const total = items.length * rowHeight
    const start = Math.max(0, Math.floor(viewport.top / rowHeight) - overscan)
    const end = Math.min(
      items.length,
      Math.ceil((viewport.top + viewport.height) / rowHeight) + overscan
    )
    return { totalHeight: total, startIndex: start, endIndex: end }
  }, [items.length, rowHeight, viewport.top, viewport.height, overscan])

  const visible = useMemo(() => items.slice(startIndex, endIndex), [items, startIndex, endIndex])

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setViewport({ top: el.scrollTop, height: el.clientHeight })
  }, [])

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current
      if (!el) return
      const target = Math.max(0, index * rowHeight - el.clientHeight / 2)
      el.scrollTo({ top: target, behavior: 'smooth' })
    },
    [rowHeight]
  )

  return {
    visible,
    totalHeight,
    startOffset: startIndex * rowHeight,
    startIndex,
    onScroll,
    scrollRef,
    scrollToIndex,
  }
}

/** Observe an element's size (ResizeObserver). Returns [ref, {width,height}]. */
export function useElementSize<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, size]
}

/** Debounced function call (fire latest after idle) — for search-as-you-type. */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 250
): (...args: A) => void {
  const timer = useRef<number | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback(
    (...args: A) => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => fnRef.current(...args), delayMs)
    },
    [delayMs]
  )
}
