/**
 * P11.5.9 — Edit strategies (I8 pattern; doc 46 Aider SEARCH/REPLACE,
 * doc 47 ApplyPatch at Copilot scale).
 *
 * Four strategies, all deterministic (no model call):
 *   1. `search_replace` — SEARCH/REPLACE blocks with fuzzy matching:
 *      whitespace-flex (indent-insensitive) + ellipsis `...` wildcard.
 *   2. `unified_diff`   — udiff hunks (fuzzy context matching).
 *   3. `whole`          — full-file replace.
 *   4. `apply_patch`    — `*** Add File:` / `*** Update File:` / `*** Delete
 *      File:` blocks (Copilot ApplyPatch format — the fourth strategy).
 */

export type EditStrategyKind = "search_replace" | "unified_diff" | "whole" | "apply_patch";

export interface EditOperation {
  kind: EditStrategyKind;
  /** Path relative to workspace root. */
  path: string;
  /** For search_replace / unified_diff / apply_patch: the replacement text. */
  replacement?: string;
  /** For search_replace: the (fuzzy) search block. */
  search?: string;
  /** For apply_patch: "add" | "update" | "delete". */
  op?: "add" | "update" | "delete";
  /** Human-readable reason (UI display). */
  reason: string;
}

/** Normalize whitespace for fuzzy compare: collapse runs, trim each line. */
function flex(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .join("\n");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j] ?? 0;
      dp[j] = Math.min(
        (dp[j] ?? 0) + 1,
        (dp[j - 1] ?? 0) + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[n] ?? 0;
}

/**
 * Split a SEARCH block into its anchor chunks. An `...` line splits the
 * search into up to three parts (head, [middle], tail); the middle is
 * optional.
 */
function splitEllipsis(search: string): { head: string; tail: string } {
  const lines = search.split("\n");
  const idx = lines.findIndex((l) => l.trim() === "...");
  if (idx === -1) return { head: search, tail: "" };
  const head = lines.slice(0, idx).join("\n");
  const tail = lines.slice(idx + 1).join("\n");
  return { head, tail };
}

export interface MatchResult {
  ok: boolean;
  /** 0-based byte-ish offsets (char indices) of the matched region. */
  start: number;
  end: number;
  /** How close the match was (1 = exact). */
  score: number;
  reason: string;
}

/**
 * Fuzzy SEARCH/REPLACE application. Whitespace-flex: line indentation
 * differences are ignored. Ellipsis `...`: the middle of the file is
 * wildcarded (only head + tail must match).
 */
export function applySearchReplace(
  original: string,
  search: string,
  replacement: string,
  maxEditDistance = 6,
): MatchResult & { result?: string } {
  const { head, tail } = splitEllipsis(search);
  const flexHead = flex(head);
  const flexTail = tail.length > 0 ? flex(tail) : null;

  const lines = original.split("\n");
  interface Cand {
    start: number;
    end: number;
    dist: number;
    exact: boolean;
  }
  const candidates: Cand[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Candidate start: try to match head at line i.
    const headLines = flexHead.split("\n");
    if (i + headLines.length > lines.length) continue;
    const candidateHead = lines.slice(i, i + headLines.length).join("\n");
    const dHead = levenshtein(flex(candidateHead), flexHead);
    if (dHead > maxEditDistance) continue;

    if (flexTail === null) {
      // No ellipsis: exact region = head block.
      const start = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      const end = start + candidateHead.length;
      candidates.push({ start, end, dist: dHead, exact: dHead === 0 });
    } else {
      // Ellipsis: find the tail after the head.
      const tailLines = flexTail.split("\n");
      for (let j = i + headLines.length; j + tailLines.length <= lines.length; j++) {
        const candidateTail = lines.slice(j, j + tailLines.length).join("\n");
        const dTail = levenshtein(flex(candidateTail), flexTail);
        if (dTail > maxEditDistance) continue;
        const start = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        const end = lines.slice(0, j + tailLines.length).join("\n").length + (j + tailLines.length > 0 ? 1 : 0);
        candidates.push({ start, end, dist: dHead + dTail, exact: dHead === 0 && dTail === 0 });
      }
    }
  }

  if (candidates.length === 0) {
    return { ok: false, start: 0, end: 0, score: 0, reason: "search block not found (fuzzy tolerance exceeded)" };
  }
  // Prefer an exact match (first occurrence); otherwise the best fuzzy one.
  const exact = candidates.find((c) => c.exact);
  const best = exact ?? candidates.sort((a, b) => a.dist - b.dist)[0]!;
  const totalLen = flexTail === null ? head.length : head.length + (tail?.length ?? 0);
  return {
    ok: true,
    start: best.start,
    end: best.end,
    score: 1 - best.dist / Math.max(totalLen, 1),
    reason: best.exact ? "exact match" : `fuzzy match (edit distance ${best.dist})`,
    result: original.slice(0, best.start) + replacement + original.slice(best.end),
  };
}

/** Parse an ApplyPatch document into operations (*** Add/Update/Delete File). */
export function parseApplyPatch(doc: string): { ops: EditOperation[]; errors: string[] } {
  const ops: EditOperation[] = [];
  const errors: string[] = [];
  const blockRe = /^\*\*\*\s+(Add|Update|Delete)\s+File:\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  while ((m = blockRe.exec(doc)) !== null) {
    const op = (m[1] ?? "").toLowerCase() as "add" | "update" | "delete";
    const path = (m[2] ?? "").trim();
    // Content = everything between this header and the next one.
    const contentStart = m.index + m[0].length;
    const next = doc.indexOf("***", contentStart);
    const contentEnd = next === -1 ? doc.length : next;
    const content = doc
      .slice(contentStart, contentEnd)
      .replace(/^\n/, "")
      .replace(/\n\s*$/, "");
    ops.push({
      kind: "apply_patch",
      path,
      op,
      replacement: op === "delete" ? "" : content,
      reason: `ApplyPatch ${op} ${path}`,
    });
    lastIndex = m.index;
  }
  if (ops.length === 0 && doc.trim().length > 0) {
    errors.push("no *** Add/Update/Delete File: blocks found");
  }
  void lastIndex;
  return { ops, errors };
}
