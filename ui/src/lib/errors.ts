// P51.2 (UI slice) — localized error-card translation layer. Maps the
// machine codes the wire can produce onto plain-language explanations and a
// concrete recovery hint, per layer. Unknown codes fall back to a generic
// per-layer line — the card never shows a raw code without a human read.
// This is a client-side dictionary over codes the shell already emits; it
// does not invent codes or claim providers' exact messages.

import type { ChatError } from './store'

interface Explanation {
  explain: string
  hint?: string
}

const CODEBOOK: Record<string, Explanation> = {
  // Provider layer — HTTP-ish codes the broker can surface.
  '401': { explain: 'The provider rejected the API key.', hint: 'Re-check the key in Settings → Providers — it may be revoked or pasted with extra whitespace.' },
  '403': { explain: 'The provider refused this request.', hint: 'The key may lack quota for this model, or the region/model is restricted. Try a different variant.' },
  '404': { explain: 'The provider could not find the requested model endpoint.', hint: 'The model id may have changed — pick another variant or re-check routing.' },
  '429': { explain: 'Rate limited — the provider is receiving too many requests.', hint: 'Wait a moment and retry; the turn will re-ask on the same history.' },
  '500': { explain: 'The provider had an internal error.', hint: 'Transient — retry, or switch variant if it persists.' },
  '503': { explain: 'The provider is overloaded or restarting.', hint: 'Wait and retry; auto-route can pick a healthy runtime instead.' },
  'insufficient_quota': { explain: 'The provider account has run out of quota or credits.', hint: 'Top up or switch to another provider/model.' },
  'context_length_exceeded': { explain: 'The request exceeded the model’s context window.', hint: 'Clear this chat, fork it, or trim the conversation before retrying.' },
  'timeout': { explain: 'The provider took too long to answer.', hint: 'Retry; if it repeats, a smaller/faster variant may be more reliable.' },

  // Guard layer — approvals and policy.
  'denied': { explain: 'The guard blocked this action.', hint: 'Check the Guard panel for the exact rule that denied it.' },
  'ticket_missing': { explain: 'The approval ticket was already consumed or expired.', hint: 'Re-issue the action — each approval is single-use by design.' },
  'ticket_timeout': { explain: 'The approval request timed out before anyone answered it.', hint: 'Retry the action and approve the card in the guard window in time.' },
  'policy_blocked': { explain: 'A policy forbids this operation for the current scope.', hint: 'Review the policy in Settings → Permissions.' },

  // Tool layer.
  'tool_failed': { explain: 'A tool call failed mid-task.', hint: 'Retry — the task resumes from the same history.' },
  'tool_not_attached': { explain: 'The tool needs a session that is not attached (e.g. a browser or device).', hint: 'Start the missing session from its surface (Browse / Computer use), then retry.' },
  'tool_timeout': { explain: 'A tool call ran too long and was cut off.', hint: 'Retry with a narrower ask, or split the work into smaller steps.' },

  // Agent layer — coordinator/engine failures.
  'agent_crash': { explain: 'The agent engine stopped unexpectedly.', hint: 'Retry — a fresh turn starts clean. If it repeats, check the runtime status in the status bar.' },
  'coordinator_unreachable': { explain: 'The coordinator sidecar is not answering.', hint: 'Check that the native shell is live (status bar “sidecar”), then retry.' },

  // Budget layer.
  'budget_exceeded': { explain: 'The spend cap stopped the turn.', hint: 'Raise or reset the cap in Settings → Chat & auto-run, then retry.' },

  // Runtime layer.
  'runtime_unavailable': { explain: 'The selected runtime is not available right now.', hint: 'Check local-model downloads / provider health, or let auto-route pick another.' },
}

const LAYER_FALLBACK: Record<ChatError['layer'], string> = {
  provider: 'The model provider did not complete the request.',
  guard: 'The guard did not allow this step.',
  tool: 'A tool call did not complete.',
  agent: 'The agent engine did not complete the turn.',
  budget: 'A budget or usage limit stopped the turn.',
  runtime: 'A runtime dependency is unavailable.',
}

export function explainError(err: Pick<ChatError, 'layer' | 'code' | 'detail'>): Explanation {
  if (err.code) {
    const hit = CODEBOOK[err.code]
    if (hit) return hit
  }
  const lower = err.detail.toLowerCase()
  if (lower.includes('rate limit') || lower.includes('429')) {
    return CODEBOOK['429']!
  }
  if (lower.includes('unauthorized') || lower.includes('api key') || lower.includes('401')) {
    return CODEBOOK['401']!
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return CODEBOOK['timeout']!
  }
  if (lower.includes('quota')) {
    return CODEBOOK['insufficient_quota']!
  }
  return { explain: LAYER_FALLBACK[err.layer] }
}