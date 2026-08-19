'use client'

import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Activity, Clock, Coins, Globe, Shield, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SchedulerJob } from '@/lib/scheduler'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

interface Props {
  automation: SchedulerJob
  onClose: () => void
}

const ACTIVITY_30D = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  runs: Math.max(0, Math.round(Math.sin(i / 3) * 3 + 3 + (i % 4))),
}))

export default function AutomationEditor({ automation, onClose }: Props) {
  const notify = useAppStore((s) => s.notify)
  const [budget, setBudget] = useState(0.5)
  const [trigger, setTrigger] = useState(automation.trigger.type)
  const [action, setAction] = useState('session')
  const [network, setNetwork] = useState('restricted')

  const successRate = Math.round(
    (automation.successes / Math.max(automation.runs, 1)) * 100,
  )

  return (
    <div className="fade-up mt-4 rounded-lg border border-orange-500/30 bg-card shadow-inset-soft">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-foreground">
            {automation.name}
          </h3>
          <Badge variant="secondary" className="text-[9px]">
            editor
          </Badge>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={onClose}
          aria-label="Close editor"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {/* === Left: form === */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Trigger kind
              </Label>
              <Select
                value={trigger}
                onValueChange={(v) =>
                  setTrigger(v as SchedulerJob['trigger']['type'])
                }
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cron">Schedule (cron)</SelectItem>
                  <SelectItem value="interval">Interval</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Cron expression
              </Label>
              <Input
                defaultValue="0 2 * * *"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Condition (optional)
            </Label>
            <Input
              defaultValue="repo.branch == 'main' && ci.status == 'failed'"
              className="h-8 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="session">Start session</SelectItem>
                  <SelectItem value="prompt">Run prompt</SelectItem>
                  <SelectItem value="triage">Triage & summarize</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Blueprint
              </Label>
              <Select defaultValue="bp-deploy">
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bp-deploy">Deploy playbook</SelectItem>
                  <SelectItem value="bp-scan">Security scan</SelectItem>
                  <SelectItem value="bp-digest">Digest writer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">
                Budget cap (USD per run)
              </Label>
              <span className="font-mono text-xs text-orange-300">
                ${budget.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[budget]}
              min={0.05}
              max={5}
              step={0.05}
              onValueChange={(v) => setBudget(v[0])}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">
              Network policy
            </Label>
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restricted">Restricted (allowlist)</SelectItem>
                <SelectItem value="open">Open (full egress)</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* === Right: chart + stats === */}
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Activity — last 30 days
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {automation.runs} runs
              </span>
            </div>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ACTIVITY_30D}
                  margin={{ top: 4, right: 0, bottom: 0, left: -28 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="hsl(240 6% 22% / 0.4)"
                    strokeDasharray="2 2"
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }}
                    tickLine={false}
                    axisLine={false}
                    interval={5}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }}
                    tickLine={false}
                    axisLine={false}
                    width={24}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(25 95% 53% / 0.1)' }}
                    contentStyle={{
                      background: 'hsl(240 8% 9%)',
                      border: '1px solid hsl(240 6% 16%)',
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Bar
                    dataKey="runs"
                    fill="hsl(25 95% 53%)"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatTile
              icon={<Coins className="h-3 w-3" />}
              label="Avg cost"
              value={`$${(automation.runs * 0.04).toFixed(2)}`}
            />
            <StatTile
              icon={<Shield className="h-3 w-3" />}
              label="Success"
              value={`${successRate}%`}
              tone="text-emerald-300"
            />
            <StatTile
              icon={<Globe className="h-3 w-3" />}
              label="Network"
              value="restricted"
              tone="text-orange-300"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 bg-orange-500 text-black hover:bg-orange-400"
              onClick={() => {
                notify('Saved automation — trigger updated, next run recomputed')
                onClose()
              }}
            >
              Save automation
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  tone = 'text-foreground',
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 p-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn('mt-0.5 font-mono text-sm font-semibold', tone)}>
        {value}
      </div>
    </div>
  )
}
