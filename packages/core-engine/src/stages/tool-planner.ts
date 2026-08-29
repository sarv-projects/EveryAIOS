import type { ToolFamily } from '../types';
import type { SurfaceContract } from '../types';
import type { RetrievalPlan } from './retrieval-planner';

/** Canonical tool ids per family — single source for plan() and familyOf(). */
export const FAMILY_TO_TOOLS: Record<ToolFamily, readonly string[]> = {
  knowledge: [
    'search_local_files',
    'search_current_project',
    'search_chat_history',
    'read_memory',
    'propose_memory',
    'search_web',
    'fetch_web_page',
  ],
  reader: [
    'search_current_document',
    'get_document_page',
    'create_highlight',
    'create_note',
    'extract_table',
    'translate_selection',
    'explain_selection',
  ],
  automations: ['draft_automation', 'create_automation', 'run_automation', 'list_automations', 'schedule_automation'],
  creation: ['create_markdown', 'create_docx', 'create_pdf', 'export_chat'],
  system: ['get_device_status', 'get_current_time', 'request_permission', 'open_full_app'],
};

export interface ToolPlan {
  mountedFamilies: ToolFamily[];
  allowedToolIds: string[];
}

export class ToolPlanner {
  plan(
    contract: SurfaceContract,
    _retrievalPlan: RetrievalPlan,
    agentToolIds?: string[],
  ): ToolPlan {
    let allowedToolIds: string[] = [];
    for (const family of contract.toolMounts) {
      const tools = FAMILY_TO_TOOLS[family];
      if (tools) allowedToolIds.push(...tools);
    }

    // Intersect with agent sandbox toolIds if provided (enforce per-agent tool access)
    if (agentToolIds && agentToolIds.length > 0) {
      allowedToolIds = allowedToolIds.filter((id) => agentToolIds.includes(id));
    }

    return { mountedFamilies: [...contract.toolMounts], allowedToolIds };
  }

  /** Resolve which tool family owns a tool id, if any. */
  familyOf(toolId: string): ToolFamily | undefined {
    for (const family of Object.keys(FAMILY_TO_TOOLS) as ToolFamily[]) {
      if (FAMILY_TO_TOOLS[family].includes(toolId)) return family;
    }
    return undefined;
  }
}
