/**
 * P11.5.10 — New agent patterns (doc 47, doc 57 §3 subscription boundary).
 *
 * All deterministic, model-agnostic, testable without a network:
 *   - Plan/Act dual-mode (Cline)       — explicit plan phase gate
 *   - Architect mode two-pass (I9)     — reasoning model → editor model
 *   - Oracle/reviewer (secondary model)— heavyweight quality review
 *   - Autopilot nudge                  — continuation on premature stop
 *   - Prompt TSX composition           — declarative prompt + budget
 *   - MODEL_ALIASES                    — config alias resolution
 *   - Custom Distribution              — branded pre-loaded configs
 *   - ACP subscription seam (doc 57)   — drive CLIs, never harvest tokens
 */

/** === Plan/Act dual-mode (Cline pattern) === */
export type AgentMode = "plan" | "act";

export interface PlanActDecision {
  mode: AgentMode;
  /** Plan mode: what the plan phase should produce. */
  planRequest?: string;
}

/**
 * Decide the agent-loop mode. When `explicitPlan` is set, plan mode is
 * entered FIRST and tool execution is gated until `approvePlan` is called —
 * the Cline "plan phase before tool execution" contract.
 */
export function decideMode(
  prompt: string,
  opts: { explicitPlan?: boolean; autoAct?: boolean } = {},
): PlanActDecision {
  if (opts.explicitPlan) {
    return {
      mode: "plan",
      planRequest: `Plan first. Do NOT execute any tool yet. Propose a step-by-step plan for: ${prompt}`,
    };
  }
  if (opts.autoAct) return { mode: "act" };
  const planSignal = /\b(plan|outline|step.?by.?step|approach|how would you)\b/i.test(prompt);
  return { mode: planSignal ? "plan" : "act", ...(planSignal ? { planRequest: `Propose a plan for: ${prompt}` } : {}) };
}

/** === Architect mode two-pass (I9) === */
export type Tier = "reasoning" | "editor";

export interface ArchitectConfig {
  /** Model id for the reasoning pass (planner tier). */
  reasoningModel: string;
  /** Model id for the edit pass (editor tier). */
  editorModel: string;
  /** `reasoning` pass also emits a review gate before edits. */
  reviewBeforeEdit: boolean;
}

/**
 * Split a task into reasoning-pass and edit-pass prompts. The reasoning pass
 * returns an architecture; the edit pass applies it (aider's two-pass
 * 82.7% benchmark — doc 51).
 */
export function architectSplit(
  task: string,
  cfg: ArchitectConfig,
): { reasoningPrompt: string; editPrompt: (architecture: string) => string } {
  return {
    reasoningPrompt: `[reasoning pass — ${cfg.reasoningModel}] Analyze and design. Do NOT edit files. Output the architecture/plan for:\n${task}`,
    editPrompt: (architecture: string) =>
      `[edit pass — ${cfg.editorModel}] Implement exactly the architecture below. Make the minimal edits:\n\n${architecture}`,
  };
}

/** === Oracle / reviewer model pattern === */
export interface OracleConfig {
  /** Model id for the oracle (heavier than the worker). */
  oracleModel: string;
  /** Require the oracle to pass before the work is committed. */
  gate: boolean;
}

export interface ReviewVerdict {
  passed: boolean;
  comments: string;
}

/**
 * The oracle's deterministic pre-checks (no model call): structural sanity
 * the reviewer always verifies. The LLM oracle prompt is composed here; the
 * harness decides whether to actually invoke the heavier model.
 */
export function oracleChecks(original: string, edited: string): ReviewVerdict {
  if (edited.length === 0) return { passed: false, comments: "edited output is empty" };
  if (edited.length > original.length * 20 + 2000) {
    return { passed: false, comments: "edited output is implausibly large vs original" };
  }
  return { passed: true, comments: "structural pre-checks passed" };
}

/** === Autopilot nudge (premature stop) === */
export interface StopInfo {
  /** Absent when the stream ended without a provider finish reason. */
  finishReason: string | undefined;
  text: string;
  /** The final assistant message ended with an incomplete construct. */
  isPrematureStop: boolean;
}

/**
 * Detect a premature stop: finish_reason `length` (context exhausted) or the
 * output ending mid-construct (unclosed backtick fence / JSON brace / code
 * block). Returns the continuation nudge when applicable.
 */
export function detectPrematureStop(text: string, finishReason?: string): StopInfo {
  const trimmed = text.trimEnd();
  const fences = (trimmed.match(/```/g) ?? []).length;
  const unbalancedFence = fences % 2 === 1;
  const unbalancedBrace = (trimmed.match(/\{/g) ?? []).length > (trimmed.match(/\}/g) ?? []).length;
  const incompleteJson = /,\s*$/.test(trimmed) || /(?:=>|->|\|\||&&)\s*$/.test(trimmed);
  const isPrematureStop =
    finishReason === "length" || unbalancedFence || unbalancedBrace || incompleteJson;
  return { finishReason, text, isPrematureStop };
}

/** === Prompt TSX (declarative prompt composition) === */
export type PromptNode =
  | { kind: "text"; text: string }
  | { kind: "section"; title: string; children: PromptNode[] }
  | { kind: "data"; name: string; value: string; capTokens?: number }
  | { kind: "boundary" }; // CACHE_BOUNDARY marker

export interface ComposeOptions {
  /** Hard cap on the total prompt (tokens). */
  maxTokens: number;
  /** Cuts volatile data nodes first when over budget. */
  volatileFirst?: boolean;
}

export function composePrompt(nodes: PromptNode[], opts: ComposeOptions): string {
  const approx = (t: string): number => Math.ceil(t.length / 4);
  let total = 0;
  const out: string[] = [];
  const cut = (n: PromptNode): number => {
    if (n.kind === "text") return approx(n.text);
    if (n.kind === "section") return n.children.map(cut).reduce((a, b) => a + b, 0);
    if (n.kind === "data") {
      const cap = n.capTokens ?? Number.POSITIVE_INFINITY;
      return Math.min(approx(n.value), cap);
    }
    return 0;
  };
  const render = (n: PromptNode): string => {
    switch (n.kind) {
      case "text":
        return n.text;
      case "boundary":
        return "\n<CACHE_BOUNDARY>\n";
      case "section":
        return `\n## ${n.title}\n${n.children.map(render).join("\n")}`;
      case "data":
        return `\n<${n.name}>\n${n.value.slice(0, (n.capTokens ?? 1e9) * 4)}\n</${n.name}>`;
    }
  };
  // Data nodes are droppable (volatile); text/section/boundary nodes are
  // structural and always kept. Over-budget data nodes are skipped (never
  // allowed to break the prompt), and remaining budget is enforced on data.
  const sorted = [...nodes].sort((a, b) => {
    if (!opts.volatileFirst) return 0;
    const av = a.kind === "data" ? 1 : 0;
    const bv = b.kind === "data" ? 1 : 0;
    return bv - av;
  });
  for (const n of sorted) {
    const rendered = render(n);
    if (n.kind === "data") {
      if (total + cut(n) > opts.maxTokens) continue; // drop, never break
      total += cut(n);
      out.push(rendered);
      continue;
    }
    out.push(rendered);
  }
  return out.join("\n");
}

/** === MODEL_ALIASES === */
export interface ModelAliasMap {
  [alias: string]: string; // alias → "provider/model"
}

/**
 * Resolve a model reference that may be a short alias. Accepts:
 *   - alias ("claude")        → mapped full path
 *   - bare model ("gpt-5")    → default-provider lookup
 *   - full path ("openai/gpt-5")
 */
export function resolveModelAlias(
  ref: string,
  aliases: ModelAliasMap,
  defaultProvider: string,
): { provider: string; model: string; usedAlias: boolean } {
  if (aliases[ref]) {
    const [p, m] = aliases[ref].split("/", 2);
    const provider = p ?? "";
    return { provider, model: m || provider, usedAlias: true };
  }
  if (ref.includes("/")) {
    const [p, m] = ref.split("/", 2);
    const provider = p ?? "";
    return { provider, model: m || provider, usedAlias: false };
  }
  return { provider: defaultProvider, model: ref, usedAlias: false };
}

/** === Custom Distribution (branded configs) === */
export interface DistroPreset {
  id: string;
  displayName: string;
  /** Pre-loaded providers (ids into the catalog). */
  providers: string[];
  /** Default model alias map. */
  aliases: ModelAliasMap;
  /** Branding overrides (UI). */
  brand: { accent?: string; tagline?: string };
  /** Read-only skill packs bundled with the distro. */
  skills: string[];
}

export interface DistroManifest {
  presets: DistroPreset[];
}

export function findDistro(manifest: DistroManifest, id: string): DistroPreset | null {
  return manifest.presets.find((p) => p.id === id) ?? null;
}

export function applyDistro(
  distro: DistroPreset,
  base: { providers: string[]; aliases: ModelAliasMap },
): { providers: string[]; aliases: ModelAliasMap } {
  const providers = [...new Set([...base.providers, ...distro.providers])];
  const aliases = { ...distro.aliases, ...base.aliases }; // user overrides distro
  return { providers, aliases };
}

/** === ACP subscription seam (doc 57 §3 boundary) === */
export interface AcpLinkConfig {
  /** Official ACP wrapper package (e.g. @agentclientprotocol/claude-agent-acp). */
  wrapper: string;
  /** The CLI is driven via ACP with the user's own login. */
  cli: "claude" | "codex" | "cline" | "opencode";
  /** NEVER true — harvesting the subscription token for the broker is blocked (doc 57). */
  harvestToken: false;
}

export const ACP_LINK: AcpLinkConfig = {
  wrapper: "@agentclientprotocol/claude-agent-acp",
  cli: "claude",
  harvestToken: false,
};

/**
 * The auth-mode badge state for the UI: driving an ACP CLI with the user's
 * own login is allowed; feeding the subscription token into the broker is
 * blocked. Returns the exact doc-57 boundary label.
 */
export function acpAuthMode(): { mode: string; badge: string; blocked: string } {
  return {
    mode: "user-login (ACP)",
    badge: "auth: user login",
    blocked: "token harvesting into broker = blocked (doc 57 §3)",
  };
}
