// P46.2 — `everyaios doctor` bridge (doctor_cmds.rs / everyaios_core::doctor).
// Per-subsystem readiness report for the Settings → Doctor panel. Read-only;
// never contains secret values (credentials are reported as a count only). In
// a plain-browser preview it returns a representative demo report so the panel
// stays explorable.

import { inTauri, invoke } from './tauri'

export type DoctorStatus = 'ok' | 'warn' | 'fail'
export interface DoctorCheck {
  name: string
  status: DoctorStatus
  detail: string
  hint?: string
}
export interface DoctorReport {
  version: string
  checks: DoctorCheck[]
  overall: DoctorStatus
}

export async function doctorReport(): Promise<DoctorReport> {
  if (!inTauri()) return demoReport()
  return invoke<DoctorReport>('doctor_report')
}

function demoReport(): DoctorReport {
  return {
    version: 'preview',
    overall: 'warn',
    checks: [
      { name: 'Core', status: 'ok', detail: 'orchestrator booted' },
      { name: 'Vault', status: 'ok', detail: 'SQLCipher open (key: generated)' },
      { name: 'Database', status: 'ok', detail: 'writable at ~/.everyaios' },
      { name: 'Disk', status: 'ok', detail: '42% used' },
      { name: 'Chrome/CDP', status: 'ok', detail: 'a Chromium binary is discoverable' },
      { name: 'Local runtimes', status: 'warn', detail: 'no Ollama / llamafile detected', hint: 'install Ollama or drop a llamafile (optional)' },
      { name: 'Credentials', status: 'warn', detail: 'no provider keys configured', hint: 'add a key in Settings → Providers' },
      { name: 'MCP', status: 'ok', detail: '0 server(s) installed; 42-tool inbuilt catalog always available' },
      { name: 'Browser', status: 'ok', detail: 'engine compiled in; live session attaches on first use' },
    ],
  }
}
