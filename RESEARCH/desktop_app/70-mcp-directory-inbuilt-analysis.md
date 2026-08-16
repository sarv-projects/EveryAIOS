# Doc 70 — MCP Directory Inbuilt Analysis (mcpservers.org)

**Date:** 2026-08-16 · **Source:** `https://mcpservers.org/all` (11,054 servers, 18 categories)
**Sampled:** `/all` (newest 30), `/category/productivity` (1,787), `/category/web-scraping` (436),
`/category/communication` (584), `/category/file-system` (127). Cross-checked via web search.

**Question:** which third-party MCP servers should ship **inbuilt** so EveryAIOS can
"modify/control everything" for Excel / PDF / browser / files / mail?

**Short answer:** almost none for Excel/PDF/browser — our Rust engines already supersede
them. The real inbuilt opportunity is (a) three small *native* gaps and (b) the connector
category, where MCP is the mechanism but only read-first/approve-before-send servers are
trustworthy.

---

## 1. The three buckets of document/browser MCP servers

| Bucket | Examples found | Verdict |
|---|---|---|
| **Extraction-only Python wrappers** | KnowledgeBaseMCP, Document Loader (awslabs), `pdf-mcp-server` (pdfplumber), Convertica, Dokumen-Pintar (62 tools), ADP | **SKIP** — these wrap calamine/pdfplumber/libreoffice. We already have calamine + lopdf + roxmltree in Rust, in-process, guard-gated. Adopting them = a Python dep + slower + extraction-only (no surgical write). |
| **Hosted / "send us your files"** | MagicSlides, MintPDF, SignSimple, EM+x, hushvert, ChangeThisFile, Import.io | **REJECT** — files leave the machine. Direct contradiction of the local-first / no-founder-server promise. |
| **Browser automation** | WaveXisMCP (CDP+BiDi, 220 tools, stealth), SlimAtlas (Lightpanda), Agent Browser MCP (Vercel), MCP Browser, egolite browser | **REFERENCE** — we already have `everyaios-cdp` + slim snapshots + 37 tools + Lightpanda/Obscura as the escalate tier (doc 55). egolite's "share logged-in state" = our Session Vault. Nothing to adopt; useful as a parity checklist. |

## 2. What IS worth stealing (real gaps in our stack)

1. **`oxidize-pdf`** (Rust, `uvx oxidize-mcp`) — 🔴 STEAL (native, small)
   PDF **split / merge / rotate / reorder pages**, form fields, annotations, encrypt.
   Our `everyaios-office::pdf` (lopdf) does form-fill + text-swap + redact + re-author but
   **not page-level ops**. This is the single cleanest inbuilt win — same dependency we
   already use (lopdf), so the API surface is the only new code.

2. **`dowse`** — 🟡 ADAPT (local full-text **content** search + **OCR of screenshots/images**)
   Our `everyaios-storage` is FTS5 **filename** search only. Content search across a folder
   + OCR of pasted screenshots/images is a real "control your own stuff" gap.

3. **`CodeGraph`** — 🟢 REFERENCE (cross-language code graph, 34+ langs, incremental cache)
   Complements our tree-sitter repo-map (`everyaios-codeintel`). Not urgent; validates the
   SCIP/RepoMap direction (doc 63, crux pattern).

4. **`mailwarden` (Gmail, native, read-only triage, *no send tools*) + `Busymail` (IMAP,
   read/send with explicit approval)** — 🔴 STEAL the *pattern*
   This is exactly the connector posture we need: **read-first, approve-before-send, no
   silent outbound**. The last honest gap (external connector OAuth) should copy this
   posture: Gmail/IMAP via the official MCP server / Graph API, tokens in the SQLCipher
   vault, every send a Guard-2 ticket.

## 3. What the directory confirms about connectors

- **258 official *remote* MCP servers** (Notion, Linear, Sentry, Stripe, …) — these are
  hosted endpoints. They belong in the **"MCP Servers" tab as user-supplied**, never inbuilt
  (inbuilt = local, no founder server).
- **Communication category (584)** is where "control everything" actually lives — Gmail,
  Slack, GitHub, LinkedIn (via logged-in browser session), WhatsApp, SMS — all OAuth or
  session-based. This is the connector surface, and it's the *same* conclusion as the
  connector-platform decision already recorded: **MCP is the mechanism; read-first +
  approve-before-send is the policy.**

## 4. Decision

- **Do not** bundle third-party document/browser MCP servers as inbuilt — redundant and
  (in the hosted case) anti-local-first.
- **Do** add three *native* inbuilt capabilities (no new deps beyond what's used):
  - **PDF page ops** (split/merge/rotate/reorder) — extend `everyaios-office::pdf` with lopdf.
  - **Content search + OCR** — extend `everyaios-storage` (FTS5 content + an on-device OCR path).
  - **Gmail/IMAP read-first connector** — the first real connector, copying the mailwarden
    no-send-by-default + Guard-2 approval posture.
- Everything else stays a user-supplied MCP server (the "MCP Servers" tab already ships the
  42-tool `everyaios-mcp` registry as the Tool Catalog).

**Queue:** TODO P18 (MCP directory inbuilt analysis).
