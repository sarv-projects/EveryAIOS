/**
 * Canonical request plan — the single internal schema for all provider adapters.
 * Provider adapters consume this but must not independently invent system rules,
 * reorder sources, add tools, change memory policy, or decide citation behaviour.
 *
 * Part of the model-agnostic prompt orchestration system (spec §6.5-6.6).
 */

export type AssistantRequestPlan = {
  requestId: string;
  conversationId: string;
  turnId: string;

  privacyMode: 'local' | 'managed' | 'byok';
  modelMode: 'fast' | 'smart' | 'user_selected';

  task: {
    kind:
      | 'chat'
      | 'explain'
      | 'write'
      | 'summarize'
      | 'document_qa'
      | 'research'
      | 'plan'
      | 'code'
      | 'automation_setup';
    depth: 'quick' | 'standard' | 'detailed';
    outputFormat: 'prose' | 'structured' | 'table' | 'json' | 'artifact';
    language: string;
    style: 'straight_shooter' | 'warm_coach' | 'terse';
  };

  scope: {
    mode: 'none' | 'attachments' | 'reader' | 'project';
    allowedSourceIds: string[];
    citationRequired: boolean;
    retrievalRequired: boolean;
  };

  input: {
    hasImages: boolean;
    hasScannedPages: boolean;
    hasAudio: boolean;
    hasVideo: boolean;
  };

  context: {
    stablePrefixVersion: string;
    systemPolicy: string;
    personaOverlay: string | null;
    approvedMemory: ContextBlock[];
    conversation: CanonicalMessage[];
    retrievedSources: SourceBlock[];
    toolResults: ToolResultBlock[];
  };

  controls: {
    maxOutputTokens: number;
    maxCreditCost: number;
    allowWeb: boolean;
    allowedTools: string[];
    allowedConnectorScopes: string[];
    requireWriteConfirmation: boolean;
    requireStructuredOutput: boolean;
  };
};

export type ContextBlock = {
  id: string;
  kind: 'memory' | 'project' | 'reader_scope';
  content: string;
};

export type CanonicalMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  sourceIds?: string[];
};

export type SourceBlock = {
  id: string;
  type: 'file' | 'web' | 'memory' | 'kg' | 'connector' | 'vision';
  label: string;
  excerpt: string;
  /** Page/region reference for citations */
  pageRef?: string;
};

export type ToolResultBlock = {
  toolId: string;
  result: string;
  success: boolean;
};