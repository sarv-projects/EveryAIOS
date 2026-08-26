/**
 * P30.5 — mention-driven sessions (openworker pattern, doc 83 §1, F13
 * concretization): `@agent` in Slack/Telegram/email → a session opens on
 * desktop → work runs → the thread gets the reply. This module owns the pure
 * routing half — parsing mentions, resolving the target agent, and producing
 * the "open session + run + reply" plan. The messaging transport itself stays
 * a stub (F13 bridge); this is the routing contract it drives.
 */

export type MentionSource = "slack" | "telegram" | "email";

export interface MentionMessage {
  /** The raw inbound text (may contain several `@mentions`). */
  text: string;
  /** Which transport it arrived on. */
  source: MentionSource;
  /** The thread/channel id to reply into. */
  threadId: string;
  /** Sender identity (best-effort). */
  from?: string;
}

export interface MentionHit {
  /** The `@handle` as written, including the @. */
  mention: string;
  /** The bare handle (lowercased). */
  handle: string;
  /** Index in the raw text. */
  start: number;
  end: number;
}

export interface MentionPlan {
  /** The message text with mentions stripped (the actual work request). */
  instruction: string;
  /** The agent that was mentioned (empty = no known agent — no session). */
  agentId: string;
  /** True when at least one known agent was mentioned. */
  opensSession: boolean;
  /** Suggested session title (for the desktop session list). */
  sessionTitle: string;
}

/**
 * Extract `@handle` mentions. Handles are `[A-Za-z0-9_-]+`; a trailing `.` or
 * `,` (sentence punctuation) is not part of the handle.
 */
export function extractMentions(text: string): MentionHit[] {
  const hits: MentionHit[] = [];
  const re = /@([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      mention: m[0],
      handle: (m[1] ?? "").toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return hits;
}

/** Strip `@handle` tokens from the text, leaving the instruction. */
export function stripMentions(text: string): string {
  return text.replace(/@[A-Za-z0-9_-]+/g, "").replace(/^\s+/, "").trim();
}

/**
 * The registry of known agent handles. Ships with the builtin agent plus the
 * ACP harnesses (claude/codex/grok/gemini/cursor). Additional handles are
 * registered when the user names an agent (P32.2).
 */
export class MentionRegistry {
  private handles = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    if (seed) {
      for (const [handle, agentId] of Object.entries(seed)) {
        this.handles.set(handle.toLowerCase(), agentId);
      }
    }
  }

  /** Register (or re-map) a handle → agent. */
  register(handle: string, agentId: string): void {
    this.handles.set(handle.toLowerCase(), agentId);
  }

  resolve(handle: string): string | undefined {
    return this.handles.get(handle.toLowerCase());
  }

  knownHandles(): string[] {
    return [...this.handles.keys()];
  }
}

/** The builtin handle seed (default agent + ACP harnesses). */
export function builtinMentionSeed(): Record<string, string> {
  return {
    everyaios: "everyaios-native",
    claude: "claude-code",
    codex: "codex-cli",
    grok: "grok-build",
    gemini: "gemini-cli",
    cursor: "cursor-agent",
  };
}

/**
 * Route a mention message to a session plan. Pure — no side effects; the
 * caller opens the session and runs the work.
 */
export function routeMention(
  msg: MentionMessage,
  registry: MentionRegistry,
): MentionPlan {
  const hits = extractMentions(msg.text);
  const known = hits.find((h) => registry.resolve(h.handle) !== undefined);
  if (!known) {
    return {
      instruction: stripMentions(msg.text),
      agentId: "",
      opensSession: false,
      sessionTitle: "",
    };
  }
  const agentId = registry.resolve(known.handle)!;
  const instruction = stripMentions(msg.text);
  return {
    instruction,
    agentId,
    opensSession: true,
    sessionTitle: `${agentId} · ${instruction.slice(0, 48)}`,
  };
}
