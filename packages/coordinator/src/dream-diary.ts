/**
 * P30.15 — **visible memory consolidation** (skales "Dreaming"/Dream-Diary
 * framing, doc 83 §1): user-visible framing over the existing C-series
 * compaction/decay. The Rust memory store already folds + decays facts (C6/C7
 * compaction); this module turns each consolidation run into a plain-language
 * diary entry + a morning brief, so the user sees what the memory system is
 * doing instead of it happening invisibly.
 */

export interface ConsolidationRun {
  /** What was consolidated (folded into long-term memory). */
  foldedFacts: number;
  /** What was decayed (pruned as noise / superseded). */
  decayedFacts: number;
  /** The sessions/topics involved (for the headline). */
  topics: string[];
  /** UNIX ms of the run. */
  atMs: number;
}

/** One diary entry (the persisted shape — mirrors ui DiaryEntry). */
export interface DiaryEntry {
  id: string;
  atMs: number;
  headline: string;
  foldedFacts: number;
  decayedFacts: number;
  brief: string;
}

let diarySeq = 0;
export function nextDiaryId(now = Date.now()): string {
  diarySeq += 1;
  return `dream-${now.toString(36)}-${diarySeq.toString(36)}`;
}

/** Build the plain-language headline for a run. */
export function headlineFor(run: ConsolidationRun): string {
  const topic = run.topics[0];
  const subject = topic ? ` about ${topic}` : "";
  const folded = run.foldedFacts > 0 ? `${run.foldedFacts} fact${run.foldedFacts === 1 ? "" : "s"}` : "";
  const decayed = run.decayedFacts > 0 ? `${run.decayedFacts} old fact${run.decayedFacts === 1 ? "" : "s"}` : "";
  const parts = [folded && `Folded ${folded}${subject}`, decayed && `let go of ${decayed}`].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Memory consolidation run";
}

/** Build the one-line morning-brief text (plain language, no jargon). */
export function briefFor(run: ConsolidationRun): string {
  const topic = run.topics[0];
  const bits: string[] = [];
  if (run.foldedFacts > 0) {
    bits.push(
      `remembered ${run.foldedFacts} thing${run.foldedFacts === 1 ? "" : "s"}${topic ? ` about ${topic}` : ""} for the long term`,
    );
  }
  if (run.decayedFacts > 0) {
    bits.push(`pruned ${run.decayedFacts} outdated detail${run.decayedFacts === 1 ? "" : "s"} to reduce noise`);
  }
  return bits.length > 0 ? bits.join(", and ") : "nothing changed this run";
}

/** Turn a consolidation run into a diary entry. */
export function diaryEntryFor(run: ConsolidationRun): DiaryEntry {
  return {
    id: nextDiaryId(run.atMs),
    atMs: run.atMs,
    headline: headlineFor(run),
    foldedFacts: run.foldedFacts,
    decayedFacts: run.decayedFacts,
    brief: briefFor(run),
  };
}

/**
 * The dream diary: an append-only journal of consolidation runs (cap 30),
 * with a morning-brief renderer over the last 24h.
 */
export class DreamDiary {
  private entries: DiaryEntry[] = [];

  constructor(private now: () => number = Date.now) {}

  /** Record a consolidation run. */
  record(run: ConsolidationRun): DiaryEntry {
    const entry = diaryEntryFor(run);
    this.entries = [entry, ...this.entries].slice(0, 30);
    return entry;
  }

  list(): DiaryEntry[] {
    return [...this.entries];
  }

  /** The morning brief: everything consolidated in the last 24h, one line. */
  morningBrief(hours = 24): string {
    const cutoff = this.now() - hours * 60 * 60 * 1000;
    const recent = this.entries.filter((e) => e.atMs >= cutoff);
    if (recent.length === 0) return "No consolidation since the last brief.";
    const folded = recent.reduce((n, e) => n + e.foldedFacts, 0);
    const decayed = recent.reduce((n, e) => n + e.decayedFacts, 0);
    const first = recent[0]!.headline;
    return `Overnight I ${folded > 0 ? `folded ${folded} new fact${folded === 1 ? "" : "s"} (${first})` : "kept memory steady"}${decayed > 0 ? ` and pruned ${decayed} outdated detail${decayed === 1 ? "" : "s"}` : ""}.`;
  }
}
