import type { Scope } from '@personal-ai/core-domain';
import type { SurfaceContract } from '../types';

export interface RetrievalPlan {
  scope: Scope;
  maxResults: number;
  includeWeb: boolean;
  includeMemory: boolean;
  includeConnectors: boolean;
}

export class RetrievalPlanner {
  plan(
    contract: SurfaceContract,
    input: { includeWeb?: boolean; includeMemory?: boolean; scopeFileIds?: string[]; openDocumentId?: string; projectId?: string },
    agentWebAccess?: boolean,
    agentMemoryScope?: 'full' | 'project' | 'none',
  ): RetrievalPlan {
    let scope: Scope = { type: 'none' };

    if (contract.surface === 'reader' && input.openDocumentId) {
      scope = { type: 'source_hard', sourceId: input.openDocumentId };
    } else if (input.projectId) {
      // Project-scoped retrieval: restrict file search to project sources.
      // Agent memoryScope: 'project' also scopes memory to project_id.
      scope = { type: 'project', projectId: input.projectId };
    } else if (input.scopeFileIds && input.scopeFileIds.length > 0) {
      scope = { type: 'sources', sourceIds: input.scopeFileIds };
    }

    // Hard gate: agent webAccess: false blocks web even if surface allows it
    const surfaceAllowsWeb = input.includeWeb ?? contract.toolMounts.includes('knowledge');
    const includeWeb = agentWebAccess === false ? false : surfaceAllowsWeb;

    // Hard gate: agent memoryScope: 'none' blocks memory even if surface allows it
    const surfaceAllowsMemory = input.includeMemory ?? true;
    const includeMemory = agentMemoryScope === 'none' ? false : surfaceAllowsMemory;

    return {
      scope,
      maxResults: 8,
      includeWeb,
      includeMemory,
      includeConnectors: false,
    };
  }
}
