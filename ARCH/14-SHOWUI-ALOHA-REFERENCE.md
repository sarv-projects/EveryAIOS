# ARCH/14 — ShowUI-Aloha Reference

ShowUI-Aloha is a reference for visual grounding and action representation,
not a runtime dependency. EveryAIOS retains the halt-over-guess rule: use the
accessibility/UIA/CDP path first, escalate to OCR/vision only when necessary,
then verify the resulting state after one action. Model weights and training
artifacts are opt-in and must not weaken Guard-2, ownership, audit, or network
policy.

> **Plane (ARCH/17 §17.1):** visual grounding and the CUA action loop serve the
> **Shared Cowork Plane**. EveryAIOS Native uses the shared CUA surface; an
> external agent that exposes its own CUA (through its integrated CLI) is
> native-first, with EveryAIOS CUA as the fallback.
