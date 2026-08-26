/**
 * H32 — agent-scoped model surface (doc 68 §3): the picker always shows a
 * model column, but the *send* policy is strict:
 * - the inbuilt engine (`everyaios-native`) may carry a model selection
 *   (it owns its model routing),
 * - ACP agents (claude-code, codex, opencode, …) own their model — the
 *   per-agent model selection is display-only and **never** forwarded to
 *   `chat_stream`/the ACP transport.
 *
 * `sanitizeRequest` is the enforcement seam: any request bound for an ACP
 * agent has the model field stripped before it reaches the transport.
 */

/** The inbuilt engine id — the only surface that accepts a model pin. */
export const INBUILT_AGENT = "everyaios-native";

/** ACP-registered agent ids (the harness owns the model). */
const ACP_AGENTS = new Set(["claude-code", "codex", "opencode", "qwen-code", "grok", "hermes", "cline", "pi", "dsh", "commandcode", "chatgpt"]);

/** Is this agent an ACP harness (model not ours to set)? */
export function isAcpAgent(agentId: string): boolean {
  return agentId !== INBUILT_AGENT && (ACP_AGENTS.has(agentId) || agentId.startsWith("acp:"));
}

/**
 * The send policy: forward the model selection only for the inbuilt engine.
 * ACP agents return false — their send never carries a per-agent model.
 */
export function shouldForwardModel(agentId: string): boolean {
  return agentId === INBUILT_AGENT;
}

/** Sanitize a request envelope for an ACP-bound send: strip the model. */
export function sanitizeRequest<T extends { model?: string }>(
  req: T,
  agentId: string,
): T {
  if (isAcpAgent(agentId)) {
    const { model: _dropped, ...rest } = req;
    return rest as T;
  }
  return req;
}

/** The picker column policy: the model column is always visible, but for
 * ACP agents it renders as "managed by <agent>" rather than a selectable
 * pin. */
export function modelColumnState(agentId: string): { visible: true; selectable: boolean; hint: string } {
  if (agentId === INBUILT_AGENT) {
    return { visible: true, selectable: true, hint: "inbuilt engine — model pinned here" };
  }
  return { visible: true, selectable: false, hint: `model managed by ${agentId}` };
}
