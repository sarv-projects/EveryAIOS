# 46 — Aider + Devin Cloud Deep Dive

> **Date:** 2026-08-08  
> **Repos:** Aider-AI/aider (48K⭐, Apache-2.0, Python), Devin Cloud (proprietary, Cognition AI)  
> **Purpose:** Code-level feature extraction for EveryAIOS steal/adapt/refer decisions  
> **Cross-refs:** Verified distinct from Hermes (doc 02), OpenCode (doc 05/38), pi (doc 05)

---

## 1. Aider-AI/aider — 48K⭐, Apache-2.0, Python

### 1.1 What It Is
Terminal-based AI pair programming agent. Edits real files in real git repos. 88% self-written. 15B tokens/week processed. 13,138 commits. SOTA on coding benchmarks.

### 1.2 Architecture
```
User (CLI / Voice / File Watcher / Clipboard)
  → main.py (config loading: .aider.conf.yml, .env, CLI args)
    → Coder (base_coder.py — central orchestrator)
      → Model (litellm, 100+ providers)  <!-- rechecked: doc 51 -->
      → RepoMap (tree-sitter + PageRank)
      → GitRepo (gitpython, auto-commits)
      → Commands (slash commands)
      → ChatSummary (recursive compaction)
      → Linter (tree-sitter + custom)
```

### 1.3 Key Source Files
- `aider/coders/base_coder.py` — 2000+ lines, central orchestrator
- `aider/repomap.py` — 700+ lines, tree-sitter + NetworkX PageRank
- `aider/models.py` — 900+ lines, Model class + litellm + aliases
- `aider/coders/editblock_coder.py` — SEARCH/REPLACE with fuzzy matching
- `aider/coders/architect_coder.py` — Two-pass reasoning→editing
- `aider/watch.py` — File watcher + AI comment detection
- `aider/linter.py` — tree-sitter syntax + custom lint commands
- `aider/history.py` — Recursive split-and-summarize
- `aider/voice.py` — Whisper transcription
- `aider/scrape.py` — Playwright/httpx dual-strategy

### 1.4 Feature Breakdown

#### RepoMap (tree-sitter + PageRank) — UNIQUE TO AIDER
1. Walk project files (respect .gitignore)
2. Extract tags via tree-sitter (definitions + references) across 130+ languages
3. Cache in SQLite via diskcache (keyed by file mtime)
4. Build NetworkX MultiDiGraph: file nodes + symbol edges
5. Personalize PageRank with: files in chat context (boost) + mentioned identifiers (boost)
6. Binary search: render top-N files as tree until fits in token_budget
7. Output: hierarchical tree with relevant symbols

#### Edit Strategy Pattern — ~9 FORMATS <!-- rechecked: whole/diff/diff-fenced/udiff/udiff-simple/patch + editor-diff/editor-whole/architect (doc 51) -->
| Format | Class | Use Case |
|--------|-------|----------|
| diff | EditBlockCoder | SEARCH/REPLACE blocks (primary) |
| whole | WholeFileCoder | Complete file rewrites |
| udiff | UnifiedDiffCoder | Git-style patches |
| patch | PatchCoder | V4A with ADD/DELETE/UPDATE |
| architect | ArchitectCoder | Two-pass reasoning→editing |
| func | SingleWholeFileFunctionCoder | Tool-calling models |

#### SEARCH/REPLACE Fuzzy Matching
1. Perfect match (exact line-by-line)
2. Whitespace flexible (handles LLM ignoring indentation)
3. Ellipsis expansion (... placeholders for elided code)
4. On failure: error message fed back to LLM for self-correction

#### Architect Mode (82.7% — aider-reported, doc 51)
1. User sends coding request
2. Route to Architect model (expensive: o3, opus, R1)
3. Architect outputs NL solution description
4. Spawn Editor sub-agent with cheap model (sonnet, gpt-4o-mini)
5. Editor produces actual file edits
6. Apply, lint, reflect if needed

#### Three-Tier Model System
- **Main**: primary code editing (default gpt-4o)
- **Weak**: cheap tasks — commit messages, summarization (gpt-4o-mini)
- **Editor**: specialized for architect mode implementation
- Runtime switchable via /model, /weak-model, /editor-model

#### File Watcher + AI Comments
- Daemon thread via `watchfiles`
- Detects markers: `# ai!`, `// ai?`, `-- ai`, `; ai`
- On detection: tree-sitter context extraction around comment → submit as prompt
- Gitignore-aware, size limits, binary detection

#### Lint/Test Reflection Loop
1. Apply edits → run lint (tree-sitter syntax + custom + flake8)
2. If errors: feed back as message → LLM self-corrects
3. Up to max_reflections (default 3)
4. Also runs test suite if --auto-test configured

#### Chat Summarization (Recursive Split)
1. Split messages into head/tail
2. Summarize head via weak model
3. Check token fit, recurse if needed
4. Keep recent messages verbatim

#### MODEL_ALIASES
```python
"sonnet" → "claude-sonnet-4-6"
"opus" → "claude-opus-4-7"
"deepseek" → "deepseek/deepseek-chat"
"gemini" → "gemini/gemini-3-pro-preview"
```

#### Git Integration
- Auto-commits every change with LLM-generated Conventional Commit messages
- Co-authored-by trailer (human + AI attribution)
- /undo safely reverts only aider-initiated commits (tracked hash set)
- .aiderignore files

---

## 2. Devin Cloud — Proprietary, Cognition AI

### 2.1 What It Is
Autonomous cloud AI software engineer. Runs in sandboxed cloud VMs. Takes NL task → returns finished PR. Model-agnostic (routes across Anthropic/OpenAI/Google/Cognition). Acquired Windsurf → renamed to Devin Desktop.

### 2.2 Product Family
- **Devin Cloud**: Parallel agents in secure cloud VMs
- **Devin Desktop**: IDE (formerly Windsurf) with cloud handoff
- **Devin CLI**: Terminal agent, `/handoff` to cloud
- **Devin Review**: AI PR review platform
- **Devin Windows VM**: Windows desktop computer-use

### 2.3 UI/UX Architecture

#### Main App Sidebar
- Sessions (list with child-session indentation)
- Ask (quick codebase Q&A)
- Wiki (DeepWiki auto-docs)
- Review (PR review interface)
- Automations (event-driven workflows)

#### Session Workspace — 4 Tabs
1. **Progress**: Unified timeline (shell + code + browser), clickable steps
2. **Shell**: Full terminal, command history panel, time-travel, copy output, toggle read/write
3. **IDE**: Full VSCode in browser, real-time watching, Cmd+K/Cmd+I, take-over/resume flow
4. **Desktop**: Interactive browser/desktop, solve CAPTCHAs, test apps, cookie persistence

#### Takeover/Resume Flow
1. Click "Stop" → agent pauses
2. User gets full IDE/terminal control
3. Make edits, run commands
4. Click "Resume" → must tell Devin what you changed
5. Devin continues with your context

#### PR Review Screen
- Smart diff grouping (logical, not alphabetical)
- Copy/move detection (shows only actual changes)
- Bug Catcher sidebar: Bugs (severe/non-severe), Flags (investigate/info), Security (critical/warning with CWE)
- Codebase-aware chat (ask questions about PR)
- Code changes from chat → apply as commit
- PR actions: Merge/Close/Draft/Auto-merge
- Stacked PRs: per-layer diffs, stack merge
- Auto-fix: generates code fixes for bugs, user reviews + applies
- ACU size pills (XS/S/M/L/XL) with cost hover

### 2.4 Key Features

#### Knowledge System
- Trigger-based recall (Devin auto-retrieves when relevant)
- Content: instructions, tips, conventions
- Macros: `!deploy-checklist` shortcuts in prompts
- Repo-pinning: none / specific repo / all repos
- Folders: nested hierarchy, bulk enable/disable
- Auto-suggestions: Devin proposes knowledge from chat feedback
- Enterprise: org-level vs enterprise-level, promotion flow

#### Automations (Event-Driven Workflows)
- **Trigger sources**: Slack, GitHub, Linear, Schedule (cron/one-time), Webhook
- **Actions**: Start session, Message session, Triage (monitor), Email notification
- **Conditions**: Filters to narrow triggers
- **Limits**: ACU cap per session, invocation cap per time window, network policy (host allowlist)
- **Templates**: 25+ pre-built (CI fixer, bug triage, weekly deps, security scan, etc.)
- **NL creation**: Describe what you want → Devin generates config
- **Activity monitoring**: Sparkline charts, invocation history, success/failure logs

#### Playbooks
- Reusable instruction templates
- Reference via @playbook-name in prompts
- Shared across org

#### AGENTS.md / Instruction Files
- Respects: REVIEW.md, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, .cursorrules, .windsurfrules, *.rules, *.mdc
- Scoped to directories (files in .agents/ apply to parent)
- Custom review rules configurable

#### Devin Review
- Auto-review on PR open / push / ready
- Smart diff organization (logical grouping)
- Bug catcher with severity + CWE security scan
- Auto-fix (generates + applies code fixes)
- Stacked PRs (per-layer diffs, atomic stack merge)
- GitHub/GitLab compatibility (comments, approve, request changes)
- REVIEW.md for project-specific review guidelines
- CLI mode: `npx devin-review <url>` with local git worktree

#### Computer Use
- Linux VM (default)
- Windows VM (Devin Windows)
- Android
- Full desktop GUI access
- Video recordings of testing

#### MCP Marketplace
- Browse + install MCP servers
- Recommended per automation template
- Connected via Settings > Connections

#### Security Features
- Network policies per automation
- OIDC cloud auth
- Secrets & site cookies management
- Commit attribution (never impersonates user)

---

## 3. STEAL List (New for EveryAIOS)

### From Aider — Port These Algorithms/Patterns

| # | What | Implementation Detail | Maps To |
|---|------|----------------------|---------|
| S1 | **RepoMap** (tree-sitter + PageRank context selection) | New crate `everyaios-repomap`: tree-sitter-rust + petgraph PageRank + SQLite tag cache + binary-search budget fitting | Forge (I1), Agent context generation |
| S2 | **Edit Strategy Pattern** (per-model format selection) | Strategy trait in sidecar: SEARCH/REPLACE + udiff + whole + patch. Match format to model via config. | Agent loop edit dispatch |
| S3 | **SEARCH/REPLACE with fuzzy matching** | Implement: perfect match → whitespace flex → ellipsis expansion → error reflection | Code editing engine |
| S4 | **Architect Mode** (reasoning→editing two-pass) | Refine B3: explicit architect/editor agent pair, different models, aider-reported 82.7% benchmark gain <!-- doc 51: no independent primary source --> | Sub-agents (B3) |
| S5 | **File Watcher + AI Comments** (`// ai!` markers) | `notify` crate watches source files, regex for AI markers, tree-sitter context, submit to agent | Watch mode (H1 extension) |
| S6 | **Lint/Test Reflection Loop** | After every edit: lint → on error feed back → retry ×3 → then test suite | Forge TDD (I4) |
| S7 | **MODEL_ALIASES** | Config map: short names → full provider/model paths | Provider UX (A6) |
| S8 | **Git commit attribution** (Co-authored-by) | Add trailer to auto-commits: `Co-authored-by: EveryAIOS <noreply@everyaios>` | Git integration |

### From Devin — Port These UX/Product Patterns

| # | What | Implementation Detail | Maps To |
|---|------|----------------------|---------|
| S9 | **Knowledge with trigger-based recall** | Knowledge items with: trigger phrase, content, macro (!name), repo-pin. Auto-retrieve when context matches. | Semantic memory (C6), Knowledge graph (C7) |
| S10 | **Progress Steps Panel** (unified timeline) | Linear step timeline in Cockpit: shell + code + browser events, clickable → details | Cockpit UI (H2) |
| S11 | **Takeover/Resume Flow** | MCQ interrupt: "Stop" → user control → "Resume" with mandatory change description | Circuit Breaker (DIAGRAMS #7) |
| S12 | **Automation Templates** (pre-built workflows) | Ship 10+ templates: daily backup, weekly deps, CI fix, security scan, release notes | Scheduled tasks (B7) |
| S13 | **NL Automation Creation** | User describes workflow in NL → agent generates trigger/action/limits config | Scheduled tasks (B7) UX |
| S14 | **MCP Marketplace UI** | Browse/install MCP servers with categories, connection status, recommended badges | Connector Hub (F7-F8) |
| S15 | **ACU/Budget Indicators** (T-shirt sizes with hover) | Show XS/S/M/L/XL cost indicators on sessions with exact token/cost hover | Token economy visibility (H10) |
| S16 | **Child Session Indentation** | Sub-agent sessions shown indented under parent in sidebar | Sub-agent UI (B3) |
| S17 | **AGENTS.md / Instruction Files** | Read repo-level instruction files (.everyaios/AGENTS.md, REVIEW.md) as system context | Blueprint system (B2) |
| S18 | **Smart Diff Grouping** (logical, not alphabetical) | Group file changes by semantic relationship when showing diffs | Git/code review UI |
| S19 | **Network Policy per sandbox** | Per-task allowlist of external hosts the sandbox can access | Guard system (J1-J3) |
| S20 | **Sparkline Activity Charts** | 30-day mini charts on automation list for quick health overview | Scheduled tasks UI (H14) |

---

## 4. ADAPT List (Take Concept, Reimplement for Desktop)

| # | What | Adaptation Needed | Maps To |
|---|------|-------------------|---------|
| A1 | Devin's **Ask mode** (quick Q&A without full session) | Lightweight chat mode in EveryAIOS: no tool dispatch, just retrieval + answer | Chat modes (H1) |
| A2 | Devin's **Playbooks** (@mentions in prompts) | Adapt as Blueprint references in prompts with variable substitution | Blueprints (B2) |
| A3 | Devin's **Auto-review** (on PR open/push) | Local git hook integration: on commit, run lint/security scan | Forge guardrails (I5) |
| A4 | Devin's **Bug Catcher** (severity + CWE) | Integrate with Guard system: security scan on code changes with CWE classification | Security (J1-J6) |
| A5 | Aider's **litellm multi-provider** | Already have BYOK key-rings — port alias/routing logic to work with vault + failover | BYOK (A1-A3) |
| A6 | Aider's **reasoning token config** | Apply per-model: thinking_tokens (Claude), reasoning_effort (OpenAI o-series), reasoning_tag (DeepSeek R1) | Provider adapter |
| A7 | Devin's **Stacked PRs** | Local git worktree management for branching experiments | Git integration (future) |

---

## 5. REFERENCE List (Study, Don't Port)

| # | What | Why Reference Only |
|---|------|-------------------|
| R1 | Devin's cloud VM execution | We're local-first |
| R2 | Devin's SaaS billing/enterprise tiers | We're open-source |
| R3 | Devin's Slack/Teams bot integration | We're desktop app, not SaaS |
| R4 | Aider's Streamlit GUI | We have Tauri desktop |
| R5 | Aider's Polyglot benchmarking | Good reference for building our own eval |
| R6 | Aider's clipboard/copy-paste mode | We have native chat |
| R7 | Devin's DeepWiki (auto-docs) | Interesting but separate product |
| R8 | Devin's Data Analyst Agent | Niche feature |
| R9 | Aider's voice (basic Whisper) | Our spec already has better TTS plan |

---

## 6. Distinctness Verification

### Confirmed: Aider features are NOT duplicates of Hermes/OpenCode

| Aider Feature | Hermes? | OpenCode? | Truly distinct? |
|---------------|---------|-----------|-----------------|
| RepoMap (PageRank) | ❌ | ❌ (LSP only) | ✅ YES |
| Edit strategy pattern (~9 formats) | ❌ | ⚠️ (basic edit/patch) | ✅ YES (fuzzy matching unique) |
| Architect mode (two-model) | ❌ | ⚠️ (Plan agent read-only) | ✅ YES (produces edits) |
| File watcher + AI comments | ❌ | ❌ | ✅ YES |
| Lint/test reflection loop | ❌ | ❌ | ✅ YES |
| MODEL_ALIASES | ❌ | ⚠️ (different pattern) | ✅ YES |
| Git Co-authored-by | ❌ | ❌ | ✅ YES |

### Confirmed: Devin features are NOT duplicates of existing research

| Devin Feature | Already in docs? | Truly new? |
|---------------|-----------------|------------|
| Knowledge trigger-based recall | ❌ (closest: Hermes skills) | ✅ YES (trigger+macro+pin is unique UX) |
| Progress steps panel | ❌ | ✅ YES |
| Takeover/resume flow | ⚠️ MCQ interrupt exists in design | Refines existing |
| Automation templates | ❌ | ✅ YES (UX pattern) |
| NL automation creation | ❌ | ✅ YES |
| Smart diff grouping | ❌ | ✅ YES |
| Network policy per sandbox | ⚠️ Guard exists | Adds per-task granularity |
| ACU/budget indicators (T-shirt) | ❌ | ✅ YES (UX pattern) |
| AGENTS.md instruction files | ⚠️ OpenClaw AGENTS.md in doc 03 | Validates existing |

---

## 7. Updated Master Repo Count

After this document:
- **Repo #160**: Aider-AI/aider — 48K⭐, Apache-2.0, Python — **STEAL**
- **Devin Cloud**: Proprietary (not a repo to clone, but UX/product patterns to steal)
- **Total tracked repos**: 160 + Devin product reference

---

## 8. Batch 4-10 Verification Summary (All 160 repos confirmed)

> Verified 2026-08-08 via live GitHub fetches across all 10 priority batches.

### Key Star Count Updates (vs earlier research)
| Repo | Earlier Count | Verified Count | Delta |
|------|--------------|----------------|-------|
| OpenClaw | ~385K | 385.5K | +0.5K |
| Hermes Agent | ~225K | 227.2K | +2.2K |
| anomalyco/opencode | ~194K | 194.9K | +0.9K |
| n8n | ~199K | 200K | +1K |
| AutoGPT | ~186K | 186K | = |
| ollama | ~177K | 178.1K | +1.1K |
| markitdown | ~172K | 172.4K | +0.4K |
| firecrawl | ~161K | 163.2K | +2.2K |
| open-webui | ~148K | 148.2K | +0.2K |
| claude-code | ~140K | 141K | +1K |
| tauri | ~110K | 110K | = |
| browser-use | ~108K | 108.3K | +0.3K |
| gemini-cli | ~106K | 106K | new |
| ragflow | ~87K | 87.1K | new |
| pi | ~84K | 85.5K | +1.5K |
| deer-flow | ~79K | 79.6K | +0.6K |
| RTK | ~75K | 75.2K | new |
| AFFiNE | ~71K | 71.3K | new |
| headroom | ~65K | 65.5K | new |
| mem0 | ~62K | 62.8K | new |
| MetaGPT | ~69K | 69.7K | +0.7K |
| ripgrep | ~67K | 67.1K | +0.1K |
| Open Interpreter | ~56K | 67.9K | +11.9K (Rust rewrite) |
| autogen | ~60K | 60.3K | = (⚠️ maintenance mode) |
| litellm | ~55K | 55.9K | +0.9K |
| crewAI | ~56K | 56.8K | +0.8K |
| Cherry Studio | ~49K | 50.1K | +1.1K |
| Strix | ~49K | 49.8K | +0.8K |
| Aider | 48K | 48K | new (doc 46) |
| Jan | ~43K | 43.9K | = |
| Vane | ~36K | 36.1K | +0.1K |
| PageIndex | ~35K | 35.1K | +0.1K |
| Reasonix | ~31K | 33K | +2K |
| googleworkspace/cli | ~30K | 30.3K | new |
| cognee | ~29K | 29.9K | +0.9K |
| graphiti | ~29K | 29.7K | +0.7K |
| composio | ~29K | 29.6K | +0.6K |
| smolagents | ~28K | 28.7K | +0.7K |
| crush | ~27K | 27.2K | +0.2K |
| letta | ~24K | 24.2K | +0.2K |
| PentAGI | ~21K | 21.7K | +0.7K |
| context-mode | ~19K | 19.7K | +0.7K |
| Agent Zero | ~18K | 18.8K | +0.8K |
| OpenFang | ~18K | 18.1K | = |

### New Repos Added (Not in Previous Research)
| Repo | Stars | Classification | Key Value |
|------|-------|---------------|----------|
| Aider-AI/aider | 48K | STEAL | RepoMap, edit strategies, architect mode |
| Devin Cloud (product) | N/A | STEAL (UI/UX) | Session tools, knowledge, automations, playbooks |

### Repos Confirmed MAINTENANCE MODE / ARCHIVED
| Repo | Status | Note |
|------|--------|------|
| microsoft/autogen | ⚠️ Maintenance | Microsoft recommends MAF (Microsoft Agent Framework) |
| opencode-ai/opencode | 📚 Archived | Moved to anomalyco/opencode (TS rewrite) |

### Classification Totals (Final)
| Category | Count | Percentage |
|----------|-------|------------|
| STEAL | 47 | 29% |
| ADAPT | 23 | 14% |
| REFERENCE | ~90 | 57% |
| **Total tracked** | **160** | 100% |

### No Redundancies Found
All 160 repos contribute distinct value. No duplicates. No repos that should be removed.