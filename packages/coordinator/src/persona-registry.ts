/**
 * P30.6 — persona manifest + registry (openworker SOUL-file pattern, doc 83
 * §1, formalized). A persona is a declarative manifest — id, display name,
 * description, source (builtin | user | imported), and the persona text —
 * loaded from a registry with validation. The builtin set mirrors the
 * existing `PERSONA_PRESETS`/`SOUL_PRESETS` (ui/lib/personas.ts); this module
 * is the coordinator-side registry contract the UI + personality surface
 * (P30.16) share.
 */

export type PersonaSource = "builtin" | "user" | "imported";

/** The declarative persona manifest. */
export interface PersonaManifest {
  /** Stable id (slug). */
  id: string;
  /** Display name ("Straight Shooter"). */
  name: string;
  /** One-line description shown in pickers. */
  description: string;
  source: PersonaSource;
  /** The persona text (system-prompt segment / SOUL.md body). */
  text: string;
  /** Optional parent persona this one extends (id). */
  extends?: string;
}

export interface PersonaValidation {
  ok: boolean;
  errors: string[];
}

/** Validation rules: a manifest must be loadable, declarative, honest. */
export function validateManifest(m: PersonaManifest): PersonaValidation {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(m.id)) {
    errors.push("id must be a lowercase slug (a-z0-9_-), max 48 chars");
  }
  if (!m.name.trim()) errors.push("name is required");
  if (!m.description.trim()) errors.push("description is required");
  if (!m.text.trim()) errors.push("text is required");
  // Declarative-only: no executable payload smuggling in a persona.
  if (/\b(?:import|require|exec|eval|fetch|curl|wget)\b/i.test(m.text)) {
    errors.push("persona text must be declarative prose (no code/exec verbs)");
  }
  if (m.source === "builtin" && !BUILTIN_IDS.has(m.id)) {
    errors.push("source=builtin but id is not in the builtin set");
  }
  return { ok: errors.length === 0, errors };
}

/** The builtin persona ids (mirrors ui PERSONA_PRESETS keys). */
export const BUILTIN_IDS = new Set(["straight-shooter", "warm", "coach", "terse"]);

/** The builtin manifests (seed of the registry). */
export function builtinManifests(): PersonaManifest[] {
  const rows: Array<[string, string, string, string]> = [
    [
      "straight-shooter",
      "Straight Shooter",
      "Direct and blunt. Short sentences, no small talk.",
      "Be direct and blunt. Short sentences. Skip small talk.",
    ],
    [
      "warm",
      "Warm",
      "Friendly, polite, encouraging — natural, not corporate.",
      "Be warm and friendly. Use polite, encouraging language. Keep it natural — not corporate.",
    ],
    [
      "coach",
      "Coach",
      "Socratic — asks guiding questions and explains the why.",
      'Be Socratic. Ask guiding questions. Explain the "why" behind answers. End with one action step.',
    ],
    [
      "terse",
      "Terse",
      "One-sentence answers, no greetings or sign-offs.",
      "One-sentence answers where possible. No greetings, no sign-offs.",
    ],
  ];
  return rows.map(([id, name, description, text]) => ({
    id,
    name,
    description,
    source: "builtin" as const,
    text,
  }));
}

/**
 * The persona registry: loading + validation + lookup. Builtin set is
 * immutable; user/imported personas register on top (id collisions refuse).
 */
export class PersonaRegistry {
  private byId = new Map<string, PersonaManifest>();

  constructor(seed: PersonaManifest[] = builtinManifests()) {
    for (const m of seed) this.byId.set(m.id, m);
  }

  /** Register a persona; refuses invalid manifests and id collisions. */
  register(m: PersonaManifest): PersonaValidation {
    const v = validateManifest(m);
    if (!v.ok) return v;
    if (this.byId.has(m.id) && this.byId.get(m.id)!.source === "builtin") {
      return { ok: false, errors: [`id '${m.id}' is a builtin — cannot overwrite`] };
    }
    this.byId.set(m.id, m);
    return v;
  }

  get(id: string): PersonaManifest | undefined {
    return this.byId.get(id);
  }

  list(): PersonaManifest[] {
    return [...this.byId.values()];
  }

  /** The effective text: own text, else the `extends` chain (cycle-safe). */
  effectiveText(id: string, seen = new Set<string>()): string {
    const m = this.byId.get(id);
    if (!m) return "";
    if (seen.has(m.id)) return m.text;
    seen.add(m.id);
    if (m.extends) {
      const parent = this.effectiveText(m.extends, seen);
      return parent ? `${parent}\n${m.text}` : m.text;
    }
    return m.text;
  }
}
