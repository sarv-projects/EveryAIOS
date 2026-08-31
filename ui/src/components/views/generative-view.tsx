'use client'

// P11.5.11 (H25) — generative UI view. The surface agent-emitted UI lands on:
// sandboxed HTML artifacts (Anthropic Artifacts pattern), token-cheap JSON
// descriptors rendered as local components, make-live artifact cards with
// version selectors, and inline Mermaid. In preview the view shows a demo
// bundle so the surface is explorable; live events arrive over the AG-UI /
// artifact channel from the coordinator.

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { inTauri } from '@/lib/tauri'
import {
  ArtifactCard,
  DescriptorRenderer,
  MermaidBlock,
  SandboxedArtifact,
} from '@/components/views/generative/generative-ui'

const DEMO_HTML = `
<h2>Quarterly review</h2>
<table>
  <tr><th>Metric</th><th>Q2</th><th>Q3</th></tr>
  <tr><td>Revenue</td><td>1.2M</td><td>1.8M</td></tr>
  <tr><td>Users</td><td>42K</td><td>71K</td></tr>
</table>
<p><b>Note:</b> rendered in the sandbox — no scripts, no network.</p>
`

const DEMO_MERMAID = `flowchart LR
  A[User prompt] --> B{Intent}
  B -- edit --> C[Edit handler]
  B -- ask --> D[Ask handler]
  B -- terminal --> E[Shell handler]
  C --> F[LSP + lint reflection]
  D --> G[Memory retrieval]
  E --> H[Execute + verify]
  F --> I[Guard-2 ticket]
  H --> I
  G --> I
  I --> J[Audit receipt]`

export default function GenerativeView() {
  const [tab, setTab] = useState<'demo' | 'empty'>(() => (inTauri() ? 'empty' : 'demo'))

  return (
    <div className="scroll-thin h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-foreground">Generative UI</span>
        <Badge variant="secondary" className="text-[9px]">agent-emitted surfaces</Badge>
        {!inTauri() && <div className="ml-auto flex gap-1">
          {(['demo', 'empty'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? 'rounded border border-orange-500/50 bg-orange-500/10 px-2 py-0.5 text-[9px] text-orange-300'
                  : 'rounded border border-border bg-background/40 px-2 py-0.5 text-[9px] text-muted-foreground hover:text-foreground'
              }
            >
              {t === 'demo' ? 'Demo bundle' : 'Empty state'}
            </button>
          ))}
        </div>}
      </div>

      {tab === 'empty' || inTauri() ? (
        <div className="rounded-lg border border-dashed border-border/60 p-8 text-center">
          <p className="font-mono text-[11px] text-muted-foreground">
            No live artifacts yet. Agent-emitted HTML / descriptors / Mermaid
            render here as they arrive.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Sandboxed HTML artifact (strict CSP)
            </div>
            <SandboxedArtifact html={DEMO_HTML} title="quarterly-review.html" />
          </section>

          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Inline live Mermaid
            </div>
            <MermaidBlock source={DEMO_MERMAID} title="Intent routing" />
          </section>

          <section className="enter-surface">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Token-cheap descriptor renderer
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <DescriptorRenderer d={{ type: 'metric', label: 'Tokens saved', value: '38%', delta: '+12% vs last week' }} />
              <DescriptorRenderer d={{ type: 'chart', kind: 'bar', labels: ['M', 'T', 'W', 'T', 'F'], series: [12, 19, 15, 27, 22] }} />
              <DescriptorRenderer d={{ type: 'table', columns: ['Task', 'Status'], rows: [['auth', 'done'], ['search', 'in progress'], ['docs', 'pending']], title: 'Sprint board' }} />
              <DescriptorRenderer d={{ type: 'list', title: 'Suggested next steps', items: ['Run the test suite', 'Review the auth diff', 'Ship the docs chapter'] }} />
            </div>
          </section>

          <section className="enter-surface">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Artifact card — make-live with version selector
            </div>
            <ArtifactCard
              versions={[
                { id: 'v1', label: 'v1', descriptor: { type: 'html', html: '<h2>Draft summary</h2><p>First version.</p>' } },
                { id: 'v2', label: 'v2', descriptor: { type: 'html', html: '<h2>Final summary</h2><p>Second version with the corrected numbers.</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>' } },
                { id: 'v3', label: 'v3', descriptor: { type: 'metric', label: 'Final', value: '✓ approved' } },
              ]}
            />
          </section>
        </div>
      )}
    </div>
  )
}
