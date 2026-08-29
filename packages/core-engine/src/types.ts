import { Scope } from '@personal-ai/core-domain';
import type { RiskLevel } from '@personal-ai/core-tools';

export type { Scope };
export type SurfaceKind = 'chat' | 'reader' | 'bubble' | 'automation';
export type ToolFamily = 'knowledge' | 'reader' | 'automations' | 'creation' | 'system';

/**
 * Agent sandbox definition — enforced at runtime by ToolPlanner, RetrievalPlanner,
 * PermissionGate, and the tool-loop cap in ConversationEngine.
 *
 * Resolved from core-agents by create-engine-deps.ts (the live app wiring).
 */
export interface AgentSandbox {
  toolIds: string[];
  maxRisk: RiskLevel;
  webAccess: boolean;
  memoryScope: 'full' | 'project' | 'none';
  maxToolCallsPerTurn: number;
}

export interface SurfaceContract {
  surface: SurfaceKind;
  scope: Scope;
  toolMounts: ToolFamily[];
  maxOutputTokens: number;
  allowArtifacts: boolean;
  allowMemoryWrites: boolean;
  uiCapabilities: {
    citationsInline: boolean;
    followupChips: boolean;
    streaming: boolean;
  };
  /** Automation-specific: max tool calls per run */
  maxToolCalls?: number;
  /** Automation-specific: estimated cost in credits */
  estimatedCost?: number;
}

export interface TurnInput {
  text: string;
  attachments?: string[];
  /** Image attachments for vision routing — backend handles vision pool */
  images?: Array<{ uri: string; mimeType: string; base64?: string; width?: number; height?: number }>;
  surface: SurfaceKind;
  sessionId?: string;
  projectId?: string;
  agentId?: string;
  styleId?: string;
  scopeFileIds?: string[];
  includeMemory?: boolean;
  includeWeb?: boolean;
  openDocumentId?: string;
  /** Automation-specific: ID of the automation being run */
  automationId?: string;
  /** Automation-specific: run ID for tracking */
  runId?: string;
}
