import { inTauri, invoke } from "./tauri";

export interface OAuthAccount {
  provider: string;
  accountId: string;
  email?: string;
  scopes: string;
  expiresAt: number;
}

export async function oauthStatus(): Promise<{ enabled: boolean; providers: string[] }> {
  if (!inTauri()) return { enabled: false, providers: [] };
  return invoke("oauth_status");
}

export async function oauthAccounts(): Promise<OAuthAccount[]> {
  if (!inTauri()) return [];
  const r = await invoke<{ accounts?: OAuthAccount[] }>("oauth_accounts");
  return r.accounts ?? [];
}

export async function oauthStartPkce(provider: string): Promise<{ authUrl: string }> {
  return invoke("oauth_start_pkce", { provider });
}

export async function oauthStartDevice(provider: string): Promise<{
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSecs: number;
}> {
  return invoke("oauth_start_device", { provider });
}

export async function oauthPollDevice(provider: string): Promise<{
  status: string;
  intervalSecs?: number;
  account?: OAuthAccount;
}> {
  return invoke("oauth_poll_device", { provider });
}

export async function oauthRevoke(provider: string, accountId: string): Promise<void> {
  return invoke("oauth_revoke", { provider, accountId });
}
