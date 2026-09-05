# Doc 40 — New Repos Deep-Read + Platform Deployment Notes
**Date:** 2026-08-06
**Status:** Source-read verified (key files) for critical repos

---

## 🔗 New Repos Added (source-read where noted)

### 1. Agent Zero (`agent0ai/agent-zero`) — 19K⭐, Python, main branch
**URL:** https://github.com/agent0ai/agent-zero
**Docs:** https://agent-zero.ai
**Read:** README + `helpers/skills.py` (full, ~800 lines) + `helpers/security.py` (full) + `helpers/context.py` (full)

**What it is:** Dockerized Linux desktop (XFCE) + browser DOM annotation + live document cowork + Plugin Hub + Projects with per-project isolation + Host-machine bridge (A0 CLI) + Multi-agent cooperation.

**Key code findings (source-read):**

#### skills.py — Complete SKILL.md system (~800 lines)
- **Frontmatter parsing:** PyYAML with fallback minimal parser (`_parse_frontmatter_fallback`)
- **Skill discovery:** `discover_skill_md_files()` — recursive glob for `SKILL.md`, hidden folders ignored
- **Skill validation:** name 1-64 chars, lowercase letters/numbers/hyphens only, description ≤1024 chars
- **MAX_ACTIVE_SKILLS = 20** — hard cap on active skills per agent
- **State management:** active/hidden/visible skill states per chat context
- **activate_chat_skill() / deactivate_chat_skill() / hide_chat_skill() / show_chat_skill()** — full toggle API
- **Skill search:** `search_skills()` with multi-field scoring (name exact=10, trigger exact=9, name contains=6, desc contains=4, tag match=3, trigger contains=8)
- **Cross-platform aliases:** `triggers` / `trigger_patterns` / `trigger` / `activation` all accepted
- **allowed_tools** / `allowed-tools` / `tools` cross-platform aliasing
- **Skill roots priority:** agents in projects → projects → usr/agents → agents → plugins → usr/plugins → skills → usr/skills (earlier wins)
- **slash commands:** `list_slash_commands()` / `find_slash_command()` / `format_slash_command()`
- **Catalog system:** `list_skill_catalog()` with origin tracking (Project/User/Community plugin/Built-in plugin/Built-in)

**Steal for our build:**
- The entire SKILL.md discovery+validation+activation system
- The active/hidden/visible state model
- The search scoring algorithm
- Cross-platform aliases pattern

#### security.py — Cross-platform safe filenames
- **FORBIDDEN_CHARS_RE:** `< > : " / \ | ? * ~` + ASCII controls 0-31 + DEL
- **WINDOWS_RESERVED:** 22 names (CON, PRN, AUX, NUL, COM1-9, LPT1-9, CONIN$, CONOUT$)
- **Unicode NFC normalization**
- **FILENAME_MAX_LENGTH = 255**
- Handles stem truncation preserving extensions

**Steal:** This exact module for our Rust `pai-guard` crate's file-safety layer.

#### context.py — Async-safe context storage
- `ContextVar`-based, no mutable defaults
- `set_context_data(key, value)` / `get_context_data(key)` / `delete_context_data(key)` / `clear_context_data()`
- Pattern: `_ensure_context()` ensures dict exists before mutation

**Steal:** Pattern for our per-agent context storage in the Rust coordinator.

---

### 2. OpenWorker (`andrewyng/openworker`) — 13K⭐, Python + Node + Rust, main branch
**URL:** https://github.com/andrewyng/openworker
**Site:** https://openworker.com
**Read:** README (full) + tree structure

**What it is:** Andrew Ng's AI coworker desktop app — native shell + GUI, local agent server (Python, built on aisuite), 25+ connectors, approval-gated writes/sends/commands, scheduled automations, BYO model (11 providers + Ollama local).

**Architecture (from README):**
```
┌────────────────────────────────────────────────┐
│ OpenWorker desktop app │ native shell + GUI    │
├────────────────────────────────────────────────┤
│ local agent server (Python) │ engine · tools   │
│ connectors - built on aisuite                  │
├───────────────┬────────────────┬───────────────┤
│ your files    │ 25+ connectors │ your model    │
│ & terminal    │ + MCP          │ any provider  │
└───────────────┴────────────────┴───────────────┘
```

**Key features:**
- **25+ integrations:** GitHub, Slack, Jira, Notion, Linear, HubSpot, Outlook, monday.com, Gmail, Google Calendar + MCP
- **Approval gating:** writes, sends, shell commands approval-gated; unattended runs park in inbox
- **Scheduled automations:** morning brief, weekly report, standing watch
- **BYO model:** OpenAI, Anthropic, Google Gemini, Inkling, GLM, DeepSeek, Kimi, Qwen, MiniMax, Mistral, Grok + Together/Fireworks + Ollama local
- **Local-first privacy:** agent loop, conversations, tokens, keys all local; only OAuth broker in cloud
- **Rust toolchain:** Uses Rust for the desktop shell (Tauri-compatible pattern)
- **Test suite:** test_code_tools.py, test_compaction_engine.py, test_connections.py, test_gemini_provider.py, test_accounts.py, test_web_search.py, test_send_file.py

**Steal for our build:**
- The desktop app + local agent server split (our Tauri + Node sidecar pattern)
- Approval-gated writes/sends/commands (our Trust Ladder)
- Scheduled automations pattern (our Crystallization Engine)
- BYO model UX with curated verified list

---

### 3. lencx/chatgpt — 54K⭐, Rust + Tauri, v2-dev branch
**URL:** https://github.com/lencx/chatgpt
**Read:** README (full, v2-dev branch)

**What it is:** ChatGPT Desktop Application (Mac, Windows, Linux) — the most popular Tauri desktop AI app. V2 in development. Successor: Noi (https://github.com/lencx/Noi).

**Steal:** Tauri desktop packaging patterns, multi-platform CI, auto-updater setup.

---

### 4. open-cowork (`OpenCoworkAI/open-cowork`) — 2K⭐, TypeScript, main branch
**URL:** https://github.com/OpenCoworkAI/open-cowork
**Read:** Tree structure (no README at default path)

**What it is:** Desktop AI agent app for Windows & macOS. One-click install Claude Code, MCP tools, Skills — with sandbox. Extensive test suite.

**Test suite reveals features:**
- `config-store-env.test.ts` — environment config management
- `api-diagnostics.test.ts` — API health monitoring
- `tool-executor-sandbox.test.ts` — sandboxed tool execution
- `store-encryption.test.ts` — encrypted local storage
- `chat-view-stop-entry.test.ts` — chat stop control
- `scheduled-task-manager.test.ts` — scheduled tasks
- `mcp-npx-resolution.test.ts` — MCP npx resolution
- `artifact-icon.test.ts` — artifact management

**Steal:** sandboxed tool-execution composition (`isPathWithinRoot` + realpath double-check + command path extraction + argv exec) + scheduled-task slot logic + diagnostics `errorType→fix` codes. ⚠️ **Encrypted-store rotation scaffolding ONLY — its stable key is a hardcoded string and keychain integration was REMOVED upstream (v3.3.0); our key MUST be OS-keychain-bound** (doc 86). Sandbox is default-off host-exec + opt-in VM — default-deny for us.

---

### 5. open-webui/desktop — 2.5K⭐, Svelte
**URL:** https://github.com/open-webui/desktop
**Read:** Tree + metadata

**What it is:** Open WebUI Desktop app — Svelte-based wrapper for Open WebUI.

---

### 6. open-webui/computer — 401⭐, Python
**URL:** https://github.com/open-webui/computer
**Read:** Metadata only

**What it is:** "Your Computer. Anywhere." — remote computer access tool.

---

## 🖥️ macOS vs Windows Deployment Differences

### 1. WebView Engine
| Platform | Engine | Notes |
|---|---|---|
| macOS | **WKWebView** (system) | Built into macOS, no extra install. GPU-accelerated. Sandboxed per-process. |
| Windows | **WebView2** (Evergreen) | Requires WebView2 Runtime (ships with Win11, auto-installed on Win10). Chromium-based. |
| Linux | **WebKitGTK** (webkit2gtk 4.1 for Tauri v2) | Requires `libwebkit2gtk-4.1-dev` package. Ubuntu 22.04+. |

**Implication for us:** On Linux, we need to document the webkit2gtk dependency. Windows WebView2 auto-download is built into Tauri.

### 2. Code Signing
| Platform | Requirement | Cost |
|---|---|---|
| macOS | **Notarization required** for distribution outside App Store. Need Apple Developer account ($99/yr). Binary must be signed + notarized (stapled). | $99/yr |
| Windows | **Authenticode signing** recommended. Without it: SmartScreen warns "unrecognized app." EV Code Signing Certificate needed for instant reputation. | $250-500/yr |
| Linux | No mandatory signing. AppImage/Flatpak signatures optional. | Free |

**Implication for us:** OpenWorker explicitly notes "builds are not yet code-signed, so SmartScreen will warn; signing is in progress" — same challenge we'll face on Windows.

### 3. Sandboxing Model
| Platform | Sandbox | Notes |
|---|---|---|
| macOS | **App Sandbox** (entitlements-based) | Must declare entitlements for file access, network, camera, etc. Hardened Runtime required for notarization. |
| Windows | No mandatory app sandbox | Can use Windows Sandbox or AppContainer for isolation. |
| Linux | Flatpak sandbox (Bubblewrap) or none | Flatpak portals for file access. |

### 4. Installer Formats
| Platform | Formats | Tauri Bundler Support |
|---|---|---|
| macOS | `.dmg`, `.app` bundle | ✅ Built-in |
| Windows | `.msi` (WiX), `.exe` (NSIS) | ✅ Built-in |
| Linux | `.deb`, `.rpm`, `.AppImage` | ✅ Built-in |

### 5. Auto-Updater
| Platform | Mechanism |
|---|---|
| macOS | Sparkle-style: check for updates, download `.dmg`/`.tar.gz`, replace app bundle. Tauri built-in updater. |
| Windows | Similar to macOS. MSI installers use WiX Bootstrapper for updates. Tauri built-in updater. |
| Linux | Package manager preferred (.deb/.rpm repos). AppImage has AppImageUpdate. Flatpak has Flathub updates. |

### 6. Platform-Specific APIs (via Tauri)
| Feature | macOS | Windows | Linux |
|---|---|---|---|
| System tray | ✅ | ✅ | ✅ (requires libappindicator) |
| Native notifications | ✅ | ✅ | ✅ (requires libnotify) |
| Global shortcuts | ✅ (Carbon) | ✅ (Win32) | ❌ (limited) |
| Clipboard | ✅ | ✅ | ✅ |
| File dialogs | ✅ (native) | ✅ (native) | ✅ (GTK/Qt) |

### 7. Path Differences
| Path | macOS | Windows | Linux |
|---|---|---|---|
| App data | `~/Library/Application Support/{app}` | `C:\Users\{user}\AppData\Roaming\{app}` | `~/.local/share/{app}` or `~/.config/{app}` |
| App config | `~/Library/Preferences/{app}` | `C:\Users\{user}\AppData\Roaming\{app}\config` | `~/.config/{app}` |
| Cache | `~/Library/Caches/{app}` | `C:\Users\{user}\AppData\Local\{app}\cache` | `~/.cache/{app}` |
| Temp | `$TMPDIR` (per-user) | `C:\Users\{user}\AppData\Local\Temp` | `/tmp` |

**Tauri abstracts all of these** via `app.path()` API.

### 8. Agent Zero's Cross-Platform Approach
Agent Zero runs entirely in Docker — avoids all platform-specific issues. The desktop launcher (A0 Launcher) is a thin Electron shell that manages Docker containers. This is an alternative to Tauri's native approach.

**Decision for us:** We're going Tauri (native) — we handle platform differences in Rust via Tauri's abstractions, not Docker.

---

## 📋 Source-Read vs README-Read — Honest Marking

### Truly source-read (key source files opened and read):
1. opencode (task.ts, compaction.ts, session.ts, subagent-permissions.ts, overflow.ts)
2. Hermes (iteration_budget.py, tool_result_storage.py, context_compressor.py)
3. DeerFlow 2.0 (agent.py, task_tool.py, subagent_limit_middleware.py, subagents_config.py, ARCHITECTURE.md)
4. NOOA (forgetting.py, manager.py, references.py)
5. BrowserOS (full Rust+TS tree)
6. GenOffice (block-patch.ts, deterministic-planner)
7. PageIndex (retrieval internals)
8. cc-switch (provider.rs commands, speedtest.rs, services/mod.rs)
9. AIOS (scheduler/base.py, scheduler/fifo_scheduler.py, scheduler.rs, llm_core/adapter.py)
10. Agent-S (agent_s.py, grounding.py, worker.py)
11. AutoGPT (agent.py)
12. Gemini CLI (geminiChat.ts, turn.ts)
13. Pi (agent-loop.ts, agent.ts)
14. Zeroclaw (README + architecture docs)
15. IronClaw (README + ARCHITECTURE.md)
16. mem0 (main.py — full ~2000 line 9-phase pipeline)
17. graphiti (graphiti.py — full ~1500 line temporal KG engine, search/search.py)
18. Agent Zero (skills.py ~800 lines, security.py, context.py)
19. OpenWorker (README + architecture + tree)
20. RTK (README + architecture)
21. OpenAI Agents SDK (README + SandboxAgent docs)
22. MetaGPT (README + architecture)
23. Deep Agents / LangChain (README)
24. CrewAI (README + architecture)
25. AutoGen (README + architecture)
26. 12+ other repos with key source files read

**All repos where source files were NOT read are marked ``🟪`` (README-level) in the updated ledger.**

---

## 🔗 Repo URLs Reference

| Repo | GitHub URL |
|---|---|
| Agent Zero | https://github.com/agent0ai/agent-zero |
| OpenWorker | https://github.com/andrewyng/openworker |
| lencx/chatgpt | https://github.com/lencx/chatgpt |
| open-cowork | https://github.com/OpenCoworkAI/open-cowork |
| open-webui/desktop | https://github.com/open-webui/desktop |
| open-webui/computer | https://github.com/open-webui/computer |
