# 06 · Local Model Stack — Ollama, Open WebUI, llama.cpp, LM Studio

> For the desktop app: users should be able to run local models (privacy, offline, no cost)
> alongside BYOK cloud providers.

---

## 1. Ollama (ollama/ollama, 177.8K ⭐, Go, MIT) — THE standard

- **Local model runtime.** Downloads, runs, serves models. Under the hood: llama.cpp.
- **OpenAI-compatible API** — `http://localhost:11434/v1/chat/completions`. Desktop apps integrate by
  just pointing their provider router at it.
- GPU auto-detect (CUDA/Metal/Vulkan), CPU fallback.
- `ollama pull <model>` then it's served; streaming supported.

**Integration pattern for our app (the Ollama sidecar):**
```
Desktop app ──> provider router ──> Ollama (localhost:11434, OpenAI-compatible)
                                   ├─ chat models (Qwen3, Llama4, Phi-4, Gemma3, DeepSeek distills)
                                   └─ embeddings (nomic-embed-text, bge-m3)
```
- **Option A (recommended):** detect Ollama on user's machine → connect. If not installed, show a
  one-click install prompt. No bundling needed — Ollama handles GPU/runtime complexity.
- **Option B (bundle):** `ollama` binary ships with our app and is spawned as a sidecar process.
- We already have an OpenAI-compatible provider layer in `core-providers` — pointing at Ollama = a config entry.

## 2. Open WebUI (open-webui/open-webui, 147.9K ⭐, Python)

- Now a **full local AI platform**: chat UI + pipelines + tools + function calling + RAG + multi-user.
- **Verdict:** too heavy to embed; it's a competitor product, not a component. We build our own UI.
  Steal ideas: pipeline concept (pluggable processing steps), tools/functions UI.

## 3. llama.cpp (75K+ ⭐, C++)

- The engine under everything (Ollama, LM Studio, Jan, most runtimes). GGUF quantization.
- **Use:** only if we ever bundle raw inference ourselves (Option C). Otherwise let Ollama wrap it.

## 4. LM Studio / Jan / other runtimes

- **LM Studio:** desktop local-model runner, exposes an OpenAI-compatible local server. Good UX reference.
- **Jan (janhq/jan):** Electron local assistant, model management, local + cloud engines. See doc 04.
- All three speak OpenAI-compatible APIs → our BYOK router treats them identically.

---

## Recommended Models for a Desktop App (2026)

| Use | Models | Notes |
|---|---|---|
| Fast chat / routing | Qwen3-4B, Phi-4-mini, Gemma3-4B, Llama-4-Scout | <4GB RAM, CPU-capable |
| Coding | Qwen3-Coder, DeepSeek-R1-Distill-Qwen-14B, Llama-4-Maverick (cloud) | 8–16GB RAM |
| Deep research drafting | DeepSeek-R1-Distill, Qwen3-30B | Summarization + reasoning |
| Embeddings | nomic-embed-text, bge-m3, Qwen3-Embedding | RAG + KG |
| Vision (optional) | Gemma3-12B (multimodal), Qwen2.5-VL | OCR / screenshot understanding |

**Routing strategy:** simple reading/typing/editing → local/cheap models; heavy deep-research or
multi-file coding → frontier BYOK models. This is the cost play the user asked about — "context-based routing."

---

## Architecture Recommendation

**Ollama sidecar pattern** — detect or install Ollama, expose it in the provider router as a first-class
local tier. Zero bundling of C++ code, automatic GPU support, works offline, and users who already have
Ollama just get the integration for free.

Jina Reader OSS container (doc 02) pairs with this: local extraction + local models = fully offline research.
