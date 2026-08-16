'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

/**
 * Bridge: watches store.lastToast and fires real toast notifications.
 * Place once in the app shell (e.g., page.tsx).
 */
export function ToastBridge() {
  const lastToast = useAppStore((s) => s.lastToast)
  const { toast } = useToast()
  const prev = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (lastToast && lastToast !== prev.current) {
      prev.current = lastToast
      toast({ title: lastToast, duration: 2500 })
    }
  }, [lastToast, toast])

  return null
}
