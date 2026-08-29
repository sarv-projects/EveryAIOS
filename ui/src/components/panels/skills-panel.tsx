'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2, Package, RotateCcw, ShieldCheck, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import { skillsCatalog, skillsInstall, skillsUninstall, type SkillRowView } from '@/lib/skills'

const PERM_TONE: Record<string, string> = {
  'fs.read': 'bg-emerald-500/15 text-emerald-300',
  'fs.write': 'bg-orange-500/15 text-orange-300',
  'tool.mcp': 'bg-sky-500/15 text-sky-300',
  'tool.connector': 'bg-violet-500/15 text-violet-300',
}

export default function SkillsPanel() {
  const [skills, setSkills] = useState<SkillRowView[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const notify = useAppStore((s) => s.notify)

  const refresh = async () => {
    const rows = await skillsCatalog()
    setSkills(rows)
  }

  useEffect(() => {
    refresh()
  }, [])

  const install = async (row: SkillRowView) => {
    setBusy(row.id)
    try {
      await skillsInstall(row.id)
      notify(`Installed “${row.name}”. Its capabilities are active under Guard-2.`)
      await refresh()
    } catch (e) {
      notify(`Install failed: ${String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const uninstall = async (row: SkillRowView) => {
    setBusy(row.id)
    try {
      await skillsUninstall(row.id)
      notify(`Uninstalled “${row.name}”.`)
      await refresh()
    } catch (e) {
      notify(`Uninstall failed: ${String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const installed = skills.filter((s) => s.installed)

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Wand2 className="h-4 w-4 text-orange-300" /> Skills store
          </h2>
          <p className="text-sm text-muted-foreground">
            Capability-gated skills, verified against the store&apos;s signed index before install.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-emerald-300">
            {installed.length} installed
          </Badge>
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {skills.map((row, i) => (
          <motion.div
            key={row.id}
            className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-4"
            style={{ opacity: 0, animation: `fadeInUp 0.3s ${i * 0.05}s ease forwards` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/15 text-orange-300">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{row.name}</span>
                    {row.installed && (
                      <Badge className="bg-emerald-500/15 text-emerald-300">installed</Badge>
                    )}
                    {row.tampered === true && (
                      <Badge className="bg-red-500/15 text-red-300" title="On-disk content no longer matches its signed install pin">
                        tampered
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">v{row.version}</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{row.description}</p>

            <div className="flex flex-wrap gap-1.5">
              {row.permissions.map((p) => (
                <Badge key={p} className={`${PERM_TONE[p] ?? 'bg-zinc-500/15 text-zinc-300'}`}>
                  {p}
                </Badge>
              ))}
            </div>

            {row.scopes_plain.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/40 p-2.5 text-xs">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                <ul className="space-y-0.5 text-muted-foreground">
                  {row.scopes_plain.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto flex justify-end">
              {row.installed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === row.id}
                  onClick={() => uninstall(row)}
                >
                  {busy === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Uninstall
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy === row.id}
                  onClick={() => install(row)}
                >
                  {busy === row.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Package className="h-3.5 w-3.5" />
                  )}
                  Install
                </Button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}