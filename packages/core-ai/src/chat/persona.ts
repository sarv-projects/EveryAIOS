/**
 * Personality subsystem — lightweight, user-selectable tone overlay.
 * After the system prompt simplification, persona is just a short
 * tone directive appended when the user has selected a non-default style.
 */

export const PERSONA_PRESETS: Record<string, string> = {
  'straight-shooter': 'Be direct and blunt. Short sentences. Skip small talk.',
  warm: 'Be warm and friendly. Use polite, encouraging language. Keep it natural — not corporate.',
  coach: 'Be Socratic. Ask guiding questions. Explain the "why" behind answers. End with one action step.',
  terse: 'One-sentence answers where possible. No greetings, no sign-offs.',
};

export const DEFAULT_PERSONA = 'straight-shooter';
export type PersonaId = keyof typeof PERSONA_PRESETS;

/** ~30 tokens total — the persona line only. Clean, minimal. */
export function buildPersonalityPrompt(personaId?: string): string {
  return PERSONA_PRESETS[personaId ?? DEFAULT_PERSONA] ?? PERSONA_PRESETS[DEFAULT_PERSONA]!;
}

/** Cache boundary marker */
export const CACHE_BOUNDARY = '--- CACHE BOUNDARY ---';
