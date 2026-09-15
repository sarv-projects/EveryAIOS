# 89 — Guard network-destination + agent-config floor audit (2026-09-13)

> **Method:** a **code-level audit of this repository's own guard floors** (read 2026-09-13), then the fix recorded as the **P62** queue. Every claim below is tagged **VERIFIED** (read in this repo, this session, with `file:line`) or **REPORTED** (external/third-party claim, not primary-read here). This document is the provenance for P62 — it is *not* a market-research pass and it adds **0 repos** to the ledger.
>
> ⚠️ **Provenance gap, stated rather than hidden:** the in-code comments written with the P62 change cite an external "2026 agent security survey". That brief is **not persisted** anywhere in `RESEARCH/` (the corpus ended at doc 88), so its specific findings are **not** treated as evidence here and no claim in this document depends on it. The findings below were independently re-derived from the code. If the survey is still available it should be filed as a separate doc and cross-linked; until then the P62 rows trace to *this* audit.

## 1. What was found — three SSRF guards that had drifted apart

The repo had **three partial implementations of the same idea**, which is the classic "N callers × M rules" drift: a rule hardened in one path silently did not apply to the others.

| # | Implementation (as found) | What it actually caught | Gap | Status |
|---|---|---|---|---|
| 1 | `everyaios-guard::toctou::is_blocked_ip` | exactly `169.254.169.254`, unspecified, broadcast, documentation; IPv6 = unspecified only | The **whole link-local range** (`169.254.0.0/16`, `fe80::/10`), multicast, CGNAT, ULA and reserved space all passed | VERIFIED |
| 2 | `everyaios-guard::urlfloor::check_url` | scheme floor (`http`/`https`/`file` + root containment for `file://`) | **No IP/host check at all** — any host, including private space, was `Allowed` | VERIFIED |
| 3 | `everyaios-browser::tiers.rs` (private copy) | loopback / RFC1918 / link-local / ULA / IPv4-mapped, decided inline in the navigation path | A second, independent rule set that could (and did) diverge from #1/#2; also re-implemented as `is_private_ipv6` | VERIFIED |

**Consequence (the load-bearing one):** the agent tool path in `everyaios-core/src/tools.rs` gated model-supplied URLs with `urlfloor` — implementation #2, which had **no network check**. A URL the model had just read out of page text or search results could therefore point at a LAN address or a metadata endpoint and pass the floor. VERIFIED (the call site was `urlfloor::is_allowed`, pre-fix).

## 2. The fix — one classifier, two policies

New module `crates/everyaios-guard/src/netfloor.rs` (414 lines incl. tests) owns the classification; everyone else calls it. VERIFIED.

- **Always refused, no opt-in exists** (`is_always_blocked`): unspecified, link-local (`169.254.0.0/16` — the range that *contains* the metadata IP — and `fe80::/10`), multicast, broadcast, documentation, and reserved/benchmark space (`0.0.0.0/8`, `192.0.0.0/24`, `198.18.0.0/15`, `240.0.0.0/4`).
- **Policy-gated** (`NetPolicy`): `private` (RFC1918 + `100.64.0.0/10` CGNAT + IPv6 ULA) and `local_name` (`.local`, `.internal`, `.home.arpa`, `.lan`) are refused by default; `loopback` is **allowed by default** on a local-first desktop because local dev servers, local model runtimes (Ollama `:11434`, LM Studio `:1234`) and the CDP endpoint are first-class workflows. `NetPolicy::strict()` refuses loopback too and is what untrusted-content paths get.
- **Classification is on the parsed host**, never the raw string, so decimal (`2130706433`), hex (`0x7f000001`), octal (`0177.0.0.1`) and IPv4-mapped (`::ffff:a.b.c.d`) bypass forms are normalized by `url::Url` before they are judged. VERIFIED by test `numeric_bypass_forms_blocked` and `ipv4_mapped_ipv6_cannot_smuggle_a_private_address`.
- **Pure and synchronous by contract** — no DNS, no syscalls, no I/O. The resolve-and-pin half of SSRF defence deliberately stays in `toctou` so a verdict can sit in front of every fetch without adding latency (pinned by a sub-microsecond budget test).

Wired call sites (all VERIFIED in the diff): `urlfloor::check_url_with_policy`/`check_url_strict`/`block_reason`, `EgressEngine::plan_with_policy`, `toctou::is_blocked_ip` (now a delegate), `everyaios-core::tools` (agent URL loop → strict), `everyaios-browser::tiers` (navigation → the shared classifier; the local copy is deleted). `everyaios-browser` gained a dependency on `everyaios-guard` for this.

## 3. Agent-config surfaces (the second finding)

**REPORTED (CVE-2025-53773):** a prompt injection caused an agent to rewrite its own configuration to enable auto-approval and then execute. The exact advisory was **not primary-read here** and is not load-bearing — the structural lesson stands on its own and is checkable in this repo: *config is an attack surface for authority escalation, not just a place to store settings.*

**What this repo did about it (VERIFIED):** `protected_paths` gained `.claude/`, `.codex/`, `.gemini/`, `.cursor/`, `.windsurf/`, `.cline/`, `.roo/`, `.continue/`, `.openclaw/`, `.aider/` and `.mcp.json`, all `rm_critical`. The deliberate boundary: **only settings are protected.** `CLAUDE.md`/`AGENTS.md` and `.github/workflows/*` stay ordinary editable workspace files, because the user and the agent legitimately edit them and over-protecting them would break normal work. Both halves are pinned by tests (`other_harness_settings_are_protected`, `instruction_files_are_not_over_protected`).

## 4. Verification actually run (2026-09-13)

| Check | Result |
|---|---|
| `cargo check --workspace --all-targets` | 0 errors, **0 warnings** (the two dead-code leftovers the wave introduced were removed in the same pass) |
| `cargo test -p everyaios-guard --lib` | 171 passed / 6 ignored |
| `cargo test -p everyaios-core --lib` | 620 passed |
| `cargo test -p everyaios-browser --lib` | 188 passed |
| `cargo test -p everyaios-mcp --lib` | 59 passed (60 after v3.74) |
| `cargo fmt --all -- --check` | clean |
| `node scripts/check-doc-sync.mjs` | green |
| `node scripts/ipc-parity.mjs` | 283 registered, 0 broken |

## 5. What P62 did **not** finish (recorded open, not implied)

- **P62.2 — MCP attach containment is a primitive, not a live path.** `SandboxPosture`, `spawn_with_posture` and `spawn_confined` (`--clearenv` + `--unshare-net` through `LinuxBwrapBackend`) are landed and tested, but `src-tauri/src/mcp_cmds.rs` still calls the legacy uncontrolled `AttachedServer::spawn`. **Why it was not flipped:** `--clearenv` removes `PATH`/`HOME`, which env-based stdio MCP servers require, so making `Confined` the default before those servers move onto the brokered credential path would break working installs. The ACP harness child already spawns sandboxed; MCP is the remaining outlier (this is also the long-standing P7.8/P7.9 note in `TODO.md`).
- **P62.4 — user-configured endpoints are not granted into the egress engine.** `EgressEngine::grant_host`/`with_granted_hosts`/`with_policy` exist but have **no production caller**, while the engine itself is constructed with `NetPolicy::default()` (`ToolService` and `chat.rs`). Because the pre-fix `urlfloor` had no network check at all, the new private/LAN refusal is a **behaviour change**: a user-typed LAN endpoint (e.g. a provider `base_url` on a NAS) that used to pass can now be denied. That is the intended floor for agent-chosen destinations, but the *user's own* configured endpoints must be granted — which is exactly what the unwired API is for. Recorded as an open row rather than papered over.

## 6. Resolution (v3.74 — 2026-09-15)

Both open items above are now closed; the findings themselves are kept verbatim as the audit's point-in-time record.

- **P62.2 closed.** The live path flipped: `src-tauri/src/mcp_cmds.rs::mcp_attach_commit` spawns through `AttachedServer::spawn_with_posture(SandboxPosture::preferred(), …)`, so on Linux an attached third-party stdio server runs confined. The recorded blocker (`--clearenv` removing `PATH`/`HOME`) is solved by `everyaios_guard::sandbox::essential_env()` — a small, explicit allow-list applied on top of `--clearenv`, with `spawn_stdio_with_env` refusing any secret-shaped name (`*_API_KEY`/`*_TOKEN`/`*SECRET`/`*PASSWORD`/`EVERYAIOS_*`). A requested confined launch **fails closed** rather than downgrading to ambient; non-Linux stays honestly `Ambient` (the recorded P49.5 platform gap).
- **P62.4 closed.** `ChatRelay::{with_endpoint, with_local, with_base_url}` call `grant_egress_url` → `EgressEngine::grant_url`, so a user-configured endpoint is a granted destination. The **unconditional** classes (cloud-metadata, link-local, multicast, broadcast) are still refused even with a grant, and the agent tool path floors on its own through `urlfloor` — the grant applies only to user/catalog-configured destinations.
- **Also closed in the same pass (P63.9/.10):** an attached MCP child is now killed on handle `Drop` (it was being orphaned), and provider endpoint resolution is two-way (`refresh_endpoint_live` retires a provider that loses its last key / profile). See `SPEC-CHANGELOG.md` v3.74 for evidence.
