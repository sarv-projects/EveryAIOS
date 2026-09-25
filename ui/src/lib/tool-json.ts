/** P45.9 — parse a large tool result off the main thread when a worker exists. */
export async function parseToolResult(raw: string): Promise<unknown> {
  if (raw.length < 8_000 || typeof Worker === 'undefined') {
    return parseSync(raw)
  }
  const source = `
    self.onmessage = (event) => {
      try {
        self.postMessage({ ok: true, value: JSON.parse(String(event.data)) })
      } catch (error) {
        self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'parse failed' })
      }
    }
  `
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const worker = new Worker(url)
    const value = await new Promise<unknown>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ ok: boolean; value?: unknown; error?: string }>) => {
        if (event.data.ok) resolve(event.data.value)
        else reject(new Error(event.data.error ?? 'parse failed'))
      }
      worker.onerror = () => reject(new Error('worker failed'))
      worker.postMessage(raw)
    })
    worker.terminate()
    return value
  } catch {
    return parseSync(raw)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function parseSync(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
