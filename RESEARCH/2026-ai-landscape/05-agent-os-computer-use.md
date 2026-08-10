# 05 · Agent OS + Computer-Use Layer

> Research on "LLM as the CPU" projects: agent operating systems, desktop/computer-use control,
> and the Linux-dev → Windows-deploy strategy.

---

## 1. OpenFang OS (RightNow-AI/openfang) — Rust Agent OS

**Verified real.** Rust, structured as a **14-crate workspace**. Single ~32MB standalone binary,
**sub-200ms cold start**, zero interpreter overhead. Bundles dozens of tools, channels, LLM providers
into one self-hosted binary.

**Architecture tiers (3):** Kernel (core) / middle / top. Native WASM sandbox for tools; supports
dynamic loading of tools as `.so` libraries (via `libloading`) or pre-compiled `.wasm` modules.

**Why it wins on Windows:** compiled binary, no Python venv lag, native tool execution.

**What to steal (study, don't copy):**
1. **WASM tool sandbox** — write a tool once, compile to `.wasm`, drop into agent runtime dir; main app
   loads it dynamically. Good fit for our agents' file/shell tools.
2. **Dynamic `.so` plugins** — modular task libraries loaded at runtime while main binary stays static.
3. **Cargo workspace caching** — isolate core architecture from script modifications so rebuilds only
   compile the changed crate. (We're TS, so the analog is: keep core compiled/typed, isolate skill dirs.)

## 2. AIOS Kernel (agiresearch/AIOS) — Agent OS Kernel

**Verified real.** Multi-language: **Rust + Python**. Core systems daemon, resource scheduling layers,
IPC protocols in Rust (safety + bare-metal perf); Python for LLM/ML glue.

**What it does:** abstraction layer that isolates resource management, memory, storage, and
tool-scheduling away from chat scripts — so the LLM functions as a true system CPU.

**What to steal:** the resource-scheduling abstraction concept (our WorkflowEngine could adopt
priority/quotas per agent).

## 3. Open Interpreter (55K+ ⭐, Python)

- Premier tool for LLMs running code (Python/shell) locally to drive your desktop environment.
- Sandboxes code execution (Docker option). **Steal:** local code-execution loop with user-approval UX.

## 4. Agent S (simular-ai/Agent-S) — computer-use GUI agent

- Intelligent agentic framework by Simular AI that navigates complex GUIs across **Linux, Mac, Windows**
  like a human operator (screenshots + accessibility APIs + input control).
- **Steal:** the observation→plan→act loop over the OS UI. Lower priority than WebView automation.

## 5. OpenWork (open-source desktop workspace)

- Local alternative to cloud-locked "digital workers" like Claude Cowork. (Lower verification confidence
  — check before deep integration.)

## 6. Browser Use (browser-use/browser-use, 107.9K ⭐, Python, MIT)

- The leading library for LLM + browser: DOM-based perception to log into web apps, fill forms, pull
  live data. Playwright harness, optional cloud.
- **Steal:** the DOM-compaction strategy (what gets sent to the LLM from a page) — implement over our
  WebView layer.

---

## Windows / Linux Strategy (from research)

**Market reality (2026):** Windows ~65–71% desktop share; macOS ~20–28%; Linux ~4.5–5% (the recent
"10% Linux" StatCounter spike is largely AI-bots, per Cloudflare Radar filtering).

**Strategy:**
- **Windows-first deployment** (the market), **Linux-first development** (Docker/microVM sandboxing,
  subprocess speed, "everything is a file").
- Windows speed play: embed **WebView2** directly (no heavy Edge window), raw Win32 async file I/O,
  Job Objects for code-execution sandboxing, `windows-rs` crate if Rust.
- For a TS/Electron app: Electron + WebView2 tabs is the pragmatic path; Rust core (Tauri/Slint) later.

**The "replace all apps" architecture (Rust version, for later):**
1. Embedded headless browser engine (Wry/WebView2) — DOM in memory, bypass visual rendering.
2. LSP client in the binary — agent reads code syntax/jumps/compiles natively (editor replacement).
3. Cross-compile `x86_64-pc-windows-msvc` from Linux dev box.
4. Job Object / cgroups sandboxing around code execution.
