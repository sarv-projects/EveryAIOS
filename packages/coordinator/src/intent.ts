/**
 * P11.5.10 — Intent classification before tool dispatch (Copilot Chat
 * pattern; doc 56 W3 `input_classifier` kept as the optional ONNX backend —
 * the prompt-based keyword core below is the default and shares the same
 * dispatch interface).
 *
 * Routes a user prompt to a specialized handler BEFORE the tool loop starts:
 *   - `agent`    → full agent loop (tools, plan, sub-agents)
 *   - `edit`     → code-editing handler (search/replace strategies, LSP)
 *   - `ask`      → conversational/read-only answer (memory + retrieval)
 *   - `terminal` → shell-centric task (command generation + execution)
 *   - `build`    → compile/test/watch task (lint reflection, retries)
 */

export type IntentKind = "agent" | "edit" | "ask" | "terminal" | "build";

export interface Intent {
  kind: IntentKind;
  /** The evidence that drove the classification (UI-displayable). */
  reason: string;
  /** Confidence 0..1 (keyword match strength). */
  confidence: number;
  /** Deterministic rewrite (e.g. strip a leading verb) — empty if none. */
  rewrite: string;
}

const EDIT_SIGNALS =
  /\b(refactor|rewrite|fix|update|change|add|remove|delete|create|rename|move|extract|inline|implement|optimize|write|edit|modify|patch|bug|issue|error)\b/i;
const TERMINAL_SIGNALS =
  /\b(run|execute|install|start|stop|restart|kill|grep|find|ls|cd|build|deploy|ssh|curl|npm|pnpm|cargo|docker|git (add|commit|push|pull|checkout|rebase|merge|status|log))\b/i;
const BUILD_SIGNALS =
  /\b(compile|build error|test (fail|pass|suite)|typecheck|type error|lint|ci|pipeline|watch mode|recompile)\b/i;
const ASK_SIGNALS =
  /\b(what is|what are|explain|how (does|do|can|is)|why|when|who|summarize|tell me|meaning|difference between|compare)\b/i;

const AGENT_SIGNALS =
  /\b(research|plan|investigate|explore|analyze|agent|multi-?step|automate|orchestrate|delegate|sub-?agent|recurring|cron|schedule|monitor|watch|workflow)\b/i;

/**
 * Classify a prompt into one of the four handlers. Deterministic — no
 * network, no model call. The optional ONNX backend (Warp `input_classifier`)
 * plugs in behind the same interface.
 */
export function classifyIntent(prompt: string): Intent {
  const p = prompt.trim();
  if (p.length === 0) return { kind: "ask", reason: "empty prompt", confidence: 0.5, rewrite: "" };

  const score = (re: RegExp): number => {
    const m = p.match(re);
    if (!m) return 0;
    // More signals → higher confidence.
    return Math.min(1, (p.match(re) ?? []).length / 3 + 0.4);
  };

  const sEdit = score(EDIT_SIGNALS);
  const sTerm = score(TERMINAL_SIGNALS);
  const sBuild = score(BUILD_SIGNALS);
  const sAsk = score(ASK_SIGNALS);
  const sAgent = score(AGENT_SIGNALS);

  // A leading question strongly implies ask even with edit-ish verbs inside.
  const leadingQuestion = /^(what|why|how|when|who|is|are|can|does|do)\b/i.test(p);
  // A leading shell verb is a strong terminal signal even when a later word
  // (e.g. "test suite") also matches build signals — the user asked to RUN it.
  const leadingShellVerb = /^(run|execute|install|start|stop|restart|kill|deploy|launch)\b/i.test(p);

  let kind: IntentKind;
  let reason: string;
  let confidence: number;

  if (sAgent >= 0.4 && sAgent >= sEdit && !leadingShellVerb) {
    kind = "agent";
    reason = "agent-loop signals (plan/research/delegate/workflow)";
    confidence = sAgent;
  } else if (leadingShellVerb && sTerm >= sBuild * 0.6) {
    kind = "terminal";
    reason = "leading shell verb (run/install/start)";
    confidence = Math.max(0.7, sTerm);
  } else if (leadingQuestion || (sAsk > 0 && sAsk >= sEdit && sAsk >= sTerm)) {
    kind = "ask";
    reason = leadingQuestion ? "leading question" : "ask signals (what/explain/summarize)";
    confidence = Math.max(sAsk, leadingQuestion ? 0.75 : 0);
  } else if (sBuild > 0 && sBuild >= sTerm && sBuild >= sEdit) {
    kind = "build";
    reason = "build/test signals (compile/lint/typecheck)";
    confidence = sBuild;
  } else if (sTerm > 0 && sTerm > sEdit) {
    kind = "terminal";
    reason = "shell signals (run/install/build/deploy)";
    confidence = sTerm;
  } else if (sEdit > 0) {
    kind = "edit";
    reason = "edit signals (refactor/fix/add/write)";
    confidence = sEdit;
  } else {
    kind = "ask";
    reason = "no strong signals — default conversational";
    confidence = 0.4;
  }

  // Deterministic rewrite: strip a leading question/interjection verb so the
  // handler receives the bare instruction ("Can you fix the bug?" → "fix the
  // bug?" is risky; instead we keep the raw prompt and only expose the verb).
  const verb = p.match(/^(?:can you|please|could you|would you)\s+/i)?.[0] ?? "";
  const rewrite = verb ? p.slice(verb.length).trim() : "";

  return { kind, reason, confidence, rewrite };
}

/** The dispatch interface the ONNX backend must satisfy (doc 56 W3). */
export type IntentClassifier = (prompt: string) => Intent;

/** Handler resolution — what each intent routes to. */
export function handlerFor(intent: IntentKind): string {
  switch (intent) {
    case "agent":
      return "agent-loop (plan → tools → verify)";
    case "edit":
      return "edit handler (SEARCH/REPLACE + LSP + lint reflection)";
    case "ask":
      return "ask handler (memory retrieval + citation)";
    case "terminal":
      return "terminal handler (command gen + execute)";
    case "build":
      return "build handler (compile/test loop with retries)";
  }
}
