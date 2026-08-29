import { describe, it, expect } from 'vitest';
import {
  ConversationEngine,
  ToolPlanner,
  PermissionGate,
  FAMILY_TO_TOOLS,
  type EngineDeps,
  type StreamProviderExtras,
} from '../index';

const mockDeps: EngineDeps = {
  generatePrompt: async () => 'mock prompt',
  streamProvider: async function* () {
    yield { type: 'text', text: 'Hello from engine!' };
    yield { type: 'done' };
  },
  persistTurn: async () => 'turn-1',
  extractMemory: async () => {},
};

describe('ConversationEngine', () => {
  it('streams tokens from a chat turn', async () => {
    const engine = new ConversationEngine(mockDeps);
    const events: string[] = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      events.push(event.type);
      if (event.type === 'token') {
        expect(event.text).toBe('Hello from engine!');
      }
    }
    expect(events).toContain('compiling');
    expect(events).toContain('routed');
    expect(events).toContain('streaming_start');
    expect(events).toContain('token');
    expect(events).toContain('streaming_done');
    expect(events).toContain('done');
  });

  it('yields error on stream failure', async () => {
    const failingDeps: EngineDeps = {
      ...mockDeps,
      generatePrompt: async () => {
        throw new Error('prompt fail');
      },
    };
    const engine = new ConversationEngine(failingDeps);
    const events: string[] = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      events.push(event.type);
    }
    expect(events).toContain('error');
  });

  it('respects reader surface', async () => {
    const engine = new ConversationEngine(mockDeps);
    const events: string[] = [];
    for await (const event of engine.run({
      text: 'q',
      surface: 'reader',
      openDocumentId: 'doc-1',
    })) {
      events.push(event.type);
    }
    expect(events).toContain('routed');
  });

  it('executes tools then re-streams with tool results', async () => {
    const executed: string[] = [];
    const rounds: number[] = [];
    const deps: EngineDeps = {
      generatePrompt: async () => 'tool prompt',
      streamProvider: async function* (_prompt, _signal, extras) {
        const round = extras?.toolRound ?? 0;
        rounds.push(round);
        if (round === 0) {
          expect(extras?.allowedToolIds).toContain('search_web');
          yield {
            type: 'tool_call',
            id: 'search_web',
            args: { query: 'weather' },
          };
          yield { type: 'done' };
          return;
        }
        expect(extras?.previousToolResults?.[0]?.toolId).toBe('search_web');
        expect(extras?.previousToolResults?.[0]?.result).toEqual({ ok: true });
        yield { type: 'text', text: 'Based on the tool: sunny' };
        yield { type: 'done' };
      },
      executeTool: async (toolId) => {
        executed.push(toolId);
        return { ok: true };
      },
      persistTurn: async (_input, response) => {
        expect(response).toBe('Based on the tool: sunny');
        return 'turn-tool';
      },
      extractMemory: async () => {},
    };

    const engine = new ConversationEngine(deps);
    const events: string[] = [];
    let finalText = '';
    for await (const event of engine.run({ text: 'weather?', surface: 'chat' })) {
      events.push(event.type);
      if (event.type === 'token') finalText += event.text;
      if (event.type === 'tool_result') {
        expect(event.toolId).toBe('search_web');
      }
    }

    expect(executed).toEqual(['search_web']);
    expect(rounds).toEqual([0, 1]);
    expect(events).toContain('tool_call');
    expect(events).toContain('tool_result');
    expect(finalText).toBe('Based on the tool: sunny');
    expect(events).toContain('streaming_done');
    expect(events).toContain('done');
  });

  it('stops tool loop without executeTool and still completes', async () => {
    const deps: EngineDeps = {
      generatePrompt: async () => 'p',
      streamProvider: async function* () {
        yield { type: 'tool_call', id: 'search_web', args: {} };
        yield { type: 'text', text: 'partial' };
        yield { type: 'done' };
      },
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };
    const engine = new ConversationEngine(deps);
    const events: string[] = [];
    for await (const event of engine.run({ text: 'x', surface: 'chat' })) {
      events.push(event.type);
    }
    expect(events).toContain('tool_call');
    expect(events).not.toContain('tool_result');
    expect(events).toContain('done');
  });

  it('denies tools not mounted on the surface (ToolPlanner)', async () => {
    const executed: string[] = [];
    const deps: EngineDeps = {
      generatePrompt: async () => 'p',
      streamProvider: async function* (_p, _s, extras: StreamProviderExtras | undefined) {
        const round = extras?.toolRound ?? 0;
        if (round === 0) {
          // reader-only tool on chat surface
          yield {
            type: 'tool_call',
            id: 'search_current_document',
            args: { q: 'x' },
          };
          yield { type: 'done' };
          return;
        }
        const denied = extras?.previousToolResults?.[0]?.result as { error?: string };
        expect(denied?.error).toMatch(/not allowed on chat/);
        yield { type: 'text', text: 'cannot use that tool' };
        yield { type: 'done' };
      },
      executeTool: async (toolId) => {
        executed.push(toolId);
        return { ok: true };
      },
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };

    const engine = new ConversationEngine(deps);
    const results: unknown[] = [];
    for await (const event of engine.run({ text: 'x', surface: 'chat' })) {
      if (event.type === 'tool_result') results.push(event.result);
    }

    expect(executed).toEqual([]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      error: expect.stringContaining('not allowed on chat'),
    });
  });

  it('allows host-registry tool ids that are not in FAMILY_TO_TOOLS', async () => {
    const executed: string[] = [];
    const deps: EngineDeps = {
      generatePrompt: async () => 'p',
      streamProvider: async function* (_p, _s, extras: StreamProviderExtras | undefined) {
        const round = extras?.toolRound ?? 0;
        if (round === 0) {
          yield {
            type: 'tool_call',
            id: 'file_ops.read',
            args: { path: 'a.txt' },
          };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text', text: 'ok' };
        yield { type: 'done' };
      },
      executeTool: async (toolId) => {
        executed.push(toolId);
        return { body: 'x' };
      },
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };
    const engine = new ConversationEngine(deps);
    for await (const _ of engine.run({ text: 'x', surface: 'chat' })) {
      /* drain */
    }
    expect(executed).toEqual(['file_ops.read']);
  });

  it('caps multi-round tool loop at MAX_TOOL_ROUNDS', async () => {
    const rounds: number[] = [];
    const deps: EngineDeps = {
      generatePrompt: async () => 'p',
      streamProvider: async function* (_p, _s, extras) {
        const round = extras?.toolRound ?? 0;
        rounds.push(round);
        // Always request another tool → loop until cap
        yield {
          type: 'tool_call',
          id: 'get_current_time',
          args: {},
        };
        yield { type: 'done' };
      },
      executeTool: async () => ({ now: 'ok' }),
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };

    const engine = new ConversationEngine(deps);
    for await (const _ of engine.run({ text: 'loop', surface: 'chat' })) {
      /* drain */
    }

    // Rounds 0..4 inclusive = 5 model calls (MAX_TOOL_ROUNDS)
    expect(rounds).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('#8 Hallucination Risk Compass — live engine path', () => {
  it('emits risk_assessment with grounded signals → LOW band', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      getRiskSignals: async () => ({
        retrievalConfidence: 0.92,
        sourceCoverage: 0.9,
        hasSources: true,
      }),
    };
    const engine = new ConversationEngine(deps);
    const assessments: Array<{ band: string; score: number }> = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      if (event.type === 'risk_assessment') {
        assessments.push({ band: event.assessment.band, score: event.assessment.score });
      }
    }
    expect(assessments).toHaveLength(1);
    expect(assessments[0]!.band).toBe('low');
    // Low band is score < 0.35; strong grounding (0.92/0.9/hasSources) minus
    // the short-answer penalty lands ~0.26 — comfortably low.
    expect(assessments[0]!.score).toBeLessThan(0.35);
  });

  it('emits risk_assessment with no grounding signals → HIGH band', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      getRiskSignals: async () => ({
        retrievalConfidence: 0.05,
        sourceCoverage: 0.0,
        hasSources: false,
      }),
    };
    const engine = new ConversationEngine(deps);
    const assessments: Array<{ band: string; score: number }> = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      if (event.type === 'risk_assessment') {
        assessments.push({ band: event.assessment.band, score: event.assessment.score });
      }
    }
    expect(assessments).toHaveLength(1);
    expect(assessments[0]!.band).toBe('high');
    expect(assessments[0]!.score).toBeGreaterThan(0.6);
  });

  it('does not emit risk_assessment when deps omit getRiskSignals? — it does, with defaults', async () => {
    const engine = new ConversationEngine(mockDeps);
    const types: string[] = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      types.push(event.type);
    }
    // Risk assessment is best-effort and always emitted (defaults 0.5/0.5/false)
    expect(types).toContain('risk_assessment');
  });

  it('risk signal failure never fails the turn (best-effort)', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      getRiskSignals: async () => {
        throw new Error('boom');
      },
    };
    const engine = new ConversationEngine(deps);
    const types: string[] = [];
    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      types.push(event.type);
    }
    expect(types).toContain('done');
    expect(types).not.toContain('error');
  });
});

describe('stage scaffolds', () => {
  it('exports ToolPlanner and PermissionGate from package root', () => {
    const planner = new ToolPlanner();
    const gate = new PermissionGate();
    expect(planner.familyOf('search_web')).toBe('knowledge');
    expect(FAMILY_TO_TOOLS.system).toContain('get_current_time');
    const result = gate.evaluate('chat', 'knowledge', 'read', 'sess-1', false);
    expect(result.granted).toBe(true);
  });
});
