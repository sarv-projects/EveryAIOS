# Doc 79 — Local Model Fetch / Download Core (HF · LM Studio · Ollama · Open WebUI)

**Date:** 2026-08-16 · **Sources (web-verified):** HuggingFace Hub (GGUF/`hf` docs, resumable-download threads), LM Studio model store (`~/.cache/lm-studio/models`), Ollama storage internals (blobs/manifests, `registry.ollama.ai`), Open WebUI (Ollama-backed); cross-checked against `everyaios-core::local.rs` (P1.8/A5), `hwfit` (A5), `catalog.ts` + `everyaios-catalog` (A6/P14), broker local routing.

**Question (user):** *"get the core for any model downloads from HuggingFace, from LM Studio itself — the entire core of model fetch, details, download, and where to store the model; it becomes part of the local model URL so multiple models appear under a Local → dropdown."*

**One-line result:** our A5/P1.8 currently **detects + lists** installed runtimes (ollama/llamafile) but has **no first-party model downloader or unified local registry**. The missing core is a **resumable HF-Hub GGUF/MLX downloader** + a **canonical storage layout** + a **stable `local://` model URL** that resolves to a runtime — the exact machinery LM Studio ships, reimplemented on our Rust stack. → **TODO P27**.

---

## 1. Coherence check (is the architecture a hodgepodge?)

No — the layering is already single-source-of-truth, and this fits it cleanly:

```
TODO task → SPEC row ID (e.g. A5/P1.8) → ARCH/09-FEATURE-MATRIX Source col
          → RESEARCH doc (01–79) → doc 41 (STEAL/ADAPT/REF verdict)
```

- **SPEC** = the master capability/algorithm index (148 rows, 33 algorithms, 281 repos).
- **ARCH/00–12** = the *derived* layer (Rust/TS/UI boundaries, security invariants).
- **RESEARCH docs** = the *evidence* layer (verdicts feed SPEC rows).
- **TODO P0–P12 (build) + P13–P27 (steal queues)** = the *open-work index*.

The new local-model core is **not a new layer** — it extends the existing **A5 (local models) → P1.8** row + feeds **A6/P14 (model catalog)**, so every new task traces through the same chain. This doc records the *evidence* for P27.

## 2. How the three apps fetch models (the deep-dive)

| App | Source | Storage | Key mechanic |
|---|---|---|---|
| **LM Studio** | **HuggingFace Hub** (GGUF + MLX), search = HF `api/models?search=` | `~/.cache/lm-studio/models/{publisher}/{model}/{file}.gguf` (human-named tree) | downloads GGUF by **file**; metadata (ctx len, quant, size, likes) from HF Hub API; quant chosen from filename tag (`Q4_K_M`, `Q8_0`, …) |
| **Ollama** | `registry.ollama.ai` (its own registry; GGUF under the hood) | `~/.ollama/models/blobs/sha256-<hash>` + `manifests/{registry}/{ns}/{model}/{tag}` (content-addressed) | `pull` → manifest JSON (layers + config) → download layers → blobs; **double-disk-space** when you also keep the raw GGUF (known issue) |
| **Open WebUI** | delegates to **Ollama** (or OpenAI-compatible) | same as the backing runtime | no own downloader — it's a UI over the runtime |

**Common denominator to steal:** HuggingFace Hub is the *source of truth* for model files; everything else is a cache layout + a runtime binding. So our core = **HF downloader + one canonical local store + a runtime-agnostic URL**.

## 3. The local model fetch/download core (P27 spec)

### 3.1 Sources
1. **HuggingFace Hub (primary)** — GGUF + MLX. Search `GET https://huggingface.co/api/models?search={q}&filter=gguf`; model meta `GET /api/models/{repo}`; file list `GET /api/models/{repo}/tree/main`.
2. **Ollama registry (secondary)** — reuse `ollama pull`/`/api/pull` (already the `ensure_ollama` path) for `ollama://` models.
3. **llamafile / manual GGUF** — drop a `.gguf`/`.llamafile` into the store; it becomes a model automatically.

### 3.2 Downloader (the LM Studio core, in Rust)
- **Resumable**: HTTP `Range` + `X-Linked-Etag`/`X-Repo-Commit`; partial file `*.gguf.part` + resume on retry (the `hf download` auto-resume semantics).
- **Verified**: `sha256` from `*.gguf.sha256` (or LFS `oid sha256:`); delete-on-mismatch.
- **Progressed**: byte events (downloaded/total, MB/s, ETA) surfaced to the model picker (the "Downloading…" state, like the ACP install progress).
- **Preflighted**: disk-space check (hwfit already scores RAM/CPU/GPU; add **disk** to the fit decision before download) + a **quant recommendation** (Q4_K_M default ≈ 0.5 B/param, from `hwfit`).

### 3.3 Storage layout (the canonical single store)
```
<data_dir>/models/
  hf/{publisher}/{model}/{quant}-{sha8}.gguf      # HF downloads (human-named + content-addressed suffix)
  ollama/{model}/{tag}/                            # ollama blobs are already content-addressed under ~/.ollama
  llamafile/{name}.llamafile                       # single-binary models
  index.json                                       # local registry: id → file, sha256, size, ctx, quant, source, runtime
```
`index.json` is the **local model registry** merged into `everyaios-catalog` (A6/P14) — one row per model, deduped across sources.

### 3.4 The local model URL (your "Local → dropdown")
A stable, runtime-agnostic id; the broker resolves it to a runtime + endpoint:

```
local://hf/{publisher}/{model}:{quant}      → managed llamafile/llama.cpp serve of the GGUF
local://ollama/{model}:{tag}                → ollama endpoint (keyless)
local://llamafile/{name}                    → llamafile endpoint (keyless)
```

- The **model picker** groups all of these under a single **"Local"** provider with a **dropdown** (installed + available-for-download), each entry = `name · quant · size · ctx` + the `hwfit` fit badge.
- The broker's local routing (already keyless `ollama`/`llamafile`) gains a `hf://` path: download (if absent) → spawn a managed server → chat. This is the "any model from HF, downloaded, stored, served" loop.

### 3.5 Runtime binding (downloaded GGUF → running server)
1. **llamafile/llama.cpp server** (our managed path — already in `local.rs`) for a downloaded `hf/` GGUF.
2. **Ollama `create`** from the GGUF (Modelfile) for `ollama://`.
3. **MLX** (Rapid-MLX, doc 61) on Apple for `hf/` MLX models — the P1.8 follow-up.

## 4. Net action

**TODO P27 (local model fetch/download core):**
1. **HF downloader** — `everyaios-core::model_fetch` — resumable Range download + sha256 verify + progress events + disk preflight (extend `hwfit` with disk).
2. **Local store + registry** — `<data_dir>/models/{source}/…` layout + `index.json` merged into `everyaios-catalog` (A6/P14).
3. **`local://` model URL + broker resolution** — runtime-agnostic id → runtime/endpoint; the model picker groups all local models under a **"Local" dropdown** (installed + downloadable + `hwfit` fit).
4. **Runtime binding** — downloaded GGUF → managed llamafile/llama.cpp serve, or ollama `create`, or MLX.

**Ledger:** unchanged **281 repos** (LM Studio → doc 18, Ollama → doc 34/35, Open WebUI → doc 35; HF Hub is a service, not a repo).
