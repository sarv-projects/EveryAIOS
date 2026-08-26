# ARCH/14 — ShowUI-Aloha Reference

ShowUI-Aloha is a reference for visual grounding and action representation,
not a runtime dependency. EveryAIOS retains the halt-over-guess rule: use the
accessibility/UIA/CDP path first, escalate to OCR/vision only when necessary,
then verify the resulting state after one action. Model weights and training
artifacts are opt-in and must not weaken Guard-2, ownership, audit, or network
policy.
