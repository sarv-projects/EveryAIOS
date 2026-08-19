/**
 * P7.5 / J21 — the coordinator-side Guard-2 driving seam.
 *
 * The sidecar never executes privileged actions itself; it asks Rust to
 * evaluate them (`guard/evaluate`), waits for a human ticket when Rust says
 * `ask`, then the executor consumes the ticket (`guard/use`) before running.
 * These helpers type the JSON-RPC surface so the loop calls the guard exactly
 * once per action — the Rust `GuardService` enforces estop + policy + profile
 * + single-use, so a dead or replaying sidecar can't double-execute.
 */

/** The decision Rust returns from `guard/evaluate`.
 * Ticket-every-effect: `allow` carries a pre-approved single-use ticket the
 * executor consumes; `ask` carries a pending ticket that needs human approval. */
export type GuardDecision =
  | { action: "allow"; ticketId: string }
  | { action: "ask"; ticketId: string }
  | { action: "block"; reason: string };

/** Canonical operation names the policy distinguishes (J21). */
export type GuardOperation =
  | "delete"
  | "multi_file_edit"
  | "external_network"
  | "terminal_shell"
  | "web_action"
  | "write";

/** Outbound JSON-RPC request (mirrors `chat.ts` `request`). */
export type GuardRequest = (method: string, params: unknown) => Promise<unknown>;

/** The decision-package fragment the sidecar attaches (doc 52 §2). */
export interface GuardDecisionPackage {
  goal?: string;
  proposedDiff?: string;
  risk?: "low" | "medium" | "high" | "critical";
  affectedPaths?: string[];
  scriptLines?: string[];
  executionTarget?: string;
  envVars?: string[];
  networkDestinations?: string[];
  webAction?: string | null;
  confidence?: number | null;
}

export interface GuardEvaluateParams {
  sessionId: string;
  agentId: string;
  toolId: string;
  operation: GuardOperation;
  /** `multi_file_edit` → file count. */
  files?: number;
  /** `external_network` → is this an unseen domain. */
  newDomain?: boolean;
  /** `terminal_shell` → Guard-1 flagged the command. */
  destructive?: boolean;
  argsHash: string;
  auditSeq?: number;
  decision?: GuardDecisionPackage;
}

/** Ask Rust to evaluate a privileged action (pre-flight). */
export async function evaluateGuard(
  request: GuardRequest,
  params: GuardEvaluateParams,
): Promise<GuardDecision> {
  const body: Record<string, unknown> = {
    sessionId: params.sessionId,
    agentId: params.agentId,
    toolId: params.toolId,
    operation: params.operation,
    argsHash: params.argsHash,
    decision: params.decision ?? {},
  };
  if (params.files !== undefined) body.files = params.files;
  if (params.newDomain !== undefined) body.newDomain = params.newDomain;
  if (params.destructive !== undefined) body.destructive = params.destructive;
  if (params.auditSeq !== undefined) body.auditSeq = params.auditSeq;
  return (await request("guard/evaluate", body)) as GuardDecision;
}

/** Consume a minted ticket right before running (executor call-site). */
export async function useTicket(
  request: GuardRequest,
  ticketId: string,
  argsHash: string,
): Promise<boolean> {
  const out = (await request("guard/use", { ticketId, argsHash })) as {
    consumed?: boolean;
  };
  return out.consumed === true;
}

/** The full executor call: pre-flight → (ticket?) → consume. Returns the
 * decision; when `ask`, the caller surfaces the ticket id to the UI and the
 * human approves before the executor calls `useTicket`. */
export async function guardGate(
  request: GuardRequest,
  params: GuardEvaluateParams,
): Promise<GuardDecision> {
  return evaluateGuard(request, params);
}
