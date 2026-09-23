/**
 * P30.4 — ask/plan/subagent/todo **first-class tools** (openworker pattern,
 * doc 83 §1). The engines already exist (DecisionPackage/MCQ J21, blueprint
 * approval B2, sub-agents B3/B4, todo P6.22); this module productizes them as
 * a stable, documented tool surface the model can call — the casual-user
 * tool kit.
 *
 * These descriptors merge into the coordinator's `ListedTool` registry
 * (tools.ts) so the model sees them like any other tool, but each routes to a
 * coordinator-side handler, not a native engine.
 */

import type { ListedTool } from "./tools";

export type FirstClassToolId = "ask" | "plan" | "subagent" | "todo";

/** JSON-schema-ish arg shapes (kept as plain objects — no schema lib). */
const ASK_ARGS = {
  type: "object",
  properties: {
    question: { type: "string", description: "The yes/no or choice question for the user." },
    options: {
      type: "array",
      items: { type: "string" },
      description: "Suggested answers (the MCU renders them as choices).",
    },
    reason: { type: "string", description: "One-sentence why this needs a human." },
  },
  required: ["question"],
} as const;

const PLAN_ARGS = {
  type: "object",
  properties: {
    goal: { type: "string", description: "The outcome the plan achieves." },
    steps: {
      type: "array",
      items: { type: "string" },
      description: "Ordered task goals (the approval card lists them; nothing executes).",
    },
  },
  required: ["goal", "steps"],
} as const;

const SUBAGENT_ARGS = {
  type: "object",
  properties: {
    objective: { type: "string", description: "What the sub-agent should accomplish." },
    isolation: {
      type: "string",
      enum: ["worktree", "sandbox", "none"],
      description: "Isolation level (worktree = parallel git worktree, P17).",
    },
    scope: { type: "string", description: "Files/folders the sub-agent may touch (empty = none)." },
  },
  required: ["objective"],
} as const;

const TODO_ARGS = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "string" },
      description: "Checklist items for this turn's todo list.",
    },
  },
  required: ["items"],
} as const;

/** The four first-class tools (stable ids — prompt-cache safe). */
export const FIRST_CLASS_TOOLS: ListedTool[] = [
  {
    id: "ask",
    family: "human",
    description:
      "Ask the user a question and wait. Use when a decision or choice genuinely needs the human (ambiguous goals, preference, approval). Never use for facts you can verify yourself.",
    readOnly: true,
    operation: "ask",
    risk: "R0",
    argsSchema: ASK_ARGS,
  },
  {
    id: "plan",
    family: "human",
    description:
      "Propose a multi-step plan and wait for approval. Read-only — nothing executes until the user approves. Prefer over acting when the task is multi-step or irreversible.",
    readOnly: true,
    operation: "plan",
    risk: "R0",
    argsSchema: PLAN_ARGS,
  },
  {
    id: "subagent",
    family: "orchestration",
    description:
      "Spawn a parallel sub-agent for an isolated subtask (B3/B4). The sub-agent gets its own worktree/sandbox; results merge back. Use for independent, parallelizable work.",
    readOnly: false,
    operation: "spawn",
    risk: "R1",
    argsSchema: SUBAGENT_ARGS,
  },
  {
    id: "todo",
    family: "orchestration",
    description:
      "Set or update this turn's visible todo checklist (P6.22). Renders as the progress checklist; checked items stay in the trajectory.",
    readOnly: false,
    operation: "todo",
    risk: "R0",
    argsSchema: TODO_ARGS,
  },
];

const FIRST_CLASS_IDS: FirstClassToolId[] = ["ask", "plan", "subagent", "todo"];

/**
 * Merge the first-class tools into a tool list without duplicates (the
 * registry may already carry native `ask`/`todo`-class tools).
 */
export function mergeFirstClassTools(tools: ListedTool[]): ListedTool[] {
  const have = new Set(tools.map((t) => t.id));
  const additions = FIRST_CLASS_TOOLS.filter((t) => !have.has(t.id));
  return additions.length === 0 ? tools : [...tools, ...additions];
}

export function isFirstClassTool(id: string): id is FirstClassToolId {
  return (FIRST_CLASS_IDS as string[]).includes(id);
}
