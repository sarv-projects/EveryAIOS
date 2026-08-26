/**
 * P16 — Two-channel injection, Channel A (doc 68 §4): the ACP protocol
 * boundary mediates every I/O for any hosted agent. The agent never touches
 * raw files/terminals — it gets slim bounded previews (C10), compressed
 * output (RTK), and every mutation stays ticket-gated at the boundary.
 *
 * `mediate` is the pure adapter: method + params → a MediatedAction the
 * executor runs (with the guard surface already applied). Token-minimizing
 * + surgical by construction.
 */

/** The ACP methods Channel A intercepts. */
export type AcpMethod =
  | "fs/read"
  | "fs/write"
  | "terminal/create"
  | "terminal/output";

/** The mediated action — what actually executes. */
export type MediatedAction =
  | { kind: "read"; method: "fs/read"; path: string; previewTokens: number; passByRef: boolean }
  | { kind: "write"; method: "fs/write"; path: string; content: string; needsTicket: true }
  | { kind: "terminal_create"; method: "terminal/create"; command: string; guard1: boolean; audited: true }
  | { kind: "terminal_output"; method: "terminal/output"; sessionId: string; compress: boolean }
  | { kind: "refused"; reason: string };

/** Channel A knobs. */
export interface ChannelAConfig {
  /** Max tokens a fs/read preview may carry (C10 pass-by-ref budget). */
  previewTokens: number;
  /** Whether reads pass-by-reference (slim preview + handle) instead of
   * inlining. */
  passByRef: boolean;
  /** RTK compression on terminal output. */
  compressTerminal: boolean;
}

export const DEFAULT_CHANNEL_A: ChannelAConfig = {
  previewTokens: 2000,
  passByRef: true,
  compressTerminal: true,
};

/** Mediate one ACP method call. Deterministic — same input, same action. */
export function mediate(
  method: AcpMethod,
  params: Record<string, unknown>,
  config: ChannelAConfig = DEFAULT_CHANNEL_A,
): MediatedAction {
  switch (method) {
    case "fs/read": {
      const path = String(params.path ?? "");
      if (!path) return { kind: "refused", reason: "fs/read without path" };
      return {
        kind: "read",
        method,
        path,
        previewTokens: config.previewTokens,
        passByRef: config.passByRef,
      };
    }
    case "fs/write": {
      const path = String(params.path ?? "");
      const content = String(params.content ?? "");
      if (!path) return { kind: "refused", reason: "fs/write without path" };
      // Channel A: fs/write is ALWAYS a Guard-2 ticket at the boundary —
      // the hosted agent never writes ungoverned.
      return { kind: "write", method, path, content, needsTicket: true };
    }
    case "terminal/create": {
      const command = String(params.command ?? "");
      if (!command) return { kind: "refused", reason: "terminal/create without command" };
      // Guard-1 pre-scan + audit are mandatory at the boundary.
      return { kind: "terminal_create", method, command, guard1: true, audited: true };
    }
    case "terminal/output": {
      const sessionId = String(params.sessionId ?? "");
      if (!sessionId) return { kind: "refused", reason: "terminal/output without session" };
      return { kind: "terminal_output", method, sessionId, compress: config.compressTerminal };
    }
  }
}

/** The token math: what a read actually injects (preview + ref handle
 * overhead) vs the raw file — the Channel-A minimization number. */
export function readTokenFootprint(
  fileTokens: number,
  previewTokens: number,
  passByRef: boolean,
): { injected: number; saved: number } {
  if (passByRef) {
    const injected = Math.min(fileTokens, previewTokens) + 24; // handle + marker
    return { injected, saved: Math.max(0, fileTokens - injected) };
  }
  return { injected: fileTokens, saved: 0 };
}
