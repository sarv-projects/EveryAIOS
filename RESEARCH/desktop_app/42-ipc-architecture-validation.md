# Doc 42 — IPC Architecture Validation & Agentic OS Axioms
**Reconciling the external IPC analysis with our existing spec. Code-verified against OpenFang & ZeroClaw source.**

---

## 🏷️ Source of this analysis

An external architectural review that validates our hybrid Rust/TS design. The review was unsolicited but thorough — it identified strengths, weaknesses, and the "Agentic OS" mental model. This doc reconciles every claim against:

- Our existing ARCH docs (01–12)
- Our master spec (`desktop_app/DESKTOP-APP-SPEC.md`)
- Source-code reads of OpenFang (`crates/openfang-kernel/src/kernel.rs`, `capabilities.rs`) and ZeroClaw (`crates/zeroclaw-api/src/lib.rs`)
- Research docs 01–41

---

## 1. The Core Safety Axiom — Validated ✅

### Statement

> *"The sidecar proposes; Rust disposes. Every mutating call from the TS sidecar requires a pai-guard authorization ticket; browser/script/audit/keys live only in Rust."*

### Where it exists in our spec

- `desktop_app/DESKTOP-APP-SPEC.md` line 328 — verbatim
- `desktop_app/ARCH/01-SYSTEM-ARCHITECTURE.md` §1.5 — data flow: "sidecar normalizes → permission check → pai-core GuardRail → execute"
- `desktop_app/ARCH/02-MODULE-LAYOUT.md` §2.3 — "the sidecar proposes; the Rust core disposes"
- `desktop_app/ARCH/06-SECURITY-GUARDRAILS.md` §6.1 — 7-layer defense depth, every layer traceable to Rust enforcement

### Why this matters (the review got this exactly right)

| Threat | Without this split | With this split |
|---|---|---|
| Prompt injection | Attacker controls tool execution | Attacker can only ask; Rust core checks Trust Ladder + Guard-1 |
| Hallucinated tool call | Schema may be wrong, executes anyway | Rust core validates schema → rejected with error |
| Sidecar crash | Everything dies | Rust watchdog → kills cleanly, no orphan processes |
| Key leak attempt | LLM context holds raw keys | Vault in Rust; sidecar never sees raw credentials |
| LLM writes to wrong path | No boundary check | Rust path floors + canonicalization block it |

### Code-level verification from production systems

**OpenFang** (`crates/openfang-kernel/src/capabilities.rs`):
```rust
pub fn check(&self, agent_id: AgentId, required: &Capability) -> CapabilityCheck {
    // Agent requests a capability → kernel checks grants → allowed or denied
    // This is NOT "the agent asks nicely." It's enforced by the kernel.
}
```

**ZeroClaw** (`crates/zeroclaw-api/src/lib.rs`):
```rust
// Kernel ABI traits: every component must implement these
pub mod model_provider;    // ModelProvider trait
pub mod tool;              // Tool trait
pub mod memory_traits;     // Memory trait
pub mod runtime_traits;    // RuntimeAdapter trait
pub mod peripherals_traits; // Peripheral trait
pub mod session_keys;      // Per-sender rate limiting
```

Both use the **kernel-with-syscalls** mental model. The Rust core is the kernel. Everything else (agents, tools, connectors) are user-space processes that request capabilities.

---

## 2. What Our IPC Model Gets Right ✅

### 2.1 Process isolation = crash resilience

| Component | Crashes → | Recovery |
|---|---|---|
| Browser child | Rust core detects process exit | Spawns new CDP session, signals sidecar |
| Bun-compiled sidecar | Rust ProcessSupervisor detects | Kill + cold restart (<30ms Bun boot, doc 43 §1.3), resume from checkpoint |
| Rust core | Tauri-level restart (rare) | OS-level; UI reconnects on restart |
| Sub-agent sandbox | Sidecar detects | Clean disposal, no impact on other agents |

Our `ProcessSupervisor` (ARCH 01 §1.3) already encodes: exponential backoff (1s→2s→4s→60s cap), circuit breaker after 5 crashes/10min, `reconnecting` state surfaced to UI.

### 2.2 IPC enables polyglotism

The JSON-RPC over stdio contract (ARCH 01 §1.4) is language-agnostic. Our future additions:

- **Python data-analysis agent**: talks the same `agent.*` / `tool.*` contract
- **Go repo-scanner**: same protocol
- **Rust memory engine** (if we move memory to Rust later): same protocol

OpenFang proves this at scale — it has `openfang-kernel` (Rust) speaking to agents that can be WASM, Python, or Docker-based.

### 2.3 Hot paths stay in Rust (no IPC overhead)

The analysis correctly identified that the hot paths don't cross the IPC boundary:

| Hot path | Location | Crosses IPC? |
|---|---|---|
| Script eval (rquickjs) | `pai-script` (Rust) | ❌ No — direct execution |
| Browser snapshot | `pai-browser` + CDP (Rust) | ❌ No — direct CDP |
| Guard-1 regex scan | `pai-guard` (Rust) | ❌ No — scanned pre-execution |
| LLM inference | Sidecar (TS) → provider HTTP | ✅ One hop: sidecar resolves key from vault, calls provider directly |
| Memory retrieval | Sidecar (TS) → SQLite/LanceDB | ❌ In-process (sidecar owns memory) |
| File parsing | MarkItDown (TS, called by sidecar) | ❌ In-process |

The sidecar makes ONE call per agent turn (the permission check) — not one per tool call.

---

## 3. The Honest Weaknesses — and Our Mitigations ⚠️

### 3.1 IPC latency on the hot path

**Claim**: "~0.1–2ms per crossing. Fine for normal turns. Compounds in tight loops."

**Our mitigation** (already in spec): The hot paths (script eval, browser snapshot, Guard-1 regex) all live INSIDE the Rust core. The sidecar makes one call and gets back a result. No tight IPC loop needed.

**Additional hardening from research:**
- **Reasonix token discipline** (doc 05): cache-first, retrieve not preload, compress not repeat
- **DeerFlow's `task()` poll loop** (doc 39 §B): sub-agents use 5s polling, not tight IPC — amortizes crossing cost
- **OpenFang's `AbortHandle` pattern**: tasks tracked in `DashMap<AgentId, AbortHandle>` — cancellation doesn't need constant IPC pings

**What we should add to spec**: A hard guideline: "No more than 1 IPC crossing per tool dispatch." The sidecar batches permission checks where possible.

### 3.2 JSON-RPC serialization cost for large payloads

**Claim**: "A11y snapshots, office files, scraped pages → tens of KB to MB. Serializing to JSON, sending over socket, deserializing — non-trivial."

**Our mitigation** (C10 — pass-by-reference context, already in spec):
- Sidecar gets `ref:snapshot#12`, not `<html>....56KB.....`
- NOOA proved this at scale (`packages/nooa-memory/src/nooa_memory/references.py`): "Never serialize what you can reference. Live handles + bounded previews."

**What browsers do**: BrowserOS's snapshot system uses refs scoped to `(document_id, url)`. The full snapshot lives in Rust memory; the sidecar only gets a handle + diff.

**What we should add to spec**: A payload size budget per IPC message:
| Message type | Max payload | Strategy if oversized |
|---|---|---|
| Tool result | 50KB | Truncate + ref handle |
| A11y snapshot | ref only | Never serialize; ref + diff on request |
| Office file | ref + metadata only | Full file stays in Rust/VFS |
| Scraped page | ref + extract (first 2KB) | Full text in Rust; sidecar requests chunks on demand |

### 3.3 Sidecar restart latency

**Claim**: "Node cold-start ≈ 50–150ms. Fine for crash recovery but must never crash in normal operation."

**Our mitigation** (already in spec): The sidecar should be stable. Only sandboxes are disposable. Our ProcessSupervisor handles crashes, but the architecture goal is zero normal-operation crashes.

**What changes with restart**: On sidecar restart, we:
1. Recover the session from the 20-snapshot checkpoint (Hermes pattern, doc 16)
2. Restore the warm memory set (`Phantom Thread`, algorithm #10)
3. Reconnect to the vault (stateless — just re-resolve keys)
4. Surface "reconnecting" state to UI (<200ms disruption target)

**What we should add to spec**: The sidecar must never persist mutable state in-memory that isn't also in a checkpoint. Every agent turn is a checkpoint boundary.

### 3.4 Shared state is harder

**Claim**: "Two sub-agents that both want to write memory simultaneously have to go through Rust as coordinator. Correct for safety but adds complexity."

**Our mitigation** (already in spec):
- DeerFlow's `(sandbox_id, path)` str_replace serial lock (doc 39) — prevents concurrent file corruption
- ZeroClaw's `tokio::task_local!` per-sender rate limiting — prevents one agent starving others
- Our `pai-core` RwLock patterns from OpenFang/ZeroClaw (ARCH 02 §2.3)

**What we should add to spec**: An explicit concurrency model:
```
pai-core memory writes:
┌────────────────────────────────────────┐
│  Memory Coordinator (Rust)             │
│  ┌──────────┐  ┌──────────┐           │
│  │ Write Q   │  │ Merge Q  │           │
│  │ per-agent │  │ (FIFO)   │           │
│  └──────────┘  └──────────┘           │
│       │              │                 │
│       └──────┬───────┘                 │
│              ▼                         │
│       SQLite (WAL mode,                 │
│       single writer, many readers)     │
└────────────────────────────────────────┘
```
WAL mode means reads never block. Single-writer means writes are serialized at the DB level, not the app level.

---

## 4. The Agentic OS Mental Model — Fully Validated ✅

### 4.1 What "Agentic OS" means at our capability level

The review's OS analogy is accurate and maps directly to our architecture:

| OS Concept | Our Implementation | ARCH ref |
|---|---|---|
| **CPU** | LLM (reasoning engine — could be local or BYOK) | ARCH 01 §1.5 |
| **RAM** | Hot/warm/cold memory tiers + KG + episodic | ARCH 07 (MEMORY-CONTEXT) |
| **Programs** | Skills/Forge — self-written, self-installed tools | ARCH 02 (pai-script + Forge) |
| **Devices** | Browser (E1–E14), office engine, shell, connectors | ARCH 08 (BROWSER-LAYER), ARCH 04 (OFFICE-ENGINE) |
| **Kernel permissions** | Trust Ladder + Guard-1 + CapabilityManager | ARCH 06 (SECURITY-GUARDRAILS) |
| **Process definitions** | Blueprint `.md` files — what each agent is allowed to do | ARCH 02 §2.5 |
| **Processes** | Sub-agents — isolated, role-limited, per-agent budgets | ARCH 01 §1.5 |

### 4.2 How this differs from a standard desktop app

| Standard desktop app | Our Agentic OS |
|---|---|
| You tell the app what to do | The LLM figures out what needs to be done |
| Tools are hardcoded | Tools are written, tested, and registered at runtime (Forge) |
| State is app-internal | State is multi-tier memory with temporal KG + procedural memory |
| Crash = restart from zero | Checkpoint/resume, 20-snapshot history (Hermes) |
| One task at a time | Parallel sub-agents with role isolation (DeerFlow) |
| Fixed capability ceiling | Ceiling = sandbox + permissions (self-evolving via skills) |

### 4.3 Production systems that prove this model

| System | Stars | Kernel pattern | Our match |
|---|---|---|---|
| **OpenFang** | 18K⭐ | `OpenFangKernel` with 20+ subsystems, RBAC, Merkle audit, capability-based security, WASM fuel-metering, DashMap abort handles | Our `pai-core` crate layout |
| **ZeroClaw** | 32K⭐ | 17-crate layout, kernel ABI traits (ModelProvider/Channel/Tool/Memory/Observer/RuntimeAdapter), supervised autonomy, OTP-gated estop | Our kernel trait pattern |
| **BrowserOS** | 13K⭐ | Full Rust+TS tree, CDP engine, a11y snapshot/diff, audit+replay, OAuth, plan-before-touch harness | Our `pai-browser` engine |
| **DeerFlow 2.0** | 79K⭐ | 14-middleware chain, concurrent sub-agent caps, per-sandbox serial locks, task() poll loop | Our sub-agent spawner (P2) |

None of these systems bundle everything in a single process. All use some form of process isolation. All use a kernel/syscall mental model.

---

## 5. What the Review Missed (our additional strengths)

The review praised our design but didn't mention these strengths — which are already in the spec:

### 5.1 Memory algorithms are our unique moat

None of OpenFang, ZeroClaw, or BrowserOS has our memory layer:
- **Spreading-Activation Retrieval** (algo #7): KG-proximity re-ranking, per-hop decay + lateral inhibition
- **Forgetting-to-Remember** (algo #7): sentiment-polarized memory, defensive recall
- **Phantom Thread** (algo #10): 0ms context pre-loading on workspace change
- **Temporal Graph Anticipation** (algo #4): weekly rhythm prediction, top-1 ≥0.55
- **Crystallization Engine** (algo #1): zero-token deterministic compilation
- **NOOA's ACT-R activation**: retention half-life × log1p(strength), importance-based never-forgotten
- **mem0's 9-phase batch pipeline**: context→retrieve→extract→embed→hash→dedup→batch persist→entity link→return

### 5.2 Office engine is unique

GenOffice's `block-patch.ts` + `deterministic-planner` — a capability no agent OS has:
- Edit DOCX/XLSX without LLM hallucination
- Zero-token deterministic operations for cell edits, formatting, formula insertion
- LibreOffice UNO integration for deeper office automation

### 5.3 Connector hub is unique

Composio (250+ tools) + Nango (OAuth platform) + 25 OpenWorker connectors + Google Workspace CLI — our connector hub is broader than any single existing system.

---

## 6. Action Items — What to Add/Change in the Spec

### 6.1 Add to ARCH 01 (SYSTEM-ARCHITECTURE)

- [ ] **IPC payload budget table** (§1.4): max sizes per message type, ref-only defaults
- [ ] **Explicit concurrency model** (§1.5): WAL-mode SQLite, single-writer pattern, per-agent write queues
- [ ] **Hot-path IPC budget**: "No more than 1 IPC crossing per tool dispatch" guideline

### 6.2 Add to ARCH 02 (MODULE-LAYOUT)

- [ ] **OpenFang kernel.rs reference**: our `pai-core` should mirror `OpenFangKernel`'s subsystem assembly pattern (registry + capabilities + event_bus + scheduler + supervisor + triggers + workflows)
- [ ] **ZeroClaw ABI pattern reference**: our kernel traits should follow ZeroClaw's `ModelProvider/Channel/Tool/Memory/Observer/RuntimeAdapter` pattern

### 6.3 Add to ARCH 06 (SECURITY-GUARDRAILS)

- [ ] **OpenFang CapabilityManager**: the `grant/check/revoke_all` pattern — our Trust Ladder should map to capability grants, not just score thresholds
- [ ] **OpenFang AbortHandle + DashMap**: our ProcessSupervisor should track task abort handles, not just process PIDs
- [ ] **ZeroClaw session_keys + tokio::task_local**: per-sender rate limiting pattern for our sub-agent spawner

### 6.4 Add as a new design axiom

> **"The sidecar must never hold state that can't be reconstructed. Every agent turn boundary is a checkpoint. No LLM output is trusted until it passes Kernel authorization."**

This formalizes the review's insight about sidecar crash recovery and the kernel/syscall mental model.

---

## 7. Verification Status

| Claim in the review | Verified? | Evidence |
|---|---|---|
| OpenFang has 53 tools, 40 channel adapters, WASM fuel-metering | ✅ | Research docs + source code (openfang-kernel kernel.rs) |
| ZeroClaw has supervised autonomy, tool receipts, OTP estop | ✅ | Research docs + source code (zeroclaw-api lib.rs) |
| Both use kernel-with-syscalls mental model | ✅ | Traceability: OpenFang kernel.rs has CapabilityManager + RBAC; ZeroClaw has kernel ABI traits |
| "Sidecar proposes, Rust disposes" is the right axiom | ✅ | Already in our spec line 328 |
| Hot paths must not cross IPC | ✅ | Our hot paths (script-eval, snapshot, Guard-1) are all in Rust |
| Pass-by-reference avoids serialization cost | ✅ | C10 in our spec; NOOA validated |
| Crash resilience from process isolation | ✅ | Our ProcessSupervisor with exponential backoff + circuit breaker |
| IPC enables polyglotism | ✅ | JSON-RPC over stdio is language-agnostic |
| Shared state needs explicit concurrency model | ⚠️ Partially | Architected (RwLock + WAL) but not spelled out in spec — action item above |
| Payload size budget needed | ⚠️ Not in spec | Action item above |

---

## 📊 Summary

The external review **fully validates** our architectural direction. Every strength it identifies is already in our spec. Every weakness it flags has a mitigation either already designed or added as an action item above. The review's "Agentic OS" mental model maps precisely to our existing architecture, and the two production systems closest to our scope (OpenFang, ZeroClaw) both use the same kernel-with-syscalls pattern we've chosen.

**The most important validation**: "The 'sidecar proposes, Rust disposes' axiom is the most important architectural decision in the whole spec." This is our spec line 328, ARCH 01 §1.5, ARCH 02 §2.3, and ARCH 06 §6.1. It is traceable from the top-level requirement ("guardrails are very, very important") all the way down to specific Rust Guard-1 regex patterns and the Trust Ladder thresholds.

**Source files to revisit during implementation:**
- `zeroclaw-labs/zeroclaw/crates/zeroclaw-api/src/lib.rs` — kernel ABI traits
- `RightNow-AI/openfang/crates/openfang-kernel/src/kernel.rs` — subsystem assembly
- `RightNow-AI/openfang/crates/openfang-kernel/src/capabilities.rs` — capability-based security
- `RightNow-AI/openfang/crates/openfang-runtime/src/sandbox.rs` — sandbox patterns
- Our own `desktop_app/ARCH/01-SYSTEM-ARCHITECTURE.md` §1.3–1.5 — process lifecycle + IPC
- Our own `desktop_app/ARCH/06-SECURITY-GUARDRAILS.md` §6.1–6.5 — defense depth
