'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BarChart3, Coins, Cpu, DollarSign, Layers, Timer } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { inTauri } from '@/lib/tauri'
import { usageSnapshot, sessionTotals } from '@/lib/spend'
import { ChartCard, ModelLeaderboard, SessionsTable, AgentBreakdown } from './analytics-sections'

const KPIS = [
  { label: 'Total spent', value: '$5.42', icon: DollarSign, tone: 'text-orange-300' },
  { label: 'Tokens used', value: '1.2M', icon: Cpu, tone: 'text-sky-300' },
  { label: 'Sessions', value: '12', icon: Layers, tone: 'text-foreground' },
  { label: 'Avg cost/session', value: '$0.45', icon: Timer, tone: 'text-emerald-300' },
]

const SPEND_30D = Array.from({ length: 30 }, (_, i) => ({
  day: `${i + 1}`,
  spend: +(0.05 + Math.abs(Math.sin(i / 4)) * 0.4 + (i % 7 === 0 ? 0.2 : 0)).toFixed(2),
}))

const TOKENS_BY_MODEL = [
  { model: 'Claude', tokens: 480 },
  { model: 'GPT-4o', tokens: 320 },
  { model: 'Gemini', tokens: 180 },
  { model: 'DeepSeek', tokens: 140 },
  { model: 'Ollama', tokens: 80 },
]

const COST_BY_CATEGORY = [
  { name: 'Chat', value: 2.4, color: 'hsl(25 95% 53%)' },
  { name: 'Browser', value: 1.1, color: 'hsl(217 91% 60%)' },
  { name: 'Office', value: 0.92, color: 'hsl(142 71% 45%)' },
  { name: 'Code', value: 0.7, color: 'hsl(38 92% 50%)' },
  { name: 'Research', value: 0.3, color: 'hsl(280 65% 60%)' },
]

const TOOLTIP_STYLE = {
  background: 'hsl(240 8% 9%)',
  border: '1px solid hsl(240 6% 16%)',
  borderRadius: 6,
  fontSize: 11,
}

export default function AnalyticsPanel() {
  const [range, setRange] = useState('30d')
  const notify = useAppStore((s) => s.notify)
  const [live, setLive] = useState<{ spent: number; tokens: number; sessions: number } | null>(null)
  useEffect(() => {
    if (!inTauri()) return
    let active = true
    Promise.all([usageSnapshot(), sessionTotals()]).then(([snapshot, totals]) => {
      if (active) setLive({
        spent: snapshot.byKey.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
        tokens: snapshot.total.tokensIn + snapshot.total.tokensOut,
        sessions: totals.length,
      })
    }).catch(() => { if (active) setLive({ spent: 0, tokens: 0, sessions: 0 }) })
    return () => { active = false }
  }, [])

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-orange-400" />
          <h2 className="text-sm font-semibold text-foreground">Analytics</h2>
          <Badge variant="secondary" className="text-[9px]">token &amp; cost</Badge>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList className="h-7">
            <TabsTrigger value="today" className="text-xs">Today</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">7d</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">30d</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">All time</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
        <motion.div
          key={range}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          className="space-y-4 p-4"
        >
          {inTauri() ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-4 text-xs text-muted-foreground">
              {live ? `Live ledger: $${live.spent.toFixed(2)} · ${live.tokens.toLocaleString()} tokens · ${live.sessions} sessions.` : 'Loading live analytics from the encrypted usage ledger…'}
            </div>
          ) : (
          <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KPIS.map((k) => {
              const Icon = k.icon
              return (
                <div key={k.label} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    {k.label}
                  </div>
                  <div className={cn('mt-1 font-mono text-xl font-semibold', k.tone)}>{k.value}</div>
                </div>
              )
            })}
          </div>

          {/* Main area chart */}
          <ChartCard
            title="Daily spend"
            subtitle="last 30 days · USD"
            right={<span className="font-mono text-xs text-orange-300">$5.42 total</span>}
          >
            <div className="chart-crossfade h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SPEND_30D} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(25 95% 53%)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(25 95% 53%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }} tickLine={false} axisLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip cursor={{ stroke: 'hsl(25 95% 53%)', strokeWidth: 1 }} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="spend" stroke="hsl(25 95% 53%)" strokeWidth={2} fill="url(#spendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Second row: tokens by model + cost donut */}
          <div className="grid gap-3 lg:grid-cols-2">
            <ChartCard title="Tokens by model" subtitle="last 30 days · K">
              <div className="chart-crossfade h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={TOKENS_BY_MODEL} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                    <XAxis dataKey="model" tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(240 5% 55%)' }} tickLine={false} axisLine={false} width={28} />
                    <Tooltip cursor={{ fill: 'hsl(25 95% 53% / 0.1)' }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="tokens" fill="hsl(25 95% 53%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Cost by category" subtitle="share of spend">
              <div className="flex items-center gap-2">
                <div className="h-32 w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={COST_BY_CATEGORY} dataKey="value" nameKey="name" innerRadius={28} outerRadius={56} paddingAngle={2} stroke="none">
                        {COST_BY_CATEGORY.map((e, i) => (
                          <Cell key={i} fill={e.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1">
                  {COST_BY_CATEGORY.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-[11px]">
                      <span className="inline-block size-2.5 rounded-sm" style={{ background: c.color }} />
                      <span className="flex-1 text-foreground/80">{c.name}</span>
                      <span className="font-mono text-muted-foreground">${c.value.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>
          </div>

          </>
          )}
          <SessionsTable />
          {!inTauri() && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ModelLeaderboard />
              <AgentBreakdown />
            </div>
          )}
        </motion.div>
        </AnimatePresence>
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-card px-4 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          <Coins className="mr-1 inline h-3 w-3" />
          {inTauri() ? 'pricing metadata unavailable until the live provider registry responds' : 'preview pricing metadata'}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => notify(inTauri() ? 'CSV export is not connected to the live ledger yet' : 'Exporting preview sessions.csv — 10 rows')}
        >
          Export CSV
        </Button>
      </footer>
    </div>
  )
}
