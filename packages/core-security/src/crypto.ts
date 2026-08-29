import { AES } from '@stablelib/aes';
import { GCM } from '@stablelib/gcm';
import { SHA256 } from '@stablelib/sha256';

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;

/** Narrow SubtleCrypto surface used across the app for test injection and Hermes fallback. */
export interface InjectableSubtleCrypto {
  digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>;
  importKey(
    format: 'raw' | 'jwk',
    keyData: BufferSource | JsonWebKey,
    algorithm: AlgorithmIdentifier | AesKeyAlgorithm,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey>;
  exportKey(format: 'raw' | 'jwk', key: CryptoKey): Promise<ArrayBuffer | JsonWebKey>;
  generateKey(
    algorithm: AlgorithmIdentifier | AesKeyAlgorithm,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey>;
  wrapKey(
    format: 'raw' | 'jwk',
    key: CryptoKey,
    wrappingKey: CryptoKey,
    wrapAlgorithm: AlgorithmIdentifier | AesGcmParams,
  ): Promise<ArrayBuffer | JsonWebKey>;
  unwrapKey(
    format: 'raw' | 'jwk',
    wrappedKey: BufferSource,
    unwrappingKey: CryptoKey,
    unwrapAlgorithm: AlgorithmIdentifier | AesGcmParams,
    keyAlgorithm: AlgorithmIdentifier | AesKeyAlgorithm,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey>;
  encrypt(algorithm: AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
  decrypt(algorithm: AesGcmParams, key: CryptoKey, data: BufferSource): Promise<ArrayBuffer>;
}

export type CryptoOptions = {
  subtle?: InjectableSubtleCrypto;
  getRandomValues?: (buffer: Uint8Array) => Uint8Array;
};

function bufferSourceToUint8Array(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** CryptoKey stand-in used by the pure-JS fallback. */
class StableCryptoKey {
  constructor(public readonly data: Uint8Array) {}
}

/**
 * Pure-JS SubtleCrypto implementation for environments without Web Crypto
 * (e.g. React Native). Uses AES-256-GCM via stablelib, which produces the same
 * ciphertext/tag layout as WebCrypto so payloads are interchangeable.
 */
function createStableSubtle(): InjectableSubtleCrypto {
  const random = createStableRandom();

  return {
    async digest(_algorithm, data) {
      const bytes = bufferSourceToUint8Array(data);
      const hash = new SHA256().update(bytes).digest();
      return arrayBufferFromBytes(hash);
    },
    async importKey(format, keyData, _algorithm, _extractable, _usages) {
      if (format === 'jwk') {
        const jwk = keyData as JsonWebKey;
        const k = jwk.k;
        if (!k) throw new Error('JWK key missing "k" field');
        const raw = Uint8Array.from(atob(k), (c) => c.charCodeAt(0));
        return new StableCryptoKey(raw) as unknown as CryptoKey;
      }
      return new StableCryptoKey(bufferSourceToUint8Array(keyData as BufferSource)) as unknown as CryptoKey;
    },
    async exportKey(format, key) {
      const keyBytes = (key as unknown as StableCryptoKey).data;
      if (format === 'raw') {
        return arrayBufferFromBytes(keyBytes);
      }
      let binary = '';
      for (const b of keyBytes) binary += String.fromCharCode(b);
      return { kty: 'oct', k: btoa(binary), alg: 'A256GCM', ext: true } as JsonWebKey;
    },
    async generateKey(algorithm, _extractable, _usages) {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name !== 'AES-GCM') throw new Error(`StableSubtle: unsupported algorithm ${name}`);
      const aesAlg = algorithm as AesKeyAlgorithm;
      const length = aesAlg.length || 256;
      const bytes = new Uint8Array(length / 8);
      random(bytes);
      return new StableCryptoKey(bytes) as unknown as CryptoKey;
    },
    async wrapKey(format, key, wrappingKey, wrapAlgorithm) {
      const keyBytes = (key as unknown as StableCryptoKey).data;
      const iv = bufferSourceToUint8Array((wrapAlgorithm as AesGcmParams).iv);
      const wkBytes = (wrappingKey as unknown as StableCryptoKey).data;
      const sealed = new GCM(new AES(wkBytes)).seal(iv, keyBytes);
      if (format === 'raw') return arrayBufferFromBytes(sealed);
      let binary = '';
      for (const b of sealed) binary += String.fromCharCode(b);
      return { kty: 'oct', k: btoa(binary) } as JsonWebKey;
    },
    async unwrapKey(format, wrappedKey, unwrappingKey, unwrapAlgorithm, _keyAlgorithm, _extractable, _usages) {
      const iv = bufferSourceToUint8Array((unwrapAlgorithm as AesGcmParams).iv);
      const ukBytes = (unwrappingKey as unknown as StableCryptoKey).data;
      let ciphertext: Uint8Array;
      if (format === 'raw') {
        ciphertext = bufferSourceToUint8Array(wrappedKey as BufferSource);
      } else {
        const jwk = wrappedKey as JsonWebKey;
        ciphertext = Uint8Array.from(atob(jwk.k!), (c) => c.charCodeAt(0));
      }
      const opened = new GCM(new AES(ukBytes)).open(iv, ciphertext);
      if (!opened) throw new Error('AES-GCM unwrap authentication failed');
      return new StableCryptoKey(opened) as unknown as CryptoKey;
    },
    async encrypt(algorithm, key, data) {
      const iv = bufferSourceToUint8Array((algorithm as AesGcmParams).iv);
      const keyBytes = (key as unknown as StableCryptoKey).data;
      const plaintext = bufferSourceToUint8Array(data);
      const sealed = new GCM(new AES(keyBytes)).seal(iv, plaintext);
      return arrayBufferFromBytes(sealed);
    },
    async decrypt(algorithm, key, data) {
      const iv = bufferSourceToUint8Array((algorithm as AesGcmParams).iv);
      const keyBytes = (key as unknown as StableCryptoKey).data;
      const ciphertext = bufferSourceToUint8Array(data);
      const opened = new GCM(new AES(keyBytes)).open(iv, ciphertext);
      if (!opened) {
        throw new Error('AES-GCM authentication failed');
      }
      return arrayBufferFromBytes(opened);
    },
  };
}

/** Best-effort synchronous random source when Web Crypto getRandomValues is missing. */
function createStableRandom(): (buffer: Uint8Array) => Uint8Array {
  return (buffer) => {
    // React Native provides crypto.getRandomValues via react-native-get-random-values,
    // so this fallback is only reached in test/edge environments. Try Node's CSPRNG first.
    try {
       
      const nodeCrypto = require('crypto') as { randomBytes?: (length: number) => Buffer };
      if (typeof nodeCrypto.randomBytes === 'function') {
        const bytes = nodeCrypto.randomBytes(buffer.length) as Buffer;
        if (!bytes) {
          throw new Error('Node crypto.randomBytes returned empty value');
        }
        buffer.set(bytes);
        return buffer;
      }
    } catch {
      /* not in Node or require unavailable */
    }
    throw new Error('Web Crypto API (getRandomValues) is not available');
  };
}

function isCompleteSubtle(obj: unknown): obj is InjectableSubtleCrypto {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Record<string, unknown>;
  return (
    typeof s.digest === 'function' &&
    typeof s.importKey === 'function' &&
    typeof s.exportKey === 'function' &&
    typeof s.generateKey === 'function' &&
    typeof s.wrapKey === 'function' &&
    typeof s.unwrapKey === 'function' &&
    typeof s.encrypt === 'function' &&
    typeof s.decrypt === 'function'
  );
}

export function resolveSubtle(options: CryptoOptions = {}): InjectableSubtleCrypto {
  const native = options.subtle ?? (globalThis.crypto?.subtle as InjectableSubtleCrypto | undefined);
  if (isCompleteSubtle(native)) {
    return native;
  }
  return createStableSubtle();
}

function resolveRandom(options: CryptoOptions): (buffer: Uint8Array) => Uint8Array {
  const random = options.getRandomValues ?? globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!random) {
    return createStableRandom();
  }
  return random;
}

/**
 * Derives AES-256 key from a HIGH-ENTROPY secret (≥256 bits).
 * WARNING: Do NOT use with user passwords — use deriveKeyFromPassword() instead.
 */
async function deriveKey(secret: string, subtle: InjectableSubtleCrypto): Promise<CryptoKey> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return subtle.importKey('raw', digest, { name: ALGORITHM, length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Generates a cryptographically secure random 16-byte salt.
 * Uses the resolved CSPRNG from CryptoOptions (Web Crypto or fallback).
 */
export function generateSalt(options: CryptoOptions = {}): Uint8Array {
  const random = resolveRandom(options);
  const salt = new Uint8Array(16);
  random(salt);
  return salt;
}

/**
 * Derives an AES-256-GCM key from a user-supplied password using PBKDF2
 * with 100,000 iterations and SHA-256. Suitable for low-entropy inputs.
 * Requires full Web Crypto API — not available in the stablelib fallback.
 * @param password - The user's password (any length).
 * @param salt - A 16-byte CSPRNG salt (use generateSalt()).
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  options: CryptoOptions = {},
): Promise<CryptoKey> {
  const subtle =
    options.subtle ??
    ((globalThis.crypto?.subtle as InjectableSubtleCrypto | undefined) ?? createStableSubtle());
  const enc = new TextEncoder();
  const keyMaterial = await (subtle as unknown as typeof crypto.subtle).importKey(
    'raw',
    enc.encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return (subtle as unknown as typeof crypto.subtle).deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(encoded: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Decode a base64-encoded UTF-8 string. Avoids TextDecoder for wider RN support. */
export function base64ToString(encoded: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(encoded, 'base64').toString('utf8');
  }
  return atob(encoded);
}

/** Encrypt a secret with AES-256-GCM. Returns base64(iv || ciphertext). */
export async function encryptSecret(
  plaintext: string,
  secret: string,
  options: CryptoOptions = {},
): Promise<string> {
  const subtle = resolveSubtle(options);
  const random = resolveRandom(options);
  const key = await deriveKey(secret, subtle);
  const iv = new Uint8Array(IV_LENGTH);
  random(iv);
  const ciphertext = await subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(payload);
}

/** Decrypt a payload produced by encryptSecret. */
export async function decryptSecret(
  encoded: string,
  secret: string,
  options: CryptoOptions = {},
): Promise<string> {
  const subtle = resolveSubtle(options);
  const key = await deriveKey(secret, subtle);
  const payload = fromBase64(encoded);
  if (payload.length <= IV_LENGTH) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = payload.slice(0, IV_LENGTH);
  const ciphertext = payload.slice(IV_LENGTH);
  const decrypted = await subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
