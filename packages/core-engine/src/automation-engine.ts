/**
 * ConversationEngine-lite — Lightweight engine for automation runs.
 *
 * Subset of the full ConversationEngine:
 * - No streaming (batch response)
 * - Subset of tools (no UI-only tools)
 * - Fixed token budget per tier
 * - surface = 'automation'
 * - Credit tracking per run
 *
 * Used by:
 * - Local runner (free tier, app alive)
 * - Server dispatcher (paid tier, phone off)
 */
import type { SurfaceContract, TurnInput } from './types';

export type AutomationRunInput = {
  prompt: string;
  surface: 'automation';
  agentId?: string;
  scopeFileIds?: string[];
  includeMemory?: boolean;
  includeWeb?: boolean;
};

export type AutomationRunResult = {
  output: string;
  tokenCount: number;
  estimatedCost: number;
  toolCalls: number;
  surface: SurfaceContract;
};

/**
 * Surface contract for automation runs.
 * Limited tools, no artifacts, no streaming, fixed token budget.
 */
export function getAutomationSurface(
  tier: 'free' | 'lite' | 'plus' | 'pro' | 'ultra',
): SurfaceContract {
  const maxOutputTokens = {
    free: 512,
    lite: 1024,
    plus: 2048,
    pro: 4096,
    ultra: 8192,
  }[tier];

  const maxToolCalls = {
    free: 2,
    lite: 5,
    plus: 10,
    pro: 20,
    ultra: 50,
  }[tier];

  return {
    surface: 'automation',
    scope: { type: 'none' },
    toolMounts: ['knowledge', 'reader'],
    maxOutputTokens,
    allowArtifacts: false,
    allowMemoryWrites: false,
    uiCapabilities: {
      citationsInline: false,
      followupChips: false,
      streaming: false,
    },
    maxToolCalls,
    estimatedCost: 1, // 1 credit per run base
  };
}

/**
 * Convert an AutomationRunInput to a TurnInput for the engine.
 */
export function automationInputToTurnInput(
  input: AutomationRunInput,
): TurnInput {
  return {
    text: input.prompt,
    surface: 'automation',
    agentId: input.agentId ?? 'general',
    ...(input.scopeFileIds ? { scopeFileIds: input.scopeFileIds } : {}),
    includeMemory: input.includeMemory ?? false,
    includeWeb: input.includeWeb ?? false,
  };
}

/**
 * Estimate the cost of an automation run based on prompt length.
 */
export function estimateAutomationCost(
  prompt: string,
  tier: 'free' | 'lite' | 'plus' | 'pro' | 'ultra',
): number {
  // Rough estimate: 1 credit per 1000 chars of prompt
  const baseCost = Math.ceil(prompt.length / 1000);
  const tierMultiplier = {
    free: 0,
    lite: 1,
    plus: 1,
    pro: 0.5, // Pro gets 50% discount
    ultra: 0.25, // Ultra gets 75% discount
  }[tier];
  return Math.max(1, Math.ceil(baseCost * tierMultiplier));
}
