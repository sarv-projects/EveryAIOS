import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, type InjectableSubtleCrypto } from '../crypto.js';
import { sealApiKey, unsealApiKey } from '../seal.js';

const subtle = webcrypto.subtle as unknown as InjectableSubtleCrypto;
const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
const cryptoOptions = { subtle, getRandomValues };

describe('encryptSecret / decryptSecret', () => {
  it('round-trips plaintext with AES-256-GCM', async () => {
    const sealed = await encryptSecret('sk-test-key-123', 'device-secret', cryptoOptions);
    const restored = await decryptSecret(sealed, 'device-secret', cryptoOptions);
    expect(restored).toBe('sk-test-key-123');
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const first = await encryptSecret('same-value', 'device-secret', cryptoOptions);
    const second = await encryptSecret('same-value', 'device-secret', cryptoOptions);
    expect(first).not.toBe(second);
  });

  it('fails decryption with the wrong secret', async () => {
    const sealed = await encryptSecret('secret-value', 'correct-secret', cryptoOptions);
    await expect(decryptSecret(sealed, 'wrong-secret', cryptoOptions)).rejects.toThrow();
  });
});

describe('sealApiKey / unsealApiKey', () => {
  it('seals and unseals API keys', async () => {
    const sealed = await sealApiKey('nvapi-abc', 'device-secret', cryptoOptions);
    const apiKey = await unsealApiKey(sealed, 'device-secret', cryptoOptions);
    expect(apiKey).toBe('nvapi-abc');
  });
});