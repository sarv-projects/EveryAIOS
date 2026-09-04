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
  const lastToastKind = useAppStore((s) => s.lastToastKind)
  const { toast } = useToast()
  const prev = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (lastToast && lastToast !== prev.current) {
      prev.current = lastToast
      const isError = lastToastKind === 'error'
      toast({
        title: isError ? 'Something needs attention' : lastToast,
        description: isError ? lastToast : undefined,
        variant: isError ? 'destructive' : 'default',
        duration: isError ? 6000 : 2500,
      })
    }
  }, [lastToast, lastToastKind, toast])

  return null
}
