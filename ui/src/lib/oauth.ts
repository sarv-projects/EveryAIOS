import { inTauri, invoke } from "./tauri";
import { nativeCall } from './runtime';

export interface OAuthAccount {
  provider: string;
  accountId: string;
  email?: string;
  scopes: string;
  expiresAt: number;
}

export async function oauthStatus(): Promise<{ enabled: boolean; providers: string[] }> {
  if (!inTauri()) return { enabled: false, providers: [] };
  return nativeCall('OAuth status', () => invoke("oauth_status"));
}

export async function oauthAccounts(): Promise<OAuthAccount[]> {
  if (!inTauri()) return [];
  const r = await nativeCall('OAuth accounts', () => invoke<{ accounts?: OAuthAccount[] }>("oauth_accounts"));
  return r.accounts ?? [];
}

export async function oauthStartPkce(provider: string): Promise<{ authUrl: string }> {
  return nativeCall('OAuth PKCE start', () => invoke("oauth_start_pkce", { provider }));
}

export async function oauthStartDevice(provider: string): Promise<{
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSecs: number;
}> {
  return nativeCall('OAuth device start', () => invoke("oauth_start_device", { provider }));
}

export async function oauthPollDevice(provider: string): Promise<{
  status: string;
  intervalSecs?: number;
  account?: OAuthAccount;
}> {
  return nativeCall('OAuth device poll', () => invoke("oauth_poll_device", { provider }));
}

export async function oauthRevoke(provider: string, accountId: string): Promise<void> {
  return nativeCall('OAuth revoke', () => invoke("oauth_revoke", { provider, accountId }));
}
