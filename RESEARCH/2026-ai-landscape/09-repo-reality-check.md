# 09 · Repo Reality-Check — 10-Repo Verification (GitHub API)

> A pasted list of "top repos" was reality-checked against the GitHub API (Aug 2026).
> **Result: 9 of 10 are real; 1 is hallucinated (`toprank`).** Actual star counts were 2–4x
> higher than the pasted list claimed. Re-verify anything before depending on it.

---

## Verification Table

| # | Repo | Exists? | What it actually does | Verdict |
|---|------|---------|----------------------|---------|
| 1 | **The-Swarm-Corporation/AutoHedge** | ✅ | Autonomous AI hedge fund swarm (Director/Quant/Risk/Execution agents), Solana-focused | Real |
| 2 | **HKUDS/Vibe-Trading** | ✅ | NL prompts → strategies/backtests/portfolio analysis, 29 swarm presets, 71 finance skills, persistent memory | Real |
| 3 | **AgriciDaniel/claude-ads** | ✅ | 250+ paid-ads audit checks, parallel sub-agents, industry templates, PDF reports | Real |
| 4 | **nowork-studio/toprank** | ❌ | **Does not exist — hallucinated** | Ignore |
| 5 | **Fincept-Corporation/FinceptTerminal** | ✅ | C++ Bloomberg-style terminal: 100+ connectors, 37 AI agents, real-time trading, node editor | Real |
| 6 | **cloudflare/agentic-inbox** | ✅ | Self-hosted email client on Cloudflare Workers + AI agent, approve-before-send | Real |
| 7 | **mksglu/context-mode** (ClawRouter) | ✅ | Context-window compressor: sandboxes tool outputs, up to 98% compression, 14 platforms | Real |
| 8 | **jo-inc/camofox-browser** | ✅ | Stealth headless browser for agents, anti-bot/fingerprint claims | Real but marketing claims unproven |
| 9 | **Anil-matcha/Open-Generative-AI** (Open Higgsfield) | ✅ | Self-hosted text→image/video, 200+ models, node workflow studio | Real |
| 10 | **heygen-com/hyperframes** | ✅ | HTML+GSAP → deterministic MP4 video rendering engine for agents | Real |

---

## Key Lessons

1. **AI-hallucinated repo lists are a real hazard** — `toprank` looked plausible but never existed.
   Always verify with `https://api.github.com/repos/{owner}/{repo}` before building on anything.
2. **Star counts in pasted lists are unreliable** (often 2–4x too low, sometimes invented).
3. **Real stars (approximate, from verification):** AutoHedge ~1.6K+, Vibe-Trading ~2.9K+,
   claude-ads ~3.2K+, FinceptTerminal ~15.3K+, agentic-inbox ~1.5K+, context-mode ~10.3K+,
   camofox-browser ~3.2K+, Open-Generative-AI ~8.6K+, hyperframes ~11.1K+.
4. **For our desktop app, the relevant takeaways from this list:**
   - `context-mode` (ClawRouter) → compression strategy feeds our `ContextCompressor` design.
   - `agentic-inbox` → human-in-the-loop approve-before-send pattern.
   - `FinceptTerminal` → node-editor workflow UI + many-connectors architecture reference.
   - `hyperframes` → HTML→video for automated content pipelines (later feature).
   - `camofox-browser` → verify claims before using; our WebView automation doesn't need stealth.
