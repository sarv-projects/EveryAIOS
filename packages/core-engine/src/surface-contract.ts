import type { SurfaceContract, SurfaceKind } from './types';
import type { Scope } from '@personal-ai/core-domain';

const chatScope: Scope = { type: 'none' };

export function defaultContract(surface: SurfaceKind): SurfaceContract {
  switch (surface) {
    case 'chat':
      return {
        surface: 'chat',
        scope: chatScope,
        toolMounts: ['knowledge', 'automations', 'creation', 'system'],
        maxOutputTokens: 4096,
        allowArtifacts: true,
        allowMemoryWrites: true,
        uiCapabilities: { citationsInline: true, followupChips: true, streaming: true },
      };
    case 'reader':
      return {
        surface: 'reader',
        scope: { type: 'source_hard', sourceId: '' },
        toolMounts: ['reader', 'system'],
        maxOutputTokens: 2048,
        allowArtifacts: false,
        allowMemoryWrites: true,
        uiCapabilities: { citationsInline: true, followupChips: true, streaming: true },
      };
    case 'bubble':
      return {
        surface: 'bubble',
        scope: chatScope,
        toolMounts: ['system'],
        maxOutputTokens: 512,
        allowArtifacts: false,
        allowMemoryWrites: false,
        uiCapabilities: { citationsInline: false, followupChips: false, streaming: true },
      };
    case 'automation':
      return {
        surface: 'automation',
        scope: chatScope,
        toolMounts: ['knowledge', 'reader', 'system'],
        maxOutputTokens: 2048,
        allowArtifacts: false,
        allowMemoryWrites: false,
        uiCapabilities: { citationsInline: false, followupChips: false, streaming: true },
      };
    default:
      return {
        surface: 'chat',
        scope: chatScope,
        toolMounts: ['knowledge', 'system'],
        maxOutputTokens: 4096,
        allowArtifacts: true,
        allowMemoryWrites: true,
        uiCapabilities: { citationsInline: true, followupChips: true, streaming: true },
      };
  }
}
