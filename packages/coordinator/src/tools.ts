/**
 * Stage 0.2 — coordinator ToolExecutor.
 *
 * Sidecar proposes: `tool/exec` (pre-flight) → wait if Ask → `tool/commit`.
 * Never auto-consumes an Ask ticket. Results are sanitized before they
 * re-enter the model (P7.6). Loop guard: same tool+args hash 3× in a window
 * of 8 trips the breaker (mirrors `everyaios-guard::loopguard`).
 */

import { createHash } from "node:crypto";
import { evaluateGuard, useTicket, type GuardOperation } from "./guard";

export type ToolRequest = (method: string, params: unknown) => Promise<unknown>;

export type ToolDecision =
  | { action: "allow"; ticketId: string; argsHash: string; readOnly?: boolean }
  | { action: "ask"; ticketId: string; argsHash: string; readOnly?: boolean }
  | { action: "block"; reason: string };

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

/** Stable id order — required for prompt-cache byte-stability (A9). */
export function sortToolsStable(tools: ListedTool[]): ListedTool[] {
  return [...tools].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * H2 capability index: pick at most `cap` tools for this turn from the
 * full registry. Scoring is deterministic (id order as a tie-break) so the
 * same query+catalog always yields the same subset.
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
  const used = new Set(opts?.previouslyUsed ?? []);
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_.]+/i)
    .filter((t) => t.length >= 3);
  const scored = sorted.map((t) => {
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
  return sortToolsStable(scored.slice(0, cap).map((s) => s.t));
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

/** P7.6 — strip instruction-shaped framing before the model sees a tool result. */
export function sanitizeToolResult(output: string): string {
  return output
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

  constructor(
    private request: ToolRequest,
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

  async listTools(): Promise<ListedTool[]> {
    const out = (await this.request("tool/list", {})) as {
      tools?: ListedTool[];
    };
    return out.tools ?? [];
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
    })) as ToolCommitResult;

    if (!committed.ok) {
      throw new Error(String(committed.error ?? "tool failed"));
    }
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
