import { sealApiKey, unsealApiKey } from '@personal-ai/core-security';
import { getProviderById } from './registry.js';
import { validateApiKey } from './openai-client.js';
import { validateAnthropicApiKey } from './anthropic-client.js';
import type {
  ConnectedProvider,
  KeyValueStore,
  StoredProviderRecord,
} from './types.js';

const VAULT_STORAGE_KEY = 'byok.providers.v1';

/** Simple promise-chain mutex to prevent lost-update race on read-modify-write operations. */
class VaultMutex {
  private chain: Promise<void> = Promise.resolve();
  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.chain = this.chain.then(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

export class ProviderVault {
  private readonly mutex = new VaultMutex();

  constructor(
    private readonly store: KeyValueStore,
    private readonly deviceSecret: string,
  ) {}

  async list(): Promise<ConnectedProvider[]> {
    const records = await this.readRecords();
    return records
      .map((record) => this.toConnectedProvider(record))
      .filter((provider): provider is ConnectedProvider => provider != null);
  }

  async getActive(): Promise<ConnectedProvider[]> {
    const providers = await this.list();
    return providers.filter((provider) => provider.isActive);
  }

  async save(input: {
    id: string;
    apiKey: string;
    model?: string;
    isActive?: boolean;
    /** Custom endpoint override (Azure/Databricks/Snowflake/Bedrock/Vertex). */
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  }): Promise<ConnectedProvider> {
    const catalog = getProviderById(input.id);
    if (!catalog) {
      throw new Error(`Unknown provider: ${input.id}`);
    }

    const model = input.model?.trim() || catalog.defaultModel;
    const baseUrlOverride = input.baseUrl?.trim();
    const validationConfig = {
      // C.6: use the user's endpoint when given (template URLs like
      // https://YOUR_RESOURCE.openai.azure.com/... can never validate).
      baseUrl: baseUrlOverride || catalog.baseUrl,
      apiKey: input.apiKey.trim(),
      model,
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
    };
    if (catalog.id === 'anthropic') {
      const validation = await validateAnthropicApiKey(validationConfig);
      if (!validation.ok) {
        throw new Error(validation.error ?? 'Anthropic API key validation failed');
      }
    } else if (catalog.validation !== 'key-only') {
      const validation = await validateApiKey(validationConfig);
      if (!validation.ok) {
        throw new Error(validation.error ?? 'API key validation failed');
      }
    } else if (!input.apiKey.trim()) {
      throw new Error('API key is required');
    }

    // Validate outside mutex (network), then lock for read-modify-write only.
    const sealedKey = await sealApiKey(input.apiKey.trim(), this.deviceSecret);

    const connected = await this.mutex.acquire(async () => {
      const records = await this.readRecords();
      const existing = records.find((r) => r.id === input.id);
      const nextRecord: StoredProviderRecord = {
        id: input.id,
        model,
        // #25: re-save must NOT silently re-activate a deactivated provider
        // (the old `?? true` did). Preserve the current state when unspecified.
        isActive: input.isActive ?? existing?.isActive ?? true,
        sealedKey,
        // Preserve original connectedAt on re-save; only set on first connect.
        connectedAt: existing?.connectedAt ?? new Date().toISOString(),
        ...(baseUrlOverride ? { baseUrl: baseUrlOverride } : {}),
      };
      const withoutCurrent = records.filter((record) => record.id !== input.id);
      await this.writeRecords([...withoutCurrent, nextRecord]);
      const result = this.toConnectedProvider(nextRecord);
      if (!result) {
        throw new Error(`Failed to persist provider: ${input.id}`);
      }
      return result;
    });
    return connected;
  }

  async remove(id: string): Promise<void> {
    await this.mutex.acquire(async () => {
      const records = await this.readRecords();
      await this.writeRecords(records.filter((record) => record.id !== id));
    });
  }

  async setActive(id: string, isActive: boolean): Promise<ConnectedProvider> {
    return this.mutex.acquire(async () => {
      const records = await this.readRecords();
      const record = records.find((entry) => entry.id === id);
      if (!record) {
        throw new Error(`Provider not connected: ${id}`);
      }
      const updated: StoredProviderRecord = { ...record, isActive };
      const nextRecords = records.map((entry) => (entry.id === id ? updated : entry));
      await this.writeRecords(nextRecords);
      const connected = this.toConnectedProvider(updated);
      if (!connected) {
        throw new Error(`Provider not connected: ${id}`);
      }
      return connected;
    });
  }

  async getApiKey(id: string): Promise<string | null> {
    return this.mutex.acquire(async () => {
      const records = await this.readRecords();
      const record = records.find((entry) => entry.id === id);
      if (!record) {
        return null;
      }
      return unsealApiKey(record.sealedKey, this.deviceSecret);
    });
  }

  private toConnectedProvider(record: StoredProviderRecord): ConnectedProvider | null {
    const catalog = getProviderById(record.id);
    if (!catalog) {
      return null;
    }
    return {
      id: record.id,
      name: catalog.name,
      group: catalog.group,
      groupLabel: catalog.groupLabel,
      // Prefer the user's saved endpoint override; fall back to catalog default.
      baseUrl: record.baseUrl || catalog.baseUrl,
      model: record.model,
      isActive: record.isActive,
      connectedAt: record.connectedAt,
    };
  }

  private async readRecords(): Promise<StoredProviderRecord[]> {
    const raw = await this.store.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as StoredProviderRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeRecords(records: StoredProviderRecord[]): Promise<void> {
    await this.store.setItem(VAULT_STORAGE_KEY, JSON.stringify(records));
  }
}