import { webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  type InjectableSubtleCrypto,
} from '../crypto.js';
import { sealApiKey, unsealApiKey } from '../seal.js';

const subtle = webcrypto.subtle as unknown as InjectableSubtleCrypto;
const getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
const cryptoOptions = { subtle, getRandomValues };

// ---------------------------------------------------------------------------
// encryptSecret / decryptSecret – edge cases
// ---------------------------------------------------------------------------

describe('encryptSecret / decryptSecret — edge cases', () => {
  it('round-trips an empty string', async () => {
    const sealed = await encryptSecret('', 'device-secret', cryptoOptions);
    const restored = await decryptSecret(sealed, 'device-secret', cryptoOptions);
    expect(restored).toBe('');
  });

  it('round-trips a very long string (10 000 chars)', async () => {
    const long = 'x'.repeat(10_000);
    const sealed = await encryptSecret(long, 'device-secret', cryptoOptions);
    const restored = await decryptSecret(sealed, 'device-secret', cryptoOptions);
    expect(restored).toBe(long);
  });

  it('handles multiple concurrent round-trips', async () => {
    const pairs = Array.from({ length: 10 }, (_, i) => ({
      plaintext: `concurrent-payload-${i}-${'a'.repeat(i * 10)}`,
      secret: `secret-${i}-key`,
    }));

    await expect(
      Promise.all(
        pairs.map(async ({ plaintext, secret }) => {
          const sealed = await encryptSecret(plaintext, secret, cryptoOptions);
          const restored = await decryptSecret(sealed, secret, cryptoOptions);
          expect(restored).toBe(plaintext);
        }),
      ),
    ).resolves.toHaveLength(10);
  });

  it('produces different ciphertext each time (IV uniqueness)', async () => {
    const first = await encryptSecret('same-value', 'device-secret', cryptoOptions);
    const second = await encryptSecret('same-value', 'device-secret', cryptoOptions);
    expect(first).not.toBe(second);
  });

  it('fails on tampered ciphertext', async () => {
    const sealed = await encryptSecret('tamper-me', 'secret', cryptoOptions);

    // Tamper a character in the first third of the payload (the IV region).
    // Any change to the IV guarantees AES-GCM authentication will reject.
    const pos = Math.min(5, sealed.length - 2);
    const tampered =
      sealed.slice(0, pos) +
      (sealed[pos] === 'z' ? 'y' : 'z') +
      sealed.slice(pos + 1);

    await expect(decryptSecret(tampered, 'secret', cryptoOptions)).rejects.toThrow();
  });

  it('fails on non-base64 input', async () => {
    // Buffer.from('!!!', 'base64') produces garbage bytes; AES-GCM auth should reject
    await expect(decryptSecret('!!!', 'secret', cryptoOptions)).rejects.toThrow();
  });

  it('fails on truncated payload (shorter than IV length)', async () => {
    // "AAEC" decodes to 3 bytes, well below the 12-byte IV threshold
    await expect(decryptSecret('AAEC', 'secret', cryptoOptions)).rejects.toThrow(
      'Invalid encrypted payload',
    );
  });

  it('falls back to pure-JS AES-GCM when SubtleCrypto is not available', async () => {
    // Stub out global crypto so resolveSubtle() falls back to stablelib
    vi.stubGlobal('crypto', undefined);
    const sealed = await encryptSecret('fallback-test', 'device-secret', {});
    const restored = await decryptSecret(sealed, 'device-secret', {});
    expect(restored).toBe('fallback-test');
    vi.unstubAllGlobals();
  });

  it('produces payloads compatible between WebCrypto and pure-JS fallback', async () => {
    const webSealed = await encryptSecret(' interoperable 🔑', 'device-secret', cryptoOptions);
    vi.stubGlobal('crypto', undefined);
    const fallbackRestored = await decryptSecret(webSealed, 'device-secret', {});
    expect(fallbackRestored).toBe(' interoperable 🔑');

    const fallbackSealed = await encryptSecret('round-trip', 'device-secret', {});
    vi.unstubAllGlobals();
    const webRestored = await decryptSecret(fallbackSealed, 'device-secret', cryptoOptions);
    expect(webRestored).toBe('round-trip');
  });

  it('works with UTF-8 special characters', async () => {
    const utf8 =
      'Hello, 世界! 🌍🔥 éñçöð€ 🎉 中文 한국어 日本語 ✅ émoji: ♠♣♥♦©®™';
    const sealed = await encryptSecret(utf8, 'device-secret', cryptoOptions);
    const restored = await decryptSecret(sealed, 'device-secret', cryptoOptions);
    expect(restored).toBe(utf8);
  });
});

// ---------------------------------------------------------------------------
// sealApiKey / unsealApiKey – edge cases
// ---------------------------------------------------------------------------

describe('sealApiKey / unsealApiKey — edge cases', () => {
  it('round-trips an API key with special characters', async () => {
    const specialKey = 'nvapi-🔥-special-कुंजी-🔑-with-accents-éñç';
    const sealed = await sealApiKey(specialKey, 'device-secret', cryptoOptions);
    const unsealed = await unsealApiKey(sealed, 'device-secret', cryptoOptions);
    expect(unsealed).toBe(specialKey);
  });

  it('produces different ciphertexts for different device secrets', async () => {
    const sealed1 = await sealApiKey('same-api-key', 'device-secret-1', cryptoOptions);
    const sealed2 = await sealApiKey('same-api-key', 'device-secret-2', cryptoOptions);
    expect(sealed1).not.toBe(sealed2);
  });

  it('fails with the wrong device secret', async () => {
    const sealed = await sealApiKey('my-real-key', 'correct-secret', cryptoOptions);
    await expect(
      unsealApiKey(sealed, 'wrong-secret', cryptoOptions),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// InjectableSubtleCrypto – mock error propagation
// ---------------------------------------------------------------------------

describe('InjectableSubtleCrypto mock', () => {
  it('propagates errors from a mock subtle implementation', async () => {
    const errorMessage = 'simulated crypto failure';

    // Provide a realistic SHA-256 digest so deriveKey doesn't fail first
    const mockSubtle: InjectableSubtleCrypto = {
      digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      importKey: vi.fn().mockResolvedValue({} as CryptoKey),
      exportKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      generateKey: vi.fn().mockResolvedValue({} as CryptoKey),
      wrapKey: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      unwrapKey: vi.fn().mockResolvedValue({} as CryptoKey),
      encrypt: vi.fn().mockRejectedValue(new Error(errorMessage)),
      decrypt: vi.fn().mockRejectedValue(new Error(errorMessage)),
    };

    // encryptSecret → deriveKey → subtle.encrypt → reject
    await expect(
      encryptSecret('payload', 'secret', { subtle: mockSubtle }),
    ).rejects.toThrow(errorMessage);

    // decryptSecret → deriveKey → subtle.decrypt → reject
    // Use a payload that is at least 13 bytes (> IV_LENGTH) so it passes the
    // length gate and reaches subtle.decrypt.
    // 24 'A' chars of base64 = 18 decoded bytes (12 IV + 6 ciphertext dummy).
    const longEnoughPayload = 'AAAAAAAAAAAAAAAAAAAAAAAA';
    await expect(
      decryptSecret(longEnoughPayload, 'secret', { subtle: mockSubtle }),
    ).rejects.toThrow(errorMessage);
  });
});
