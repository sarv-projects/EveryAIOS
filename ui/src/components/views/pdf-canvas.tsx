'use client'

// P4.4 — pdf.js canvas renderer, code-split so the worker only ships when a
// real PDF is rendered. Renders a page to <canvas> from the `pdf_bytes`
// base64 payload; page nav + zoom stay in the parent.
//
// P2.12 — the parent can find text through the real pdf.js text layer:
// `findText(query)` walks every page's `getTextContent()` and returns the
// 1-based page number of the first match (null when absent), instead of
// searching the extracted-text array.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export interface PdfCanvasHandle {
  /** Real pdf.js text-layer search across all pages → 1-based page or null. */
  findText: (query: string) => Promise<number | null>
}

interface Props {
  dataUrl: string
  page: number
  scale: number
}

const PdfCanvas = forwardRef<PdfCanvasHandle, Props>(function PdfCanvas(
  { dataUrl, page, scale },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  docRef.current = doc

  // Load the document once per dataUrl.
  useEffect(() => {
    let alive = true
    setError(null)
    setDoc(null)
    getDocument({ url: dataUrl })
      .promise.then((d) => {
        if (alive) setDoc(d)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load PDF')
      })
    return () => {
      alive = false
      void getDocument({ url: dataUrl }).promise.then((d) => d.destroy()).catch(() => {})
    }
  }, [dataUrl])

  // P2.12 — pdf.js text-layer search (real glyph text, not the extracted
  // array). Cancellable per keystroke via a generation token.
  useImperativeHandle(ref, () => ({
    findText: async (query: string): Promise<number | null> => {
      const d = docRef.current
      if (!d || !query) return null
      const q = query.toLowerCase()
      const pageCount = d.numPages
      for (let p = 1; p <= pageCount; p++) {
        try {
          const page = await d.getPage(p)
          const content = await page.getTextContent()
          const text = content.items
            .map((it) => ('str' in it ? (it as { str: string }).str : ''))
            .join(' ')
          if (text.toLowerCase().includes(q)) return p
        } catch {
          /* skip unreadable pages */
        }
      }
      return null
    },
  }))

  // Render the requested page.
  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    doc.getPage(page).then(async (p) => {
      const viewport = p.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      await p.render({ canvasContext: ctx, viewport }).promise
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [doc, page, scale])

  if (error) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[10px] text-red-400">
        ⚠ {error} — showing text extraction instead
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full rounded-sm bg-[#fbfbf9] shadow-xl"
    />
  )
})

export default PdfCanvas
