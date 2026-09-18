/**
 * Stage 0.2 — coordinator ToolExecutor.
 *
 * Sidecar proposes: `tool/exec` (pre-flight) → wait if Ask → `tool/commit`.
 * Never auto-consumes an Ask ticket. Results are sanitized before they
 * re-enter the model (P7.6). Loop guard: same tool+args hash 3× in a window
 * of 8 trips the breaker (mirrors `everyaios-guard::loopguard`).
 */

import { createHash } from "node:crypto";
import { checkSpawn } from "./chief";
import { evaluateGuard, useTicket, type GuardOperation } from "./guard";

export type ToolRequest = (method: string, params: unknown) => Promise<unknown>;

export type ToolDecision =
  | { action: "allow"; ticketId: string; argsHash: string; readOnly?: boolean }
  | { action: "ask"; ticketId: string; argsHash: string; readOnly?: boolean }
  | { action: "block"; reason: string };

/**
 * P64.6 — the shadow-preflight verdict. `verified: false` means *no evidence*
 * (the preflight could not run), which is deliberately distinct from a failed
 * check: conflating the two would let an unrunnable preflight read as a pass.
 */
export interface ShadowPreflightResult {
  needsPreflight: boolean
  verified: boolean
  passed: boolean
  reason: string
}

/**
 * P64.6 — does this verdict require the caller to refuse the edit?
 *
 * Only a preflight that actually ran and actually failed blocks. An edit that
 * did not need a preflight proceeds, and an unverifiable one is reported to the
 * caller as such rather than being silently upgraded into either answer.
 */
export function preflightBlocks(result: ShadowPreflightResult): boolean {
  return result.needsPreflight && result.verified && !result.passed
}

export interface ToolCommitResult {
  ok: boolean;
  result?: unknown;
  content?: unknown;
  error?: string;
  durationMs?: number;
  auditSeq?: number;
  ticketId?: string;
  [k: string]: unknown;
}

export interface ListedTool {
  id: string;
  family: string;
  description: string;
  readOnly: boolean;
  operation: string;
  risk: string;
  argsSchema: unknown;
}

/** OpenAI-compatible function tool — serialized once from the Rust registry. */
export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * P7.2 / H2 — hard cap on tools injected into a model turn. The registry is
 * the catalog (index); the model only sees this many resolved defs.
 */
export const MAX_ACTIVE_TOOLS = 20;

/**
 * P54.5 — one live PTY session, as `terminal/status` reports it. Mirrors the
 * Rust `TerminalSessionView` (camelCase on the wire); the coordinator does not
 * invent its own shape for the plane.
 */
export interface TerminalSessionView {
  ptyId: string;
  profileId: string;
  backend: 'local' | 'wsl' | 'remote';
  /** `human` is a user tab; `agent`/`task` are read-only. */
  origin: 'human' | 'agent' | 'task';
  label: string | null;
  integration: 'Rich' | 'Basic' | null;
  cwd: string;
  pid: number | null;
  running: boolean;
  exitCode: number | null;
}

/** The one PTY plane's live state (`terminal/status`). */
export interface TerminalPlaneStatus {
  attached: boolean;
  count: number;
  ptys: TerminalSessionView[];
}

/**
 * P64.1 / B11 — First-class Native Tools: ask, plan, todo, subagent.
 * These are first-class native workflows integrated directly into the turn loop.
 */
export const FIRST_CLASS_NATIVE_TOOLS: ListedTool[] = [
  {
    id: "ask",
    family: "native",
    description:
      "Ask the user an interactive question to clarify requirements, select between options, or request confirmation.",
    readOnly: true,
    operation: "read",
    risk: "none",
    argsSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The specific question or prompt to ask the user" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional selectable choices for the user",
        },
        allowCustom: {
          type: "boolean",
          description: "Whether the user can provide a custom text input",
        },
      },
      required: ["question"],
    },
  },
  {
    id: "plan",
    family: "native",
    description:
      "Update or query the hierarchical execution plan and task DAG (state saved to task_plan.md).",
    readOnly: false,
    operation: "write",
    risk: "low",
    argsSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update_step", "view", "finish_step"],
          description: "Planning action to take",
        },
        goal: { type: "string", description: "High level goal of the plan" },
        stepId: { type: "string", description: "Step identifier when updating a specific step" },
        status: {
          type: "string",
          enum: ["pending", "running", "completed", "failed", "skipped"],
          description: "New step status",
        },
        notes: { type: "string", description: "Progress notes, findings, or blocking issues" },
      },
      required: ["action"],
    },
  },
  {
    id: "todo",
    family: "native",
    description: "Manage a lightweight checklist of tasks for the current turn or session.",
    readOnly: false,
    operation: "write",
    risk: "low",
    argsSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "update", "list", "remove"], description: "Todo action" },
        taskId: { type: "string", description: "Task identifier" },
        title: { type: "string", description: "Task title/description" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
          description: "Task status",
        },
      },
      required: ["action"],
    },
  },
  {
    id: "subagent",
    family: "native",
    description:
      "Spawn an isolated subagent worker (inbuilt or external ACP agent) to execute a scoped subtask in a dedicated worktree or scratch space.",
    readOnly: false,
    operation: "write",
    risk: "medium",
    argsSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description:
            "Target agent id or specialization ('opencode', 'grok', 'inbuilt-coder', 'inbuilt-researcher')",
        },
        task: { type: "string", description: "Detailed task description and instructions for the subagent" },
        worktreeBranch: {
          type: "string",
          description: "Optional dedicated branch/worktree name for filesystem isolation",
        },
        sharedCapabilities: {
          type: "array",
          items: { type: "string" },
          description:
            "EveryAIOS shared cowork capabilities to grant ('shared:office', 'shared:browser', 'shared:desktop', 'shared:calendar')",
        },
      },
      required: ["agentId", "task"],
    },
  },
];

/**
 * P64.1 — Merge catalog tools with first-class native tools without duplication.
 */
export function mergeWithNativeTools(catalog: ListedTool[]): ListedTool[] {
  const existing = new Set(catalog.map((t) => t.id));
  const merged = [...catalog];
  for (const nativeTool of FIRST_CLASS_NATIVE_TOOLS) {
    if (!existing.has(nativeTool.id)) {
      merged.push(nativeTool);
    }
  }
  return sortToolsStable(merged);
}

/** Stable id order — required for prompt-cache byte-stability (A9). */
export function sortToolsStable(tools: ListedTool[]): ListedTool[] {
  return [...tools].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * P64.10 / P54.5 — the turn loop's own instrument panel, mounted on *every*
 * turn.
 *
 * `resolveActiveTools` scores the catalog against the user's words and keeps
 * the top `cap`. With the 51-tool MCP catalog plus the native extras the cap
 * always bites, so what the model received was a keyword-scored subset of the
 * registry — and that silently decided which capabilities the agent even
 * *had*. Measured consequence: `script.run` scored only when the user's text
 * happened to contain "script"/"js"/"eval", so for an ordinary request like
 * "fix the failing test" the shell was **not mounted at all**. The executor,
 * the Guard-2 path and the PTY host were all present and correct; the agent
 * simply never saw a shell. The same held for the four first-class coordinator
 * tools (`ask`/`plan`/`todo`/`subagent`), which §17.4.1 calls part of the turn
 * loop, and for the file tools every edit turn needs.
 *
 * So: execute, read, write, locate and delegate are pinned; the remaining
 * slots are still chosen by score, and capability indexing keeps doing its job
 * for the other ~60 tools. Selection stays deterministic and
 * `sortToolsStable`-ordered, so prompt-cache byte stability is unaffected.
 *
 * Pinning never invents a tool: an id the host does not register is simply
 * absent. A pinned id with no handler is still a bug, not a placeholder.
 */
export const LOOP_PINNED_TOOL_IDS: readonly string[] = [
  // The loop's own instruments (P64.1 first-class tools).
  'ask',
  'plan',
  'todo',
  'subagent',
  // Execute, read, write, locate.
  'script.run',
  'file_ops.read',
  'file_ops.list',
  'file_ops.write',
  'file_ops.edit',
  'search.query',
];

/**
 * H2 capability index: pick at most `cap` tools for this turn from the
 * full registry. Scoring is deterministic (id order as a tie-break) so the
 * same query+catalog always yields the same subset.
 *
 * [`LOOP_PINNED_TOOL_IDS`] are always included; the remaining slots are scored.
 */
export function resolveActiveTools(
  catalog: ListedTool[],
  query: string,
  opts?: { previouslyUsed?: string[]; cap?: number },
): ListedTool[] {
  const cap = opts?.cap ?? MAX_ACTIVE_TOOLS;
  const sorted = sortToolsStable(catalog);
  if (sorted.length <= cap && !(opts?.previouslyUsed && opts.previouslyUsed.length > 0)) {
    return sorted;
  }
  // Pinned first, in priority order, then sorted-id order within a class so
  // the subset is reproducible. A cap smaller than the pinned set keeps the
  // leading ids rather than dropping the shell to satisfy a caller's budget —
  // the caller asked for fewer tools, not for an agent with no terminal.
  //
  // Priority is by what the *loop* is already holding:
  //   1. `previouslyUsed` — the model called it this turn and is mid-loop on
  //      it. Dropping one mid-turn breaks the loop it was selected for, so it
  //      outranks the policy pins.
  //   2. `LOOP_PINNED_TOOL_IDS` — the instruments every turn needs.
  //   3. everything else, by score.
  const used = new Set(opts?.previouslyUsed ?? []);
  const pinnedIds = new Set(LOOP_PINNED_TOOL_IDS);
  const pinned = [
    ...sorted.filter((t) => used.has(t.id)),
    ...sorted.filter((t) => !used.has(t.id) && pinnedIds.has(t.id)),
  ].slice(0, cap);
  const taken = new Set(pinned.map((t) => t.id));
  const remaining = sorted.filter((t) => !taken.has(t.id));
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_.]+/i)
    .filter((t) => t.length >= 3);
  const scored = remaining.map((t) => {
    let score = 0;
    if (used.has(t.id)) score += 1000;
    const hay = `${t.id} ${t.family} ${t.description}`.toLowerCase();
    for (const tok of tokens) {
      if (t.id.toLowerCase() === tok || t.id.toLowerCase().endsWith(`.${tok}`)) score += 40;
      else if (t.id.toLowerCase().includes(tok)) score += 20;
      else if (hay.includes(tok)) score += 8;
    }
    if (/\b(file|read|write|path|dir|folder)\b/i.test(query) && /file|storage/i.test(t.family)) {
      score += 6;
    }
    if (/\b(search|web|query)\b/i.test(query) && /search/i.test(t.family + t.id)) {
      score += 6;
    }
    if (/\b(browser|page|click|navigate)\b/i.test(query) && /browser/i.test(t.family)) {
      score += 6;
    }
    if (/\b(script|js|eval)\b/i.test(query) && /script/i.test(t.family + t.id)) {
      score += 6;
    }
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0));
  const budget = Math.max(0, cap - pinned.length);
  return sortToolsStable([...pinned, ...scored.slice(0, budget).map((s) => s.t)]);
}

/**
 * S0.3 — pin the Rust `ToolRegistry` (via `tool/list`) as the single schema
 * source. `argsSchema` is already JSON Schema from Rust; we wrap it as an
 * OpenAI function def. Never convert a second TS/Zod catalog here.
 * Tool-list order is canonical (sorted by id) so the tools body stays
 * byte-stable for prompt cache.
 */
export function listedToolsToOpenAI(tools: ListedTool[]): OpenAIFunctionTool[] {
  return sortToolsStable(tools).map((t) => {
    const parameters =
      t.argsSchema && typeof t.argsSchema === "object" && !Array.isArray(t.argsSchema)
        ? (t.argsSchema as Record<string, unknown>)
        : { type: "object", properties: {} };
    return {
      type: "function" as const,
      function: {
        name: t.id,
        description: t.description || t.id,
        parameters,
      },
    };
  });
}

const MAX_TOOL_ROUNDS = 8;
const LOOP_WINDOW = 8;
const LOOP_REPEATS = 3;
const ASK_POLL_MS = 50;
const ASK_TIMEOUT_MS = 60_000;

/** Canonical JSON (sorted keys) → SHA-256 hex. Must match Rust `canonical_args_hash`.
 *
 * Numbers are canonicalized to a runtime-independent token (`n:<f64-bits-hex>`)
 * so this and Rust `serde_json` agree regardless of integer-vs-float formatting
 * (`5` vs `5.0`), exponent style (`1e+21` vs `1e21`), or precision beyond 2^53.
 * JS has one IEEE-754 number type, so the f64 bit pattern is the shared form. */
export function canonicalArgsHash(args: unknown): string {
  const json = JSON.stringify(canonicalize(args));
  return createHash("sha256").update(json).digest("hex");
}

const _numBuf = new DataView(new ArrayBuffer(8));

/** Canonicalize a number to the same `n:<f64-bits-hex>` token Rust emits. */
function canonicalNumberToken(n: number): string {
  // Normalize -0 → +0 so both sides hash identically (matches Rust).
  const f = n === 0 ? 0 : n;
  _numBuf.setFloat64(0, f, false); // big-endian, matches Rust `to_bits()` hex
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += _numBuf.getUint8(i).toString(16).padStart(2, "0");
  }
  return `n:${hex}`;
}

function canonicalize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "number") return canonicalNumberToken(v);
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = canonicalize(obj[k]);
  }
  return out;
}

/** P7.6 — strip instruction-shaped framing before the model sees a tool result and cap at 50KB. */
export const MAX_TOOL_OUTPUT_CHARS = 51200;

export function sanitizeToolResult(output: string): string {
  const sanitized = output
    .split("\n")
    .map((l) => {
      const t = l.trim();
      if (t.startsWith("<") && t.endsWith(">") && t.length < 64) {
        return `[tag-neutralized: ${t}]`;
      }
      if (/ignore (all )?(previous|prior) instructions/i.test(l)) {
        return "[flagged untrusted content]";
      }
      if (/you are now/i.test(l) || /system prompt/i.test(l)) {
        return "[flagged untrusted content]";
      }
      return l;
    })
    .join("\n");

  if (sanitized.length > MAX_TOOL_OUTPUT_CHARS) {
    const truncated = sanitized.slice(0, MAX_TOOL_OUTPUT_CHARS);
    return `${truncated}\n\n[Context-Mode: Output truncated from ${sanitized.length} characters to 50KB. Use targeted grep/slice or file reading tools for specific sections.]`;
  }
  return sanitized;
}

export function sanitizeUnknown(result: unknown): unknown {
  if (typeof result === "string") return sanitizeToolResult(result);
  try {
    return JSON.parse(sanitizeToolResult(JSON.stringify(result)));
  } catch {
    return sanitizeToolResult(String(result));
  }
}

class LoopGuard {
  private recent: string[] = [];
  record(hash: string): boolean {
    this.recent.push(hash);
    if (this.recent.length > LOOP_WINDOW) this.recent.shift();
    return this.recent.filter((h) => h === hash).length >= LOOP_REPEATS;
  }
}

export class ToolExecutor {
  private loop = new LoopGuard();
  private rounds = 0;
  private pending = new Map<string, (state: string) => void>();
  // NB: explicit `| undefined` unions, not optional `?` properties — this
  // package compiles with `exactOptionalPropertyTypes`, under which an
  // optional property may be omitted but never assigned `undefined`.
  /** P51.14/P64.5 — the live execution this executor's effects belong to. */
  private executionId: string | undefined;
  /** P64.5 — the Guard-2 ticket that authorised the last committed effect. */
  private lastCommitTicketId: string | undefined;

  constructor(
    private request: ToolRequest,
    /** P51.14 — the Work Gateway work id this executor's effects belong to.
     * Rust records attempted/observed/verified WorkEvents when `tool/exec`
     * and `tool/commit` carry it (chat.rs `tool/*` arm). */
    private workId?: string,
    private sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Resolve an Ask wait when the UI/tests report a ticket decision. */
  notifyTicket(ticketId: string, state: string): void {
    const w = this.pending.get(ticketId);
    if (w) {
      this.pending.delete(ticketId);
      w(state);
    }
  }

  /**
   * P64.5/P64.7 — bind the execution id opened by `execution/begin` so
   * verified-edit receipts land on the right Work timeline. Optional: without
   * it the executor still runs, it simply records no execution receipt
   * (headless and unit-test runs never call `execution/begin`).
   */
  setExecutionId(id: string | undefined): void {
    this.executionId = id !== undefined && id.length > 0 ? id : undefined;
  }

  /** The Guard-2 ticket that authorised the most recent committed tool call. */
  get lastTicketId(): string | undefined {
    return this.lastCommitTicketId;
  }


  /**
   * P64.5 — attach a verified-edit receipt (strategy + path + Guard-2 ticket)
   * to the bound execution (SPEC I14 edit-ladder provenance).
   *
   * Best-effort by design: the kernel is optional, and a receipt failure must
   * never invalidate an edit that already landed. A receipt without a real
   * ticket is skipped rather than fabricated — the kernel refuses an empty
   * ticket, and inventing one would be fake provenance.
   *
   * Returns whether the receipt was actually recorded.
   */
  async recordVerifiedEdit(
    strategy: "exact" | "structured" | "fuzzy",
    path: string,
    ticketId: string | undefined,
  ): Promise<boolean> {
    const id = this.executionId;
    if (id === undefined) return false;
    if (ticketId === undefined || ticketId.length === 0) return false;
    try {
      await this.request("execution/record_edit", {
        id,
        strategy,
        path,
        ticketId,
        auditSeq: 0,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * P64.6 — request a risk-gated shadow preflight for a risky edit (SPEC I15).
   *
   * Rust owns both the policy (the multi-file / structural / destructive gate)
   * and the execution (discovering the project's own typecheck command, running
   * it in the shadow tree, capping the output, attaching the receipt). This
   * method only carries the request and reports back the verdict, so the gate
   * cannot be argued with from here.
   *
   * Note the distinction the caller must respect: `verified: false` means the
   * preflight **could not run** (no execution bound, transport failure, or no
   * check command discovered) and is not evidence of anything. Only
   * `verified: true` carries a verdict.
   */
  async runShadowPreflight(input: {
    root: string
    filesChanged: number
    structural?: boolean
    destructive?: boolean
    candidateFiles?: Array<{ path: string; content: string }>
  }): Promise<ShadowPreflightResult> {
    const id = this.executionId
    if (id === undefined) {
      return { needsPreflight: false, verified: false, passed: false, reason: "no execution bound" }
    }
    try {
      const raw = (await this.request("execution/preflight", {
        id,
        root: input.root,
        filesChanged: input.filesChanged,
        structural: input.structural === true,
        destructive: input.destructive === true,
        ...(input.candidateFiles !== undefined ? { candidateFiles: input.candidateFiles } : {}),
      })) as Partial<ShadowPreflightResult> | null
      if (raw === null || typeof raw !== "object") {
        return {
          needsPreflight: false,
          verified: false,
          passed: false,
          reason: "preflight returned no result",
        }
      }
      return {
        needsPreflight: raw.needsPreflight === true,
        verified: raw.verified === true,
        passed: raw.passed === true,
        reason: typeof raw.reason === "string" ? raw.reason : "",
      }
    } catch (e) {
      return {
        needsPreflight: false,
        verified: false,
        passed: false,
        reason: e instanceof Error ? e.message : String(e),
      }
    }
  }

  async listTools(plane: "all" | "shared" = "all"): Promise<ListedTool[]> {
    const out = (await this.request("tool/list", { plane })) as {
      tools?: ListedTool[];
    };
    return out.tools ?? [];
  }

  /**
   * P54.5 — read-only view of the one PTY plane (`terminal/status`).
   *
   * The agent's *privileged* shell path is the ticketed `script.run` tool; this
   * only observes. `attached: false` is the honest answer on a host with no PTY
   * host, and must not be rendered as "a shell with nothing running".
   */
  async terminalPlaneStatus(): Promise<TerminalPlaneStatus> {
    const out = (await this.request("terminal/status", {})) as Partial<TerminalPlaneStatus>;
    return {
      attached: out?.attached === true,
      count: typeof out?.count === "number" ? out.count : 0,
      ptys: Array.isArray(out?.ptys) ? out.ptys : [],
    };
  }

  /**
   * P54.5 — what the shell itself reported about the last command in a session.
   * `null` means the shell has not reported a trusted record yet — an absence of
   * evidence, never an empty success.
   */
  async terminalLastCommand(ptyId: string, maxChars = 6000): Promise<string | null> {
    const out = (await this.request("terminal/last_command", { ptyId, maxChars })) as {
      block?: string | null;
    };
    return typeof out?.block === "string" && out.block.length > 0 ? out.block : null;
  }

  /**
   * Pre-flight → (wait if ask) → commit. Never auto-consumes Ask.
   * Throws on block, timeout, loop, or ticket refusal.
   */
  async executeTool(
    toolId: string,
    args: Record<string, unknown>,
    ctx: { sessionId: string; agentId?: string } = { sessionId: "default" },
  ): Promise<unknown> {
    this.rounds += 1;
    if (this.rounds > MAX_TOOL_ROUNDS) {
      throw new Error(`tool loop cap (${MAX_TOOL_ROUNDS}) exceeded`);
    }
    const argsHash = canonicalArgsHash(args);
    const step = `${toolId}:${argsHash}`;
    if (this.loop.record(step)) {
      throw new Error("tool loop detected (repeated args)");
    }

    const operation = operationOf(toolId);
    let ticketFromGuard: string | undefined;
    try {
      const gated = await evaluateGuard(this.request, {
        sessionId: ctx.sessionId,
        agentId: ctx.agentId ?? "agent",
        toolId,
        operation,
        argsHash,
      });
      if (gated.action === "block") {
        throw new Error(gated.reason || "tool blocked");
      }
      ticketFromGuard = gated.ticketId;
      if (gated.action === "ask") {
        const state = await this.waitForTicket(gated.ticketId);
        if (state !== "approved") {
          throw new Error(`tool ticket ${state}`);
        }
      }
    } catch (e) {
      // A guard transport/protocol failure is not permission to continue.
      // Rust's `tool/commit` remains the final enforcement point, but
      // fail-closed here prevents a degraded sidecar from presenting an
      // unreviewed action to the executor. Tests that model an older Rust
      // endpoint must provide a `tool/exec`-only request explicitly.
      if (e instanceof Error) throw e;
      throw new Error(`guard pre-flight failed: ${String(e)}`);
    }

    const pre = (await this.request("tool/exec", {
      toolId,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId ?? "agent",
      args,
      argsHash,
      ...(this.workId !== undefined ? { workId: this.workId } : {}),
      ...(ticketFromGuard ? { ticketId: ticketFromGuard } : {}),
    })) as ToolDecision;

    if (pre.action === "block") {
      throw new Error(pre.reason || "tool blocked");
    }

    let ticketId = pre.ticketId;
    const hash = pre.argsHash || argsHash;

    if (pre.action === "ask") {
      const state = await this.waitForTicket(ticketId);
      if (state !== "approved") {
        throw new Error(`tool ticket ${state}`);
      }
    }

    const consumed = await useTicket(this.request, ticketId, hash);

    const committed = (await this.request("tool/commit", {
      toolId,
      ticketId,
      argsHash: hash,
      args,
      ticketConsumed: consumed,
      ...(this.workId !== undefined ? { workId: this.workId } : {}),
    })) as ToolCommitResult;

    if (!committed.ok) {
      throw new Error(String(committed.error ?? "tool failed"));
    }
    // P64.5 — remember the Guard-2 ticket that authorised this effect so a
    // verified-edit receipt can cite it (never invent one: the kernel rejects
    // an empty ticket, and a fabricated id would be fake provenance).
    this.lastCommitTicketId = ticketId;
    const payload =
      committed.content ?? committed.result ?? committed;
    return sanitizeUnknown(payload);
  }

  private async waitForTicket(ticketId: string): Promise<string> {
    const started = Date.now();
    const immediate = new Promise<string>((resolve) => {
      this.pending.set(ticketId, resolve);
    });

    while (Date.now() - started < ASK_TIMEOUT_MS) {
      const raced = await Promise.race([
        immediate.then((s) => s),
        this.sleep(ASK_POLL_MS).then(() => null),
      ]);
      if (typeof raced === "string") return raced;

      const status = (await this.request("guard/ticket_status", { ticketId })) as {
        state?: string;
      };
      const state = (status.state ?? "unknown").toLowerCase();
      if (state === "approved") return "approved";
      if (
        state === "rejected" ||
        state === "revoked" ||
        state === "expired" ||
        state === "unknown"
      ) {
        return state;
      }
    }
    return "timeout";
  }
}

function operationOf(toolId: string): GuardOperation {
  const id = toolId.toLowerCase();
  if (id.includes("delete")) return "delete";
  if (
    id.includes("search") ||
    id.includes("http") ||
    id.includes("browser") ||
    id.includes("navigate") ||
    id.includes("network")
  ) {
    return "external_network";
  }
  if (id.includes("script") || id.includes("shell") || id.includes("terminal")) {
    return "terminal_shell";
  }
  if (id.includes("web")) return "web_action";
  return "write";
}

/**
 * P64.4 — sub-agent orchestration contract, coordinator side (Tier-1 lane).
 *
 * Mirrors the native `SubAgentSpec` / `SubAgentResult` / `SubAgentLimits`
 * shape: fresh-context spawn (spec only, never the parent transcript),
 * worktree isolation under `.everyaios/worktrees/task-<id>`, inherited
 * denies that are never escalated, depth <= 2, and a summary-only return
 * (no transcript field exists by construction). Limits are enforced through
 * the shared `checkSpawn` gate; rejections carry the specific reason and
 * never queue silently. No new orchestration engine is introduced — this is
 * a thin validation + dispatch facade over the native runtime RPC.
 */

/** Tools a parent always withholds from children (inherited denies). */
export const DELEGATE_BLOCKED_TOOLS: readonly string[] = [
  "delegate",
  "clarify",
  "memory",
  "send_message",
  "cronjob",
] as const;

/** Task-ledger tools are default-deny for children unless explicitly granted. */
export const SUBAGENT_DEFAULT_DENY_TASK_TOOLS: readonly string[] = ["task", "todo"] as const;

export const SUBAGENT_MAX_DEPTH = 2;
export const SUBAGENT_MAX_CONCURRENT = 3;
export const SUBAGENT_MAX_TOTAL = 6;

/** Coordinator mirror of the native spawn shape (worktree-bound). */
export interface SubAgentSpecShape {
  spec: { taskId: string; goal: string };
  model: string;
  workspace: string;
  parentId: string | null;
  tools: string[];
  blockedTools: string[];
  depth: number;
}

/** Summary-only return: summary + status + artifacts, never a transcript. */
export interface SubAgentResultShape {
  task_id: string;
  summary: string;
  status: string;
  artifacts: string[];
}

export interface BuildSubAgentSpecOptions {
  taskId: string;
  goal: string;
  model?: string;
  parentId?: string | null;
  /** Parent-granted tool ids (narrowed below). */
  tools?: string[];
  /** Extra denies beyond the canonical blocked set. */
  blockedTools?: string[];
  /** Assigned by the spawner (parent depth + 1; root = 0). */
  depth?: number;
}

function sanitizeTaskId(taskId: string): string {
  const clean = taskId.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (clean.length === 0) throw new Error("subagent taskId is empty after sanitization — fail-closed");
  return clean.slice(0, 64);
}

/**
 * Build a worktree-bound spawn spec. Fail-closed: empty goal, bad depth,
 * or an unsafe task id throws before any ticket or spawn is attempted.
 * Tool lists are returned stably sorted for prompt-cache stability.
 */
export function buildSubAgentSpec(opts: BuildSubAgentSpecOptions): SubAgentSpecShape {  const taskId = sanitizeTaskId(opts.taskId);
  const goal = opts.goal.trim();
  if (goal.length === 0) throw new Error("subagent goal is empty — fail-closed");
  const depth = opts.depth ?? 0;
  if (!Number.isInteger(depth) || depth < 0 || depth > SUBAGENT_MAX_DEPTH) {
    throw new Error(`subagent depth ${String(depth)} outside 0..${SUBAGENT_MAX_DEPTH} — fail-closed`);
  }
  const model = (opts.model ?? "inbuilt").trim() || "inbuilt";
  const tools = [...(opts.tools ?? [])].sort();
  const blocked = [...DELEGATE_BLOCKED_TOOLS, ...(opts.blockedTools ?? [])];
  const blockedTools = [...new Set(blocked)].sort();
  return {
    spec: { taskId, goal },
    model,
    workspace: `.everyaios/worktrees/task-${taskId}`,
    parentId: opts.parentId ?? null,
    tools,
    blockedTools,
    depth,
  };
}

/**
 * Narrowed child tool set: parent grants minus explicit denies minus the
 * canonical blocked set, with task-ledger tools default-deny unless the
 * parent explicitly granted them. Sorted and deduped (stable ids).
 */export function deriveEffectiveSubAgentTools(
  parentGrants: string[],
  parentDenies: string[],
  explicitGrants: string[],
): string[] {
  const denies = new Set(parentDenies);
  const explicit = new Set(explicitGrants);
  const out = parentGrants.filter(
    (t) =>
      !denies.has(t) &&
      !(DELEGATE_BLOCKED_TOOLS as readonly string[]).includes(t) &&
      (!(SUBAGENT_DEFAULT_DENY_TASK_TOOLS as readonly string[]).includes(t) || explicit.has(t)),
  );
  return [...new Set(out)].sort();
}

/**
 * Normalize either first-class `subagent` arg shape into spec options:
 * the registry shape (`agentId`/`task`/`worktreeBranch`/`sharedCapabilities`)
 * or the planner shape (`objective`/`isolation`/`scope`). Fail-closed on an
 * empty objective. The returned tools are the narrowed effective set.
 */
export function subAgentSpecFromToolArgs(
  args: Record<string, unknown>,
  defaults: { parentId?: string | null; depth?: number; parentGrants?: string[] } = {},
): BuildSubAgentSpecOptions {
  const goalRaw =
    (typeof args.task === "string" && args.task) ||
    (typeof args.objective === "string" && args.objective) ||
    (typeof args.goal === "string" && args.goal) ||
    "";
  const goal = goalRaw.trim();
  if (goal.length === 0) {
    throw new Error("subagent objective is empty — fail-closed (ask for scope first)");
  }
  const taskIdRaw =
    (typeof args.taskId === "string" && args.taskId) ||
    (typeof args.worktreeBranch === "string" && args.worktreeBranch) ||
    goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) ||
    "task";
  const model =
    (typeof args.agentId === "string" && args.agentId) ||
    (typeof args.model === "string" && args.model) ||
    "inbuilt";
  const shared =
    Array.isArray(args.sharedCapabilities)
      ? args.sharedCapabilities.filter((t): t is string => typeof t === "string")
      : Array.isArray(args.scope)
        ? args.scope.filter((t): t is string => typeof t === "string")
        : typeof args.scope === "string" && args.scope.length > 0
          ? [args.scope]
          : [];
  const grants = defaults.parentGrants ?? shared;
  const tools = deriveEffectiveSubAgentTools(grants, [], grants);
  const opts: BuildSubAgentSpecOptions = {
    taskId: taskIdRaw,
    goal,
    model,
    tools,
  };
  if ((defaults.parentId ?? null) !== null) opts.parentId = defaults.parentId as string;
  if (defaults.depth !== undefined) opts.depth = defaults.depth;
  return opts;
}

/** Minimal spawn counts for the shared gate. */
export interface SubAgentSpawnCounts {
  depth: number;
  active: number;
  total: number;
}

/**
 * Enforce max_depth 2 / max_concurrent 3 / max_total 6 through the shared
 * `checkSpawn` gate (concurrency + depth) plus an explicit total cap the
 * shared gate tracks as chain budget. Returns the refusal reason; never
 * queues silently.
 */
export function checkSubAgentSpawn(
  counts: SubAgentSpawnCounts,
): { allowed: true } | { allowed: false; reason: string } {
  const verdict = checkSpawn(
    {
      depth: counts.depth,
      active: counts.active,
      stepsUsed: 0,
      parentPermissions: new Set<string>(),
      denies: new Set<string>(),
      grants: new Set<string>(),
    },
    {
      maxDepth: SUBAGENT_MAX_DEPTH,
      maxConcurrency: SUBAGENT_MAX_CONCURRENT,
      maxStepsPerSubagent: 200,
      chainBudget: Number.MAX_SAFE_INTEGER,
    },
  );
  if (!verdict.allowed) return verdict;
  if (counts.active >= SUBAGENT_MAX_CONCURRENT) {
    return {
      allowed: false,
      reason: `concurrency ${counts.active} ≥ max ${SUBAGENT_MAX_CONCURRENT}`,
    };
  }
  if (counts.total >= SUBAGENT_MAX_TOTAL) {
    return { allowed: false, reason: `total ${counts.total} ≥ max ${SUBAGENT_MAX_TOTAL}` };
  }
  return { allowed: true };
}

/** In-process spawn accounting (active + total per run). */
export class SubAgentSpawnTracker {
  private activeCount = 0;
  private totalCount = 0;

  get active(): number {
    return this.activeCount;
  }

  get total(): number {
    return this.totalCount;
  }

  async canSpawn(depth: number): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    return checkSubAgentSpawn({ depth, active: this.activeCount, total: this.totalCount });
  }
  /** Reserve a slot (throws fail-closed when a cap refuses). */
  async begin(depth: number): Promise<void> {
    const verdict = await this.canSpawn(depth);
    if (!verdict.allowed) {
      throw new Error(`subagent spawn refused: ${verdict.reason}`);
    }
    this.activeCount += 1;
    this.totalCount += 1;
  }

  release(): void {
    if (this.activeCount > 0) this.activeCount -= 1;
  }
}

/** Shared default tracker for the coordinator's subagent tool path. */
export const subAgentTracker = new SubAgentSpawnTracker();

/** Keep only the summary-only fields (drop any transcript-shaped extra). */
export function toSummaryOnlyResult(raw: Record<string, unknown>): SubAgentResultShape {  const taskId = typeof raw.task_id === "string" ? raw.task_id : typeof raw.taskId === "string" ? raw.taskId : "unknown";
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const status = typeof raw.status === "string" ? raw.status : "done";
  const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts.filter((a): a is string => typeof a === "string") : [];
  return { task_id: taskId, summary, status, artifacts };
}

async function waitForTicketApproval(
  request: ToolRequest,
  ticketId: string,
  sleep: (ms: number) => Promise<void>,
  notify?: (ticketId: string, state: string) => void,
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < ASK_TIMEOUT_MS) {
    await sleep(ASK_POLL_MS);
    const status = (await request("guard/ticket_status", { ticketId })) as {
      state?: string;
    };
    const state = (status.state ?? "unknown").toLowerCase();
    if (state === "approved") {
      notify?.(ticketId, state);
      return "approved";
    }
    if (state === "rejected" || state === "revoked" || state === "expired" || state === "unknown") {
      return state;
    }
  }
  return "timeout";
}

/**
 * Dispatch one sub-agent spawn through the Guard-2 ticket flow
 * (evaluate → useTicket → spawn RPC) and return the summary-only result.
 * The spawn binds to the Rust `subagent/spawn` handler, which owns the
 * accounting policy (depth / concurrency / total) and returns a summary-only
 * payload. A missing handler fails closed (never a fabricated success), and a
 * rejection carrying a real reason is surfaced verbatim rather than masked.
 * Callers hold a tracker slot across this call (begin → finally release).
 */
export async function dispatchSubAgent(
  request: ToolRequest,
  spec: SubAgentSpecShape,
  ctx: { sessionId: string; agentId?: string } = { sessionId: "default" },
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SubAgentResultShape> {
  if (spec.depth > SUBAGENT_MAX_DEPTH) {
    throw new Error(`subagent depth ${spec.depth} exceeds max ${SUBAGENT_MAX_DEPTH} — fail-closed`);
  }
  for (const blocked of DELEGATE_BLOCKED_TOOLS) {
    if (spec.tools.includes(blocked)) {
      throw new Error(`subagent tools grant blocked tool "${blocked}" — fail-closed`);
    }
  }
  const args = {
    spec: spec.spec,
    model: spec.model,
    workspace: spec.workspace,
    parentId: spec.parentId,
    tools: spec.tools,
    blockedTools: spec.blockedTools,
    depth: spec.depth,
  };
  const argsHash = canonicalArgsHash(args);
  const gated = await evaluateGuard(request, {
    sessionId: ctx.sessionId,
    ...(ctx.agentId !== undefined ? { agentId: ctx.agentId } : { agentId: "agent" }),
    toolId: "subagent",
    operation: "write",
    argsHash,
  });
  if (gated.action === "block") {
    throw new Error(gated.reason || "subagent spawn blocked");
  }
  if (gated.action === "ask") {
    const state = await waitForTicketApproval(request, gated.ticketId, sleep);
    if (state !== "approved") {
      throw new Error(`subagent ticket ${state}`);
    }
  }
  await useTicket(request, gated.ticketId, argsHash);
  let raw: unknown;
  try {
    raw = await request("subagent/spawn", { ...args, ticketId: gated.ticketId, argsHash });
  } catch (e) {
    // A missing handler fails closed, but the accounting policy's own
    // rejections (depth / concurrency / total exceeded) are the useful signal
    // and must not be flattened into a generic "unavailable" message.
    if (e instanceof Error) throw e;
    throw new Error(`subagent spawn failed: ${String(e)}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("subagent spawn returned no result — fail-closed");
  }
  return toSummaryOnlyResult(raw as Record<string, unknown>);
}

/**
 * P64.5 — unified native edit ladder shape, coordinator side (Tier-1 lane).
 *
 * Three rungs, tried in order and each failing closed on zero or 2+ matches:
 * exact single-occurrence splice → structured (exact splice + declaration-shape
 * reparse) → fuzzy (whitespace-insensitive ordered multi-hunk). They mirror
 * `everyaios-core::tools::{apply_exact_once, apply_structured_edit,
 * apply_fuzzy_edit, apply_edit_ladder}` rung for rung, and the rung that
 * succeeds is recorded as the edit's strategy on the Work receipt.
 *
 * The ladder is computed here, not delegated to Rust's `file_ops.edit`, for one
 * reason: the shadow preflight gate (`execution/preflight`) must inspect the
 * post-state *before* the write lands, and a handler that commits cannot hand
 * back a pre-commit candidate. Rust's `file_ops.edit` remains the applier of
 * record for the native tool path; this is a mirror of a deterministic
 * algorithm, not a second engine.
 *
 * Every mutation rides the existing Guard-2 ticket flow (`ToolExecutor.executeTool`
 * → evaluate → useTicket → tool/commit); this module never applies an edit
 * itself and never bypasses the ticket. Reads and writes reuse the registered
 * `file_ops` handlers.
 */

/** One exact edit request: replace a single `target` block with `replacement`. */
export interface ExactEditParams {
  path: string;
  target: string;
  replacement: string;
}

/** Count non-overlapping occurrences of `target` in `content`. */
export function countOccurrences(content: string, target: string): number {
  if (target.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = content.indexOf(target, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + target.length;
  }
}

/**
 * Fail-closed single-match gate: throws when the target matches zero times
 * or more than once (the caller must supply more context — never guess).
 */
export function assertSingleMatch(content: string, target: string): void {
  if (target.length === 0) {
    throw new Error("edit target is empty — fail-closed (supply the block to replace)");
  }
  const n = countOccurrences(content, target);
  if (n === 0) {
    throw new Error("edit target has no match — fail-closed (refusing to guess)");
  }
  if (n > 1) {
    throw new Error(
      `edit target is ambiguous (${n} matches) — fail-closed (supply more surrounding context)`,
    );
  }
}

/**
 * Read → ladder → shadow gate → ticketed write. Reads the file through the
 * executor, splices it through the edit ladder (which refuses zero/ambiguous
 * matches before any ticket is consumed for the write), asks Rust's gate to
 * preflight the proposed post-state, then commits via the standard
 * `file_ops.write` Guard-2 path.
 */
export interface ApplyExactEditOptions {
  /**
   * P64.6 — the caller's risk read for the gate. Omitted defaults to the
   * coordinator's own derivation (`deriveEditRisk`); an explicit value can
   * only *raise* the flags, never silence a derived one. They are an input to
   * Rust's gate, never a way to bypass it (Rust decides).
   */
  structural?: boolean
  destructive?: boolean
  /** Shadow tree the check runs in. Defaults to the workspace root (`.`). */
  root?: string
}

/**
 * Declarations whose count is a structural signal when a splice adds or
 * removes one. Deliberately narrow: `const`/`let`/locals are noise, and a
 * merely multi-line edit must NOT fire the gate (a shadow typecheck costs
 * real build time — the gate is for edits that plausibly move a type
 * boundary, which is exactly what a typecheck catches before landing).
 */
const STRUCTURAL_DECL_RE =
  /\b(?:function|class|struct|impl|enum|trait|interface|def|fn|func|type)\b/g;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/**
 * P64.6 — derive the edit's own risk from the splice, not from a model arg.
 *
 * The model's edit arguments never carry risk flags (a model-supplied flag
 * would let the model lower its own gate); risk is a property of the change.
 * For an exact single-occurrence splice the derivable signals are:
 *
 * - **structural** — the splice changes the number of declaration sites
 *   (`fn`/`class`/`struct`/`interface`/`type`/…), or changes the bracket
 *   balance (`{}` `()` `[]`). Cheap, language-agnostic proxies for "this edit
 *   can move a type boundary". A string/comment/log-line edit derives no
 *   risk and stays a small `local-write` that verifies after, per contract.
 * - **destructive** — not derivable for an in-place splice (nothing is
 *   deleted beyond the replaced block), so always `false` here; destructive
 *   risk belongs to the overwrite/delete primitives.
 *
 * Conservative direction: under-deriving keeps today's behaviour (post-commit
 * verification); over-deriving only buys a shadow check the gate then runs —
 * never a refusal by itself. Rust still owns the decision.
 */
export function deriveEditRisk(params: {
  target: string
  replacement: string
}): { structural: boolean; destructive: boolean; filesChanged: number } {
  const { target, replacement } = params;
  const declDelta =
    countMatches(replacement, STRUCTURAL_DECL_RE) -
    countMatches(target, STRUCTURAL_DECL_RE);
  if (declDelta !== 0) {
    return { structural: true, destructive: false, filesChanged: 1 };
  }
  const balance = (s: string): number => {
    let b = 0;
    for (const ch of s) {
      if (ch === "{" || ch === "(" || ch === "[") b += 1;
      else if (ch === "}" || ch === ")" || ch === "]") b -= 1;
    }
    return b;
  };
  if (balance(replacement) !== balance(target)) {
    return { structural: true, destructive: false, filesChanged: 1 };
  }
  return { structural: false, destructive: false, filesChanged: 1 };
}

/** P64.5 — the ladder's rungs, mirroring `EditStrategy` in
 * `everyaios-core::tools`. */
export type EditStrategy = "exact" | "structured" | "fuzzy"

/** P64.5 — payload cap, mirroring `everyaios_core::tools::P64_MAX_EDIT_BYTES`. */
export const P64_MAX_EDIT_BYTES = 50 * 1024

/** One applied rung: the post-state plus the strategy that produced it. */
export interface LadderResult {
  content: string
  strategy: EditStrategy
}

/**
 * Mirror of Rust `str::lines()`: split on `\n`, drop the trailing empty
 * element left by a final newline, and strip a trailing `\r` from each line.
 * Required for byte-faithful parity with Rust `apply_fuzzy_edit` — a bare
 * `split("\n")` would invent a trailing empty line that Rust never sees.
 */
function rustLines(s: string): string[] {
  if (s.length === 0) return []
  const raw = s.split("\n")
  if (s.endsWith("\n")) raw.pop()
  return raw.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
}

/** Mirror of Rust `norm_line`: every whitespace character stripped, so
 * `fn  alpha( )  {` compares equal to `fn alpha() {`. Deliberately the most
 * tolerant comparison in the codebase — it is the last rung, so tolerance is
 * affordable while the 0/2+ gate still fails closed. */
function normalizeFuzzyLine(s: string): string {
  return s.replace(/\s+/g, "")
}

const DECL_KEYWORDS = ["fn ", "struct ", "enum ", "const ", "static ", "class ", "def "] as const

/**
 * P64.5 — the dependency-free shape probe behind the structured rung, mirroring
 * Rust `LexicalShapeSource::symbols`. A declaration is a line whose text, after
 * stripping `pub`/`async` decoration, begins with a declaration keyword. Only
 * the *count* is ever compared (never a tree), so a tree-sitter source can
 * replace this without touching the ladder.
 *
 * Deviation from the Rust source, deliberate: Rust's strip chain is
 * `t.strip_prefix("pub ").unwrap_or(t).strip_prefix("async ").unwrap_or(t)`,
 * whose second `unwrap_or` binds the **pre-strip** `t` — so a `pub fn` that is
 * not `pub async` is restored *with* its `pub ` prefix and then matches no
 * keyword, hiding every `pub`-decorated declaration from the probe. This
 * version strips decoration in a loop instead. The visible effect is strictly
 * more sensitive (a `pub`-declaration delta is now detected rather than
 * ignored); the shape check only ever *refuses* a splice, and a refusal falls
 * through to the fuzzy rung, so this can never corrupt an edit — it can only
 * change which rung's strategy is recorded.
 */
export function lexicalSymbols(content: string): string[] {
  const out: string[] = []
  for (const line of rustLines(content)) {
    let t = line.trimStart()
    for (;;) {
      const stripped =
        t.startsWith("pub ") ? t.slice(4) : t.startsWith("async ") ? t.slice(6) : undefined
      if (stripped === undefined) break
      t = stripped
    }
    const kw = DECL_KEYWORDS.find((k) => t.startsWith(k))
    if (kw === undefined) continue
    const sym = /^[A-Za-z0-9_]+/.exec(t.slice(kw.length))?.[0]
    if (sym !== undefined && sym.length > 0) out.push(`${kw}${sym}`)
  }
  return out.sort()
}

/**
 * P64.5 rung 1 — exact single-occurrence splice, mirroring Rust
 * `apply_exact_once`. Fails closed on 0 matches (refusing to guess which site
 * was meant) and on 2+ (refusing to pick one) — the ambiguity invariant every
 * rung in the ladder preserves.
 */
export function applyExactOnce(
  content: string,
  target: string,
  replacement: string,
): LadderResult {
  if (target.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  const bytes = target.length + replacement.length
  if (bytes > P64_MAX_EDIT_BYTES * 4) {
    throw new Error(
      `edit refused: payload ${bytes} bytes over the ${P64_MAX_EDIT_BYTES * 4} byte cap`,
    )
  }
  const n = countOccurrences(content, target)
  if (n === 0) {
    throw new Error("edit refused: no occurrence found (0 matches); provide more context")
  }
  if (n > 1) {
    throw new Error(
      `edit refused: ambiguous match (${n} occurrences); provide more context for a single occurrence`,
    )
  }
  return { content: content.replace(target, replacement), strategy: "exact" }
}

/**
 * P64.5 — strip every whitespace character, keeping a code-unit index map back
 * into the original so a token match can be converted into a raw splice range.
 * Mirrors Rust `whitespace_free`.
 */
function whitespaceFree(s: string): { text: string; map: number[] } {
  let text = ""
  const map: number[] = []
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i] as string
    if (/\s/.test(ch)) continue
    text += ch
    map.push(i)
  }
  return { text, map }
}

/**
 * P64.5 rung 2 — structured edit: a token-exact splice followed by a shape
 * reparse, mirroring Rust `apply_structured_edit`.
 *
 * `target` is located by **token** equality: whitespace is insignificant (so a
 * re-indented, re-wrapped, or reformatted target still matches exactly) while
 * every other character must match. That makes this rung strictly stricter than
 * the fuzzy rung (which tolerates extra lines between hunks) and strictly more
 * tolerant than the exact rung (which needs byte equality) — which is what
 * makes it a real rung rather than a second exact check.
 *
 * It does **not** check the shape before matching: `shapeChanged` is raised only
 * after a unique token match produced a splice. In the ladder a shape refusal
 * falls through to the fuzzy rung, which applies the same splice without the
 * shape check, so this rung selects the recorded strategy rather than hard-
 * blocking the edit; it is a hard refusal only for direct callers.
 */
export function applyStructuredEdit(
  content: string,
  target: string,
  replacement: string,
): LadderResult {
  if (target.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  const c = whitespaceFree(content)
  const t = whitespaceFree(target)
  if (t.text.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  const n = countOccurrences(c.text, t.text)
  if (n === 0) {
    throw new Error("edit refused: no occurrence found (0 matches); provide more context")
  }
  if (n > 1) {
    throw new Error(
      `edit refused: ambiguous match (${n} occurrences); provide more context for a single occurrence`,
    )
  }
  const at = c.text.indexOf(t.text)
  const firstByte = c.map[at] as number
  const lastByte = (c.map[at + t.text.length - 1] as number) + 1
  const spliced = content.slice(0, firstByte) + replacement + content.slice(lastByte)
  const before = lexicalSymbols(content).length
  const after = lexicalSymbols(spliced).length
  if (Math.abs(before - after) > 1) {
    throw new Error(
      `edit refused: structured reparse changed symbol shape (${before} → ${after}); refusing rather than corrupting`,
    )
  }
  return { content: spliced, strategy: "structured" }
}

/**
 * P64.5 rung 3 — order-tolerant fuzzy fallback, mirroring Rust
 * `apply_fuzzy_edit`.
 *
 * The target's non-empty normalized lines must appear as an ordered
 * subsequence of the content's normalized lines; gaps are allowed (extra
 * unmodified lines between hunks), reordering is not (it would risk splicing
 * the wrong region). Whitespace-insensitive, so a re-indented or
 * reformatted target still matches. Fails closed on 0 or 2+ candidate windows —
 * tolerance is in the *comparison*, never in the ambiguity gate.
 */
export function applyFuzzyEdit(
  content: string,
  target: string,
  replacement: string,
): LadderResult {
  if (target.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  const want = rustLines(target)
    .map(normalizeFuzzyLine)
    .filter((l) => l.length > 0)
  if (want.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  const have = rustLines(content).map(normalizeFuzzyLine)
  // Candidate windows: each content line equal to the first wanted line, where
  // every remaining wanted line then appears in order after it.
  const starts: number[] = []
  for (let i = 0; i < have.length; i += 1) {
    if (have[i] !== want[0]) continue
    let j = i
    let ok = true
    for (const w of want.slice(1)) {
      let found = false
      j += 1
      while (j < have.length) {
        if (have[j] === w) {
          found = true
          break
        }
        j += 1
      }
      if (!found) {
        ok = false
        break
      }
    }
    if (ok) starts.push(i)
  }
  if (starts.length === 0) {
    throw new Error("edit refused: no occurrence found (0 matches); provide more context")
  }
  if (starts.length > 1) {
    throw new Error(
      `edit refused: ambiguous match (${starts.length} occurrences); provide more context for a single occurrence`,
    )
  }
  const start = starts[0] as number
  // Re-locate the last matched line so the raw range [start, end] can be
  // replaced by the replacement text (which may itself be multi-line).
  let end = start
  for (const w of want.slice(1)) {
    end += 1
    while (end < have.length && have[end] !== w) end += 1
  }
  const raw = rustLines(content)
  const out: string[] = []
  for (let i = 0; i < raw.length; i += 1) {
    if (i === start) out.push(replacement)
    if (!(i >= start && i <= end)) out.push(raw[i] as string)
  }
  let joined = out.join("\n")
  // Trailing-newline fidelity: preserve the original file ending.
  if (content.endsWith("\n") && !joined.endsWith("\n")) joined += "\n"
  return { content: joined, strategy: "fuzzy" }
}

/**
 * P64.5 — the unified ladder: exact → structured → fuzzy, mirroring Rust
 * `apply_edit_ladder`. The first rung that succeeds wins; if all three refuse,
 * the **first** refusal (exact's) is thrown, because it is the most actionable
 * message for the model ("provide more context").
 *
 * Why this exists on the coordinator side rather than only in Rust: the shadow
 * preflight gate must inspect the *post-state* before the write lands, so the
 * post-state has to be computable here. Rust's `file_ops.edit` cannot supply it
 * without committing the edit first. The ladder is deterministic and pure, so
 * this is a mirror of an algorithm, not a second engine — Rust's
 * `file_ops.edit` remains the applier of record for the native tool path, and
 * whichever rung this returns is the strategy recorded on the Work receipt.
 */
export function applyEditLadder(
  content: string,
  target: string,
  replacement: string,
): LadderResult {
  if (target.length === 0) {
    throw new Error("edit refused: `target` must not be empty")
  }
  if (content.length > P64_MAX_EDIT_BYTES * 8 || target.length > P64_MAX_EDIT_BYTES) {
    throw new Error(
      `edit refused: payload ${Math.max(content.length, target.length)} bytes over the ${P64_MAX_EDIT_BYTES} byte cap`,
    )
  }
  let firstErr: unknown
  try {
    return applyExactOnce(content, target, replacement)
  } catch (e) {
    firstErr = e
  }
  try {
    return applyStructuredEdit(content, target, replacement)
  } catch {
    // Rung 2 only handles whitespace-only noise; anything else falls through.
  }
  try {
    return applyFuzzyEdit(content, target, replacement)
  } catch {
    // All rungs refused — report exact's verdict below.
  }
  throw firstErr instanceof Error ? firstErr : new Error(String(firstErr))
}

/**
 * P64.5/P64.6 — map the model-facing `file_ops.edit` args to the edit params.
 *
 * The tool the model is offered takes `{path, old, new}` (Rust's registered
 * schema). `new` may legitimately be an empty string — that is a deletion — so
 * an absent `new` is distinguished from an empty one rather than both being
 * coerced to "". A missing or non-string field fails closed here, before any
 * read, rather than editing the wrong text.
 */
export function editArgsFromToolCall(args: Record<string, unknown>): ExactEditParams {
  const path = typeof args.path === "string" ? args.path : "";
  if (path.trim().length === 0) {
    throw new Error("file_ops.edit requires `path` — fail-closed");
  }
  if (typeof args.old !== "string") {
    throw new Error("file_ops.edit requires `old` — fail-closed");
  }
  if (typeof args.new !== "string") {
    throw new Error("file_ops.edit requires `new` — fail-closed");
  }
  return { path, target: args.old, replacement: args.new };
}

/**
 * P64.5/P64.6 — the coordinator's composite edit path: read, splice through the
 * ladder, preflight the proposed post-state, then write.
 *
 * The name is historical (this path began as the exact-only rung); it now rides
 * the full ladder, and the rung that actually spliced the file is returned as
 * `strategy` and recorded as the Work's verified-edit receipt.
 */
export async function applyExactEdit(
  executor: ToolExecutor,
  params: ExactEditParams,
  ctx: { sessionId: string; agentId?: string } = { sessionId: "default" },
  opts: ApplyExactEditOptions = {},
): Promise<unknown> {
  const path = params.path.trim();
  if (path.length === 0) throw new Error("edit path is empty — fail-closed");
  if (params.target.length === 0) {
    throw new Error("edit target is empty — fail-closed (supply the block to replace)");
  }
  const read = (await executor.executeTool("file_ops.read", { path }, ctx)) as unknown;
  const content =
    typeof read === "string"
      ? read
      : typeof (read as { content?: unknown })?.content === "string"
        ? String((read as { content: unknown }).content)
        : JSON.stringify(read ?? "");
  // P64.5 — the full ladder, not just the exact rung: a target that misses
  // exactly because of re-indentation or reformatting still lands through the
  // fuzzy rung instead of being refused outright, and every rung keeps the
  // fail-closed 0/2+ ambiguity gate. The post-state is computed here (rather
  // than by Rust's `file_ops.edit`) because the shadow gate below must inspect
  // it *before* the write lands.
  const applied = applyEditLadder(content, params.target, params.replacement)
  const next = applied.content
  // P64.6 — the proposed post-state is fully known here, so it is the one place
  // this path can hand a real candidate to the shadow preflight: Rust decides
  // whether the gate fires, stages the candidate into an isolated tree, runs the
  // project's own declared check there, and returns the verdict. A verdict that
  // ran and failed refuses the write; `verified: false` (could not run) is
  // reported as no evidence and never blocks — see `preflightBlocks`.
  //
  // The risk flags are derived from the splice itself (`deriveEditRisk`), not
  // taken from the model: an explicit caller flag can only raise the gate.
  const derived = deriveEditRisk({ target: params.target, replacement: params.replacement });
  const preflight = await executor.runShadowPreflight({
    root: opts.root ?? ".",
    filesChanged: derived.filesChanged,
    structural: derived.structural || opts.structural === true,
    destructive: derived.destructive || opts.destructive === true,
    candidateFiles: [{ path, content: next }],
  });
  if (preflightBlocks(preflight)) {
    throw new Error(`edit refused: shadow preflight failed (${preflight.reason})`);
  }
  const written = await executor.executeTool("file_ops.write", { path, content: next }, ctx);
  // P64.5 — the edit ladder's outcome belongs on the Work timeline: which rung
  // actually spliced this file (`exact` / `structured` / `fuzzy`). An absent or
  // failed receipt returns false and is never allowed to undo an edit that has
  // already landed.
  await executor.recordVerifiedEdit(applied.strategy, path, executor.lastTicketId);
  // P64.6/P64.7 — the preflight verdict rides with the edit result so the
  // transcript carries the evidence the checkpoint timeline shows. No new
  // channel: the verdict is the same object Rust recorded as the Work's
  // `shadow_preflight` receipt (or the honest no-evidence verdict when the
  // preflight could not run).
  return {
    ok: true,
    path,
    // P64.5 — which rung spliced the file. Surfaced so a caller (and the
    // checkpoint timeline) can tell an exact hit from a fuzzy recovery.
    strategy: applied.strategy,
    written,
    preflight: {
      needsPreflight: preflight.needsPreflight,
      verified: preflight.verified,
      passed: preflight.passed,
      reason: preflight.reason,
    },
  };
}

/**
 * P64.5 — one file's edit inside a batch: the same shape as
 * `ExactEditParams`, applied through the same ladder.
 */
export interface BatchEditParams {
  path: string
  target: string
  replacement: string
}

/** One landed file in a batch, with the rung that spliced it. */
export interface BatchEditOutcome {
  path: string
  strategy: EditStrategy
}

/** P64.5 — the batch's result: every landed file plus the shared gate verdict. */
export interface BatchEditResult {
  ok: true
  filesChanged: number
  edits: BatchEditOutcome[]
  preflight: {
    needsPreflight: boolean
    verified: boolean
    passed: boolean
    reason: string
  }
}

/**
 * P64.5 — apply several files' edits as one gated unit, which is what gives the
 * shadow gate's multi-file arm (`filesChanged > 1`) a production input.
 *
 * Contract:
 * - every edit is spliced through the same ladder as a single edit (so one
 *   file's fuzzy recovery is fine, and every rung still fails closed on 0/2+);
 * - the **whole batch shares one preflight**: all post-states are staged as
 *   candidates into a single `execution/preflight` call with
 *   `filesChanged = edits.length`, so a structural/multi-file risk is judged
 *   once against the combined change rather than file by file;
 * - a failing verdict refuses **every** file — nothing is written — because a
 *   multi-file change that does not typecheck together is exactly the failure
 *   the gate exists to stop;
 * - a duplicate path is refused up front: the second edit's candidate would be
 *   computed against the pre-first-edit content and the staged tree would not
 *   match what lands;
 * - a write failure mid-batch is reported with how many files had already
 *   landed, so a partial success is never disguised as a clean failure.
 */
/**
 * P64.5 — Aider `apply_edits` list: consecutive `file_ops.edit` calls in one
 * model round share a single shadow preflight (`filesChanged = N`). Other
 * tools stay per-call. This is the live consumer for `applyEditBatch`.
 */
export async function executeEditAwareRound(
  executor: ToolExecutor,
  calls: Array<{ toolId: string; args: Record<string, unknown> }>,
  ctx: { sessionId: string; agentId?: string },
  dispatch: (toolId: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown[]> {
  const out: unknown[] = [];
  let i = 0;
  while (i < calls.length) {
    const cur = calls[i]!;
    if (cur.toolId === "file_ops.edit") {
      const batch: BatchEditParams[] = [];
      const start = i;
      while (i < calls.length && calls[i]!.toolId === "file_ops.edit") {
        batch.push(editArgsFromToolCall(calls[i]!.args));
        i += 1;
      }
      if (batch.length === 1) {
        out.push(await dispatch("file_ops.edit", calls[start]!.args));
      } else {
        const result = await applyEditBatch(executor, batch, ctx, { root: "." });
        for (const e of result.edits) {
          out.push({
            ok: true,
            path: e.path,
            strategy: e.strategy,
            filesChanged: result.filesChanged,
            preflight: result.preflight,
          });
        }
      }
      continue;
    }
    out.push(await dispatch(cur.toolId, cur.args));
    i += 1;
  }
  return out;
}

export async function applyEditBatch(
  executor: ToolExecutor,
  edits: BatchEditParams[],
  ctx: { sessionId: string; agentId?: string } = { sessionId: "default" },
  opts: ApplyExactEditOptions = {},
): Promise<BatchEditResult> {
  if (edits.length === 0) {
    throw new Error("batch edit has no edits — fail-closed")
  }
  const seen = new Set<string>()
  for (const e of edits) {
    const p = e.path.trim()
    if (p.length === 0) throw new Error("edit path is empty — fail-closed")
    if (e.target.length === 0) {
      throw new Error(`edit target is empty for ${p} — fail-closed (supply the block to replace)`)
    }
    if (seen.has(p)) {
      throw new Error(
        `batch edit lists ${p} twice — fail-closed (apply the two edits to that file sequentially)`,
      )
    }
    seen.add(p)
  }

  // Read + splice every file first, so nothing is written until the single
  // shared preflight has judged the combined post-state.
  const staged: Array<{ path: string; next: string; strategy: EditStrategy }> = []
  let structural = false
  for (const e of edits) {
    const path = e.path.trim()
    const read = (await executor.executeTool("file_ops.read", { path }, ctx)) as unknown
    const content =
      typeof read === "string"
        ? read
        : typeof (read as { content?: unknown })?.content === "string"
          ? String((read as { content: unknown }).content)
          : JSON.stringify(read ?? "")
    const applied = applyEditLadder(content, e.target, e.replacement)
    const derived = deriveEditRisk({ target: e.target, replacement: e.replacement })
    structural = structural || derived.structural
    staged.push({ path, next: applied.content, strategy: applied.strategy })
  }

  // One gate call for the whole batch: `filesChanged > 1` is the multi-file
  // arm, and the candidates are every file's post-state, not just the first.
  const preflight = await executor.runShadowPreflight({
    root: opts.root ?? ".",
    filesChanged: staged.length,
    structural: structural || opts.structural === true,
    destructive: opts.destructive === true,
    candidateFiles: staged.map((s) => ({ path: s.path, content: s.next })),
  })
  if (preflightBlocks(preflight)) {
    throw new Error(
      `batch edit refused: shadow preflight failed for ${staged.length} file(s) (${preflight.reason})`,
    )
  }

  const landed: BatchEditOutcome[] = []
  for (const s of staged) {
    try {
      await executor.executeTool("file_ops.write", { path: s.path, content: s.next }, ctx)
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      throw new Error(
        `batch edit stopped at ${s.path}: ${landed.length} of ${staged.length} file(s) already landed (${landed
          .map((l) => l.path)
          .join(", ") || "none"}) — ${why}`,
      )
    }
    await executor.recordVerifiedEdit(s.strategy, s.path, executor.lastTicketId)
    landed.push({ path: s.path, strategy: s.strategy })
  }

  return {
    ok: true,
    filesChanged: landed.length,
    edits: landed,
    preflight: {
      needsPreflight: preflight.needsPreflight,
      verified: preflight.verified,
      passed: preflight.passed,
      reason: preflight.reason,
    },
  }
}
