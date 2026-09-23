import { describe, it, expect, vi } from 'vitest';
import { ConversationEngine, type EngineDeps, type TurnTrajectory } from '../index';

const mockDeps: EngineDeps = {
  generatePrompt: async () => 'mock prompt',
  streamProvider: async function* () {
    yield { type: 'text', text: 'Hello from engine!' };
    yield { type: 'done' };
  },
  persistTurn: async () => 'turn-1',
  extractMemory: async () => {},
};

describe('trajectory logging', () => {
  it('emits trajectory event after done', async () => {
    const engine = new ConversationEngine(mockDeps);
    const eventTypes: string[] = [];
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      eventTypes.push(event.type);
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    // trajectory is the last event before extracting_memory (or before done if that's last)
    const doneIdx = eventTypes.indexOf('done');
    const trajIdx = eventTypes.indexOf('trajectory');
    expect(doneIdx).toBeGreaterThanOrEqual(0);
    expect(trajIdx).toBeGreaterThanOrEqual(0);
    expect(trajIdx).toBeGreaterThan(doneIdx);
    expect(trajectory).toBeDefined();
    expect(trajectory!.output).toBe('Hello from engine!');
    expect(trajectory!.input.text).toBe('hi');
  });

  it('includes generation step with full output', async () => {
    const engine = new ConversationEngine(mockDeps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'hello', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    const generationSteps = trajectory!.steps.filter((s) => s.type === 'generation');
    expect(generationSteps).toHaveLength(1);
    expect(generationSteps[0]!.content).toBe('Hello from engine!');
  });

  it('records reasoning steps in order', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      streamProvider: async function* () {
        yield { type: 'reasoning', text: 'thinking step 1' };
        yield { type: 'reasoning', text: 'thinking step 2' };
        yield { type: 'text', text: 'final answer' };
        yield { type: 'done' };
      },
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'q', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    const reasoningSteps = trajectory!.steps.filter((s) => s.type === 'reasoning');
    expect(reasoningSteps).toHaveLength(2);
    expect(reasoningSteps[0]!.content).toBe('thinking step 1');
    expect(reasoningSteps[1]!.content).toBe('thinking step 2');
  });

  it('records tool_call and tool_result steps with metadata', async () => {
    const deps: EngineDeps = {
      generatePrompt: async () => 'prompt',
      streamProvider: async function* (_p, _s, extras) {
        const round = extras?.toolRound ?? 0;
        if (round === 0) {
          yield { type: 'tool_call', id: 'search_web', args: { query: 'weather' } };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text', text: 'sunny' };
        yield { type: 'done' };
      },
      executeTool: async () => ({ temp: 25 }),
      persistTurn: async () => 'turn-tool',
      extractMemory: async () => {},
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'weather?', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    const toolCallSteps = trajectory!.steps.filter((s) => s.type === 'tool_call');
    const toolResultSteps = trajectory!.steps.filter((s) => s.type === 'tool_result');

    expect(toolCallSteps).toHaveLength(1);
    expect(toolCallSteps[0]!.content).toBe('search_web');
    expect(toolCallSteps[0]!.metadata).toEqual({ args: { query: 'weather' } });

    expect(toolResultSteps).toHaveLength(1);
    expect(toolResultSteps[0]!.metadata).toEqual({ toolId: 'search_web' });
  });

  it('measures duration correctly', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      streamProvider: async function* () {
        yield { type: 'text', text: 'slow response' };
        yield { type: 'done' };
      },
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;
    const t0 = Date.now();

    for await (const event of engine.run({ text: 'slow', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    const elapsed = Date.now() - t0;
    expect(trajectory).toBeDefined();
    // Duration can be 0ms on extremely fast test runs; the important invariant
    // is that it is measured consistently and does not exceed wall-clock time.
    expect(trajectory!.durationMs).toBeGreaterThanOrEqual(0);
    expect(trajectory!.durationMs).toBeLessThanOrEqual(elapsed + 100);
  });

  it('includes usage when provided', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      streamProvider: async function* () {
        yield { type: 'text', text: 'hello' };
        yield { type: 'done', usage: { promptTokens: 10, completionTokens: 5 } };
      },
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    expect(trajectory!.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('does not emit trajectory on error', async () => {
    const failingDeps: EngineDeps = {
      ...mockDeps,
      generatePrompt: async () => {
        throw new Error('prompt fail');
      },
    };
    const engine = new ConversationEngine(failingDeps);
    const eventTypes: string[] = [];

    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      eventTypes.push(event.type);
    }

    expect(eventTypes).toContain('error');
    expect(eventTypes).not.toContain('trajectory');
  });

  it('calls persistTrajectory when wired', async () => {
    const persistFn = vi.fn().mockResolvedValue(undefined);
    const deps: EngineDeps = {
      ...mockDeps,
      persistTrajectory: persistFn,
    };
    const engine = new ConversationEngine(deps);

    for await (const _event of engine.run({ text: 'hi', surface: 'chat' })) {
      /* drain */
    }

    expect(persistFn).toHaveBeenCalledTimes(1);
    const calledWith = persistFn.mock.calls[0]![0] as TurnTrajectory;
    expect(calledWith.output).toBe('Hello from engine!');
    expect(calledWith.input.text).toBe('hi');
  });

  it('includes turnId from persistTurn in trajectory', async () => {
    const deps: EngineDeps = {
      ...mockDeps,
      persistTurn: async () => 'my-turn-42',
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'hi', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    expect(trajectory!.turnId).toBe('my-turn-42');
  });

  it('captures toolRounds count', async () => {
    const deps: EngineDeps = {
      generatePrompt: async () => 'p',
      streamProvider: async function* (_p, _s, extras) {
        const round = extras?.toolRound ?? 0;
        if (round === 0) {
          yield { type: 'tool_call', id: 'get_current_time', args: {} };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text', text: 'done' };
        yield { type: 'done' };
      },
      executeTool: async () => ({ now: 'ok' }),
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };
    const engine = new ConversationEngine(deps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({ text: 'loop', surface: 'chat' })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    expect(trajectory!.toolRounds).toBe(1);
  });

  it('sets sessionId and agentId from input', async () => {
    const engine = new ConversationEngine(mockDeps);
    let trajectory: TurnTrajectory | undefined;

    for await (const event of engine.run({
      text: 'hi',
      surface: 'reader',
      sessionId: 'sess-007',
      agentId: 'agent-bond',
    })) {
      if (event.type === 'trajectory') {
        trajectory = event.trajectory;
      }
    }

    expect(trajectory!.sessionId).toBe('sess-007');
    expect(trajectory!.agentId).toBe('agent-bond');
    expect(trajectory!.surface).toBe('reader');
  });
});
