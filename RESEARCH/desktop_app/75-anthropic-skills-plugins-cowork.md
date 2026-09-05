# Doc 75 — Anthropic Skills / Plugins / Cowork Deep-Dive

**Date:** 2026-08-16 · **Sources (web-verified):** `github.com/anthropics/skills` (+ `agentskills.io` spec), `github.com/anthropics/claude-plugins-official`, `code.claude.com/docs/en/plugins-reference`, `github.com/OpenCoworkAI/open-cowork`, `github.com/hesreallyhim/awesome-claude-code`; cross-checked against docs 22/45/63/65/69/71.

**Question:** which Claude **skills / capabilities** should ship **inbuilt**, and which should be **user-addable via an "Add" button**? Also re-check the **Cowork** concept.

**One-line result:** the Agent Skills standard (`SKILL.md`: only `name` + `description` required) + the plugin manifest (`.claude-plugin/plugin.json` — bundles **skills + agents + hooks + MCP + LSP + monitors + themes**) are the **canonical extension format we should adopt**. **Inbuilt** = our native engine skill-wrappers + a small curated set; **everything else** = user-added via a marketplace "Add" button (the F8 registry, already built). The **document-skills (docx/pdf/pptx/xlsx) are source-available, NOT open source** — reference-only for P4. → **TODO P23**.

---

## 1. anthropics/skills — the Agent Skills standard

- **Skill = a folder with `SKILL.md`** (YAML frontmatter + instructions + optional `reference.md`, `scripts/`, resources). Frontmatter requires **only two fields**: `name` (lowercase, hyphens) + `description` (what + when to use). Optional fields seen in the wild: `license`, `allowed-tools`, `disable-model-invocation`, `metadata`.
- Repo layout: `./skills` (Creative & Design / Development & Technical / Enterprise & Communication / **Document Skills**), `./spec` (the Agent Skills spec), `./template` (template-skill). Spec lives at **agentskills.io**.
- Registered as a plugin marketplace: `/plugin marketplace add anthropics/skills`, then `/plugin install document-skills@anthropic-agent-skills` or `example-skills@…`. Skills are then invoked by *mentioning* them ("Use the PDF skill to…").
- **Partner skills** (Notion, etc.) get highlighted upstream — the catalog-seed pattern.

## 2. 🔴 The document-skills are source-available, NOT open source

The `skills/docx`, `skills/pdf`, `skills/pptx`, `skills/xlsx` folders are the **production skills that power Claude's document editing** — published as **source-available reference**, not open source. → **Reference-only for P4**: we already built our own surgical OOXML engine (D1–D4, doc 28/29), so we cross-check *patterns* (their skill decomposition, e.g. "extract form fields", "surgical patch", "recalc") but **never copy text**. This is a license boundary to record permanently.

## 3. claude-plugins-official + plugins-reference — the plugin manifest (the steal)

A **plugin = a self-contained directory** of components. The manifest schema is the canonical packaging format to adopt/extend:

| Component | Location | Notes → our row |
|---|---|---|
| **Skills** | `skills/` (each a `SKILL.md` dir) or `commands/` (markdown) or a single root `SKILL.md` | → I2 (doc 63/65 SKILL.md anatomy) |
| **Agents** | `agents/` markdown: `name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory, background, isolation:"worktree"` | → P6.22 agent-frontmatter + `SubAgentRuntime` (we already have these fields; add `effort`/`background`/`isolation`) |
| **Hooks** | `hooks/hooks.json` (lifecycle: PreToolUse / PermissionRequest / PostToolUse / PreCompact / PostCompact / FileChanged / …; types command/http/mcp_tool/prompt/agent) | → P7 profile-gated hooks (we have these; the *event taxonomy* is the reference) |
| **MCP servers** | `.mcp.json` (bundled servers start on enable) | → F6 + **doc 74 MCP Server Manager** (this is exactly the "consume third-party servers" surface) |
| **LSP servers** | `.lsp.json` (gopls/pyright/rust-analyzer/ts-lsp) | → I11 `everyaios-codeintel` |
| **Monitors** | `monitors/monitors.json` (background cmd → stdout lines as notifications) | → new: pairs with B7 heartbeat + the cockpit now-doing strip |
| **Themes** | `themes/*.json` (base preset + sparse overrides) | → UI v2 theme system |

**Directory mechanics (worth copying verbatim as *pattern*):**
- **Immutable plugin slug** (`name` can't change once published); `displayName` for UI; top-level `renames` map in `marketplace.json` auto-migrates old slugs on next sync.
- **Skill-bundle plugins**: `strict: false` + explicit `skills` array + `source` (`git-subdir` + `sha` pin). Each skill registers as `<plugin-name>:<skill-name>`.
- **Install scopes**: user / project / local / managed.

## 4. Inbuilt vs user-addable — the answer

| Tier | What | Where |
|---|---|---|
| **Inbuilt (first-party, always on)** | (a) **Native engine skill-wrappers** — `SKILL.md` packs that teach *any* hosted agent (our default + Claude Code/Codex via ACP) to drive our engines: Office (docx/pdf/pptx/xlsx), Browser (CDP/a11y), Storage, CodeIntel (LSP/SCIP); (b) a **small curated general set** — document-creation, skill-creator (from the anthropics template), ui-ux-pro-max design-intelligence (P19-4). | bundle in `<data_dir>/skills` (read-only), no install step |
| **User-addable ("Add" button)** | anthropics/skills (example-skills + document-skills), claude-plugins-official (`/plugins` + `/external_plugins`), claude-plugins-community, awesome-claude-code's curated list — via a **marketplace "Add"** = the F8 registry-fed install we already built (Guard-2 ticket, sha-pinned, immutable slug). | registry → install → `skills/` + `agents/` + `.mcp.json` merge |

So: **we don't re-implement Anthropic's skills — we become a host that can install them**, exactly like the doc-74 MCP Server Manager conclusion. The one *native* thing we ship is the engine + the skill-wrappers around it.

## 5. The rest of the batch

| Repo | Verdict |
|---|---|
| **OpenCoworkAI/open-cowork** | 🟡 **VALIDATION (not a steal)** — open-source Cowork desktop app (Win/macOS): BYOK provider table + MCP + Skills, sandbox isolation, multi-model. It is *exactly* our thesis (a desktop app that installs harnesses + MCP + skills) but **single-harness-only (pi-agent loop since v3.0.0 — was Claude-Code-based, corrected doc 86)**; we are the cockpit that hosts many harnesses + our own engines. Confirms H2/F8/F12/J17 direction. |
| **hesreallyhim/awesome-claude-code** | 🟢 REF — curated resource list = catalog seed for the skills/plugins marketplace tab. |
| **anthropics/claude-cookbooks** | 🟢 REF — recipe notebooks (patterns for prompt/skill design). |
| **anthropics/claude-code-action** | ⚪ SKIP — GitHub Action wrapper (CI surface, out of scope). |
| **anthropics/financial-services** | ⚪ SKIP/REF — enterprise vertical demo (connector/compliance patterns only). |
| **anthropics/claude-plugins-community** | 🟢 REF — community plugin marketplace (read-only mirror) = the "Add more" catalog seed. |
| **anthropics/claude-code** | 🟢 REF — already covered (doc 69, the harness itself; plugins/skills/slash-commands/subagents/hooks/ACP all mapped). |

## 6. Net action

**TODO P23 (Anthropic skills/plugins/cowork queue):**
1. **Adopt the plugin manifest schema** (`.claude-plugin/plugin.json` components: skills + agents + hooks + MCP + LSP + monitors) — extend our F8 `skills_index.json` (doc 65) into this richer format; align P6.22 agent-frontmatter with the agent fields (`effort`/`background`/`isolation`).
2. **Inbuilt first-party skill packs** — `SKILL.md` wrappers over our native engines (office/browser/storage/codeintel) + bundled general set (document-creation, skill-creator, ui-ux-pro-max design-intelligence).
3. **Marketplace "Add" button** — register anthropics/skills + claude-plugins-official + community + awesome-claude-code as addable marketplaces via the F8 registry (Guard-2 install, sha-pinned, immutable slug).
4. **Document-skills reference (🔴 license boundary)** — read `skills/docx|pdf|pptx|xlsx` as *pattern* reference to cross-check our P4 OOXML engine; **source-available, never copy**.

**Ledger:** unchanged **281 repos** (claude-code/claude-plugins-official/claude-plugins-community/skills/claude-cookbooks already tracked in docs 45/63/65/69; `open-cowork` + `awesome-claude-code` are new names but **reference-only** — tracked in TODO P23, not the master ledger, consistent with docs 71–74 which also left the ledger at 281 for reference-only findings).
