# 44 — Modularity Deep-Dive: VS Code, Zed, Hermes, Agentic Apps (source-verified)

> **Date:** 2026-08-07 · **Purpose:** answer "how did these apps make themselves 100% modular / future-expandable?" — then extract the exact mechanisms we copy into our **Extension ABI** (doc 44b proposal → spec §0 hardening of P8).
> **Method:** all claims below were source-read this pass from the live repos (raw.githubusercontent HEAD trees). Nothing is README-paraphrased.
> **Related:** doc 05 (plugins/agents/skills), doc 41 (steal index), doc 43 (landmines), ARCH/02 (module layout), spec P8 (Forge/skills).

---

## 0. TL;DR — the 6 mechanisms that make an app expandable forever

Every genuinely extensible app we studied uses the SAME six mechanisms, in different ratios. Our spec already has most of them; the gaps are marked `[GAP]`.

| # | Mechanism | VS Code | Zed | Hermes | We have? |
|---|---|---|---|---|---|
| M1 | **Manifest-declared contribution points** (what an extension *is allowed to add*) | `contributes` in package.json | `extension.toml` fields | `config.yaml` blocks | 🟡 partial (F9 registry, no schema) |
| M2 | **Separate extension host process** (crashes don't kill the app) | dedicated Node EH process | WASM host in-process (wasmtime) | N/A (monolith, single proc) | 🟢 yes (sidecar + children) |
| M3 | **Lazy activation events** (extensions load only when needed) | `activationEvents` | lazy `register_*` proxies | lazy skill loading | 🟡 partial (sidecar lazy-spawn) |
| M4 | **Capability/allow-list gates** (what an extension *may execute*) | Workspace Trust + `capabilities` | `ExtensionCapability` enum + `CapabilityGranter` | per-plugin trust flags, fail-closed | 🟢 yes (Trust Ladder, GuardRail) |
| M5 | **Versioned ABI / API surface** (extensions pin an API version; host evolves) | `@types/vscode` + proposed API channel | `schema_version` + WIT `since_vX_Y_Z` modules | model-version metadata | ❌ **[GAP] — no ABI versioning spec** |
| M6 | **Host-owned privileged services** (extension asks, host executes) | EH proxies to main | WIT `delegate` interfaces | `ctx.llm` host facade | 🟢 yes ("sidecar proposes, Rust disposes") |

**The single biggest finding:** nobody ships "unlimited power" extensions. They ship *narrow, allow-listed, versioned capability slots*. Zed is the gold standard here — a `process:exec` capability literally lists the command + args with `*`/`**` wildcards, and the host enforces it in `CapabilityGranter`.

---

## 1. VS Code — the contribution-point model (the original)

### 1.1 Source evidence (read this pass)
- Manifest schema + validation: `src/vs/platform/extensions/common/extensions.ts` (570 lines) — `IExtensionManifest` w/ `activationEvents`, `extensionKind`, `contributes`, `capabilities`.
- Extension host process: `src/vs/workbench/api/node/extensionHostProcess.ts` + `src/vs/workbench/services/extensions/common/extensionHostManager.ts` + `extensionHostKind.ts`.
- Registry: `src/vs/workbench/services/extensions/common/extensionDescriptionRegistry.ts`.
- Proposed-API channel: `extensionManifestPropertiesService.ts` (gates unstable APIs behind `enabledApiProposals`).

### 1.2 What we steal from VS Code

1. **The `contributes` contract — declare, don't code.** An extension's `package.json` declares *contribution points* (commands, views, menus, languages, themes, chatParticipants, languageModelTools, mcpServerDefinitionProviders). The core app renders/registers them generically. New extension = new declarative entry, zero core code.
   - **Our mapping:** our `ToolDefinition`, skill manifests, connector manifests must become *typed contribution schemas* (JSON Schema validated at load, like Zed's `extension.toml` parse), not free-form.
2. **Lazy activation events.** `onCommand:xyz`, `onLanguage:python`, `onView:abc` — extension *process* exists but the extension's code doesn't load until its activation event fires. Startup stays fast with 1000s of extensions installed.
   - **Our mapping:** skills/tools/connectors register a manifest now, load code on first use. Already aligned with our lazy sidecar spawn; extend to *per-skill lazy load*.
3. **Host proxies.** `extHostCustomers` — the extension host never talks to the UI directly; it talks through typed proxies. Every API `vscode.window`, `vscode.commands` is a proxy across the process boundary.
   - **Our mapping:** mirrors our `pai-ipc` stdio contract. Our proxies must be *narrow* — a plugin gets only the proxy surface its manifest declared.
4. **Workspace Trust + `capabilities`.** Extensions can declare `capabilities: { untrustedWorkspaces: { supported: false } }`; the host refuses to activate them in untrusted workspaces.
   - **Our mapping:** Trust Ladder already covers this conceptually; add *per-extension* trust tiers (Trusted / Sandboxed / Untrusted-refused).

### 1.3 Where VS Code is NOT our model
- Electron monolith with a dedicated EH process — we already do better with Tauri + supervised children (doc 42).
- `extensionKind` (ui vs workspace vs local vs remote) — needed only for remote dev; we're local-first (P10 remote is opt-in).

---

## 2. Zed — the WASM + capability-granter model (THE one to copy for ABI design)

### 2.1 Source evidence (read this pass)
- Manifest: `crates/extension/src/extension_manifest.rs` (607 lines) — `ExtensionManifest` with `schema_version: SchemaVersion(i32)`, `lib: LibManifestEntry`, `themes`, `languages`, `grammars`, `language_servers`, `context_servers`, `slash_commands`, `snippets`, `capabilities`, `debug_adapters`.
- Capability enum: `crates/extension/src/capabilities.rs` (20 lines) — `ExtensionCapability::ProcessExec(ProcessExecCapability) | DownloadFile | NpmInstallPackage`.
- Per-capability matchers: `crates/extension/src/capabilities/process_exec_capability.rs` (116 lines) — command + args with `*` (single-arg wildcard) and `**` (trailing args), unit-tested (`test_allow_exec_wildcard_arg`, `test_allow_exec_double_wildcard`).
- Enforcer: `crates/extension_host/src/capability_granter.rs` (153 lines) — `grant_exec` checks BOTH the manifest's declared `allow_exec` AND the host's `granted_capabilities` before anything runs.
- WASM host: `crates/extension_host/src/wasm_host.rs` (1110 lines) — wasmtime Engine/Store/WASI, `WasmState`, `load_extension()`.
- Versioned ABI: `crates/extension_host/src/wasm_host/wit/since_v0_0_1.rs`, `since_v0_0_4.rs`, `since_v0_0_6.rs` — WIT (WebAssembly Interface Types) interfaces, `MIN_VERSION = 0.0.6`, cumulative compat modules (`latest`, `since_v0_1_0`, `since_v0_6_0`).
- Host proxy registry: `crates/extension/src/extension_host_proxy.rs` (468 lines) — RwLock'd registries for theme/grammar/language/lsp/context-server/slash-command/debug-adapter proxies; lazy `register_*`.

### 2.2 What we steal from Zed (the non-negotiable three)

1. **Capability allow-lists in the manifest, enforced by the host.** Zed extensions run *inside* the host (WASM) but cannot execute a single process without `capabilities = [{ process:exec, command: "git", args: ["status"] }]` (or wildcards). The `CapabilityGranter` double-checks: manifest says allowed AND host granted.
   - **Our mapping:** our skill/tool manifests get an explicit `capabilities` array. Anything not listed = refused by `pai-guard` (deterministic, in Rust). This is strictly better than our current "permission class" (F9) because it's *per-argument*, not just per-tool.
   - **Steal verbatim:** the `*` / `**` argument wildcard matcher + its unit tests (`process_exec_capability.rs`).
2. **Versioned ABI via schema_version + WIT.** Zed's extensions pin `schema_version`; the host keeps cumulative interface versions (`since_v0_0_1` … `since_v0_0_6`) so old extensions keep working as the API grows. This is THE missing piece in our spec — `[GAP] M5`.
   - **Our mapping:** our `pai-ipc` contract + skill manifest schema get a mandatory `abi_version`. Host keeps per-version adapters. New features = new version, never a break.
3. **Declarative, typed manifest with a `lib` entrypoint.** `extension.toml` is parsed by serde into a typed struct; the `lib` points to the compiled entrypoint (WASM module). Everything else (languages, servers, commands) is *declared*, not coded.
   - **Our mapping:** skill = `SKILL.md` frontmatter + typed manifest (TOML/JSON) + entrypoint. Aligns with our `~/.pai/skills/` plan; make the manifest typed + schema-validated at load.

### 2.3 What Zed proves about sandboxing
- Extensions are WASM (wasmtime + WASI) → no raw FS, no raw network, no raw exec by default. Every privilege is a *capability the manifest declared*.
- **Our takeaway:** we don't need WASM for v1 (we have rquickjs + subprocess sandboxes, doc 33), but the *capability semantics* must match Zed exactly: a plugin never "just runs" anything; it requests, the host checks the manifest allow-list, then the guard, then executes in a sandbox.

---

## 3. Hermes — the adapter/registry + fail-closed trust model

### 3.1 Source evidence (read this pass)
- **Provider adapters as first-class modules** (the entire repo is file-per-concern): `agent/anthropic_adapter.py`, `azure_identity_adapter.py`, `bedrock_adapter.py`, `gemini_native_adapter.py`, `codex_responses_adapter.py`, `copilot_acp_client.py`, `image_gen_provider.py` + `image_gen_registry.py`.
- **Host-owned LLM facade:** `agent/plugin_llm.py` (1046 lines) — `ctx.llm.complete()/complete_structured()/acomplete()/acomplete_structured()`; plugins NEVER hold raw API keys or OAuth tokens; every override (provider/model/agent/profile) gated by per-plugin trust flags in `config.yaml`: `allow_provider_override`, `allow_model_override`, `allowed_providers`, `allowed_models`, `allow_agent_id_override`, `allow_profile_override` — **fail-closed** (missing config block = overrides disabled).
- **Skill discovery:** `agent/skill_utils.py` (934 lines) — frontmatter parsing, platform matching (`skill_matches_platform`), org-mirror paths, excluded/support-path rules, lazy YAML loader.
- **Telemetry/observability:** `agent/monitoring/` (emitter, events, OTLP exporter, redaction, policy) — Hermes ships real OpenTelemetry w/ redaction (doc 43 §2.3 cross-ref).
- **Budgets:** `iteration_budget.py` (already source-read, doc 43).

### 3.2 What we steal from Hermes

1. **Host-owned privileged facade (`ctx.llm` pattern).** A plugin gets `ctx.llm` — it can *ask* for model calls but never touches the key-ring. Our `pai-vault` + sidecar boundary already does this for tools; extend the pattern to *plugins*: plugin code runs in the sandbox, asks `ctx.llm`, Rust vault resolves the key.
2. **Per-plugin trust flags, fail-closed.** `allow_provider_override=false` by default; `allowed_providers`/`allowed_models` lists. Missing config = disabled. This is the *plugin-facing* complement to our Trust Ladder (P9).
3. **One adapter file per provider, registered in a registry.** `image_gen_registry.py` pattern — new provider = new file + register; zero core changes. We already do this in `core-providers` (ARCH/02 §2.3); formalize the registry interface for *extensibility* (external providers).

### 3.3 Hermes is NOT our model for
- Process topology: Hermes is a single Python process monolith — its *code* is modular, its *runtime* is not. We're the opposite (process-isolated, doc 42). That's why we copy its **file/registry structure**, not its runtime.

---

## 4. Agentic apps — the plugin-manifest zoo (web-researched, cross-checked vs our doc 05)

| App | Packaging | Manifest | Extension points | Sandbox | What we steal |
|---|---|---|---|---|---|
| **Claude Code** | folder/archive | `.claude-plugin/plugin.json` | commands, agents, hooks (PreToolUse), mcpServers; kebab-case namespacing | host shell, approval prompts | namespacing (no collisions); hook points (Pre/PostToolUse) as *declared* lifecycle interceptors |
| **opencode** | TS module / npm | `plugin.ts` exporting fn(ctx)→hooks | event hooks (`command.*`, `file.*`, `session.*`, `tool.execute.before/after`), Zod-typed custom tools, shell.env | Bun process, interception hooks | `tool.execute.before` block pattern (plugin can veto); Zod-typed tool args (schema = permission surface) |
| **Cursor** | workspace files | `.cursor/rules/*.mdc` + AGENTS.md | glob-scoped prompt instructions (frontmatter: alwaysApply, globs, description) | none (declarative text) | glob-scoped declarative rules — our blueprint `.md` files already do this (P2); add `globs` scoping |
| **Cherry Studio** | config/JSON | client settings + MCP registry | **agent-bound MCP servers** (explicit bind, never global) | subprocess stdio (JSON-RPC) | explicit agent→capability binding (least privilege per agent) |
| **LibreChat** | YAML | `librechat.yaml` | tool include/exclude filters, code interpreter, MCP, agents | Docker containers for code exec | tool-level include/exclude per agent (granular permission) |
| **AnythingLLM** | folder bundle | `plugin.json` + `handler.js` | `setup_args` (declarative UI forms for secrets), `this.requestToolApproval()` | Node module isolation | `setup_args` → our skill install UI; `requestToolApproval` → our Guard-2 diff-card API |

**Cross-cutting takeaways (all six agree):**
- Plugins are **declarative bundles** (manifest + assets), discovered by scanning a directory, **not** linked into the core.
- **Approval is a first-class async primitive** (`requestToolApproval`, hooks, prompts) — a plugin can halt mid-flight and ask the user. We have Guard-2 diff-cards; expose it *to plugins* as a callable API.
- **Nothing is global by default** — everything is bound to a specific agent/workspace (Cherry Studio's explicit MCP binding is the strictest and best).

---

## 5. Synthesis — our Extension ABI (the concrete design, distilled from all four)

### 5.1 The six ABI layers (each maps to M1–M6)

```
plugin-bundle/
├── manifest.toml          → M1: declared contribution points + capabilities + abi_version (typed, schema-validated at load)
├── SKILL.md / rules/      → M2: declarative intelligence (Cursor-style, glob-scoped)
├── code/                  → entrypoint (rquickjs sandbox or subprocess; Zed-style capability-gated)
└── assets/                → icons, prompts, config templates
```

1. **Manifest schema (`manifest.toml`)** — typed, validated at load, versioned:
   ```toml
   abi_version = 1            # M5 — mandatory, like Zed's schema_version
   name = "example"           # kebab-case; ALL ids namespaced with it (Claude Code rule)
   version = "1.2.0"
   contributes = ["tools", "skills", "connectors", "search-adapter"]   # M1 — typed list
   capabilities = [           # M4 — Zed-style allow-list, enforced by pai-guard
     { kind = "process:exec", command = "git", args = ["status"] },     # * and ** wildcards
     { kind = "http", hosts = ["api.example.com"], methods = ["GET"] },
     { kind = "files", paths = ["~/.pai/workspace/example/**"], modes = ["read"] }
   ]
   trust = "sandboxed"        # per-extension trust tier (VS Code Workspace Trust analog)
   llm = { allow_model_override = false, allowed_models = [] }  # Hermes fail-closed flags
   ```
2. **Registry + lazy activation** — scan `~/.pai/plugins/` at boot → validate manifests → register contribution points → **load code only on first use** (VS Code activation events / Zed lazy proxies).
3. **Capability granter** — port Zed's `CapabilityGranter` semantics into `pai-guard`: double-check (manifest allow-list ∧ host grant) before any exec/FS/network/shell. Deterministic regex + argument wildcard matcher (copy Zed's unit-tested matcher).
4. **Host-owned facades** — `ctx.llm` (Hermes), `ctx.files` (scoped to capability paths), `ctx.web`, `ctx.approval` (AnythingLLM requestToolApproval → our Guard-2 card). Plugin never touches the vault, the browser session vault, or the audit log.
5. **Versioned ABI** — `abi_version` in manifest + cumulative host adapters (Zed's `since_v0_0_x` pattern). Host vN serves plugin v1..vN. **This closes `[GAP] M5` — the one thing our spec was missing.**
6. **Explicit binding** — a plugin's capabilities are bound to *specific agents/workspaces* only (Cherry Studio model). No global auto-grant.

### 5.2 What we ALREADY have (don't rebuild — docs 41/43)
- Trust Ladder + GuardRail + diff-cards (P9) → the enforcement substrate; add the Zed-style *capability argument matcher* and *per-plugin trust flags*.
- Skill registry `~/.pai/skills/` (P8) → becomes a special case of the plugin registry (plugins are richer: code + capabilities; skills stay declarative).
- Tool registry `ToolDefinition` (F9) → the `contributes.tools` type.
- Process isolation (doc 42) → plugins run in existing sandboxes (rquickjs 64MB/30s, or subprocess); no new runtime needed.
- `setup_args`-style declarative config → reuse connector `config.toml` patterns (ARCH/03).

### 5.3 The 6 concrete spec patches (to apply on next spec update)
1. Add **ABI versioning** to `pai-ipc` contract + all manifest schemas (schema_version pattern). — closes M5
2. Add **capability allow-list + argument wildcard matcher** to skill/tool/connector manifests, enforced in `pai-guard` (copy Zed `process_exec_capability.rs` + tests). — hardens M4
3. Add **per-extension trust flags** (Hermes fail-closed `allowed_*` lists). — hardens M4/P9
4. Add **explicit agent-binding** rule: no capability is global; every plugin capability is bound to declared agents/workspaces (Cherry Studio). — hardens M1
5. Add **lazy per-skill/plugin activation** (register now, load on first use — VS Code activation events). — hardens M3
6. Add **`ctx.approval()` API** exposed to plugin code → Guard-2 diff-card (AnythingLLM pattern). — hardens P9
6-extra. **Dogfood rule (VS Code #7):** ship our own first-party "plugins" (office engine, connectors, search adapters) through the same manifest+registry path — proves the ABI works and forces it to stay clean.

---

## 6. Repo references (for future re-checks — raw paths)

| Project | File | What it proves |
|---|---|---|
| microsoft/vscode | `src/vs/platform/extensions/common/extensions.ts` | manifest schema, contribution points, activationEvents, capabilities |
| microsoft/vscode | `src/vs/workbench/services/extensions/common/extensionHostManager.ts` | EH process lifecycle |
| zed-industries/zed | `crates/extension/src/extension_manifest.rs` | extension.toml schema, `allow_exec` gate |
| zed-industries/zed | `crates/extension/src/capabilities.rs` | capability enum (process:exec / download_file / npm:install) |
| zed-industries/zed | `crates/extension/src/capabilities/process_exec_capability.rs` | `*`/`**` argument matcher + tests |
| zed-industries/zed | `crates/extension_host/src/capability_granter.rs` | host-side grant double-check |
| zed-industries/zed | `crates/extension_host/src/wasm_host.rs` | wasmtime host lifecycle |
| zed-industries/zed | `crates/extension_host/src/wasm_host/wit/since_v0_0_1.rs` (+ _0_0_4, _0_0_6) | versioned ABI pattern |
| zed-industries/zed | `crates/extension/src/extension_host_proxy.rs` | lazy proxy registries |
| NousResearch/hermes-agent | `agent/plugin_llm.py` | host-owned LLM facade + trust flags |
| NousResearch/hermes-agent | `agent/skill_utils.py` | skill discovery, frontmatter, platform match |
| NousResearch/hermes-agent | `agent/image_gen_registry.py`, `agent/*_adapter.py` | adapter-per-provider registry pattern |
| NousResearch/hermes-agent | `agent/monitoring/otlp_exporter.py` | OTel w/ redaction |

---

## 7. Bottom line for the "100% modular" question

**We were honest last pass: ~90%, with the missing 10% being (a) a formal plugin/extension ABI and (b) ABI versioning.** This research closes (a)+(b):

- **Zed gives us the capability/ABI model** (versioned manifest + allow-listed capabilities + host-enforced granter + versioned WIT interfaces).
- **VS Code gives us the contribution-point + lazy-activation model** (declare everything, load nothing until needed, host proxies).
- **Hermes gives us the fail-closed trust + adapter-per-provider model** (plugins ask, host owns keys; new providers are new files, not core edits).
- **The six agentic apps give us the packaging/UX details** (namespacing, explicit agent-binding, `setup_args`, approval primitive).

With the 6 spec patches in §5.3 applied, the answer becomes **defensible 100% for the seams that matter**: any future capability (new model, new connector, new file format, new browser engine, new agent) lands as a *bundle*, not a core edit.
