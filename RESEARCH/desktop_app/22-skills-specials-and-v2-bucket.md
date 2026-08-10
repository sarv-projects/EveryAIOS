# 22 — Skills, Checklists, Special Deep-Dives & V2 Bucket (requested 2026-08-06)

---

## A. Headroom — `headroomlabs-ai/headroom` ⚠️ IMPORTANT (repo + docs researched)
- **Repo:** https://github.com/headroomlabs-ai/headroom | **Docs:** https://docs.headroomlabs.ai/ (site: headroomlabs.ai)
- **What:** **"The context compression layer for AI agents"** — project-claims **60–95% fewer tokens** for JSON data, 15–20% for coding agents (⚠️ **vendor-claimed, not independently benchmarked this pass**). **Not an AI OS** — it's infrastructure/middleware that slots under existing agents (Claude Code, Aider, Cursor, Codex CLI, Cline, Continue) or apps (LangChain, Agno, Vercel AI SDK) to cut token costs without changing agent behavior.
- **Forms:** Python lib + TS SDK (`headroom-ai` on npm) + local FastAPI proxy + **MCP server** + agent command wrappers.
- **How it works (docs-verified pipeline):**
  1. Tool-result interceptor (opt-in)
  2. **CacheAligner** (detector-only; reports prefix drift)
  3. **ContentRouter** → dispatches by type:
     - **SmartCrusher** — shrinks JSON arrays/tool payloads 70–90% (preserves keys/structure/IDs/high-entropy, compresses verbose values)
     - **CodeAwareCompressor** — source code (opt-in)
     - **SearchCompressor / LogCompressor / DiffCompressor** — 40–95% cuts
     - **Kompress** — ML fallback (ModernBERT via ONNX) for generic text
  4. **CCR Local Store** (SQLite) — originals cached; if the model needs raw data back it calls a `headroom_retrieve` tool → **lossless reversal**
- **Key principles:** **fails open** (errors return content unchanged); **live-zone-only compression** (`cache` mode) — compresses only the newest delta, keeps prior history byte-faithful to **preserve provider KV-cache prefixes**; **Rust core** (`headroom._core` via PyO3) for ~1–10ms overhead; **output shaping** (thinking-budget clamps + verbosity steering); **shared cross-agent memory** with dedup (`SharedContext`); `headroom learn` mines past sessions to tune `CLAUDE.local.md`.
- **Why it's important for us:** this is the **production-grade answer to our compaction pillar** (docs 05/16 cache-first + token reduction). It beats our current approach on reversibility + cache-preservation. **Copy: the ContentRouter + SmartCrusher + CCR-retrieve loop.**

---

## B. Skills & checklists (the Agent Skills ecosystem — agentskills.io standard)

| Repo | URL | What / why it matters |
|---|---|---|
| **anthropics/skills** | https://github.com/anthropics/skills | Anthropic's official skills for Claude — the reference implementation of the **Agent Skills standard** (agentskills.io): folder of instructions/scripts/resources loaded dynamically. Our Forge skill format should match this standard. |
| **superpowers** | https://github.com/obra/superpowers | Complete software-development methodology built on composable skills (planning, debugging, TDD); works in Claude Code, Antigravity, Codex App/CLI, Cursor, Factory Droid. Reference for skill-composition + methodology instructions. |
| **ui-ux-pro-max-skill** | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | UI/UX design skill for agents (uupm.cc) — design-system generation, component guidance. For our UI-generation pillar. |
| **CL4R1T4S** | https://github.com/elder-plinius/CL4R1T4S | **Extracted system prompts** from OpenAI, Google, Anthropic, xAI, Perplexity, Cursor, Windsurf, Devin, Manus, Replit + more. A goldmine for system-prompt design reference. |
| **marketingskills** | https://github.com/coreyhaines31/marketingskills | Marketing skills for AI agents (conversion, copywriting, SEO, analytics, growth) — works with any Agent-Skills-spec agent. |
| **Anthropic-Cybersecurity-Skills** | https://github.com/mukul975/Anthropic-Cybersecurity-Skills | Largest OSS cybersecurity skills library (817+ skills mapped across categories). For our cyber agent pillar (doc 03 §7). |
| **scientific-agent-skills** | https://github.com/K-Dense-AI/scientific-agent-skills | 158 agent skills, 100+ database integrations (v2.62.0, MIT) — scientific/research automation. Reference for data-science skills. |
| **system-prompts-and-models-of-ai-tools** | https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools | LeaksLab's collection of system prompts + models across AI tools. Same value as CL4R1T4S (prompt-design reference). |
| **Front-End-Checklist** | https://github.com/thedaviddias/Front-End-Checklist | Front-end quality system as actionable checklists — now positioned for AI agents too. For our UI quality gates. |

---

## C. V2 bucket (researched now, filed for V2 per user instruction)

### OpenMontage — `calesthio/OpenMontage`
- **URL:** https://github.com/calesthio/OpenMontage
- **What:** "The first open-source, **agentic video production system**" (AGPLv3). Agent-driven video workflows, pipelines, integrations with video generation/editing providers. Mascot: "Monty the Clapper."
- **V2 slot:** video generation/editing automation (post-v1). Related to Hyperframes (HTML→video, doc 10) — both go in the V2 video pillar.

### Hyperframes — `heygen-com/hyperframes` (already doc 10; filing here for V2)
- **URL:** https://github.com/heygen-com/hyperframes (39.7K⭐, TS, Apache-2.0)
- **What:** HTML→video rendering framework (npm) from HeyGen — dynamic animated video frames.
- **V2 slot:** together with OpenMontage → the **video-generation pillar** (V2).

---

## D. Paste verification: OSWorld / Orchard / OSCAR (from the Agentic-OS paste)

| Name | Real? | URL | What it actually is |
|---|---|---|---|
| **OSWorld** | ✅ Real | https://github.com/xlang-ai/OSWorld | First scalable real-computer benchmark for multimodal agents (Ubuntu + Windows), NeurIPS 2024, ~2.9K⭐. Measures agent execution of multi-step workflows (Thunderbird, VLC, LibreOffice, Chrome) with mouse/keyboard/terminal. |
| **Microsoft Orchard** | ✅ Real | https://github.com/microsoft/Orchard | Open-source, **Kubernetes-native agentic training framework** (MIT): Orchard Env manages sandboxes; benchmarks Orchard-SWE (software eng), Orchard-GUI (web), Orchard-Claw (personal assistant/productivity). Not a runtime we'd use — a training/eval harness reference. |
| **OSCAR** | ✅ Real | arXiv:2410.18963 | "Operating System Control via State-Aware Reasoning and Re-Planning" (UdeM/Mila): translates NL→Python, runs as a state machine (observe→plan→execute→verify→re-plan), evaluated on OSWorld/GAIA. |
| **Microsoft Agent Framework** | ✅ Real | (microsoft/agent-framework) | The paste's "Orchard" ≠ this; Agent Framework = AutoGen + Semantic Kernel successor. Noted for clarity. |

**Takeaway for the paste:** its "Microsoft Orchard Framework" claim is real but it's a *training/eval* framework, not a desktop runtime — the paste's integration strategy ("implement as the primary multiagent orchestration layer") is off-target. Use OSWorld/OSCAR as **benchmarks + computer-use reference**, not components.

---

## E. LibreChat feature list (user-pasted — verified against README/docs)
- **Providers:** OpenAI, Azure, Anthropic, Google/Vertex, Bedrock, Responses API, Custom OpenAI-compatible endpoints, Ollama, Groq, Cohere, Mistral, MLX, Koboldcpp, Together, OpenRouter, Perplexity, DeepSeek, Qwen. **Per-user BYOK keys** stored per user in MongoDB (doc 19 §3).
- **Code Interpreter API:** sandboxed Python/Node/Go/C++/Java/PHP/Rust/Fortran, ClickHouse-backed.
- **Agents:** LibreChat Agents (no-code assistants, marketplace), SKILL.md skills (manual/auto/always-on), **subagents** (isolated child runs), MCP servers, tools, file search.
- **Artifacts / generative UI, image gen (GPT-Image-1/DALL-E/SD/Flux/MCP), multimodal files, reasoning UI (R1-style), resumable streams, multi-tab sync, STT/TTS (OpenAI/Azure/ElevenLabs), import/export, search:** all in the README feature list; the client code implements these in `client/` (React). The `@librechat/agents` package lives in `packages/` (api/client/data-provider/data-schemas).

---

## Rapid table (all new repos this pass → docs)
| Repo | Doc |
|---|---|
| headroom | 22-A |
| rtk, tauri, rust, ripgrep, AFFiNE, vfs, rustwright, LocalAI, markitdown, SeekStorm, endee, qdrant, microsandbox | 20 |
| AutoGPT, openai-agents-python, deepagents, CopilotKit, agenticSeek, nanobot, khoj, agentmemory, MindSearch, Agent-Reach, PageIndex, ragflow, Scrapegraph-ai, google-ai-mode-scraper, maxun, deer-flow, gemini-cli, googleworkspace/cli | 21 |
| skills ×9, OpenMontage, hyperframes, OSWorld/Orchard/OSCAR, LibreChat | 22 |
| pi, litellm, LibreChat, AnythingLLM, Reasonix, cc-switch (providers) | 19 |
