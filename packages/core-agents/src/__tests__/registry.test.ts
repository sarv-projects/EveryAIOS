import { describe, expect, it } from 'vitest';
import { SHIPPED_AGENTS, createAgentRepository } from '../registry.js';

const EXPECTED_OVERLAY_IDS = new Set(['general', 'research', 'reader', 'writer', 'planner', 'code', 'docmaker', 'summarizer']);

describe('SHIPPED_AGENTS registry', () => {
  it('contains every id that exists in the core-ai AGENT_CATALOG overlay', () => {
    const shippedIds = new Set(SHIPPED_AGENTS.map((a) => a.id));
    const missing: string[] = [];
    for (const id of EXPECTED_OVERLAY_IDS) {
      if (!shippedIds.has(id)) missing.push(id);
    }
    expect(missing).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = SHIPPED_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each shipped agent has the required metadata', () => {
    for (const agent of SHIPPED_AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.toolIds).toBeInstanceOf(Array);
      expect(agent.maxRisk).toBeTruthy();
    }
  });

  it('exposes a get/list API', () => {
    const repo = createAgentRepository();
    expect(repo.get).toBeDefined();
    expect(repo.list).toBeDefined();
  });
});
