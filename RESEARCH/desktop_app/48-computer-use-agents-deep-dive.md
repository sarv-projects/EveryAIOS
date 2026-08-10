# 48 — Computer-Use Agents Deep Dive

> **Date:** 2026-08-08
> **Repos:** OmniParser (25.2K), UI-TARS-desktop (38.5K), UI-TARS (11.3K), Skyvern (22.7K), self-operating-computer (10.3K)
> **Also referenced:** anthropics/anthropic-quickstarts (17.4K, computer-use-demo)
> **Purpose:** Desktop/browser computer-use agent patterns for EveryAIOS
> **Cross-refs:** Doc 09 (agentic OS), doc 30 (agent OS family), ARCH/08 (browser layer), ARCH/12 (UI spec)

---

## 1. New Repos (#166-170)

### 1.1 microsoft/OmniParser — 25.2K⭐, CC-BY-4.0/MIT

**STEAL** — Screen parsing / visual grounding pipeline

- Two-stage pipeline: YOLO detector finds interactive regions → Florence captioning model describes each element
- Input: raw screenshot. Output: structured JSON of clickable elements with bounding boxes + semantic labels
- Model-agnostic: any vision LLM can consume the parsed output
- OmniTool wrapper adds Windows 11 VM control via pyautogui
- Supports trajectory logging for training data

**What to steal:** The detect-then-describe separation. Instead of asking one LLM to both FIND and UNDERSTAND UI elements, split the job: fast YOLO for detection, smart captioner for understanding. This is more reliable than pure end-to-end vision.

### 1.2 bytedance/UI-TARS-desktop — 38.5K⭐, Apache-2.0

**STEAL** — Closest direct competitor architecture

- Electron monorepo (pnpm + turborepo): `apps/ui-tars` (desktop) + `packages/` (SDK modules)
- **Operator layer**: Local Operator (native screenshots + mouse/keyboard) + Remote Operators (VNC/browser)
- **Agent TARS CLI**: Node.js agent loop with Web UI, Event Stream protocol for context engineering
- **MCP as kernel** — tools are MCP servers (filesystem, shell, browser)
- SDK (`@anthropic/ui-tars-sdk`) for custom GUI automation agents
- Supports: UI-TARS models, Claude, Volcengine Doubao, any OpenAI-compatible

**What to steal:** Operator abstraction (local vs remote), Event Stream protocol for agent<→>UI communication, MCP-as-kernel tool architecture, the monorepo structure.

### 1.3 bytedance/UI-TARS — 11.3K⭐, Apache-2.0

**STEAL** — Best open-source GUI agent model

- Specialized vision-language model (7B/72B) fine-tuned for GUI interaction
- Input: screenshot + instruction. Output: `Thought: [reasoning]` + `Action: click(start_box='(x,y)')`
- Normalized coordinates (0-1000 scale) — resolution-independent
- SOTA on OSWorld (50.3%), Windows Agent Arena, AndroidWorld
- RL-enhanced reasoning (UI-TARS-1.5) — thinks before acting
- System prompt modes: COMPUTER_USE / MOBILE_USE / GROUNDING

**What to steal:** The Thought→Action output format with normalized coordinates. The system prompt modes for different platforms. Consider running UI-TARS-7B locally for computer-use tasks.

### 1.4 Skyvern-AI/skyvern — 22.7K⭐, AGPL-3.0

**ADAPT** (AGPL — patterns only, can't embed)

- Production browser automation via vision + DOM hybrid
- Playwright extension with AI commands: `page.act(prompt)`, `page.extract(prompt, schema)`, `page.validate(prompt)`
- Three interaction modes: CSS/XPath selectors → AI natural-language → fallback chain
- Handles: 2FA/TOTP, file downloads, form filling, authentication flows
- Agent swarm: specialized agents for comprehension, planning, execution
- 40+ LLM providers via liteLLM

**What to adapt:** The `page.act(prompt)` API pattern for augmenting Playwright/CDP with AI. The three-mode fallback (selector → AI → hybrid). The credential/auth handling.

### 1.5 OthersideAI/self-operating-computer — 10.3K⭐, MIT

**REFERENCE** — Historical baseline

- The original "computer use" project (Nov 2023)
- Simple loop: screenshot → multimodal LLM → parse action → pyautogui
- Three vision modes: vanilla, OCR (text coordinate hash map), Set-of-Mark (YOLO overlays)
- Works with GPT-4o, Claude 3, Gemini, Qwen-VL, LLaVa (local)
- Maintenance slowed since 2024

**Reference value:** Proved the concept. The OCR mode's "text label → coordinate lookup" is a lightweight alternative to full visual grounding when you know the element text.

---

## 2. Anthropic Computer-Use Best Practices (Reference)

From `anthropics/anthropic-quickstarts` (17.4K⭐, MIT):

**Production patterns to steal:**
1. **Image scaling strategy**: Always scale to 1024×768 before sending to model. Map coordinates proportionally.
2. **Prompt caching**: Cache stable system prompt + tool definitions across turns.
3. **Server-side compaction**: Prune old screenshots from conversation history (keep only last 2-3).
4. **Batched tool calls**: Execute multiple actions per model response when safe.
5. **Trajectory recording**: Log every screenshot + action for debugging and training data.
6. **Tool schemas**: `computer` (mouse/keyboard), `text_editor` (str_replace), `bash` (shell) — the canonical trio.

---

## 3. How This Maps to EveryAIOS

| EveryAIOS Component | Best Reference | Pattern |
|---|---|---|
| Computer-use backbone | UI-TARS-desktop | Operator abstraction (local/remote) |
| Screen parsing | OmniParser | YOLO + captioning two-stage |
| Vision model (local) | UI-TARS-1.5-7B | Thought→Action format |
| Browser computer-use | Skyvern | `page.act(prompt)` API, hybrid DOM+Vision |
| Image handling | Anthropic best practices | Scale to 1024×768, prune old screenshots |
| Desktop screenshots | UI-TARS-desktop | Native bindings per platform |

### Integration with existing ARCH/08 Browser Layer:
- Our 34-tool browser catalog handles **structured** browser automation (CDP-based)
- Computer-use adds **visual** browser/desktop automation (screenshot-based)
- These are complementary: use CDP tools when you have DOM access, fall back to visual grounding when you don't (e.g., native desktop apps, remote VNC sessions)

### Integration with ARCH/12 UI Spec:
- The Desktop tab in the workspace panel can show the agent's screen view
- OmniParser annotations (bounding boxes) can be overlaid for debugging
- User sees what the agent "sees" in real-time

---

## 4. Distinctness from Existing Research

| New Repo | vs Existing | Distinct? |
|---|---|---|
| OmniParser | vs browser-use (a11y tree) | ✅ YES — vision-only, no DOM needed, works on native desktop apps |
| UI-TARS-desktop | vs BrowserOS (Chromium fork) | ✅ YES — generic desktop control vs browser-specific |
| UI-TARS model | vs Agent-S (uses UI-TARS) | ✅ YES — the model itself vs a framework using it |
| Skyvern | vs Crawl4AI | ✅ YES — production browser automation vs data extraction |
| self-operating-computer | vs Agent Zero | ✅ YES — simpler single-agent vs full framework |

---

## 5. Updated Totals

- **Total repos tracked:** 170 (was 165)
- **STEAL:** 54 (was 51, +3: OmniParser, UI-TARS-desktop, UI-TARS)
- **ADAPT:** 25 (was 24, +1: Skyvern)
- **REFERENCE:** ~91 (was ~90, +1: self-operating-computer)
