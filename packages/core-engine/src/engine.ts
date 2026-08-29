import type { TurnInput, SurfaceContract, AgentSandbox } from './types';
import { defaultContract } from './surface-contract';
import { RetrievalPlanner, ToolPlanner, PermissionGate } from './stages';
import type { ToolPlan } from './stages';
import type { TurnTrajectory, TrajectoryStep } from './trajectory';
import {
  assessHallucinationRisk,
  countUncertaintyMarkers,
  type RiskAssessment,
  type RiskSignals,
} from './risk-compass';

export type EngineEvent =
  | { type: 'compiling' }
  | { type: 'routed'; decision: string }
  | { type: 'streaming_start' }
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; toolId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolId: string; result: unknown }
  | { type: 'streaming_done'; usage?: { promptTokens: number; completionTokens: number } }
  | { type: 'risk_assessment'; assessment: RiskAssessment }
  | { type: 'error'; error: string; retryable: boolean }
  | { type: 'done'; turnId: string }
  | { type: 'trajectory'; trajectory: TurnTrajectory }
  | { type: 'extracting_memory' }
  | { type: 'artifact_generated'; artifact: { title: string; format: string; uri?: string; preview?: string; needsReview?: boolean } };

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; args: Record<string, unknown>; name?: string }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number } };

export type ToolResultRecord = {
  toolId: string;
  args: Record<string, unknown>;
  result: unknown;
};

export type StreamProviderExtras = {
  /** 0-based tool-loop iteration (0 = first model call). */
  toolRound?: number;
  /** Results from the previous round; used to continue the agent loop. */
  previousToolResults?: ToolResultRecord[];
  /** Tool ids allowed for this surface (from ToolPlanner), when tools are enabled. */
  allowedToolIds?: string[];
};

export interface EngineDeps {
  generatePrompt(input: TurnInput, contract: SurfaceContract): Promise<string>;
  streamProvider(
    prompt: string,
    signal: AbortSignal,
    extras?: StreamProviderExtras,
  ): AsyncGenerator<StreamChunk, void>;
  executeTool?(toolId: string, args: Record<string, unknown>): Promise<unknown>;
  persistTurn(
    input: TurnInput,
    response: string,
    usage?: { promptTokens: number; completionTokens: number },
  ): Promise<string>;
  extractMemory(input: TurnInput, response: string): Promise<void>;
  /**
   * Optional (Algorithm #8 — Hallucination Risk Compass): supply retrieval
   * grounding signals for the risk assessment. When omitted, the engine
   * computes risk from response-only signals (uncertainty markers, length,
   * grounding enforcement) and assumes neutral retrieval confidence.
   */
  getRiskSignals?(input: TurnInput, response: string): Promise<Partial<RiskSignals>> | Partial<RiskSignals>;
  /**
   * Optional: detect and auto-promote user corrections to persistent memory.
   * Called after extractMemory when the user sent the input.
   * If omitted, correction detection is skipped entirely.
   */
  detectAndPromoteCorrections?(input: TurnInput, response: string): Promise<void>;
  /**
   * Optional: resolve the capability sandbox for a given agent.
   * If provided, the engine enforces per-agent toolIds, maxRisk, webAccess,
   * and maxToolCallsPerTurn. If omitted, the engine uses surface-wide defaults
   * (backward-compatible with the pre-sandbox behavior).
   */
  getAgentSandbox?(agentId: string): Promise<AgentSandbox | null>;
  /**
   * Optional: persist a completed turn trajectory for debugging / fine-tuning data.
   * Called after emitting the 'trajectory' event. The engine does not wait for
   * this promise to resolve before returning — failures are silently caught.
   */
  persistTrajectory?(trajectory: TurnTrajectory): Promise<void>;
  /**
   * Optional: detect DocMaker/artifact intent from the user's message.
   * Called before prompt generation. When it returns a format, the engine
   * will call generateArtifact after the turn to produce the document.
   * The main chat stream is NOT affected — DocMaker runs as a side-channel.
   */
  detectDocMakerIntent?(input: TurnInput): Promise<'docx' | 'pdf' | null>;
  /**
   * Optional: generate a document artifact via a separate LLM call.
   * Called after persistTurn when DocMaker intent was detected.
   * Runs its own LLM call — the main chat response is conversational.
   */
  generateArtifact?(input: TurnInput, format: 'docx' | 'pdf'): Promise<{
    title: string;
    format: string;
    uri?: string;
    preview?: string;
    needsReview?: boolean;
  } | null>;
}

export type EngineCallback = (event: EngineEvent) => void;

/** Safety cap so a runaway tool loop cannot spin forever. */
const MAX_TOOL_ROUNDS = 5;

/**
 * Fallback risk when no agent sandbox is available.
 * Higher-risk tools still fail closed if PermissionGate denies them.
 */
const FALLBACK_TOOL_RISK = 'read' as const;

/**
 * Canonical risk level per tool family.
 * Used to compare a tool's actual risk against the agent's maxRisk.
 */
const FAMILY_DEFAULT_RISKS: Record<string, 'read' | 'local-write' | 'external-write' | 'destructive'> = {
  knowledge: 'read',
  reader: 'read',
  automations: 'local-write',
  creation: 'local-write',
  system: 'read',
};

const RISK_ORDER: Array<'read' | 'local-write' | 'external-write' | 'destructive'> = ['read', 'local-write', 'external-write', 'destructive'];

export class ConversationEngine {
  private readonly retrievalPlanner = new RetrievalPlanner();
  private readonly toolPlanner = new ToolPlanner();
  private readonly permissionGate = new PermissionGate();

  constructor(private deps: EngineDeps) {}

  async *run(input: TurnInput, signal?: AbortSignal): AsyncGenerator<EngineEvent, void> {
    const contract = defaultContract(input.surface);
    if (input.openDocumentId && contract.scope.type === 'source_hard') {
      (contract.scope as { sourceId: string }).sourceId = input.openDocumentId;
    }

    const abortSignal = signal ?? new AbortController().signal;

    // Resolve agent sandbox (per-agent capability enforcement)
    const agentSandbox: AgentSandbox | null =
      input.agentId && this.deps.getAgentSandbox
        ? await this.deps.getAgentSandbox(input.agentId).catch(() => null)
        : null;
    const agentWebAccess = agentSandbox?.webAccess;
    const agentToolIds = agentSandbox?.toolIds;
    const agentMemoryScope = agentSandbox?.memoryScope;
    const maxToolRounds = agentSandbox?.maxToolCallsPerTurn ?? MAX_TOOL_ROUNDS;
    const agentMaxRisk = agentSandbox?.maxRisk;

    // Stage: RetrievalPlanner + ToolPlanner (mount allowed tools for this surface × agent)
    const retrievalInput: {
      includeWeb?: boolean;
      includeMemory?: boolean;
      scopeFileIds?: string[];
      openDocumentId?: string;
      projectId?: string;
    } = {};
    if (input.includeWeb !== undefined) retrievalInput.includeWeb = input.includeWeb;
    if (input.includeMemory !== undefined) retrievalInput.includeMemory = input.includeMemory;
    if (input.scopeFileIds !== undefined) retrievalInput.scopeFileIds = input.scopeFileIds;
    if (input.openDocumentId !== undefined) retrievalInput.openDocumentId = input.openDocumentId;
    if (input.projectId !== undefined) retrievalInput.projectId = input.projectId;
    const retrievalPlan = this.retrievalPlanner.plan(contract, retrievalInput, agentWebAccess, agentMemoryScope);
    const toolPlan: ToolPlan | null = this.deps.executeTool
      ? this.toolPlanner.plan(contract, retrievalPlan, agentToolIds)
      : null;

    const trajectorySteps: TrajectoryStep[] = [];
    const startTime = Date.now();

    // DocMaker artifact intent detection (pre-processing hook)
    const docMakerFormat: 'docx' | 'pdf' | null =
      this.deps.detectDocMakerIntent
        ? await this.deps.detectDocMakerIntent(input).catch(() => null)
        : null;

    try {
      // 1. COMPILE
      yield { type: 'compiling' };
      const prompt = await this.deps.generatePrompt(input, contract);
      // Diagnostic — round-2 chat-fidelity audit helper.
      // Logs the post-compression prompt length (chars + tokens-estimate + lines).
      // Strictly dev-only: gated on process.env.NODE_ENV so Logcat/text-file leaks
      // of the system prompt + first 120 chars cannot be triggered in release even
      // if an env var flips. Compared to the previous NODE_ENV + DEBUG_CHAT_FIDELITY
      // gate, this is fail-closed (no override). core-engine runs in both
      // React Native (mobile) and Node (cloudflare-worker / gcp-svc-api) contexts,
      // so we use NODE_ENV rather than __DEV__ which is RN-only.
      const isDev =
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV !== undefined &&
        process.env?.NODE_ENV !== 'production' &&
        process.env?.NODE_ENV !== 'test';
      if (isDev) {
        console.log(
          '[ConversationEngine] prompt-diagnostic',
          JSON.stringify({
            chars: prompt.length,
            tokens_estimate: Math.ceil(prompt.length / 4),
            lines: prompt.split('\n').length,
          }),
        );
      }
      yield { type: 'routed', decision: input.agentId ?? 'general' };

      // 2. STREAM (+ optional tool loop with re-stream)
      yield { type: 'streaming_start' };

      let fullResponse = '';
      let usage: { promptTokens: number; completionTokens: number } | undefined;
      let previousToolResults: ToolResultRecord[] = [];
      let toolRound = 0;

      // When the model emits tool calls in the LAST allowed round, we must
      // stream one more time so the tool results become a real answer.
      // Without this flag, tools execute but fullResponse stays empty.
      let extraFinalRound = false;
      while (toolRound < maxToolRounds || extraFinalRound) {
        extraFinalRound = false;
        if (abortSignal.aborted) return;

        const toolCalls: { toolId: string; args: Record<string, unknown> }[] = [];
        let roundText = '';

        const streamExtras: StreamProviderExtras = { toolRound };
        if (toolRound > 0) {
          streamExtras.previousToolResults = previousToolResults;
        }
        if (toolPlan) {
          streamExtras.allowedToolIds = toolPlan.allowedToolIds;
        }
        const stream = this.deps.streamProvider(prompt, abortSignal, streamExtras);

        for await (const chunk of stream) {
          if (abortSignal.aborted) return;

          switch (chunk.type) {
            case 'text':
              roundText += chunk.text;
              fullResponse += chunk.text;
              yield { type: 'token', text: chunk.text };
              break;
            case 'reasoning':
              yield { type: 'reasoning', text: chunk.text };
              trajectorySteps.push({
                type: 'reasoning',
                timestamp: Date.now(),
                content: chunk.text,
              });
              break;
            case 'tool_call':
              toolCalls.push({ toolId: chunk.id, args: chunk.args });
              yield {
                type: 'tool_call',
                toolId: chunk.id,
                args: chunk.args,
              };
              trajectorySteps.push({
                type: 'tool_call',
                timestamp: Date.now(),
                content: chunk.id,
                metadata: { args: chunk.args },
              });
              break;
            case 'done':
              usage = chunk.usage ?? usage;
              break;
          }
        }

        // No tools this round → final answer
        if (toolCalls.length === 0 || !this.deps.executeTool) {
          break;
        }

        // 3. EXECUTE TOOLS for this round (ToolPlanner mount + PermissionGate), then re-stream
        previousToolResults = [];
        for (const tc of toolCalls) {
          if (abortSignal.aborted) return;

          const denied = this.gateToolCall(tc.toolId, contract, toolPlan, input.sessionId, agentMaxRisk);
          if (denied) {
            previousToolResults.push({
              toolId: tc.toolId,
              args: tc.args,
              result: denied,
            });
            yield { type: 'tool_result', toolId: tc.toolId, result: denied };
            trajectorySteps.push({
              type: 'tool_result',
              timestamp: Date.now(),
              content: JSON.stringify(denied).slice(0, 500),
              metadata: { toolId: tc.toolId },
            });
            continue;
          }

          try {
            const result = await this.deps.executeTool(tc.toolId, tc.args);
            previousToolResults.push({
              toolId: tc.toolId,
              args: tc.args,
              result,
            });
            yield { type: 'tool_result', toolId: tc.toolId, result };
            trajectorySteps.push({
              type: 'tool_result',
              timestamp: Date.now(),
              content: JSON.stringify(result).slice(0, 500),
              metadata: { toolId: tc.toolId },
            });
          } catch (toolErr) {
            const message = toolErr instanceof Error ? toolErr.message : String(toolErr);
            const result = { error: message };
            previousToolResults.push({
              toolId: tc.toolId,
              args: tc.args,
              result,
            });
            yield { type: 'tool_result', toolId: tc.toolId, result };
            trajectorySteps.push({
              type: 'tool_result',
              timestamp: Date.now(),
              content: JSON.stringify(result).slice(0, 500),
              metadata: { toolId: tc.toolId },
            });
          }
        }

        // If the model only emitted tools (no text), drop any partial tool-status noise
        // before the follow-up answer. Keep text that already streamed to the user.
        if (!roundText.trim() && toolRound === 0) {
          fullResponse = '';
        }

        toolRound += 1;
        // One extra streaming round when the LAST allowed iteration produced tools.
        if (toolRound >= maxToolRounds && previousToolResults.length > 0) {
          extraFinalRound = true;
        }
      }

      yield usage
        ? { type: 'streaming_done', usage }
        : { type: 'streaming_done' };

      // 3.5 ALGORITHM #8 — HALLUCINATION RISK COMPASS
      // Assess the just-completed answer from grounding signals. Hosts wire
      // retrievalConfidence / sourceCoverage / hasSources via getRiskSignals;
      // the engine always contributes uncertainty markers + answer length.
      try {
        const hostSignals: Partial<RiskSignals> =
          this.deps.getRiskSignals
            ? await Promise.resolve(this.deps.getRiskSignals(input, fullResponse)).catch(() => ({}))
            : {};
        const completionTokens = usage?.completionTokens ?? Math.ceil(fullResponse.length / 4);
        const assessment: RiskAssessment = assessHallucinationRisk({
          retrievalConfidence: hostSignals.retrievalConfidence ?? 0.5,
          sourceCoverage: hostSignals.sourceCoverage ?? 0.5,
          hasSources: hostSignals.hasSources ?? false,
          uncertaintyMarkers: countUncertaintyMarkers(fullResponse),
          answerLength: completionTokens,
          groundedOnly: hostSignals.groundedOnly ?? contract.scope.type === 'source_hard',
        });
        yield { type: 'risk_assessment', assessment };
        trajectorySteps.push({
          type: 'risk_assessment',
          timestamp: Date.now(),
          content: `${assessment.band} (${assessment.score.toFixed(2)}): ${assessment.flags.join(', ')}`,
        });
      } catch {
        // Risk assessment is best-effort — never fail the turn on it.
      }

      // 4. PERSIST
      const turnId = await this.deps.persistTurn(input, fullResponse, usage);
      yield { type: 'done', turnId };

      // 5. TRAJECTORY — emit after 'done' so consumers can capture without blocking main flow
      const durationMs = Date.now() - startTime;
      trajectorySteps.push({
        type: 'generation',
        timestamp: Date.now(),
        content: fullResponse,
      });
      const trajectory: TurnTrajectory = {
        turnId,
        sessionId: input.sessionId ?? 'unknown',
        agentId: input.agentId ?? 'general',
        surface: input.surface,
        input: {
          text: input.text,
          ...(input.attachments ? { attachments: input.attachments } : {}),
        },
        steps: trajectorySteps,
        output: fullResponse,
        ...(usage ? { usage } : {}),
        toolRounds: toolRound,
        durationMs,
        createdAt: new Date().toISOString(),
      };
      yield { type: 'trajectory', trajectory };

      // Fire-and-forget persistence (if wired)
      if (this.deps.persistTrajectory) {
        this.deps.persistTrajectory(trajectory).catch(() => {
          // Silently ignore persistence failures — trajectory is diagnostic-only
        });
      }

      // 6. GENERATE ARTIFACT — fire a separate LLM call to build the document.
      // Runs after 'done' so the UI renders the chat message first, then the artifact card.
      if (docMakerFormat && this.deps.generateArtifact) {
        try {
          const artifact = await this.deps.generateArtifact(input, docMakerFormat);
          if (artifact) {
            yield {
              type: 'artifact_generated',
              artifact: {
                title: artifact.title,
                format: artifact.format,
                ...(artifact.uri !== undefined ? { uri: artifact.uri } : {}),
                ...(artifact.preview !== undefined ? { preview: artifact.preview } : {}),
                ...(artifact.needsReview !== undefined ? { needsReview: artifact.needsReview } : {}),
              },
            };
          }
        } catch {
          // Artifact generation is best-effort — never fail the chat turn
        }
      }

      // 7. EXTRACT MEMORY — skip when agent memoryScope is 'none'
      if (agentMemoryScope !== 'none') {
        yield { type: 'extracting_memory' };
        try {
          await this.deps.extractMemory(input, fullResponse);
        } catch {
          // extractMemory failure must not surface as an error after 'done'
          // was already emitted (trajectory/artifact depend on done-first).
        }

        if (this.deps.detectAndPromoteCorrections) {
          this.deps.detectAndPromoteCorrections(input, fullResponse).catch(() => {});
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = !message.includes('abort') && !message.includes('cancelled');
      yield { type: 'error', error: message, retryable };
    }
  }

  /**
   * ToolPlanner mount check + PermissionGate risk check.
   * Returns an error result object if the call must not run; null if allowed.
   */
  private gateToolCall(
    toolId: string,
    contract: SurfaceContract,
    toolPlan: ToolPlan | null,
    sessionId: string | undefined,
    agentMaxRisk?: 'read' | 'local-write' | 'external-write' | 'destructive',
  ): { error: string } | null {
    const family = this.toolPlanner.familyOf(toolId);
    if (toolPlan && !toolPlan.allowedToolIds.includes(toolId)) {
      // Catalog-mounted tools stay fail-closed on the wrong surface.
      // Host-registry ids (desktop Rust ToolRegistry: file_ops.read, …)
      // are not in FAMILY_TO_TOOLS — the host executeTool is the authority.
      if (family) {
        return {
          error: `Tool not allowed on ${contract.surface} surface: ${toolId}`,
        };
      }
    }

    if (!family) {
      return null;
    }

    const toolRisk = FAMILY_DEFAULT_RISKS[family] ?? FALLBACK_TOOL_RISK;

    // Enforce agent maxRisk: compare tool's actual family risk vs agent's limit
    if (agentMaxRisk) {
      const toolRiskIdx = RISK_ORDER.indexOf(toolRisk);
      const agentRiskIdx = RISK_ORDER.indexOf(agentMaxRisk);
      if (toolRiskIdx > agentRiskIdx) {
        return {
          error: `Agent risk limit (${agentMaxRisk}) prohibits tool: ${toolId} (requires ${toolRisk})`,
        };
      }
    }

    // PermissionGate risk must be the tool's real family risk — not the agent max.
    // read → auto-grant
    // local-write → NO blanket auto-approval (fix #23): create_automation /
    // create_docx must not run with zero confirmation from chat. The gate
    // grants only when the user/UI explicitly approved the risk for this
    // session (approveRiskForSession) or the surface contract requires the
    // write (automation runs carry their own pre-approved flow).
    // external-write / destructive → always require confirmation.
    const sid = sessionId ?? 'default';
    let sessionApproved = false;
    if (toolRisk === 'read') {
      sessionApproved = true;
    } else if (toolRisk === 'local-write') {
      // Deliberately NOT calling approveForSession here — session approval
      // must be an explicit user/UI action, not an implicit engine grant.
      sessionApproved = false;
    }

    const gate = this.permissionGate.evaluate(
      contract.surface,
      family,
      toolRisk,
      sid,
      sessionApproved,
    );
    if (!gate.granted) {
      if (gate.requiresConfirmation) {
        return {
          error: `Permission required (${gate.confirmationKind ?? 'confirm'}) for ${toolId}`,
        };
      }
      return { error: `Permission denied for ${toolId}` };
    }

    return null;
  }
}
