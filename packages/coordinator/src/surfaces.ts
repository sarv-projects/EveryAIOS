/**
 * ADD-1..4 — the four add-now surfaces (doc 82 §1 🔵 ADD NOW; all compose
 * existing engines, none are new capability rows).
 *
 * - ADD-1 `capture()` — one-gesture capture (file / screenshot / clipboard /
 *   url / selection) routed to the existing engines.
 * - ADD-2 `Inbox` — one inbox composing notifications + memory + tasks +
 *   session-open proactivity; powers the four-verbs first screen.
 * - ADD-3 `repeat()` — the "repeat it" affordance: replay a guard card's
 *   change-set entry (K2) with the same ticket args; quiet-mode continues.
 * - ADD-4 `Studio` — the deliverable studio: report/deck/workbook output
 *   over artifact cards.
 */

/** A captured input — the unified surface (ADD-1). */
export type CaptureInput =
  | { kind: "file"; path: string }
  | { kind: "screenshot"; ref: string }
  | { kind: "clipboard"; text: string }
  | { kind: "url"; url: string }
  | { kind: "selection"; text: string }
  | { kind: "voice_memo"; audioRef: string; transcript?: string };

/** Where a capture is routed (the engine that consumes it). */
export type CaptureRoute = "office" | "browser" | "memory" | "report" | "chat";

/** Deterministic routing: the capture kind → engine (ADD-1). */
export function routeCapture(input: CaptureInput): CaptureRoute {
  switch (input.kind) {
    case "file":
      return "office";
    case "screenshot":
      return "browser";
    case "clipboard":
    case "selection":
      return "memory";
    case "url":
      return "browser";
    case "voice_memo":
      return "report";
  }
}

/** One inbox item (ADD-2). */
export type InboxItem =
  | { kind: "notification"; id: string; text: string; at: number }
  | { kind: "memory"; id: string; text: string; at: number }
  | { kind: "task"; id: string; text: string; at: number }
  | { kind: "proactive"; id: string; text: string; at: number; suggestion: string };

/** The inbox: compose + query (ADD-2). Deterministic ordering by recency. */
export class Inbox {
  private items: InboxItem[] = [];

  push(item: InboxItem): void {
    this.items.push(item);
  }

  /** All items, newest first (stable). */
  all(): InboxItem[] {
    return [...this.items].sort((a, b) => b.at - a.at);
  }

  /** Items by kind (the four-verbs first screen queries each pane). */
  byKind<K extends InboxItem["kind"]>(kind: K): Array<Extract<InboxItem, { kind: K }>> {
    return this.items.filter((i) => i.kind === kind) as Array<Extract<InboxItem, { kind: K }>>;
  }

  ack(id: string): void {
    const i = this.items.findIndex((x) => x.id === id);
    if (i >= 0) this.items.splice(i, 1);
  }

  get size(): number {
    return this.items.length;
  }
}

/** The repeat-it contract (ADD-3): replay a change-set entry (K2). */
export interface RepeatTarget {
  /** The K2 change id / guard card id. */
  ticketId: string;
  /** The change-set idempotency key — replay with the same key is safe. */
  idempotencyKey: string;
  /** Effect class — reversible/compensatable entries may repeat; the
   * coordinator refuses irreversible repeats by default. */
  effectClass: "reversible" | "compensatable" | "irreversible" | "uncertain";
  /** The ticket args hash — must match the original (no drift). */
  argsHash: string;
}

/** The repeat verdict (ADD-3). */
export type RepeatVerdict =
  | { ok: true; argsHash: string }
  | { ok: false; reason: "irreversible" | "uncertain" | "missing_ticket" };

/** Repeat a guard card's action with the same ticket args. Quiet-mode
 * continues (no re-ask) when the original ticket was already approved. */
export function repeat(target: RepeatTarget, quietMode: boolean): RepeatVerdict {
  if (target.effectClass === "irreversible" || target.effectClass === "uncertain") {
    return { ok: false, reason: target.effectClass };
  }
  if (quietMode && !target.ticketId) {
    return { ok: false, reason: "missing_ticket" };
  }
  return { ok: true, argsHash: target.argsHash };
}

/** A deliverable in the studio (ADD-4). */
export interface Deliverable {
  id: string;
  kind: "report" | "deck" | "workbook" | "email";
  title: string;
  /** Artifact-card refs the deliverable composes (D1–D4 + H1 cards). */
  sources: string[];
  format: string;
  state: "draft" | "rendered" | "exported";
}

/** The studio: compose deliverables from artifact cards (ADD-4). */
export class Studio {
  private items: Deliverable[] = [];

  compose(kind: Deliverable["kind"], title: string, sources: string[]): Deliverable {
    const d: Deliverable = {
      id: `del-${this.items.length + 1}`,
      kind,
      title,
      sources,
      format: kind === "workbook" ? "xlsx" : kind === "deck" ? "pptx" : "docx",
      state: "draft",
    };
    this.items.push(d);
    return d;
  }

  markRendered(id: string): void {
    const d = this.items.find((x) => x.id === id);
    if (d) d.state = "rendered";
  }

  export(id: string): Deliverable | undefined {
    const d = this.items.find((x) => x.id === id);
    if (d) d.state = "exported";
    return d;
  }

  all(): Deliverable[] {
    return [...this.items];
  }
}
