import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

/** Shared chat column width: grows when sidebars collapse so the composer
 *  and transcript use the extra space instead of staying a skinny 42rem strip. */
export function useChatColumnClass(extra?: string) {
  const leftClosed = useAppStore((s) => s.sidebarCollapsed)
  const rightClosed = useAppStore((s) => s.railCollapsed)
  const both = leftClosed && rightClosed
  const one = leftClosed || rightClosed
  return cn(
    'mx-auto w-full transition-[max-width,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
    both ? 'max-w-6xl px-8' : one ? 'max-w-4xl px-6' : 'max-w-3xl px-4',
    extra,
  )
}
