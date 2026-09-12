// The UI production build runner.
//
// Why this exists instead of `cross-env NODE_OPTIONS=--max-old-space-size=4096
// tsc && vite build`: the fixed 4 GB heap is wrong in both directions.
//
// * On a machine with ~6 GB of RAM and a Rust/Tauri dev stack already running,
//   a 4 GB old space exceeds what the OS can actually give the process, so V8
//   spends its time in major GC (mark-compact at ~2 GB with a low allocation
//   success rate) and the build is killed — the failure looks like a hang, not
//   an OOM.
// * On Node's default heap the monaco/mermaid/cytoscape chunks genuinely need
//   more than ~2 GB of old space, so too small a budget OOMs during transform.
//
// So size the budget from the machine (60 % of total RAM, clamped to
// 2–8 GB), print it, and run the two steps with it. `tsc --noEmit` is the type
// gate; `vite build` emits `dist/` (main + guard entries).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import os from 'node:os'

const uiDir = dirname(dirname(fileURLToPath(import.meta.url)))

const totalMb = Math.floor(os.totalmem() / 1024 / 1024)
const heapMb = Math.min(8192, Math.max(2048, Math.floor(totalMb * 0.6)))

console.log(`build: node heap ${heapMb} MB (machine has ${totalMb} MB)`)

const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${heapMb}`.trim(),
}

function run(entry, args) {
  if (!existsSync(entry)) {
    console.error(`build: missing ${entry} — run \`bun install\` in ui/ first`)
    process.exit(1)
  }
  // `process.execPath` (not a shell) keeps this identical on Windows/macOS/Linux
  // and inherits NODE_OPTIONS, so the heap budget applies to the child.
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: uiDir,
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    console.error(`build: ${entry} failed to start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(join(uiDir, 'node_modules', 'typescript', 'bin', 'tsc'), ['--noEmit'])
run(join(uiDir, 'node_modules', 'vite', 'bin', 'vite.js'), ['build'])
