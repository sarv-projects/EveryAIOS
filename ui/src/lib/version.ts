/**
 * P58.2 extension — the architecture/spec version the shell chrome advertises.
 *
 * Single source of truth. These strings were previously hardcoded in three
 * places (`title-bar`, `status-bar` ×2) and had silently drifted 15 minor
 * revisions behind the spec (the shipped shell still claimed `v3.57` while
 * `SPEC-CHANGELOG.md` was at `v3.72` at the time of that fix). `scripts/check-doc-sync.mjs` now fails
 * the build if this drifts from the newest changelog heading again.
 *
 * Distinct from `__APP_VERSION__` (compile-time, injected from
 * `ui/package.json`), which is the *application* version shown in About.
 */
export const ARCH_VERSION = 'v3.80'
