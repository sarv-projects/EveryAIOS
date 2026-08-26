/**
 * P30.16 — companion layer seam (skales Desktop-Buddy/Iris/pixel-pets
 * pattern, doc 83 §1). **Deferred as a product surface** (post-v1,
 * high-effort differentiator for the 6-to-60+ audience) — this module lands
 * only the architectural seam: a persona → personality-surface contract that
 * the future companion UI will render. The `PersonaRegistry` (P30.6) is the
 * source of personas; this seam maps one to the chat personality and to a
 * companion frame (name, tagline, mood hooks) without any pixel-pet chrome.
 *
 * Honest status: the surface is a seam, not a feature — no overlay, no pet.
 */

import type { PersonaManifest } from "./persona-registry";

export type CompanionMood = "neutral" | "cheerful" | "focused" | "resting";

/** The personality surface a companion would render (seam only). */
export interface CompanionFrame {
  /** The agent's name (P32.2 naming — empty until the user names it). */
  name: string;
  /** One-line personality summary (from the persona description). */
  tagline: string;
  /** Mood hooks the chat/status surfaces may read. */
  mood: CompanionMood;
}

/** Map a persona manifest to the companion frame (no product surface). */
export function companionFrameFor(persona: PersonaManifest | undefined, name = ""): CompanionFrame {
  if (!persona) {
    return { name, tagline: "Your local AI coworker", mood: "neutral" };
  }
  const mood: CompanionMood = persona.id === "warm" ? "cheerful" : "neutral";
  return { name, tagline: persona.description, mood };
}

/** Mood suggestion from the agent's current state (seam contract). */
export function moodForState(paused: boolean, running: boolean): CompanionMood {
  if (paused) return "resting";
  if (running) return "focused";
  return "neutral";
}
