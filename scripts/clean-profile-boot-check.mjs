#!/usr/bin/env node
/**
 * P50.1.7: verify the packaged shell is launched with an isolated clean profile.
 * This script does not invent a binary or mutate the user's profile. CI or a
 * release job supplies the packaged executable and an isolated data directory.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const executable = process.argv[2]
if (!executable || !existsSync(executable)) {
  console.error('usage: node scripts/clean-profile-boot-check.mjs <packaged-executable>')
  process.exit(2)
}

const profile = mkdtempSync(join(tmpdir(), 'everyaios-clean-profile-'))
const env = { ...process.env, HOME: profile, USERPROFILE: profile, EVERYAIOS_DATA_DIR: join(profile, '.everyaios') }
const child = spawn(executable, [], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })
const timeout = setTimeout(() => child.kill(), 10_000)
child.on('close', (code, signal) => {
  clearTimeout(timeout)
  const offline = /coordinator binary not found|pre-spawn skipped/i.test(output)
  const setup = /vault|setup|locked|persistence/i.test(output)
  const seeded = /mockSessions|demo|seeded/i.test(output)
  if (seeded || !offline || !setup) {
    console.error(output)
    console.error(`clean-profile boot failed: offline=${offline} setup=${setup} seeded=${seeded}`)
    process.exit(1)
  }
  console.log(`clean-profile boot passed: exit=${code ?? 'null'} signal=${signal ?? 'none'}; offline/setup state observed; no seeded marker`)
  rmSync(profile, { recursive: true, force: true })
})
