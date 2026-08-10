# 39 — NVIDIA NOOA (Object-Oriented Agents) deep-dive + audit resolutions

> Added 2026-08-06 on user request: *"reread all, upgrade final all… then check https://github.com/NVIDIA-NeMo/labs-OO-Agents"*.
> **Method:** shallow-cloned and read this pass (`/tmp/oo-agents`, 20MB). Read: full README, `pyproject.toml`, CHANGELOG, package READMEs (`nooa-cli`, `nooa-memory`, `nooa-bench`), `skills/` index (11 SKILL.md bundles), `examples/README.md` progression, core `src/nooa/` module tree, and **nooa-memory source** (`forgetting.py` retention formula, `manager.py` spontaneous-association hook, `references.py` typed edges). Web: NVIDIA blog *"Six Agent Harness Capabilities for Higher Model Performance"* + arXiv 2607.20709 (via researcher). Core runtime modules listed but not line-read → depth **🟦 structure-verified**.

---

## A. NOOA — `NVIDIA-NeMo/labs-OO-Agents` (Apache 2.0, Python, research-grade)

**What it is:** NVIDIA-labs **Object-Oriented Agents** (NOOA) — a model-agnostic Python framework (LiteLLM-backed: Anthropic/OpenAI/Ollama/vLLM/hosted) that makes the agent itself a Python class. Claims SWE-bench Verified / Terminal-Bench 2.0 results in the paper; **+11.8 RHAE over file-based notes on ARC-AGI-3** with its memory subsystem. ⚠️ Research software — README explicitly warns LLM-generated code can do dangerous things; recommends OS-level sandboxing (NVIDIA OpenShell).

### A1. The 6 harness capabilities (the design thesis)
1. **Typed I/O** — agentic methods have strict typed argument/return contracts (pydantic).
2. **Pass-by-reference** — the model operates on *live objects* (variable names + bounded previews: head/tail samples, type metadata), never serialized copies → megabytes stay out of the context window. ⭐
3. **Code-as-action** — the model acts by writing Python in a Jupyter-style REPL (loops, conditionals, imports), not rigid JSON tool schemas.
4. **Programmable loop engineering** — orchestration loops are readable Python the model itself can adapt.
5. **Explicit object state** — durable typed state lives as fields (`self.order_db`), not buried in chat history.
6. **Model-callable harness APIs** — context blocks, memory tools, event histories exposed as Python APIs the agent queries.

**Agent model:** `...` body = LLM-driven generation method (docstring *is* the prompt, signature *is* the contract); real body = deterministic Python that never enters the LLM. This is the Python analogue of our **"sidecar proposes, Rust disposes"** split — deterministic-vs-agentic boundary enforced by code shape, not convention.

### A2. nooa-memory — ACT-R activation + spontaneous recall (⭐ the memory steal)
`MemoryManager.install(agent)` wires: conscious tools (`recall`/`search`/`remember`/`write`/`deliberate_recall`) + **pre-turn spontaneous association** — a dynamic context block refreshed from queries derived from *recent events* (code-verified in `manager.py`).
- **Retention/decay (`forgetting.py`, source-read):** `retention(m) = f(time_since_last_access, stability)` where `stability = decay_half_life_hours × (1 + log1p(strength))` — accessed memories decay much more slowly; **importance ≥ 8.0 never auto-forgotten**; prune when below `prune_activation_threshold`; protected types excluded.
- **Associative recall** = semantic + keyword + **recency** + **graph** (four signals, one query).
- **Typed relational edges (`references.py`, source-read):** "typed relations stay edges" — mechanism source-verified; edge **vocabulary** (`supports` / `contradicts` / `derived-from`) per paper/blog (arXiv 2607.20709) — on the memory graph (we only have temporal edges in Kuzu today).
- **Pass-by-reference at recall:** stored *references* are re-read fresh at recall time — memory entries can point at live files/objects instead of pasted values (token-minimizing by construction).
- **Async consolidation:** background pass merges duplicates, reconciles conflicting records, prunes decayed memories, distills episodes → insights (validates our forgetting/KG-conflict design).
- Storage: single inspectable **SQLite** file + pluggable vector backends (numpy default; sqlite-vec/chromadb lazy-import).

### A3. Sandboxing & guardrails (`src/nooa/runtime/`)
- `code_validator.py` (AST checks) + `restrictions.py` (**module deny-lists**) + `method_guard.py` — **in-process, defense-in-depth only, explicitly NOT containment** (README: `open()`/`importlib`/reflection escape static checks; containment = OS-level isolation).
- `sandbox/` — real REPL sandbox: `guards.py`, `executor.py`, `worker.py`, `readonly.py`, `cell_core.py` (per-cell execution).
- `middleware.py` — `intercept()` guardrails/transforms/blocking + `on()` event observers (our Guard-1/2 interceptor-chain analogue).
- Security hygiene: pins `litellm>=1.84.0` (CVE-2026-49468 proxy-RCE); CHANGELOG notes **MCP server configs no longer expand `${VAR}` env placeholders** (injection fix — copy this).

### A4. Channels & reactive input (`runtime/producers.py`, `event_query.py`, `events.py`)
`Channel`/`QueueManager`, `race()` dispatch loops, `spawn()` background jobs, producers: **monitor / cron / tail**. A unified reactive-input surface (validates our B7 scheduled triggers + F11 port hooks design; DeerFlow 2.0 ships the same idea at scale — §B).

### A5. Self-extending + skills + observability
- **Self-extending agents:** `self.libs` persistent skill libraries, in-cell helpers, `@strategy` sub-calls, `@slash_command` (validates our Forge G-series + I2).
- **11 SKILL.md bundles** (`skills/`) — agent-authoring, codeact-advanced (prefill, loop guards, truncation tuning), agentdoc (progressive disclosure via `doc()`/`spec()`), context-and-state, tools-and-skills (Bash/File/Todo + MCP), channels, self-extending, middleware-hooks, capturing-traces, trace-viewer, trace-explorer — the `~/.claude/skills` / `.codex/skills` convention again (I2/F8).
- **Tracing:** every LLM call/code exec/method invocation auto-traced; `nooa start-dev` trace viewer (port 5001), jsonl/otlp/langfuse/journal exporters, `@no_trace` (validates H9 + our audit/replay design).

### A6. What we steal (landing rows)
| NOOA pattern | Land on |
|---|---|
| **Pass-by-reference context** — live refs + bounded previews; agent queries via sandboxed REPL instead of serializing payloads | **NEW matrix C10** + 05 |
| **ACT-R activation + spontaneous recall** — retention formula (half-life × log1p(strength)), importance ≥8 protected, associative recall (semantic+keyword+recency+graph), typed `supports/contradicts/derived-from` edges, pre-turn spontaneous context block | **NEW algorithm #32** + 07 §7.7 |
| AST validation + module deny-lists + per-cell REPL sandbox (defense-in-depth, never containment) | 06 §6.6 |
| `intercept()` middleware chain + `on()` observers | 06 (Guard pipeline note) |
| Channels (monitor/cron/tail/race/spawn) | B7 / F11 (fold-in) |
| Progressive disclosure `doc()` (hide long type docs, reveal on demand) | 05 (fold-in) |
| Trace viewer + auto-tracing | H9 (validation) |
| Agent-as-class `...`-body split (deterministic-vs-agentic by shape) | 03 / H4 (validation) |
| MCP `${VAR}` expansion removed | 06 §6.5 (injection hygiene) |

---

## B. Audit resolutions (from the "reread all" pass — fixed in this batch)

### B1. DeerFlow 2.0 — ⭐ channels-first super-agent harness (marker RESOLVED, deepened)
Doc 15 F13 + doc 23 A6 both carried "re-verify / deep-read 2.0 next pass". **Verified live 2026-08-08: 79,565⭐**, README: *"ground-up rewrite… super agent harness that orchestrates sub-agents, memory, and sandboxes — powered by extensible skills."* Tree read via API reveals a **channels-first architecture**:
- `backend/app/channels/` — **10 IM/chat adapters**: buzz, buzz_nostr, dingtalk, discord, feishu, github, slack, telegram, wechat, wecom + `message_bus.py`, `run_policy.py` (+ per-channel run policies), `dedupe_store.py`, `connection_identity.py`, `runtime_config_store.py`, `store.py`, `manager.py`, `service.py`.
- `backend/app/gateway/auth/` — full auth gateway: JWT, OIDC, password, local_provider, credential_file, repositories.
- `.agent/skills/` — e.g. `blocking-io-guard` skill template.
- → **Directly validates + informs our F13 messaging bridges** (Secure OpenClaw = 1 gateway; DeerFlow shows the full pattern: per-channel run policies, message dedup, connection identity, auth gateway). Steal: `run_policy.py` (per-channel concurrency/approval policy), `dedupe_store.py` (idempotent message ingest). Code-level loop read of the harness itself remains deferred — pattern covered by docs 03/07/38.

### B2. microsandbox hypervisor — RESOLVED (was "backend TBD" in doc 24)
`Cargo.toml` pins **`msb_krun = "=0.1.25"`** (+ `msb_krun_utils`); README credits **libkrun** and **smoltcp** → hypervisor = **libkrun** (KVM virtualization via Rust), networking = smoltcp. Rust SDK `Sandbox::builder(...).create()` boots a microVM as a child process. Doc 24 note now resolved: libkrun-based, smoltcp networking.

---

## C. Decision: ADD (2 corpus changes)

1. **C10 — Pass-by-reference context** 🟡 (new): live handles + bounded previews for files/datasets/results; the agent queries/slices them via the sandboxed script-eval (E4/rquickjs) instead of loading payloads into context. Token-economy win aligned with tokenmining rule 1 (retrieve instead of preload) + Hermes persist-don't-truncate (05 §5.8): **never serialize what you can reference**.
2. **Algorithm #32 — ACT-R activation + spontaneous recall** 🟡 (new): NOOA memory math + typed relational edges upgrade our spreading-activation/KG (07). (All other NOOA patterns fold into existing rows as code-verified details.)

**Rejected:** the Python framework itself (we're TS sidecar + Rust core); the REPL-executes-model-code model as default (we gate via script-eval sandbox); in-process-only validation as a containment story (matches our 06 stance).

## D. Delta

| File | Change |
|---|---|
| doc 39 (this) | NOOA + DeerFlow 2.0 channels + microsandbox krun |
| ledger | 151 → **152** (NOOA 🟦, §17) |
| matrix | 100 → **101** (C10 🟡); F13 note (+DeerFlow channels); totals 🟡 48→49 |
| spec | v3.2 → **v3.3** — C10 row, algorithm #32, totals 101 rows / 32 algos (17 built + 15 new), F13 note, P4 bullet |
| ARCH/05 | +§5.9 pass-by-reference + progressive disclosure |
| ARCH/07 | +§7.7 ACT-R activation + spontaneous recall + typed edges |
| ARCH/06 | §6.6 + in-cell guard row (AST + deny-lists, defense-in-depth) |
| index | row 39 + reading step 30 → spec v3.3 |
| build plan | P5 + C10 + #32 |
| docs 15/23/24 | DeerFlow + microsandbox markers resolved |
