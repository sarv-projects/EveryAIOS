// F12 / J17 — ACP harness bridge client (doc 45 §1, doc 57 §2). The agent
// picker: one manifest per agent (the `ollama launch` pattern), same chat bar,
// agent differs. The default (`everyaios`) is the inbuilt engine with all
// first-party capabilities; every other entry drives an external agent CLI
// over ACP stdio and obeys the same Guard-2 ticket card.

import { invoke } from "./tauri";
import { nativeCall } from './runtime';

/** Auth-mode badge (F12 — subscription / api_key / local). */
export type AuthMode = "subscription" | "api_key" | "local";

/** How the agent is distributed / driven. */
export type HarnessProtocol = "inbuilt" | "acp" | "model_backend";

/** The agent's advertised ACP auth method (`authMethods` in initialize). */
export interface AuthMethod {
  id: string;
  name: string;
  description?: string;
  /** `agent` (default) | `url` | `terminal` — how login completes. */
  type?: "agent" | "url" | "terminal";
}

export interface HarnessManifest {
  id: string;
  name: string;
  description: string;
  authMode: AuthMode;
  protocol: HarnessProtocol;
  isDefault: boolean;
  /** P50.3.9 — governance truth (present on every row from the shell). */
  governance?: GovernanceInfo;
}

/** P50.3.9 — how much of an agent's effects EveryAIOS actually governs.
 * Never imply audit coverage that does not exist. */
export type GovernanceClass =
  | "GovernedMediated"
  | "SelfContained"
  | "NotGoverned";

export interface GovernanceInfo {
  class: GovernanceClass;
  /** True only when every effect lands on the EveryAIOS audit trail. */
  auditedEffects: boolean;
  note: string;
}

/** Short picker/transcript badge label per governance class. */
export function governanceLabel(g: GovernanceInfo | undefined): string {
  switch (g?.class) {
    case "GovernedMediated":
      return "Governed — every effect ticketed + audited";
    case "SelfContained":
      return "Self-contained — approvals mediated; agent's own effects unaudited";
    case "NotGoverned":
      return "Not governed — no EveryAIOS audit coverage";
    default:
      return "Governance unknown";
  }
}

export interface AcpHandleInfo {
  handle: string;
  agentId: string;
  agentName: string;
  sessionId: string;
  protocol: string;
  /** True when the agent needs sign-in before it accepts a session. */
  authRequired: boolean;
  authMethods: AuthMethod[];
}

export interface AcpPromptResult {
  handle: string;
  stopReason: string;
  updateCount: number;
  permissionCount: number;
  pendingTickets: string[];
}

/** One agent's install state (F8 — flip Install ↔ Launch in the picker). */
export interface InstallState {
  installed: boolean;
  version?: string;
  kind?: string;
  binaryPath?: string | null;
}

/** The install-request verdict (Guard-2 ticket minted, or auto-allowed).
 * Ticket-every-effect: both `allow` and `ask` carry a single-use ticket. */
export interface InstallRequest {
  action: "allow" | "ask";
  agentId: string;
  version: string;
  ticketId: string;
  exactCommand?: string[];
  consentRequired?: boolean;
  preferNative?: boolean;
}

/** The result of `acp_authenticate` (url-type pending vs completed). */
export interface AuthenticateResult {
  ok: boolean;
  sessionId?: string;
  url?: string;
  pending?: boolean;
}

/** Catalog (UI) agent id → ACP registry id. The UI picker labels curated
 * rows with catalog ids (`claude-code`, `codex-cli`, `grok-build`, …); the
 * ACP launch/install registry keys them by registry id (`claude`, `codex`,
 * `grok`, …). Synthesized registry rows already carry their registry id, so
 * unknown ids pass through unchanged. Always translate before `acp_launch` /
 * `acp_install_*` calls. */
const CATALOG_TO_ACP: Record<string, string> = {
  "everyaios-native": "everyaios",
  "claude-code": "claude",
  "codex-cli": "codex",
  "grok-build": "grok",
  "gemini-cli": "gemini",
  "cursor-agent": "cursor",
  aider: "aider",
  opencode: "opencode",
};

export function acpIdFor(catalogId: string): string {
  return CATALOG_TO_ACP[catalogId] ?? catalogId;
}

/** The launch registry (the picker). Default = inbuilt EveryAIOS. */
export async function acpAgents(): Promise<HarnessManifest[]> {
  return nativeCall('ACP agent registry', () => invoke<HarnessManifest[]>("acp_agents"));
}

/** F8 — per-agent install state (installed? version? kind?). */
export async function acpInstallStatus(): Promise<Record<string, InstallState>> {
  return nativeCall('ACP install status', () => invoke<Record<string, InstallState>>("acp_install_status"));
}

/** F8 — plan-before-touch: resolve the plan + mint a Guard-2 ticket (or
 * auto-allow). Nothing is downloaded until `acpInstallCommit`. */
export async function acpInstallRequest(agentId: string): Promise<InstallRequest> {
  return nativeCall('ACP install request', () => invoke<InstallRequest>("acp_install_request", { agentId }));
}

/** F8 — the executor half: consume the (mandatory) single-use ticket and
 * install. Both auto-allowed and approved requests commit with a ticket. */
export async function acpInstallCommit(
  agentId: string,
  ticketId: string,
): Promise<{ agentId: string; version: string; kind: string; binaryPath?: string }> {
  return nativeCall('ACP install commit', () => invoke("acp_install_commit", { agentId, ticketId }));
}

/** Launch an agent: spawn + ACP handshake → a live handle. May report
 * `authRequired` (the agent needs sign-in before it accepts a session). */
export async function acpLaunch(
  agentId: string,
  cwd: string,
): Promise<AcpHandleInfo> {
  return nativeCall('ACP launch', () => invoke<AcpHandleInfo>("acp_launch", { agentId, cwd }));
}

/** Drive the ACP `authenticate` flow on a live handle. Agent-type methods
 * complete immediately; url-type returns `{pending: true, url}` — open the
 * URL in the system browser, then call `acpAuthenticate` again. */
export async function acpAuthenticate(
  handle: string,
  methodId: string,
): Promise<AuthenticateResult> {
  return nativeCall('ACP authenticate', () => invoke<AuthenticateResult>("acp_authenticate", { handle, methodId }));
}

/** Drive one ACP turn. Returns the stop reason + any minted Guard-2 tickets. */
export async function acpPrompt(
  handle: string,
  text: string,
): Promise<AcpPromptResult> {
  return nativeCall('ACP prompt', () => invoke<AcpPromptResult>("acp_prompt", { handle, text }));
}

/** F8 — refresh the official ACP registry cache from the CDN (network).
 * Returns the catalog stats. Fails honestly when offline/uncached. */
export async function acpRegistryRefresh(): Promise<{
  version?: string
  agentCount?: number
  fromCache?: boolean
}> {
  return nativeCall('ACP registry refresh', () => invoke("acp_registry_refresh"));
}

/** Interrupt the ongoing ACP turn. */
export async function acpCancel(handle: string): Promise<void> {
  return nativeCall('ACP cancel', () => invoke("acp_cancel", { handle }));
}

/** Tear an ACP session down (kill + reap). */
export async function acpShutdown(handle: string): Promise<boolean> {
  return nativeCall('ACP shutdown', () => invoke<boolean>("acp_shutdown", { handle }));
}

/** Live ACP handles. */
export async function acpSessions(): Promise<AcpHandleInfo[]> {
  return nativeCall('ACP sessions', () => invoke<AcpHandleInfo[]>("acp_sessions"));
}

/** P38 — the `primary_chief` default (inbuilt | ACP agent id). */
export async function chiefDefaultGet(): Promise<{
  primaryChief: string
  known: string[]
}> {
  return nativeCall('chief default get', () => invoke<{ primaryChief: string; known: string[] }>("chief_default_get"));
}

/** P38 — set the `primary_chief` default. Unknown ids are refused (fail
 * closed — never a silent fallback to the inbuilt engine). */
export async function chiefDefaultSet(primaryChief: string): Promise<string> {
  return nativeCall('chief default set', () => invoke<string>("chief_default_set", { primaryChief }));
}
