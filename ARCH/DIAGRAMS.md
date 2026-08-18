# EveryAIOS — Architecture & Flow Diagrams (Mermaid)

> **Generated:** 2026-08-09 · **Spec version:** v3.16 · **Diagrams:** 24
> **Purpose:** Every major system flow visualized. Render with any Mermaid-compatible viewer.
> **Surgical hierarchy (doc 52 §1):** the harness-driving diagrams compose external agent CLIs as **brain → core → surgeon** workers via ACP (J17/F12) — Aider-class precision editors included in the harness list. Storage-intelligence flows (D9–D12) and the tiered search cascade (G8) are described in docs 49/52.

---

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph UI["UI LAYER — Tauri 2 Window (React SPA, ARCH/12)"]
        Sidebar[Sidebar<br/>Nav + Sessions + Status]
        Chat[Chat + Artifacts + Progress Steps]
        Cockpit[Cockpit / Flight Deck]
        Workspace[Workspace Panel<br/>Shell/Code/Browser/Excel/Word/PPT/PDF]
        Office[Office Editors<br/>docx/xlsx/pptx/pdf]
        Perms[Permission Cards + Guard UI]
        Analytics[Token/Cost Analytics]
        AutoBuilder[Automation Builder]
        KnowledgeUI[Knowledge Browser]
        Tray[Tray Daemon]
    end

    subgraph RustCore["RUST CORE — everyaios-core binary"]
        EosCDP[everyaios-cdp<br/>CDP Client]
        EosBrowser[everyaios-browser<br/>Snapshot/Diff/Refs]
        EosScript[everyaios-script<br/>rquickjs Sandbox]
        EosGuard[everyaios-guard<br/>Guard-1 + Guard-2]
        EosAudit[everyaios-audit<br/>NDJSON + Replay]
        EosMCP[everyaios-mcp<br/>MCP Server]
        EosVault[everyaios-vault<br/>SQLCipher Keys]
        EosIPC[everyaios-ipc<br/>JSON-RPC Framing]
        Supervisor[ProcessSupervisor]
    end

    subgraph Sidecar["TS SIDECAR — coordinator (Bun compiled)"]
        Engine[core-engine<br/>3-stage loop]
        Memory[core-memory<br/>7 algorithms]
        Files[core-files<br/>RAG + embeddings]
        Connectors[core-connectors<br/>Hub routing]
        Search[core-search<br/>Cascade + research]
        Auto[core-automations<br/>Crystallization]
        Providers[core-providers<br/>BYOK clients]
        Tools[core-tools<br/>Trust Ladder]
    end

    subgraph Browser["BROWSER CHILDREN (tiered)"]
        Chrome[System Chrome/Edge]
        Lightpanda[Lightpanda ~16× less mem (vendor benchmark)]
        Obscura[Obscura ~30MB (opt-in)]
        Stealth[Fortress/Camoufox]
    end

    subgraph Storage["LOCAL STORAGE"]
        SQLite[(SQLite<br/>app.db + memory.db)]
        LadybugDB[(Rust-native graph store<br/>(LadybugDB optional))]
        SqliteVec[(sqlite-vec<br/>Vectors)]
        Vault[(SQLCipher<br/>vault.db)]
    end

    UI -->|Tauri Commands + Events| RustCore
    RustCore -->|stdio JSON-RPC<br/>length-prefixed| Sidecar
    RustCore -->|CDP WebSocket<br/>loopback| Browser
    Sidecar --> Storage
    RustCore --> Storage
    EosVault --> Vault
    Supervisor -->|spawn/kill/restart| Sidecar
    Supervisor -->|spawn/kill| Browser
```


---

## 2. Agent Turn Lifecycle

```mermaid
sequenceDiagram
    participant U as User/UI
    participant R as Rust Core (everyaios-core)
    participant S as Sidecar (coordinator)
    participant V as everyaios-vault
    participant G as everyaios-guard
    participant A as everyaios-audit
    participant LLM as LLM Provider
    participant T as Tool (browser/file/connector)

    U->>R: Send prompt (Tauri command)
    R->>S: agent.start(prompt) [JSON-RPC]
    S->>S: Load blueprint + agent config
    S->>S: Token budget check (ARCH/05)
    S->>S: Memory retrieval (C3 fusion)
    S->>S: Inject warm set (Phantom Thread)
    S->>V: Request stream (provider, model, session) [JSON-RPC]
    V->>V: Resolve key (ring lookup, failover, budget)
    V->>LLM: Stream request (key injected in Rust — sidecar never sees it)
    LLM-->>V: SSE chunks
    V-->>S: streamed chunks (length-prefixed IPC)
    
    loop Tool Loop (≤5 rounds + final guard)
        LLM-->>S: Tool call (streaming)
        S->>S: Grammar extraction (B5/GBNF)
        S->>G: Permission check (tool, args, path)
        G->>G: Guard-1 regex scan
        alt Escalated action
            G->>R: Request Guard-2 diff card
            R->>U: Show native approval dialog
            U-->>R: Approve/Deny
            R-->>G: Decision
        end
        G-->>S: allow/deny ticket
        alt Allowed
            S->>T: Execute tool
            T-->>S: Result
            S->>A: Audit row (tool, args_hash, duration, tokens)
            S->>S: Snip result if >budget (ARCH/05)
            S->>LLM: Feed result, continue
        else Denied
            S->>LLM: Feed "blocked by policy" message
        end
    end

    LLM-->>S: Final response (stream complete)
    S->>S: Risk compass score
    S->>S: Memory write (turn boundary checkpoint)
    S->>A: Session audit commit
    S->>R: agent.turn_complete(response)
    R->>U: Stream to UI
```


---

## 3. BYOK Key-Ring Resolution & Failover

```mermaid
flowchart TD
    A[Sidecar requests key<br/>provider + model + session_id] --> B{Drop keys in<br/>cooldown/suspended/capped?}
    B -->|remaining keys| C{Apply routing policy}
    C -->|priority| D[Sort by status order + weight]
    C -->|round-robin| E[Sort by LRU last_used]
    C -->|least-used| F[Sort by tokens_day ascending]
    D --> G{Model filter<br/>excludes requested model?}
    E --> G
    F --> G
    G -->|yes, skip| C
    G -->|no| H[Return key_id + sealed handle<br/>raw key injected by vault fetch layer]
    H --> I[Make LLM API call]
    I -->|200 OK| J[success_count++ / update usage]
    I -->|429| K[Set cooldown = cooldown_s × 2^failures<br/>cap 5min]
    I -->|401/403| L[Suspend key + alert user<br/>likely revoked]
    I -->|5xx/timeout| M[Backoff + retry]
    K --> N{switches < max_429_switches?}
    L --> N
    M --> N
    N -->|yes| C
    N -->|no, all exhausted| O[Surface aggregated error<br/>offer 'retry in Ns']

    style H fill:#2d6,stroke:#333
    style O fill:#d33,stroke:#333
```


---

## 4. Memory Retrieval Pipeline (Multi-Signal Fusion C3)

```mermaid
flowchart LR
    Q[User Query] --> IC[Intent Classifier<br/>memory/fact/event/document]
    IC --> S1[S1: FTS5/BM25<br/>keyword + headings 5×<br/>trigram + Porter stem]
    IC --> S2[S2: sqlite-vec<br/>bge-micro embeddings<br/>cosine similarity]
    IC --> S3[S3: Rust-native graph<br/>Spreading Activation<br/>per-hop decay + inhibition]
    IC --> S4[S4: Temporal Recency<br/>graphiti-style edge timestamps]
    
    S1 --> Fuse[Score Fusion<br/>weighted RRF<br/>mem0-style single score]
    S2 --> Fuse
    S3 --> Fuse
    S4 --> Fuse
    
    Fuse --> Dedup[Deduplicate + Smart Snippets]
    Dedup --> Budget[Budget Cap<br/>≤600 tok warm set<br/>≤2K per source type]
    Budget --> Inject[Inject into context<br/>wrapped in delimiters]
    
    subgraph Filters
        Scope[Multi-scope filter<br/>user/agent/session/project]
        Tombstone[Exclude tombstoned<br/>ghost context prevention]
        Polarity[Polarity filter<br/>defensive vs normal recall]
    end
    
    Fuse -.-> Filters
    Filters -.-> Dedup
```


---

## 5. Browser Tier Escalation

```mermaid
flowchart TD
    Task[Browser Task Arrives] --> T0{Tier 0: Static OK?<br/>No JS needed?}
    T0 -->|yes| Static[reqwest + markitdown<br/>0 browser overhead]
    T0 -->|no, needs JS| T1{Tier 1: Lightweight?<br/>No login/WebGL needed?}
    T1 -->|yes (default)| LP[Lightpanda ~16× less mem (vendor benchmark)<br/>Zig, AGPL spawn-only]
    T1 -->|opt-in| Obscura[Obscura ~30MB RSS<br/>V8 + CDP + stealth-lite]
    T1 -->|no, needs auth/WebGL| T2[Tier 2: System Chrome/Edge<br/>full browser via CDP]
    T2 --> Check{Challenge/block<br/>detected?}
    Check -->|no| Done[Execute task]
    Check -->|yes| T3{Tier 3: Stealth needed?}
    T3 -->|Firefox stealth| Camoufox[Camoufox<br/>Playwright/Juggler]
    T3 -->|Chromium stealth, open| Fortress[Fortress<br/>CDP native, open-source]
    T3 -->|Chromium stealth, closed| Cloak[CloakBrowser<br/>⚠️ proprietary binary]
    
    Static --> Result[Return to sidecar]
    Obscura --> Result
    LP --> Result
    Done --> Result
    Camoufox --> Result
    Fortress --> Result
    Cloak --> Result

    style Cloak fill:#f99,stroke:#900
    style Fortress fill:#9f9,stroke:#090
```


---

## 6. Security Gate Pipeline

```mermaid
flowchart TD
    Input[LLM emits tool call<br/>or generated shell command] --> TL{Trust Ladder<br/>score check}
    TL -->|score < threshold<br/>for this action type| Block1[BLOCKED: insufficient trust]
    TL -->|score OK| G1[Guard-1: Regex Interceptor<br/>compiled RegexSet scan]
    G1 -->|matches blocklist<br/>rm -rf, mkfs, etc.| Block2[BLOCKED: Guard-1 pattern match<br/>+ audit log + UI card]
    G1 -->|clean| PF[Path Floor Check<br/>canonicalize + symlink resolve]
    PF -->|outside granted roots| Block3[BLOCKED: path boundary violation]
    PF -->|inside workspace| Risk{Risk classification<br/>0-100}
    Risk -->|0-30: read-only/search| Auto[AUTO-APPROVE<br/>execute immediately]
    Risk -->|31-70: workspace write| Toast[Execute + ambient toast<br/>5s undo buffer]
    Risk -->|71-100: destructive/external| G2[Guard-2: Native Diff Card<br/>Tauri IPC → OS dialog]
    G2 -->|user clicks Approve| Exec[Execute in sandbox]
    G2 -->|user clicks Deny| Block4[BLOCKED: user denied]
    Auto --> Sandbox[Execution Environment]
    Toast --> Sandbox
    Exec --> Sandbox
    Sandbox --> Audit[everyaios-audit: append row<br/>tool, args_hash, result_meta,<br/>trace_id, span_id, duration]

    style Block1 fill:#f66,stroke:#900
    style Block2 fill:#f66,stroke:#900
    style Block3 fill:#f66,stroke:#900
    style Block4 fill:#f99,stroke:#900
    style Auto fill:#6f6,stroke:#090
```


---

## 7. Circuit Breaker + MCQ Interrupt + DAG Resume

```mermaid
stateDiagram-v2
    [*] --> Planning: User submits goal
    Planning --> TaskDAG: Planner decomposes into DAG
    TaskDAG --> Executing: Begin first pending task
    
    state Executing {
        [*] --> RunTask
        RunTask --> CheckBudget: after each tool call
        CheckBudget --> RunTask: within budget
        CheckBudget --> LoopDetect: check N-gram hash
        LoopDetect --> RunTask: no loop (< 3 repeats)
        LoopDetect --> CircuitBreak: 3x same args detected
        CheckBudget --> CircuitBreak: $ limit exceeded
        CheckBudget --> CircuitBreak: timeout exceeded
        RunTask --> TaskSuccess: tool returns success
        RunTask --> CircuitBreak: unrecoverable error
    }
    
    TaskSuccess --> NextTask: mark task SUCCESS,<br/>advance DAG pointer
    NextTask --> Executing: next pending task exists
    NextTask --> AllDone: no more tasks
    AllDone --> [*]: return final result

    CircuitBreak --> FreezeState: checkpoint all completed<br/>outputs to disk
    FreezeState --> MCQCard: present interrupt card to user
    
    state MCQCard {
        [*] --> ShowOptions
        ShowOptions --> OptionA: Skip this task & continue
        ShowOptions --> OptionB: Retry with user guidance
        ShowOptions --> OptionC: Escalate to frontier model
        ShowOptions --> OptionD: Manual override (user does it)
    }
    
    OptionA --> NextTask: mark task SKIPPED
    OptionB --> Executing: reset retry count,<br/>inject user instruction
    OptionC --> Executing: swap model for this task
    OptionD --> WaitManual: user completes action
    WaitManual --> NextTask: mark task SUCCESS
```


---

## 8. Office Edit Pipeline

```mermaid
flowchart TD
    Open[User opens .docx/.xlsx/.pptx/.pdf] --> Detect{Detect format}
    Detect -->|.docx| DocxPath
    Detect -->|.xlsx| XlsxPath
    Detect -->|.pptx| PptxPath
    Detect -->|.pdf| PdfPath
    Detect -->|.doc/.xls/.ppt| Legacy[Convert to modern format<br/>soffice --convert-to<br/>then open as read-only]

    subgraph DocxPath[Word Pipeline]
        D1[Open ZIP] --> D2[Parse structure<br/>parts index, content types, rels]
        D2 --> D3[Read target part → BLOCK TREE<br/>anchored with docxIndex]
        D3 --> D4[LLM edits PLAIN TEXT<br/>against block tree]
        D4 --> D5[Deterministic patch renderer<br/>minimal XML diff, w:t prefix/suffix]
        D5 --> D6[ZIP rewrite:<br/>modified parts only,<br/>everything else byte-copied]
    end

    subgraph XlsxPath[Excel Pipeline]
        X1[calamine: fast read] --> X2[Deterministic Planner<br/>regex NLP → workbook DSL]
        X2 -->|common ops| X3[Zero-LLM execution<br/>sort/fill/shift/sum/pivot]
        X2 -->|complex ops| X4[LLM generates formula/value]
        X3 --> X5[IronCalc recalc<br/>300+ functions, NEVER LLM-computed]
        X4 --> X5
        X5 --> X6[Surgical part-patch<br/>xl/worksheets/sheetN.xml]
    end

    subgraph PptxPath[PowerPoint Pipeline]
        P1[Parse slide parts] --> P2[Patch ppt/slides/slideN.xml<br/>text runs, bullets, shapes]
        P2 --> P3[Add/remove slides:<br/>clone part + rels + Content_Types]
    end

    subgraph PdfPath[PDF Pipeline]
        F1{Operation type?}
        F1 -->|form fill/annotate| F2[pdf-lib (AcroForms)]
        F1 -->|text replace| F3[lopdf replace_text<br/>exact-match only]
        F1 -->|structural edit| F4[Re-author from extracted content]
        F1 -->|redact| F5[Fill glyph boxes +<br/>remove text streams]
    end

    D6 --> Verify
    X6 --> Verify
    P3 --> Verify
    F2 --> Verify
    F3 --> Verify
    F4 --> Verify
    F5 --> Verify

    Verify[Verify: reopen + assertions] --> Snapshot[snapshotBefore kept<br/>for 1-click rollback]
    Snapshot --> Save[Atomic write:<br/>temp ZIP → fsync → rename]

    style Legacy fill:#ff9,stroke:#990
```


---

## 9. Token Economy / Compaction Pipeline

```mermaid
flowchart TD
    Turn[New turn arrives] --> Budget[Context Planner<br/>allocate turn budget]
    Budget --> Prefix[15% System/Persona<br/>STABLE PREFIX - never edit]
    Budget --> User[10% User intent<br/>current message - never snip]
    Budget --> RAG[40% Retrieved/RAG/memory<br/>Rule 1 budgets per source]
    Budget --> Working[35% Working set<br/>recent turns + tool results]

    Working --> Check{Total > context_window<br/>minus reserve?}
    Check -->|no| Send[Send to LLM]
    Check -->|yes| Compact[Compaction Pipeline]

    subgraph Compact[Compaction Stages]
        C1[1. SNIP before summarize<br/>tool_result_snip_ratio=0.6<br/>stale results → head/tail anchor]
        C1 --> C2[2. SOFT compact<br/>soft_compact_ratio=0.5<br/>notice-only, slow context growth]
        C2 --> C3[3. SUMMARIZE<br/>BrowserOS callSummarizer<br/>timeout + abort = fail-open<br/>findSafeSplitPoint, slidingWindow]
        C3 --> C4[4. FORCE compact<br/>compact_force_ratio=0.9<br/>high-water mark]
        C4 --> C5[5. STRUCTURAL passes<br/>Janus: tool-result dedup,<br/>regex stack-trace collapse,<br/>AST prune non-referenced lines]
    end

    Compact --> PrefixCheck{prefix_dirty flag?}
    PrefixCheck -->|clean| Send
    PrefixCheck -->|dirty: key rotation/<br/>provider switch| CacheBreak[Accept cache miss<br/>re-snapshot summary]
    CacheBreak --> Send

    Send --> Cost[Cost Ledger Update<br/>provider, model, key_id,<br/>in, out, cache_read,<br/>cache_write, cost]

    subgraph CacheEcon[Prefix-Cache Economics]
        direction LR
        DeepSeek[DeepSeek: 92-99% hit<br/>automatic, long TTL]
        Claude[Claude: 77-87% hit<br/>⚠️ 5-min TTL]
        OpenAI[OpenAI: 60-80% hit]
        Local[Local: N/A]
    end
```


---

## 10. Extension ABI Lifecycle

```mermaid
sequenceDiagram
    participant Boot as everyaios-core Boot
    participant Reg as Plugin Registry
    participant Guard as everyaios-guard (CapabilityGranter)
    participant Host as Host Facades (ctx.*)
    participant Ext as Extension Code
    participant Agent as Agent Loop

    Boot->>Reg: Scan ~/.everyaios/plugins/<br/>validate manifest.toml schema
    Reg->>Reg: Check abi_version compatibility<br/>(cumulative host adapters)
    Reg->>Reg: Register contribution points<br/>(tools/skills/connectors/search-adapter)
    Note over Reg: LAZY - code NOT loaded yet

    Agent->>Reg: Request tool from extension X
    Reg->>Reg: First use → activate extension
    Reg->>Guard: Check capabilities allow-list<br/>(manifest ∧ host grant)
    Guard->>Guard: Match args against wildcards<br/>(* / ** Zed pattern)
    
    alt Capability denied
        Guard-->>Agent: BLOCKED: capability not granted
    else Capability allowed
        Guard-->>Reg: Issue authorization ticket
        Reg->>Ext: Load extension code<br/>(rquickjs 64MB/30s sandbox)
        Ext->>Host: ctx.llm(prompt) — host-owned facade
        Host-->>Ext: LLM response (scoped)
        Ext->>Host: ctx.files.read(path) — capability-scoped
        Host->>Guard: Verify path within granted scope
        Guard-->>Host: OK
        Host-->>Ext: File content
        Ext->>Host: ctx.approval("Delete old backups?")
        Host->>Agent: Guard-2 card presented to user
        Agent-->>Host: User approves
        Host-->>Ext: Approved
        Ext-->>Reg: Return result
        Reg-->>Agent: Tool result
    end

    Note over Reg: Extension never touches<br/>vault/browser-session/audit directly
```


---

## 11. Connector Hub Routing

```mermaid
flowchart TD
    Request[Agent needs external action<br/>e.g. 'send Gmail', 'create Jira ticket'] --> Registry[Unified Tool Registry<br/>lookup ToolDefinition]
    Registry --> Route{Hub Router:<br/>which engine handles this?}

    Route -->|official MCP server exists| MCPServer[MCP Server<br/>user-supplied stdio/npx or HTTP<br/>Gmail/Slack/GitHub/Linear…]
    Route -->|direct API available| Native[Native Adapter<br/>BYO OAuth/API-key in vault<br/>direct HTTP/SDK call]
    Route -->|simple OAuth, no 3rd party| AuthBridge[Local Auth Bridge<br/>PKCE client, no secret<br/>local token manager]
    Route -->|logged-in web session exists| BrowserConn[Browser-Session Connector<br/>drive via CDP + Session Vault]

    MCPServer --> Exec[Execute + audit]
    Native --> Exec
    AuthBridge --> Exec
    BrowserConn --> Exec

    note right of Route: Connector-platform decision 2026-08-16 — MCP is the platform; Composio/Zapier/Nango aggregator tabs removed

    Exec --> Dedup{Already connected<br/>via another engine?}
    Dedup -->|yes| Skip[Skip: no double-connect]
    Dedup -->|no| Done[Return result to agent]

    style Skip fill:#ff9,stroke:#990
```


---

## 12. ACP Harness-Driving Flow

```mermaid
sequenceDiagram
    participant User as User
    participant EveryAIOS as EveryAIOS Core (ACP Client)
    participant ACP as ACP Protocol (stdio JSON-RPC)
    participant Agent as External Agent CLI<br/>(Claude Code / Codex / etc.)
    participant Guard as everyaios-guard
    participant Audit as everyaios-audit

    User->>EveryAIOS: "Run Claude Code on src/ to fix tests"
    EveryAIOS->>Agent: initialize {protocolVersion: 1,<br/>capabilities: {permissions: true}}
    Agent-->>EveryAIOS: initialize response<br/>{capabilities: {tools: true, permissions: true}}

    EveryAIOS->>Agent: session/new {workspace: "src/", task: "fix tests"}
    Agent->>ACP: session/update {type: "tool_call",<br/>tool: "edit_file", args: {...}}
    ACP->>Audit: Log tool_call to NDJSON
    
    Agent->>ACP: session/request_permission<br/>{action: "write", path: "src/utils.ts", diff: "..."}
    ACP->>Guard: Check Trust Ladder + Guard-1
    Guard->>EveryAIOS: Requires Guard-2 (score > 70)
    EveryAIOS->>User: Show diff card:<br/>"Claude Code wants to edit src/utils.ts"
    User-->>EveryAIOS: Approve
    EveryAIOS->>Agent: permission_granted
    
    Agent->>ACP: session/update {type: "file_write",<br/>path: "src/utils.ts"}
    ACP->>Audit: Log file_write

    Note over EveryAIOS,Agent: Agent continues working...<br/>All updates flow through audit

    alt Budget exceeded or timeout
        EveryAIOS->>Agent: session/cancel<br/>{reason: "budget_exceeded"}
        Agent-->>EveryAIOS: Acknowledge stop
        EveryAIOS->>Audit: Log stop_reason
    end

    Agent-->>EveryAIOS: session/complete {result: "Fixed 3 tests"}
    EveryAIOS->>User: Show result in cockpit
```


---

## 13. Process Lifecycle & Orphan Prevention

```mermaid
flowchart TD
    subgraph Boot["App Launch"]
        T[Tauri window starts<br/>< 50ms] --> RC[everyaios-core boots<br/>config, vault, SQLite]
        RC --> PreSpawn[Pre-spawn coordinator<br/>Bun compiled binary<br/>hidden, < 30ms]
        PreSpawn --> Ready[IPC handshake ready<br/>< 200ms total perceived]
    end

    subgraph Runtime["Normal Runtime"]
        Ready --> Warm[Sidecar warm<br/>5min idle before kill]
        Warm -->|user action| Active[Active: agent running]
        Active -->|idle 5min| Warm
        Warm -->|battery detected| Suppress[Suppress heavy indexing<br/>defer to AC/idle]
    end

    subgraph Crash["Crash Recovery"]
        Active -->|sidecar crash| Detect[ProcessSupervisor detects]
        Detect --> Backoff[Exponential backoff<br/>1s→2s→4s→60s cap]
        Backoff --> Respawn[Cold restart from checkpoint<br/>20-snap Hermes pattern]
        Respawn -->|< 5 crashes/10min| Active
        Respawn -->|≥ 5 crashes/10min| Circuit[Circuit breaker OPEN<br/>surface error to UI]
    end

    subgraph Orphan["Orphan Prevention (J12)"]
        direction LR
        Linux[Linux:<br/>prctl PR_SET_PDEATHSIG<br/>→ SIGTERM on parent death]
        Windows[Windows:<br/>Job Object<br/>KILL_ON_JOB_CLOSE]
        MacOS[macOS:<br/>posix_spawn process group<br/>+ 5s PID poll]
    end

    subgraph Heap["Heap Safety (J13)"]
        Active -->|heapUsed > 80% of 512MB| SelfRestart[Self-restart sidecar<br/>from last checkpoint]
        Active -->|30min session| Rotate[Forced rotation<br/>fresh sidecar]
    end
```


---

## 14. Crystallization Engine (B8 — Zero-Token Automation)

```mermaid
flowchart TD
    First[Agent completes multi-step task<br/>successfully N times] --> Detect[Crystallization detector:<br/>identify non-cognitive steps]
    Detect --> Classify{Step classification}
    Classify -->|cognitive: reasoning,<br/>judgment, creative| Keep[Keep as LLM steps]
    Classify -->|non-cognitive: waits,<br/>triggers, transforms,<br/>notifications| Compile[Compile to deterministic<br/>TS/Python script]
    Compile --> Script[Crystallized Script<br/>stored in ~/.everyaios/skills/]
    Script --> Rerun{Next time<br/>same workflow triggered}
    Rerun -->|cognitive steps| LLM[Route to LLM<br/>normal token cost]
    Rerun -->|compiled steps| Native[Execute native script<br/>0 tokens, 100× speed]
    
    Native --> Verify{Output matches<br/>expected pattern?}
    Verify -->|yes| Done[Complete — $0 cost]
    Verify -->|no, drift detected| Decrystallize[Decrystallize:<br/>fall back to LLM<br/>for this step]
```

---

## 15. Session Vault & Login Flow

```mermaid
sequenceDiagram
    participant User as User
    participant UI as Visible Webview
    participant Vault as everyaios-vault (SQLCipher)
    participant Browser as Agent Browser (CDP)
    participant Agent as Agent Loop
    participant Guard as Trust Ladder

    Note over User,Guard: PATH 1: Sign-in-in-browser (default)
    User->>UI: Logs into site (e.g., Gmail)
    UI->>Vault: Page.getCookies → seal into vault<br/>(per-site, per-account, encrypted)
    Vault-->>UI: Session stored

    Note over User,Guard: PATH 2: Session inheritance (no re-login)
    User->>Browser: Attach to user's Chrome profile<br/>via --remote-debugging-port
    Browser->>Vault: Read live sessions → store needed cookies

    Note over User,Guard: RUNTIME: Agent requests site access
    Agent->>Guard: Request: "use Gmail / work account"
    Guard->>Guard: Check Trust Ladder requirement<br/>for site + action type
    alt First time for this site
        Guard->>User: Guard-2 card: "Use Gmail / work account / read-only?"
        User-->>Guard: Approve + remember rule
    else Rule cached
        Guard-->>Agent: Auto-approved
    end
    Guard->>Vault: Issue session token for this request
    Vault->>Browser: Inject cookies into browser context<br/>(agent NEVER sees raw cookies)
    Browser-->>Agent: Authenticated page ready
    
    Note over Vault: On session end: revoke injected cookies
    Note over Vault: Rotation: 429/blocked → next account
    Note over Vault: Expiry: TTL tracking + re-auth nudge card
```


---

## 16. Ghost Context Prevention (Tombstone Eviction)

```mermaid
sequenceDiagram
    participant FS as File System
    participant Notify as notify crate (Rust)
    participant Coord as Memory Coordinator
    participant FTS as FTS5 Index
    participant Vec as sqlite-vec
    participant Graph as RustGraph

    FS->>Notify: File renamed (old → new)
    Notify->>Coord: Rename(old_path, new_path)
    
    par Atomic transaction
        Coord->>FTS: UPDATE source_path = new<br/>WHERE source_path = old
        Coord->>Vec: UPDATE source_path = new<br/>WHERE source_path = old
        Coord->>Graph: SET n.origin = new<br/>WHERE n.origin = old
    end
    Note over Coord: Rename = re-path, NOT delete+re-index<br/>Zero re-embedding cost

    FS->>Notify: File deleted (path)
    Notify->>Coord: Remove(path)
    
    par Atomic transaction
        Coord->>FTS: Mark rows tombstoned<br/>WHERE source_path = path
        Coord->>Vec: DELETE WHERE source_path = path
        Coord->>Graph: DELETE EDGE WHERE source_file = path<br/>DELETE NODE WHERE origin = path
    end
    Note over Coord: Tombstoned = excluded from ALL queries<br/>Physically purged on next compaction cycle
```

---

## 17. Scheduled Tasks & Nudge Sentinels

```mermaid
flowchart TD
    subgraph Triggers["Task Triggers (B7)"]
        Cron[Cron: "every Monday 9AM"]
        Interval[Interval: "every 4 hours"]
        Event[Event: "on git push to main"]
        Webhook[Webhook: "POST /hooks/deploy"]
        Nudge[Nudge Sentinel:<br/>agent detects repeating pattern<br/>→ suggests schedule]
    end

    Triggers --> Scheduler[everyaios-core Scheduler<br/>cron-next evaluation]
    Scheduler --> Check{Battery-aware?}
    Check -->|on battery + heavy task| Defer[Defer until AC/idle]
    Check -->|on AC or light task| Spawn[Spawn agent session]
    Spawn --> Crystallized{Task crystallized?}
    Crystallized -->|yes| Script[Run deterministic script<br/>0 tokens]
    Crystallized -->|no| Agent[Run agent loop<br/>normal token cost]
    Script --> Audit[Audit + notify user]
    Agent --> Audit
```


---

## 18. MCP Server (Stateless 2026-07-28) — Tool Serving

```mermaid
sequenceDiagram
    participant Client as External Client<br/>(Claude Code / Codex / Cursor)
    participant MCP as everyaios-mcp<br/>(Streamable HTTP endpoint)
    participant Guard as everyaios-guard
    participant Tools as Tool Executor
    participant Audit as everyaios-audit

    Note over Client,Audit: MCP 2026-07-28: STATELESS<br/>No initialize, no session-id<br/>Every request self-contained via _meta

    Client->>MCP: POST /mcp<br/>{method: "tools/list",<br/>_meta: {protocolVersion: "2026-07-28",<br/>capabilities: {...}}}
    MCP-->>Client: {tools: [...37 tools...<br/>annotations: readOnlyHint/openWorldHint]}

    Client->>MCP: POST /mcp<br/>{method: "tools/call",<br/>name: "snapshot",<br/>arguments: {tabId: "..."},<br/>_meta: {...}}
    MCP->>Guard: Permission check (readOnly tool)
    Guard-->>MCP: Auto-approved (score 0-30)
    MCP->>Tools: Execute snapshot
    Tools-->>MCP: A11y tree result
    MCP->>Audit: Log tool dispatch
    MCP-->>Client: {result: {content: [...]}}

    Client->>MCP: POST /mcp<br/>{method: "tools/call",<br/>name: "run",<br/>arguments: {script: "..."},<br/>_meta: {...}}
    MCP->>Guard: Permission check (openWorld tool)
    Guard->>Guard: Guard-1 scan script content
    Guard-->>MCP: Requires approval (score > 70)
    MCP-->>Client: SSE stream begins...<br/>{type: "approval_required",<br/>diff: "..."}
    Note over Client: Client shows approval to user
    Client->>MCP: POST /mcp (approval response)
    MCP->>Tools: Execute in rquickjs sandbox
    Tools-->>MCP: Script result
    MCP->>Audit: Log + InnerCallHook entries
    MCP-->>Client: {result: {...}}
```

---

## 19. Sub-Agent Orchestration

```mermaid
flowchart TD
    User[User goal] --> Planner[Planner Agent<br/>frontier model]
    Planner --> Blueprint[Generate/load .md blueprint<br/>decompose into sub-tasks]
    Blueprint --> Spawn{Spawn sub-agents<br/>max depth=2, concurrent=3, total=6}

    Spawn --> SA1[Sub-Agent 1: Researcher<br/>cheap model, own context]
    Spawn --> SA2[Sub-Agent 2: Coder<br/>cheap model, own workspace]
    Spawn --> SA3[Sub-Agent 3: Reviewer<br/>cheap model, peer-check]

    SA1 -->|result| Collect[Parent collects summaries<br/>children can't see each other's full context]
    SA2 -->|result| Collect
    SA3 -->|result| Collect

    Collect --> Planner
    Planner --> Final[Synthesize final response]

    subgraph Constraints["Budget Constraints (B6)"]
        C1[Parent: 500 iterations max]
        C2[Each sub: 50 iterations max]
        C3[Timeout: 900s per sub / 1800s global]
        C4[execute_code refunded]
        C5[DELEGATE_BLOCKED_TOOLS:<br/>delegate/clarify/memory/send_message/cronjob]
        C6[Loop detector: 3x same → interrupt]
    end

    SA1 -.-> Constraints
    SA2 -.-> Constraints
    SA3 -.-> Constraints
```


---

## 20. Full System Interaction (All Components Working Together)

```mermaid
flowchart TB
    subgraph UserLayer["USER"]
        Human((Human))
    end

    subgraph UILayer["UI (Tauri Webview)"]
        ChatUI[Chat]
        FlightDeck[Ambient Flight Deck]
        OfficeUI[Office Editors]
        ReplayUI[Audit/Replay]
    end

    subgraph RustLayer["RUST CORE (everyaios-core binary)"]
        direction TB
        IPC[everyaios-ipc<br/>JSON-RPC + length-prefix]
        Guard[everyaios-guard<br/>Guard-1 + Guard-2 + Trust Ladder]
        Vault[everyaios-vault<br/>SQLCipher keys + sessions]
        Audit[everyaios-audit<br/>NDJSON append-only]
        MCP[everyaios-mcp<br/>stateless HTTP server]
        CDP[everyaios-cdp<br/>browser driver]
        Script[everyaios-script<br/>rquickjs sandbox]
        Super[ProcessSupervisor<br/>spawn/kill/restart]
    end

    subgraph SidecarLayer["SIDECAR (Bun binary)"]
        direction TB
        AgentLoop[Agent Loop<br/>3-stage + tool loop]
        MemEngine[Memory Engine<br/>7 algos + fusion]
        Compaction[Compaction Pipeline<br/>snip→soft→summarize→force]
        ConnHub[Connector Hub<br/>routing engine]
        SearchEngine[Search Cascade<br/>+ deep research]
        BlueprintEngine[Blueprint Engine<br/>DAG planner]
        SkillRegistry[Skill Registry<br/>~/.everyaios/skills/]
    end

    subgraph BrowserLayer["BROWSERS (tiered)"]
        Obscura[Obscura 30MB]
        Chrome[System Chrome]
        Stealth[Fortress/Camoufox]
    end

    subgraph StorageLayer["STORAGE (all local)"]
        AppDB[(app.db)]
        MemDB[(memory.db)]
        VaultDB[(vault.db<br/>SQLCipher)]
        LDB[(Rust-native graph<br/>(LadybugDB optional))]
        VecDB[(sqlite-vec)]
    end

    subgraph External["EXTERNAL (user's keys)"]
        LLMs[LLM Providers<br/>Anthropic/OpenAI/DeepSeek/...]
        Connectors[SaaS APIs<br/>Gmail/Slack/Notion/...]
        Harnesses[Agent CLIs<br/>Claude Code/Codex/...]
    end

    Human --> ChatUI
    Human --> FlightDeck
    ChatUI --> IPC
    FlightDeck --> IPC
    OfficeUI --> IPC
    IPC <--> AgentLoop
    AgentLoop --> MemEngine
    AgentLoop --> Compaction
    AgentLoop --> ConnHub
    AgentLoop --> SearchEngine
    AgentLoop --> BlueprintEngine
    AgentLoop --> SkillRegistry
    AgentLoop -->|permission check| Guard
    Guard -->|diff card| ChatUI
    AgentLoop -->|resolve key| Vault
    Vault --> LLMs
    AgentLoop -->|tool exec| Script
    AgentLoop -->|browser tool| CDP
    CDP --> Obscura
    CDP --> Chrome
    CDP --> Stealth
    ConnHub --> Connectors
    MCP --> Harnesses
    AgentLoop -->|audit row| Audit
    MemEngine --> MemDB
    MemEngine --> LDB
    MemEngine --> VecDB
    Audit --> AppDB
    Super -->|lifecycle| SidecarLayer
    Super -->|lifecycle| BrowserLayer

    style RustLayer fill:#1a1a2e,color:#fff
    style SidecarLayer fill:#16213e,color:#fff
    style StorageLayer fill:#0f3460,color:#fff
```


---

## 21. UI Layout & Workspace Panel (ARCH/12)

```mermaid
graph LR
    subgraph App["EveryAIOS Desktop (Tauri 2)"]
        subgraph Sidebar["Sidebar (240px)"]
            Nav[New Session<br/>Automations<br/>Guard<br/>Connectors<br/>Memory<br/>Analytics]
            Sessions[Recent Sessions<br/>• Running ⏳<br/>• Action Required ●<br/>• Completed ✓<br/>└─ Child sessions]
        end

        subgraph Center["Chat Panel (40%)"]
            Messages[Messages Stream]
            Artifacts[Artifact Cards<br/>📄 Rendered Previews]
            Progress[Progress Steps<br/>✓ Done • Running ○ Pending]
            MCQ[MCQ Interrupt<br/>Approve / Edit / Reject]
            Input[Input Bar<br/>+ attach | mode | 🎙 | ▶]
        end

        subgraph Right["Workspace Panel (60%, tabbed)"]
            TabBar["[Progress][Shell][Code][Browser][Excel][Word][PPT][PDF][+]"]
            Shell[Terminal<br/>Read-only ↔ Writable]
            Code[Editor<br/>Live diffs, 100+ langs]
            BrowserView[Live Browser<br/>● Live indicator]
            ExcelView[Spreadsheet<br/>Real-time cells + charts]
            WordView[Document<br/>Live cursor + typing]
            PPTView[Slides<br/>Element editing]
            PDFView[PDF<br/>Forms + annotations]
        end
    end

    Nav --> Center
    Sessions --> Center
    Center --> Right
    Progress -.->|click step| Right
```

---

## 22. Takeover / Resume Flow

```mermaid
stateDiagram-v2
    [*] --> AgentRunning: Session starts

    AgentRunning: Agent Working
    AgentRunning: All panels read-only
    AgentRunning: ● Live indicator ON

    UserPauses: User Clicks ⏸ Pause
    UserControl: User Has Control
    UserControl: Panels editable
    UserControl: ⏸ Paused indicator

    ResumePrompt: Resume Dialog
    ResumePrompt: "Describe what you changed"
    ResumePrompt: [text field required]

    AgentContinues: Agent Resumes
    AgentContinues: Context includes user changes
    AgentContinues: ● Live indicator restored

    AgentRunning --> UserPauses: User clicks Pause
    AgentRunning --> MCQInterrupt: Agent needs input
    UserPauses --> UserControl: Panels unlock
    MCQInterrupt --> UserControl: User responds
    UserControl --> ResumePrompt: User clicks ▶ Resume
    ResumePrompt --> AgentContinues: Description submitted
    AgentContinues --> AgentRunning: Loop continues
    AgentContinues --> [*]: Task complete

    state MCQInterrupt {
        [*] --> ShowOptions
        ShowOptions: ● Action Required
        ShowOptions: [Approve] [Edit] [Reject] [Options]
    }
```

---

## 23. RepoMap Context Selection (Aider Pattern, doc 46)

```mermaid
flowchart TD
    Start[User sends coding prompt] --> Extract[Extract identifiers<br/>from message text]
    Extract --> Walk[Walk project files<br/>respect .gitignore]
    Walk --> Tags[tree-sitter tag extraction<br/>definitions + references<br/>130+ languages]
    Tags --> Cache{SQLite cache<br/>valid?}
    Cache -->|hit| Graph
    Cache -->|miss| Reparse[Parse file → new tags]
    Reparse --> Store[Store in diskcache<br/>keyed by mtime]
    Store --> Graph

    Graph[Build NetworkX MultiDiGraph<br/>file nodes + symbol edges]
    Graph --> Personalize[Personalize PageRank:<br/>• boost files in context<br/>• boost mentioned identifiers]
    Personalize --> Rank[Rank files by score]
    Rank --> BinarySearch[Binary search:<br/>render top-N as tree<br/>until fits token_budget]
    BinarySearch --> Output[Output: hierarchical symbol tree<br/>injected into LLM context]

    style Start fill:#e8f5e9
    style Output fill:#e8f5e9
    style Graph fill:#fff3e0
    style BinarySearch fill:#fff3e0
```

---

## 24. Computer-Use Agent Loop (OmniParser + UI-TARS, doc 48)

```mermaid
sequenceDiagram
    participant U as User
    participant Agent as EveryAIOS Agent
    participant Screen as Screen Capture
    participant Parser as OmniParser<br/>(YOLO + Florence)
    participant VLM as Vision LLM<br/>(UI-TARS / Claude / GPT-4o)
    participant Exec as Action Executor<br/>(pyautogui / CDP)

    U->>Agent: "Fill out the expense form"
    
    loop Screenshot-Action Loop
        Agent->>Screen: Capture screenshot
        Screen-->>Agent: Raw image (1024×768)
        
        alt Structured app (has DOM/a11y)
            Agent->>Agent: Use CDP 37-tool catalog
        else Native desktop / unknown app
            Agent->>Parser: Parse screenshot
            Parser->>Parser: YOLO9 detect interactive regions
            Parser->>Parser: Florence caption each element
            Parser-->>Agent: Structured JSON<br/>[{box, label, actionable}...]
        end
        
        Agent->>VLM: Screenshot + parsed elements + task
        VLM-->>Agent: Thought: "I see the Amount field..."<br/>Action: click(x=450, y=320)
        
        Agent->>Exec: Execute action
        Exec-->>Agent: Action complete
        
        Agent->>Agent: Check: task done?
    end
    
    Agent->>U: ✓ Task complete<br/>(with screenshots as proof)
```

---

## Notes on Diagram Consistency

After iterating through all flows, the following cross-cutting invariants hold across every diagram:

1. **"Sidecar proposes, Rust disposes"** — visible in diagrams 2, 6, 10, 12, 18: every mutating action from the sidecar passes through everyaios-guard before execution.

2. **Audit is universal** — every diagram that involves execution (2, 5, 6, 8, 10, 11, 12, 15, 18, 19) terminates with an audit write. No action escapes logging.

3. **Pass-by-reference** — diagrams 4, 9 show that large payloads (snapshots, office files, scraped pages) never serialize into IPC; only refs + bounded previews cross the boundary.

4. **Battery-awareness** — diagrams 13, 17 show that heavy background work (indexing, embedding, scheduled tasks) is suppressed on battery.

5. **Tombstone eviction** — diagram 16 ensures ghost context from deleted/renamed files never pollutes retrieval in diagram 4.

6. **MCQ interrupt** — diagram 7 (original) + diagram 22 (expanded UI flow) show how circuit breaks in any execution diagram gracefully hand control back to the user with Approve/Edit/Reject options.

7. **Crystallization** — diagram 14 shows how successful multi-step workflows from diagram 2 eventually compile to zero-token scripts used by diagram 17 (scheduled tasks).

8. **Key affinity** — diagram 3 shows key-ring resolution respects cache economics from diagram 9 (same provider+model+session = same key to preserve prefix cache).

9. **UI as live viewport** — diagram 21 shows the workspace panel as a real-time view into agent execution; diagram 22 shows the takeover/resume state machine that enables human-in-the-loop collaboration.

10. **Intelligent context selection** — diagram 23 (RepoMap) shows how the agent selects relevant codebase context without loading everything, feeding only the most relevant symbols into the LLM within a token budget.

11. **Vision fallback for computer-use** — diagram 24 shows the dual-path: CDP 37-tool catalog for structured apps (DOM available) vs OmniParser+VLM screenshot loop for native desktop apps (no DOM).
