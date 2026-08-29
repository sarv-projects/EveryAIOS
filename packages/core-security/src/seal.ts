import { decryptSecret, encryptSecret, type CryptoOptions } from './crypto.js';

/** Seal an API key with the device secret before persisting to secure storage. */
export async function sealApiKey(
  apiKey: string,
  deviceSecret: string,
  options: CryptoOptions = {},
): Promise<string> {
  return encryptSecret(apiKey, deviceSecret, options);
}

/** Restore a sealed API key using the device secret. */
export async function unsealApiKey(
  sealed: string,
  deviceSecret: string,
  options: CryptoOptions = {},
): Promise<string> {
  return decryptSecret(sealed, deviceSecret, options);
}