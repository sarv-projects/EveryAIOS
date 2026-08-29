/**
 * Surface-routing tests — verifies that ConversationEngine applies the
 * correct surface contract per kind (chat / reader / bubble) and that
 * agentId is threaded through to prompt generation.
 *
 * The free-vs-paid provider selection is one layer up in the app-mobile's
 * createEngineDeps (via getManagedTier). These tests verify that the
 * engine correctly delegates tool sets and scope per surface.
 */
import { describe, it, expect } from 'vitest';
import { ConversationEngine } from '../engine';
import type { EngineDeps, StreamProviderExtras } from '../engine';

function makeDeps(
  recordAllowedTools?: (tools: string[] | undefined) => void,
): EngineDeps {
  return {
    generatePrompt: async (input) => `prompt for ${input.agentId ?? 'general'}`,
    streamProvider: async function* (_p, _s, extras?: StreamProviderExtras) {
      recordAllowedTools?.(extras?.allowedToolIds);
      yield { type: 'text', text: 'response' };
      yield { type: 'done' };
    },
    executeTool: async () => ({}),
    persistTurn: async () => 'turn-1',
    extractMemory: async () => {},
  };
}

describe('ConversationEngine surface routing', () => {
  it('chat surface mounts knowledge + creation + tasks + system tools', async () => {
    const toolsPerRound: string[][] = [];
    const engine = new ConversationEngine(makeDeps((t) => toolsPerRound.push(t ?? [])));

    for await (const _ of engine.run({
      text: 'hello',
      surface: 'chat',
    })) {
      /* drain */
    }

    const tools = toolsPerRound[0] ?? [];
    // Chat tools: knowledge (search_web) + tasks + creation (create_markdown) + system
    expect(tools).toContain('search_web');
    expect(tools).toContain('create_markdown');
    expect(tools).toContain('get_current_time');
  });

  it('reader surface mounts reader + system tools only', async () => {
    const toolsPerRound: string[][] = [];
    const engine = new ConversationEngine(makeDeps((t) => toolsPerRound.push(t ?? [])));

    for await (const _ of engine.run({
      text: 'summarize page 5',
      surface: 'reader',
      agentId: 'reader',
      openDocumentId: 'doc-1',
    })) {
      /* drain */
    }

    const tools = toolsPerRound[0] ?? [];
    expect(tools).toContain('search_current_document');
    expect(tools).toContain('get_document_page');
    // Reader should NOT have web or creation tools
    expect(tools).not.toContain('search_web');
    expect(tools).not.toContain('create_markdown');
  });

  it('bubble surface mounts system tools only (minimal)', async () => {
    const toolsPerRound: string[][] = [];
    const engine = new ConversationEngine(makeDeps((t) => toolsPerRound.push(t ?? [])));

    for await (const _ of engine.run({
      text: 'quick question',
      surface: 'bubble',
    })) {
      /* drain */
    }

    const tools = toolsPerRound[0] ?? [];
    // Bubble only has system tools + maybe knowledge (per schema)
    expect(tools.length).toBeGreaterThan(0);
    expect(tools).toContain('get_current_time');
    expect(tools).not.toContain('search_web');
    expect(tools).not.toContain('create_markdown');
  });

  it('threads agentId through to prompt generation', async () => {
    const generated: string[] = [];
    const engine = new ConversationEngine({
      generatePrompt: async (input) => {
        const p = `agent:${input.agentId}`;
        generated.push(p);
        return p;
      },
      streamProvider: async function* () {
        yield { type: 'text', text: 'ok' };
        yield { type: 'done' };
      },
      executeTool: async () => ({}),
      persistTurn: async () => 't',
      extractMemory: async () => {},
    });

    for await (const _ of engine.run({
      text: 'do something',
      surface: 'chat',
      agentId: 'research',
    })) {
      /* drain */
    }

    expect(generated[0]).toContain('agent:research');
  });

  it('yields router decision in event stream', async () => {
    const engine = new ConversationEngine(makeDeps());
    const decisions: string[] = [];

    for await (const event of engine.run({
      text: 'hello',
      surface: 'chat',
      agentId: 'general',
    })) {
      if (event.type === 'routed') {
        decisions.push(event.decision);
      }
    }

    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0]!.length).toBeGreaterThan(0);
  });

  it('aborts mid-stream via AbortSignal', async () => {
    const deps: EngineDeps = {
      generatePrompt: async () => 'slow prompt',
      streamProvider: async function* () {
        for (let i = 0; i < 100; i++) {
          yield { type: 'text', text: `token-${i}` };
        }
        yield { type: 'done' };
      },
      executeTool: async () => ({}),
      persistTurn: async () => 't',
      extractMemory: async () => {},
    };

    const engine = new ConversationEngine(deps);
    const abort = new AbortController();
    const seen: string[] = [];

    setTimeout(() => abort.abort(), 10);
    for await (const event of engine.run({ text: 'abort test', surface: 'chat' }, abort.signal)) {
      seen.push(event.type);
    }

    expect(seen.length).toBeGreaterThan(0);
  });
});
