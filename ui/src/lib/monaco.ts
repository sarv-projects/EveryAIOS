// P11.5.3 — Monaco (MIT — the actual VS Code editor component) wired for the
// local Tauri webview: workers are bundled with Vite (`?worker` imports) so
// the editor works fully offline, and the @monaco-editor/react loader is
// pointed at this local instance (no CDN).

import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
// Monaco ≥0.52 maps "./*" → "./esm/vs/*.js" in its exports map, so the subpath
// must NOT include the esm/vs/ prefix (that double-prefixes and fails to resolve).
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'

type WorkerCtor = new () => Worker

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    const map: Record<string, WorkerCtor> = {
      json: jsonWorker,
      css: cssWorker,
      scss: cssWorker,
      less: cssWorker,
      html: htmlWorker,
      handlebars: htmlWorker,
      razor: htmlWorker,
      typescript: tsWorker,
      javascript: tsWorker,
    }
    return new (map[label] ?? editorWorker)()
  },
}

// Point the React wrapper at the local monaco instance (offline).
loader.config({ monaco })

export default monaco
