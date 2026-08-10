# 57 — ACP Registry & BYO-Agent Subscription Auth (finalize)

> Live-verified 2026-08-10. Answers the user question: *"why can't we copy what Zed and Hermes do — use an ACP registry to use any agent? users who paid for a subscription but have no API key shouldn't face a loss."* Verdict: **we already planned exactly this (F12/J17/TODO-1010) — this pass makes it concrete (the official ACP registry now exists; live-verified 346★ / 38 agents) and sharpens one over-broad reading (subscription reuse is *precise*, not banned: Claude via the official ACP wrapper = allowed; token-harvest for other engines = blocked).** No new matrix rows (maps onto F8/F12/J17 + ARCH/06 §6.16); ledger 226 → **227 repos** (`agentclientprotocol/registry`).

---

## 1. The question, resolved — two layers, not one

The confusion comes from treating **BYOK** and **BYO-agent** as alternatives. They are complementary layers, selected by shortest-path routing (doc 53 §5):

| | **Layer 1 — BYOK providers (A1–A9)** | **Layer 2 — BYO-agent harnesses (F12/J17)** |
|---|---|---|
| What | User pastes **API keys** → vault → our Rust broker calls the provider directly (doc 53 §2) | User already has an **agent CLI** (logged in) → we drive it over ACP as a supervised subprocess |
| Auth | Raw key in `everyaios-vault` (SQLCipher) | **The CLI's own existing login/subscription** — we never see or store it |
| Covers | General chat, vision, office, memory, local models — *the whole OS* | The **coding forge** (and anything an agent can do) |
| Pattern | **Hermes** — adapter-per-provider registry (`anthropic_adapter.py`, `gemini_native_adapter.py`, doc 44 §3; we already mirror this in `core-providers`) | **Zed** — app = ACP **Client**, agent = backend subprocess; per-agent manifest (`command`/`args`/`env`) |

**Copy what Zed does** → that is F12/J17 (doc 45): Zed *created* ACP (Aug 2025, Apache-2.0) exactly so any client can drive any agent, and the agent CLI reuses the user's existing login — no API key pasted into the app. **Copy what Hermes does** → Hermes ships `copilot_acp_client.py` and is generalizing it (issue #5257) into a generic `ACPClient` + `acp_agent_registry.py` that drives Claude Code / Codex / Gemini CLI as ACP agents — that is literally our J17 + a registry, proven in the wild.

---

## 2. The official ACP agent registry — now real, this is our discovery source (live-verified 2026-08-10)

| Fact | Verified |
|---|---|
| Repo | **`agentclientprotocol/registry`** — **346⭐, Apache-2.0, daily-active** (hourly cron re-publishes agent versions; pushed 2026-08-10) |
| Contents | Per-agent dirs `<id>/agent.json` + optional `icon.svg` (16×16 monochrome) + aggregated index **`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json`** |
| Spec | RFD `/rfds/acp-agent-registry` (author @ignatov, champion @benbrandt) |
| Distribution types | 3 mutually-independent: **`binary`** (6 platform targets: darwin/linux/windows × aarch64/x86_64), **`npx`**, **`uvx`** (≥1 required) |
| Required `agent.json` fields | `id` (`^[a-z][a-z0-9-]*$`, = folder name), `name`, `version` (semver), `description`, `distribution` — CI-validated against a strict schema |
| Listed agents | **38 (live CDN 2026-08-10)**: `claude-acp` (Claude Agent), `codex-acp`, `gemini`, `qwen-code`, `opencode`, `goose`, `cline`, `cursor`, `devin`, `github-copilot-cli`, `mistral-vibe`, `pi-acp`, `amp-acp`, `deepagents`, … |
| Adopters (clients) | Zed, JetBrains, VS Code/Cursor (extensions), Neovim (CodeCompanion/agentic), Obsidian, Codeg |
| **Claude entry — the headline** | `claude-acp` v0.66.0 — **authors: Anthropic · Zed Industries · JetBrains**; npx `@agentclientprotocol/claude-agent-acp` (Apache-2.0 npm, "ACP-compatible coding agent powered by the Claude Agent SDK (TypeScript)") — **Anthropic co-authors the official ACP path for Claude** |

**Adoption decision (F8 + F12 upgrade):** consume the CDN `registry.json` for **registry-fed harness discovery** — local cache + version pinning + **curated allow-list on top** (we ship a default set = today's F12 9-CLI list; the registry adds the long tail). "Obscure agent" = any agent that registers (or any CLI we wrap with a non-ACP shim manifest) joins the same install → drive path (F8 → J17). This replaces the hardcoded-catalog framing; the F12 list stays the *default allow-list*, not the ceiling.

---

## 3. ⚠️ The subscription-auth landmine — Anthropic OAuth restriction (CRITICAL)

The "users who paid shouldn't face a loss" instinct is right in principle — **but** the freshly-verified reality:

> **The boundary, precisely (live-verified 2026-08-10):** Anthropic (late-Feb → Apr 2026) restricted Claude Pro/Max OAuth tokens to official first-party surfaces (`claude.ai` + Claude Code). What got **blocked** = *harvesting the subscription OAuth token to power a DIFFERENT engine's direct model calls* (OpenClaw, OpenCode wrappers, custom API conduits — third-party model routing on a consumer subscription) — server-side header checks + token invalidations; announced by Boris Cherny (Head of Claude Code, Anthropic) 2026-04-03/04, covered on HN #46549823 / r/ClaudeAI / The Register / VentureBeat.
> ✅ **What stays allowed — and this is the headline:** driving **Claude Code / Claude Agent via ACP is first-party-sanctioned.** The official wrapper `@agentclientprotocol/claude-agent-acp` (npx, v0.66.0) is **co-authored by Anthropic · Zed Industries · JetBrains** and runs the **Claude Agent SDK** with the user's own Claude login — the model calls are made by Anthropic's own code. Zed, JetBrains, VS Code, Neovim, Obsidian and Hermes all drive Claude this way. **This is exactly our F12/J17 harness-driving path.**
> **The test:** *who makes the model call?* Anthropic's own SDK/CLI (inside Claude Code or the official wrapper, with the user's own login) → **allowed**. Your code or another engine's code making the call with a subscription token → **blocked**.

**Consequences for EveryAIOS:**

1. ✅ **Claude Code / Claude Agent is a first-class F12 harness** — spawn the official `@agentclientprotocol/claude-agent-acp` wrapper (or the user's own `claude` CLI) with the user's own login; badge = **subscription-backed**. Zed/JetBrains/Hermes precedent; Anthropic co-authors the wrapper.
2. ✅ **Open agents** with their own auth — OpenCode, Qwen Code, Goose, Gemini CLI (again: the blocked OpenCode was the Claude-OAuth-piggybacking mode, not its own-keys operation).
3. ✅ **BYOK API keys** via the broker (§6.9) — for **our own engine's** direct provider calls, always API keys, never subscription tokens.
4. ❌ **Never harvest the subscription OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN`) to power our own (or any non-Claude) engine's direct calls — that is the ToS violation / takedown zone (OpenClaw/OpenCode precedent); the broker never ingests a subscription token.
5. 🏷️ **Auth-mode badge (F12/UI):** every harness is labeled **subscription-backed / API-key-backed / local** so the user knows exactly what they're connecting; Claude Agent shows **subscription-backed (allowed via official wrapper)**.
6. ✅ **Copilot CLI:** closed (custom license) — drive via ACP like any harness, never a dependency (already in TODO P6.8); user's own GitHub login.

**This corrects TODO-1010 + doc 47's naive "ACP subscription linking — users bring existing Claude/ChatGPT subs" framing** (doc 47 §"Key steals" #3) rather than confirming it — same treatment the SIGKILL→SIGTERM drift got in doc 43.

---

## 4. What we adopt (mapped to existing rows — no new matrix rows)

| Verdict | Row | Change |
|---|---|---|
| **Registry-fed discovery** | F8 | Harness installer consumes the official ACP registry (CDN catalog + local cache + version pinning + curated allow-list) instead of a hardcoded set |
| **Registry + auth-mode badge** | F12 | Discovery via registry (doc 57 §2); **auth-mode badge** (subscription/API/local) on every harness (doc 57 §3) |
| **Generalized ACP client ref** | J17 | Hermes issue #5257 (`copilot_acp_client.py` → generic `ACPClient` + `acp_agent_registry.py`) as reference impl alongside cowork-forge `acp/client.rs` |
| **ToS boundary** | ARCH/06 §6.16 | Subscription-auth boundary: Claude via official ACP wrapper = allowed (Anthropic co-authored); token-harvest for other engines = blocked; broker stays API-key-only |
| **Tasks** | TODO P6.8 | +3 tasks (registry consume, auth-mode badge, landmine doc); TODO-1010 corrected |
| **Ledger** | doc 27 §26 | +1 repo (`agentclientprotocol/registry`) → **227** |

---

## 5. Architecture re-analysis — what this pass decides

1. **BYOK and BYO-agent are both kept, never merged.** The provider layer stays the universal floor (chat/vision/office/memory/local); the harness layer owns the forge. Shortest-path routing (doc 53 §5) selects per task — a simple edit may run *only* on the user's logged-in CLI; a general chat runs on BYOK.
2. **The harness boundary softens "sidecar proposes, Rust disposes."** The external agent executes its own tool calls; our Guard sees what ACP surfaces (`request_permission` → Guard-2 cards, `session/update` → audit) and gates it, but a non-cooperating agent can act outside. Mitigations stand: Trust Ladder tiers (§6.2), the agent's own sandboxing, audit NDJSON of every surfaced call, watchdog/budget kills (J17). The registry's curated allow-list is the *first* gate — only agents we've reviewed ship as defaults.
3. **Auth reuse is precise, not banned.** Driving Claude via the official wrapper (Anthropic's own SDK, user's own login) is sanctioned — the badge tells the user which of the three auth classes they're connecting; the hard line is only token-harvesting for non-Claude engines. Our own broker stays API-key-only (doc 53).
4. **Maturity is manageable.** ACP v1 + v2 draft; we pin manifests and monitor the spec (J17 already does). Non-ACP CLIs get shim manifests — the registry is the catalog, not the protocol ceiling.
5. **Verdict on the user's proposal: adopt it — and Claude is in.** Yes to Zed's agent-integration model and Hermes's generalized ACPClient; **Claude Code/Claude Agent joins the F12 harness list as a first-class, subscription-backed harness via the official ACP wrapper** (Anthropic co-authors it). What we corrected vs our earlier over-broad reading: the landmine is *token-harvesting*, not *ACP-driving*. Registry-fed discovery (F8/F12) stands.

---

## 6. Sources

- `https://github.com/agentclientprotocol/registry` (**346⭐**, Apache-2.0, live-verified 2026-08-10 — 38 agents on CDN)
- `https://agentclientprotocol.com/rfds/acp-agent-registry` (registry spec: id/name/version/description/distribution; binary/npx/uvx)
- `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` (aggregated catalog; fetched live — `claude-acp` v0.66.0, authors Anthropic·Zed·JetBrains)
- `https://github.com/agentclientprotocol/claude-agent-acp` + npm `@agentclientprotocol/claude-agent-acp` v0.66.0 ("ACP-compatible coding agent powered by the Claude Agent SDK", Apache-2.0 npm) — **Anthropic co-authored**
- `https://zed.dev/acp` (Zed's ACP intro — Zed is the originator)
- `https://github.com/NousResearch/hermes-agent/issues/5257` — "feat: Generalized ACP client for multi-agent CLI orchestration" (`copilot_acp_client.py` → `ACPClient` + `acp_agent_registry.py`)
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/acp` + `/docs/developer-guide/acp-internals` (Hermes ACP host/client)
- Anthropic OAuth restriction (Apr 2026): Boris Cherny announcement (X, 2026-04-03/04); HN #46549823; The Register; VentureBeat; DecodeTheFuture — **classified confirmed + widely reported; monitor for policy evolution**
- Internal refs: doc 45 (ACP deep-dive), doc 47 (subscription-linking claim — corrected here), doc 53 (credential broker), ARCH/06 §6.9/§6.16, F8/F12/J17
