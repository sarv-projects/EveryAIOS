# Doc 72 — Batch 5: Code-Intelligence, Parallel Agents, Search Libs (2026-08-16)

**Date:** 2026-08-16 · **Method:** web-verified (GitHub + crates.io + docs), cross-checked against docs 20/23/65.
**Scope:** 10 repos — code-intelligence graphs, MCP coding toolkits, parallel-agent IDE, loop
engineering, token metering, internet access, vector/lexical search.

**One-line result:** 6 of the 10 already covered (docs 20/65 verdicts stand). 4 new findings →
**TODO P20** (2 tasks): SeekStorm embedded hybrid index (STEAL), Superset worktree-per-agent
parallel orchestration (ADAPT). Agent-Reach + Qdrant Edge are references only.

---

## 1. New verdicts

### 🔴 SeekStorm/SeekStorm — STEAL (embedded hybrid vector+lexical index)
Apache-2.0, pure Rust, **in-process library** + multi-tenancy server. v3.0 (2026) = vector +
lexical **under one roof** with an 8-mode query planner; sub-millisecond; field filtering,
real-time indexing. This is the exact "SeekStorm-pattern hybrid search as embedded lib" already
queued in doc 65 for **P5.1 multi-signal fusion + P5.7** (we currently do BM25 + RRF by hand).
**Action (P20-1):** evaluate `seekstorm` as the embedded hybrid index for `everyaios-memory`
(replacing/upgrading the hand-rolled BM25+RRF) — it is Apache-2.0, embeddable, and removes the
BM25+vector glue we wrote. Keep sqlite-vec as the optional embedding path (doc 34).

### 🟡 superset-sh/superset — ADAPT (worktree-per-agent parallel orchestration)
Agentic IDE to orchestrate **100+ coding agents in parallel**: runs any CLI agent (Claude Code,
Codex, …) **each in an isolated git worktree**, with built-in terminal, review, and
open-in-editor; **bring your own subscription**; macOS CLI/TUI. This is precisely our
**B3/B4 worktree isolation (P17) + H2 Kanban-of-agents + F12 ACP harness-driving** — validation,
not a new capability. The only new delta: **"review + open-in-editor"** per task (a worktree diff
→ review → open in editor flow), which maps to our Diff view + Code view + "Open in Cursor".
**Action (P20-2):** fold "worktree-per-agent + review/open-in-editor" into the existing P17
worktree-isolation + parallel-multiplexing tasks — no new row.

### 🟢 Panniantong/Agent-Reach (38K★) — REFERENCE (per-platform read/search CLI)
Python CLI: "read & search Twitter, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu — one CLI,
zero API fees" (scrapes directly, no keys). Overlaps our G8 tiered search + browser scraping
(doc 06/52) but is Python + platform-specific. It **validates the web-search/fetch capability**
and the "zero API fee" direct-scrape tier; not a steal (our Rust CDP + slim-snapshot stack is
broader and guard-gated). **Action:** none (note in G8/`web_search` capability).

### 🟢 Qdrant Edge — REFERENCE (embedded vector alt; sqlite-vec stays default)
Lightweight, **in-process** embedded vector engine (clean-slate, minimal memory, no background
service). Valid alternative to full Qdrant for the C5 optional embedding path. **Decision stands:
sqlite-vec is the default** (doc 34 — lighter, no separate engine); Qdrant Edge is the
higher-scale alternative if on-device vector volume grows. **Action:** none.

---

## 2. Already covered (verdicts stand)

| Repo | Prior doc | Verdict |
|---|---|---|
| tirth8205/code-review-graph | 65 | STEAL → I7 persistent graph + git-diff rebuild (P13) |
| oraios/serena | 65 | STEAL → I11 symbol-editing (P13) |
| cobusgreyling/loop-engineering | 65 | STEAL → P6 loop-pattern registry (P13) |
| getagentseal/codeburn | 65 | STEAL → A9 usage-parser + J11 efficiency (P13) |
| xerj-org/xerj | 65 | REF — autoindex token-efficiency |
| qdrant/qdrant | 20 | REF — vector DB (server) |

---

## 3. Net action

**TODO P20 (batch-5 queue, 2 tasks):**
1. SeekStorm embedded hybrid index → `everyaios-memory` (P5.1/P5.7; Apache-2.0, replaces hand-rolled BM25+RRF).
2. Superset worktree-per-agent + review/open-in-editor → fold into P17 (B3/B4 + H2).

**Ledger:** unchanged **281 repos** (superset + Agent-Reach + SeekStorm + Qdrant Edge already in
the 281 via docs 20/21/23/65; this pass adds no new live repos).
