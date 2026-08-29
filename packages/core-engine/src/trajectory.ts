/**
 * Structured trajectory logging for ConversationEngine turns.
 *
 * Every turn produces a TurnTrajectory capturing {input, reasoning, tool_calls,
 * tool_results, output, usage} — for debugging, fine-tuning data, and the
 * chat-fidelity harness.
 */

export interface TrajectoryStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'generation' | 'risk_assessment';
  timestamp: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface TurnTrajectory {
  turnId: string;
  sessionId: string;
  agentId: string;
  surface: string;
  input: { text: string; attachments?: string[] };
  steps: TrajectoryStep[];
  output: string;
  usage?: { promptTokens: number; completionTokens: number };
  toolRounds: number;
  durationMs: number;
  createdAt: string; // ISO
}
