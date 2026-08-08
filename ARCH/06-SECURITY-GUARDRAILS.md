# 06 — Security & Guardrails

> **The user requirement, verbatim:** *"guardrails are very, very important. research on that."* Synthesized from: v2.0 §P8 (Trust Ladder + dual-guard, built in core-tools), doc 03 §8, ZeroClaw security-first (doc 30 §1), BrowserOS ownership + guards/effects pipeline (doc 33 §4.3, §6.3), Hermes prompt-injection scan + FTS5 trust scoring (doc 16), ECC AgentShield + plan-before-build (doc 09), OpenFang WASM metering (doc 09), microsandbox (doc 23), cyber-agent red-team corpus (doc 26 — use their attack patterns as our test suite).

## 6.1 Defense in depth (every path, every layer)

```
LLM output ──► [1] Trust Ladder policy (sidecar, proposes)
            ──► [2] Grammar extractor (sidecar, structure)
            ──► [3] Deterministic regex interceptor (Rust everyaios-guard)
            ──► [4] Path/scope floors (Rust everyaios-guard)
            ──► [5] Human diff-card (Rust — escalated ops only, real click)
            ──► [6] Sandbox execution (subprocess jail / WASM / browser ownership)
            ──► [7] Append-only audit (Rust everyaios-audit)
```

## 6.2 The Trust Ladder (kept from core-tools, 0–100)

- Score grows from successful task completions; decays slowly on repeated failures.
- Tiers: reads (any) · local-write in workspace (≥25) · local-write outside workspace (≥50 + path grant) · external writes / network sends (≥75 + diff-card) · destructive (100 still **requires** diff-card — never auto). The ladder raises *convenience*, never overrides the hard guards.
- Per-agent override (blueprints): role isolation — subagents inherit a capped ladder + `DELEGATE_BLOCKED_TOOLS` (Hermes, doc 16).

## 6.3 Guard 1 — deterministic regex interceptors (Rust)

- A compiled `RegexSet` scanned over **every generated shell string / filesystem path / URL** before execution: `rm -rf /`, `mkfs`, `dd if=/dev/zero`, `drop database`, `format c:`, fork bombs, key/pass exfiltration patterns, `.git` destruction, home-directory wipes, self-modifying shell. Matches → block + audit + UI card ("blocked by Guard 1 — pattern X").
- **Hard floors** (structural, not regex): everyaios-guard owns the workspace boundary map; background loops physically cannot read/write outside granted roots (path canonicalization, symlink resolution — no `..` escapes). The sidecar's own FS access is limited to its data dir (01 §2.3).
- URL floors: `file://` only inside granted roots; scheme guard (browser `navigate_scheme` — BrowserOS guard, doc 33 §4.3).

## 6.4 Guard 2 — human diff-card handshake (Rust)

Escalated actions freeze the loop and render a native card (not LLM-generated): exact file paths (pre/post), script lines, execution target (host vs sandbox vs browser), env vars being set, network destinations. **Approval = a real host click** (non-bypassable — the card is rendered by the **Tauri shell (Rust side)** as a real OS dialog from a everyaios-guard payload over IPC, not by the webview's JS, so prompt-injected webview JS cannot synthesize the click). Every approval/denial is audit-logged with a receipt.

## 6.5 Prompt-injection defense (browser + files + web)

- **Context scan** (Hermes pattern, doc 16): every ingested file/webpage/memory block is scanned for injection patterns (instruction-adjacent, `<system`-like tags, "ignore previous instructions") and **wrapped in `<user_document>` delimiters** (PageIndex hardening, doc 25) so the model sees them as data.
- **Browser ownership isolation** (BrowserOS, doc 33): agent tabs vs user tabs (`mine | user | other-agent`); agents read only their own tabs' content; sensitive-site navigation (banking, auth pages) prompts even when in-scope; the agent never reads clipboard unless asked (permission-gated).
- **Tool-result sanitization**: tool outputs are treated as untrusted data — rendered as text/JSON, never as UI markup, never as instructions (they can't call the next tool directly; the loop always re-validates).
- **Escape hatches**: `estop` (global stop, tray-accessible), optional OTP for destructive ops (ZeroClaw, doc 30), per-session "YOLO mode" off by default with a loud warning.

## 6.6 Sandboxes (execution isolation)

| Runner | For | Boundaries |
|---|---|---|
| Subprocess jail | filesystem tools, shells, office sidecars | seccomp/no-new-privs (Linux), app-sandbox (mac), job-object (win); cwd + path floors enforced by everyaios-guard |
| WASM (fuel-metered) | Forge-generated tools | compute budget + epoch interruption (OpenFang dual metering, doc 09); no host syscalls |
| In-cell guard (script-eval) | LLM-generated JS cells (E4/rquickjs) | **AST validation + module deny-list + event-loop guards** (NOOA `code_validator`/`restrictions` pattern, doc 39) — in-process = defense-in-depth only, **never containment** (matches NOOA's own warning: `open()`/`importlib`/reflection escape static checks) |
| Docker (optional) | heavy/data workflows | user-installed Docker only; never required |
| MicroVM (future) | highest isolation | microsandbox msb_krun pattern (doc 23) |
| Browser tab | web content | per-tab process, ownership claims, no extension bridges into the app core |
| Remote-SSH (optional, later) | dev servers / VPS execution | port-forward + SFTP + detached `serve` (Reasonix's 6th backend, doc 05) — always diff-card gated |

## 6.7 Audit (append-only, replayable)

- Every tool dispatch: **`trace_id, span_id`** (OpenTelemetry — matrix J14, doc 43 §2.3: one Rust→sidecar→provider→sandbox flow = one span chain; console/log-file export at v1, OTLP/Jaeger post-v1), plus `session, agent, tool, args(hashed+bounded), result_meta, duration, token_estimate, outcome, approval receipts`.
- Every script primitive via InnerCallHook (BrowserOS, doc 33 §6.3) — `run` can't hide anything.
- Replay of browser sessions (08 §8.5) + screenshot-per-step.
- Retention: replays 7d default, audit configurable; export/wipe controls.
- The cyber red-team corpus (doc 26: PentAGI/PyRIT/NeuroSploit etc.) doubles as our **adversarial test suite** for Guard 1 + injection defense — we test with the same tools the attackers use.

## 6.8 Secrets (see also 03 §3.4)

Vault (SQLCipher) is the only owner of keys/tokens; CES-style executor for high-risk credentialed calls (v2.0 §P8); keys masked everywhere in UI/logs; no key material in crash dumps (crash scrubbing).
