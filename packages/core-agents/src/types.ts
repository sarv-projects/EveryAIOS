import type { RiskLevel } from '@personal-ai/core-tools';

export type MemoryScope = 'full' | 'project' | 'none';

export interface AgentDefinition {
  id: string;
  name: string;
  icon: string;
  instructions: string;
  toolIds: string[];
  maxRisk: RiskLevel;
  webAccess: boolean;
  memoryScope: MemoryScope;
  preferredModel: string[];
  maxToolCallsPerTurn: number;
  maxCreditsPerRun?: number;
  outputSchema?: Record<string, unknown>;
}

export interface AgentRepository {
  get(id: string): Promise<AgentDefinition | null>;
  list(): Promise<AgentDefinition[]>;
  save(agent: AgentDefinition): Promise<void>;
  delete(id: string): Promise<void>;
}
