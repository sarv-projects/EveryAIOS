/**
 * P50.4.8 — Capability availability matrix.
 *
 * Every advertised consumer surface maps to exactly one truthful status,
 * derived from LIVE runtime state — never from a static claim:
 *
 *   - `live`        the capability exists in this build AND is usable now
 *   - `partial`     exists but needs setup/credentials/attachment to act
 *   - `unavailable` not yet implemented — the control must be disabled or
 *                   hidden (spec: "hide or disable actions that cannot work
 *                   in the current build rather than showing attractive but
 *                   inert chrome")
 *   - `v1-planned`   confirmed v1 deliverable, stack not wired yet — controls
 *                   render as staged/inert, never as working (H15/H28 voice)
 *   - `post-v1`     deliberately scoped out of v1 (spec §8 / FINAL VISION;
 *                   capabilities.yaml `post_v1: true`, ARCH/09 ⚪)
 *
 * The matrix is a pure function of a runtime snapshot (`CapabilityContext`)
 * so it is deterministic and unit-testable; components read it via
 * `capabilityFor(id, ctx)`.
 *
 * Source of truth for the post-v1 set: `capabilities.yaml` (I3 = WASM
 * sandbox, A10 = image generation, H15/H28 = voice, H18 = remote handoff,
 * H26 = clipboard). The v1-unavailable set is the verified absence of a
 * consumer implementation in this build (voice STT/TTS capture, image-gen
 * tooling, remote-session pairing).
 */

/** The truthful availability of one advertised capability. */
export type CapabilityStatus = 'live' | 'partial' | 'unavailable' | 'v1-planned' | 'post-v1'

/** Stable capability ids used by the consumer surface (spec rows). */
export type CapabilityId =
  | 'voice-input' //      H15 — VAD/STT capture
  | 'voice-output' //     H28 — TTS read-aloud
  | 'image-generation' // A10
  | 'wasm-sandbox' //     I3 — fuel-metered
  | 'remote-handoff' //   H18 — LAN/Tailscale/phone resume
  | 'browser-attach' //   E2 — CDP Chrome attachment
  | 'desktop-computer-use' // E9 — native windows see/read/act
  | 'local-models' //     P27 — GGUF/Ollama local runtimes
  | 'provider-routing' // A6/A7 — live provider router feed
  | 'connector-attach' // F1–F5 — OAuth/MCP connectors
  | 'skill-registry' //   I2
  | 'script-eval' //      E4 — rquickjs sandbox (in-process, never containment)

/**
 * The live facts a caller supplies. Every field is runtime truth — the
 * matrix never guesses.
 */
export interface CapabilityContext {
  /** True when running in the Tauri shell (vs plain-browser preview). */
  inTauri: boolean
  /** True once the Rust sidecar answered (live chat/coordinator path). */
  sidecarLive: boolean
  /** True when the session vault is unlocked (keys/credentials readable). */
  vaultUnlocked: boolean
  /** True when the browser engine reports an attached CDP session. */
  browserAttached: boolean
  /** True when the desktop computer-use engine reports a driver attach. */
  desktopAttached: boolean
  /** Provider routes the live feed decided are usable (non-empty). */
  providerRoutesAvailable: boolean
  /** Any connector row in `connected` state. */
  anyConnectorConnected: boolean
  /** Any local model runtime configured (Ollama/llamafile/GGUF). */
  anyLocalModelConfigured: boolean
}

/** One matrix row: the capability, its live status, and WHY. */
export interface CapabilityRow {
  id: CapabilityId
  status: CapabilityStatus
  /** Honest one-line explanation of the status (surfaced in UI tooltips). */
  reason: string
}

const V1_PLANNED = new Set<CapabilityId>(['voice-input', 'voice-output'])

const POST_V1 = new Set<CapabilityId>(['image-generation', 'wasm-sandbox', 'remote-handoff'])

const LABEL: Record<CapabilityId, string> = {
  'voice-input': 'Voice input (VAD/STT)',
  'voice-output': 'Voice output (TTS read-aloud)',
  'image-generation': 'Image generation',
  'wasm-sandbox': 'WASM fuel-metered sandbox',
  'remote-handoff': 'Remote session handoff',
  'browser-attach': 'Browser (CDP) attachment',
  'desktop-computer-use': 'Desktop computer use',
  'local-models': 'Local model runtimes',
  'provider-routing': 'Live provider routing',
  'connector-attach': 'Connector attachment',
  'skill-registry': 'Skill registry',
  'script-eval': 'Script eval sandbox (rquickjs)',
}

/** Build the truthful row for one capability from live facts. */
export function capabilityFor(id: CapabilityId, ctx: CapabilityContext): CapabilityRow {
  // Post-v1 surfaces are post-v1 unconditionally (spec §8 scope, not build
  // state) — but the reason says so explicitly, and the consumer must render
  // them disabled/hidden, not as working controls.
  if (POST_V1.has(id)) {
    return { id, status: 'post-v1', reason: `${LABEL[id]} is scoped to post-v1 (spec §8 / capabilities.yaml).` }
  }
  // Voice is a confirmed v1 deliverable (H15/H28, flipped 2026-08-31) whose
  // stack is not wired yet. Controls render as staged/inert — persisted prefs
  // are kept as the future surface, but nothing pretends to capture or speak.
  if (V1_PLANNED.has(id)) {
    return { id, status: 'v1-planned', reason: `${LABEL[id]} is a v1 deliverable — the STT/TTS stack is not wired in this build; controls are staged, not live.` }
  }

  switch (id) {
    case 'browser-attach':
      if (!ctx.inTauri) {
        return { id, status: 'partial', reason: 'Browser attachment needs the Tauri shell (preview has no CDP session).' }
      }
      return ctx.browserAttached
        ? { id, status: 'live', reason: 'CDP session attached.' }
        : { id, status: 'partial', reason: 'Engine available — attach Chrome to make the session live.' }
    case 'desktop-computer-use':
      if (!ctx.inTauri) {
        return { id, status: 'partial', reason: 'Desktop computer use needs the Tauri shell (preview has no driver).' }
      }
      return ctx.desktopAttached
        ? { id, status: 'live', reason: 'Desktop driver attached.' }
        : { id, status: 'partial', reason: 'Engine available — attach a driver to make the session live.' }
    case 'local-models':
      return ctx.anyLocalModelConfigured
        ? { id, status: 'live', reason: 'Local model runtime configured.' }
        : { id, status: 'partial', reason: 'No local runtime configured — pick one in Settings → Local.' }
    case 'provider-routing':
      if (!ctx.inTauri || !ctx.sidecarLive) {
        return { id, status: 'partial', reason: 'Provider routing is live once the coordinator answers (preview shows the static catalog).' }
      }
      return ctx.providerRoutesAvailable
        ? { id, status: 'live', reason: 'Live routing feed decided usable routes.' }
        : { id, status: 'partial', reason: 'No verified provider route yet — add a provider key to activate the live feed.' }
    case 'connector-attach':
      if (!ctx.inTauri) {
        return { id, status: 'partial', reason: 'Connector attach needs the Tauri shell (preview rows are fixtures).' }
      }
      return ctx.anyConnectorConnected
        ? { id, status: 'live', reason: 'At least one connector is attached and connected.' }
        : { id, status: 'partial', reason: 'No connected connector — attach an OAuth/MCP resource.' }
    case 'skill-registry':
      if (!ctx.inTauri) {
        return { id, status: 'partial', reason: 'Skills scan the on-disk registry in the shell (preview has none).' }
      }
      return { id, status: 'live', reason: 'Skill registry is live in the shell.' }
    case 'script-eval':
      // ARCH/08 §8.4 — the rquickjs sandbox is defense-in-depth only, NEVER
      // containment: it must never be advertised as a full isolation boundary.
      return { id, status: 'live', reason: 'In-process rquickjs sandbox with hard limits — defense-in-depth, never containment (ARCH/08 §8.4).' }
  }
  // Exhaustive: every capability id has a branch above or is POST_V1.
  return { id, status: 'unavailable', reason: `${LABEL[id]} is not implemented in this build.` }
}

/** The full matrix, in a stable display order (used by any matrix UI). */
export function capabilityMatrix(ctx: CapabilityContext): CapabilityRow[] {
  return (Object.keys(LABEL) as CapabilityId[]).map((id) => capabilityFor(id, ctx))
}