# 51 — Aider Recheck (2026-08) — doc 46 claims vs primary sources

> **Date:** 2026-08-09 · **Status:** 🟦 primary-source verified (aider.chat docs + GitHub; web-researched 2026 state)
> **Purpose:** Re-verify every Aider claim made in **doc 46** (`Aider-AI/aider`, 48K⭐, Apache-2.0, Python) against primary sources — per the user's "recheck aider once again". Confirms the STEAL list (S1–S8) and matrix I7–I10; flags the two token/benchmark claims that have **no primary source**.
> **Cross-refs:** doc 46 (the original deep-dive), matrix I7–I10, TODO P11.5.9 (Aider-derived features), ARCH/12 §5.4 (Code tab — Aider-derived edit UX).

---

## 1. Verdict table

| # | doc 46 claim | 2026-08 primary-source verdict | Evidence |
|---|---|---|---|
| 1 | RepoMap = tree-sitter + PageRank, ~1K token budget | ✅ **CONFIRMED** (mechanism; docs phrase it as graph/centrality ranking) | `aider.chat/docs/repomap.html`: tree-sitter tag extraction → graph of files/definitions → ranking → binary-search budget fit (`--map-tokens`, default ~1K); boosts for files/identifiers mentioned in chat. `aider/repomap.py` (700+ lines, NetworkX) |
| 2 | Edit Strategy Pattern — **6 formats** | ⚠️ **UPDATED: ~9 formats** | `aider.chat/docs/more/edit-formats.html`: `whole`, `diff` (SEARCH/REPLACE blocks), `diff-fenced`, `udiff`/`udiff-simple`, `patch`, + `editor-diff`/`editor-whole` (architect/editor) + `architect`. Auto per-model, overridable via `--edit-format` |
| 3 | SEARCH/REPLACE fuzzy matching (perfect → whitespace flex → ellipsis → error reflection) | ✅ CONFIRMED | `aider/coders/editblock_coder.py`; docs |
| 4 | Architect mode two-pass (reasoning → editor), "SOTA 82.7%" | ✅ mechanism CONFIRMED; **82.7% is aider-reported, no independent primary source** | `aider/coders/architect_coder.py`; `aider.chat/docs/usage/modes.html` |
| 5 | File watcher + `// ai!` / `ai?` comments | ✅ CONFIRMED | `aider/watch.py`; `aider.chat/docs/usage/watch.html` (`--watch-files`; markers `# ai!`, `// ai?`, `-- ai`, `; ai`) |
| 6 | Lint/Test Reflection loop (max_reflections default 3) | ✅ CONFIRMED | `aider/linter.py`; `--auto-lint`/`--auto-test`/`--test-cmd`; errors fed back for repair |
| 7 | MODEL_ALIASES config map | ✅ CONFIRMED | `aider/models.py`; docs |
| 8 | Git: auto-commit every change, conventional messages, Co-authored-by | ✅ CONFIRMED | git integration + `--attribute-co-authored-by` trailer |
| 9 | Providers: **"50+ via litellm"** | ⚠️ **UPDATED: 100+ providers / thousands of models** | `aider.chat/docs/llms.html` — LiteLLM-backed; Ollama/LM Studio local included |
| 10 | Voice-to-code (Whisper) | ✅ CONFIRMED (basic; doc 46 R9 already noted our TTS plan is better) | `aider/voice.py`; `--voice-format/--voice-language/--voice-input-device` |
| 11 | **"4.2× fewer tokens than Claude Code"** | ❌ **NO PRIMARY SOURCE on aider.chat** — third-party 2026 comparisons (e.g., Morph-class CLI evals) circulate it | `aider.chat/docs/benchmarks.html` hosts the Exercism polyglot suite, **not** token-efficiency numbers. Flag: third-party, unverified → do not cite as aider's own claim |
| 12 | **"First-pass success 71%"** | ❌ **NO PRIMARY SOURCE on aider.chat** — same situation as #11 | third-party figure (vs Claude Code ~78% in the same third-party evals); unverified → flag |
| 13 | MCP support | ⚠️ MCP is **not** aider's core path (native git + tree-sitter + LiteLLM) | not a gap for us — we *serve* MCP (F7) and drive harnesses via ACP (J17) |

---

## 2. Version / activity (2026)
- v0.8x series current; active releases through 2026.
- Model support current: GPT-5 family (incl. `gpt-5.x`, `o3`, `o4-mini`), Claude 4.x/4.5/4.6, Gemini 2.5/3 (Pro/Flash, `--thinking-tokens`/`--reasoning-effort`), DeepSeek R1/V3. Tree-sitter language pack covers **130+ languages**. OpenRouter OAuth added.

---

## 3. Corrections applied (doc 46 patched + tracked here)
1. **doc 46 §1.2 "50+ providers"** → **100+ providers / thousands of models** (LiteLLM) — line patched in doc 46.
2. **doc 46 §1.4 "Edit Strategy — 6 formats"** → **~9 formats** (whole/diff/diff-fenced/udiff/udiff-simple/patch + editor-diff/editor-whole/architect) — header patched in doc 46. TODO P11.5.9's SEARCH/REPLACE + fuzzy line stands.
3. **"4.2× fewer tokens" and "71% first-pass"** → **third-party, unverified** — never repeat as aider facts.
4. **Architect-mode "82.7%"** → softened to **aider-reported** in matrix I9 (SPEC + ARCH/09) to match this doc's verdict #4.
5. No design change to EveryAIOS: **S1–S8 steals stand** (RepoMap, edit strategies, architect mode, file watcher, lint/test reflection, MODEL_ALIASES, commit attribution).

---

## 4. Impact on TODO/matrix
- TODO **P11.5.9** (Aider-derived features) — no task removed; the RepoMap line's "PageRank" phrasing is accurate per primary source.
- The `everyaios-repomap` crate (S1) keeps: tree-sitter tags + graph ranking + SQLite tag cache + budget fitting.
- Verification depth: 🟦 (docs-level, primary) — not a fresh source re-read of aider's Python (doc 46 was the ⬛ read).
