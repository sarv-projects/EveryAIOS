// F12 / J17 — ACP harness bridge client (doc 45 §1, doc 57 §2). The agent
// picker: one manifest per agent (the `ollama launch` pattern), same chat bar,
// agent differs. The default (`everyaios`) is the inbuilt engine with all
// first-party capabilities; every other entry drives an external agent CLI
// over ACP stdio and obeys the same Guard-2 ticket card.

import { invoke } from "./tauri";
import { nativeCall } from './runtime';

/**
 * Auth-mode badge (F12). **Canonical spelling** (P69.C11) — a projection of
 * `everyaios_types::AuthMode`; one union for the whole stack, never a second
 * hand-maintained variant list.
 *
 * `local` means local inference on this machine (Ollama / llamafile /
 * on-device) per `ARCH/03-BYOK-KEYRINGS.md` §3.0 — it is not an open-source
 * marker. Anything the authoritative source is silent about is `unknown` and
 * must render as unknown. The legacy `'local_cli'` auth spelling is deleted
 * (it survives only in the readiness vocabulary, which is a UI state).
 */
export type AuthMode =
  | "subscription"
  | "api_key"
  | "local"
  | "keyless"
  | "unknown";

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

export interface AcpConfigOptionValue {
  value: string | boolean
  name: string
  description?: string
}

export interface AcpConfigOption {
  id: string
  name: string
  description?: string
  category?: string
  type: 'select' | 'boolean' | string
  currentValue: string | boolean
  options?: AcpConfigOptionValue[]
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
  /** P53.8 — the agent advertised `promptCapabilities.embeddedContext`. */
  embeddedContext: boolean;
  /** Complete agent-owned session options, including model when exposed. */
  configOptions?: AcpConfigOption[]
}

/** One live slash command advertised by the agent (P53.1). */
export interface AvailableCommand {
  name: string
  description: string
  /** Optional JSON-schema-ish input hint (opaque — rendered as help text). */
  input?: unknown
}

export interface AcpPromptUpdate {
  sessionId?: string;
  sessionUpdate?: string;
  content?: { type?: string; text?: string }[];
  toolCallId?: string;
  title?: string;
  status?: string;
  /** P53.1 — live slash vocabulary (only on `available_commands_update`). */
  availableCommands?: AvailableCommand[];
  /** Complete agent-owned config state (only on `config_option_update`). */
  configOptions?: AcpConfigOption[];
}

export interface AcpPromptResult {
  handle: string;
  stopReason: string;
  updateCount: number;
  permissionCount: number;
  pendingTickets: string[];
  /** Actual assistant/session output collected by the ACP client. */
  finalText?: string;
  updates?: AcpPromptUpdate[];
  executionId?: string;
}

/** P66 — non-secret runtime provenance. Catalog membership is not occupancy. */
export type RuntimeLocation =
  | { kind: 'managed'; source: 'everyaios_install'; executable?: string; version?: string | null; verifiedAt?: string | null }
  | { kind: 'path' | 'windows_path'; source: 'path_probe' | 'app_paths' | 'user_selected'; executable: string; version?: string | null; verifiedAt?: string | null }
  | { kind: 'package_manager'; source: 'path_probe' | 'everyaios_install'; manager: 'npx' | 'uvx'; command?: string; package?: string; version?: string | null; verifiedAt?: string | null }
  | { kind: 'wsl'; source: 'wsl_probe' | 'user_selected'; distro: string; linuxPath: string; windowsLauncher: string; version?: string | null; verifiedAt?: string | null }
  | { kind: 'unavailable'; source: 'registry_catalog' | 'path_probe'; reason: string };

/** One agent's install state (F8/P66 — flip Install ↔ Launch honestly). */
export interface InstallState {
  /** EveryAIOS-managed install or package-manager-ready launch path. */
  installed: boolean;
  /** A catalog entry has a verified runtime location, including WSL-only. */
  discovered?: boolean;
  /** The selected native launch adapter can currently start it. */
  launchable?: boolean;
  version?: string;
  kind?: string;
  binaryPath?: string | null;
  location?: RuntimeLocation;
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
  /** P69.C12 — the consent surface's evidence: license (+ published URL),
   * verdict, why, and which catalog the row came from. Never empty. */
  license?: string;
  licenseUrl?: string | null;
  verdict?: "allow" | "ask";
  reason?: string;
  source?: string;
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
/** P69.D1 — one directory entry, composed server-side by
 * `everyaios_agents::AgentDirectory`. The UI renders these rows; it never
 * merges agent lists of its own (the ACP registry, the local bundle store and
 * the inbuilt engine meet in one place, in Rust). */
export interface AgentDirectoryEntry {
  id: string;
  name: string;
  description: string;
  protocol: HarnessProtocol;
  authMode: AuthMode;
  isDefault: boolean;
  /** Where the row came from — provenance the picker must be able to show. */
  source: 'inbuilt' | 'acp_registry' | 'discovered' | 'local_bundle' | 'mcp';
  installed: boolean;
  /** Whether the user may remove this row (discovered / local bundles only). */
  removable: boolean;
  /** Install/distribution hint, e.g. `npx: @scope/pkg` — never a secret. */
  locator: string | null;
}

export interface AgentDirectorySnapshot {
  agents: AgentDirectoryEntry[];
  defaultAgentId: string;
  bundleCount: number;
  total: number;
}

/**
 * The canonical agent directory (P69.D1). Prefer this over `acpAgents()` when
 * a surface needs to *enumerate* agents (picker, settings list, subagent
 * mix): it is the composed truth including local `agent.toml` bundles.
 */
export async function agentDirectoryList(): Promise<AgentDirectorySnapshot> {
  return nativeCall('agent directory', () => invoke<AgentDirectorySnapshot>('agent_directory_list'));
}

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

/** P69.C12 — wait for the user's Guard-window answer on an `ask` install,
 * then commit only when approved. A rejection or timeout resolves
 * `approved: false` with an honest reason; nothing is installed. */
export async function acpInstallAwait(
  ticketId: string,
  timeoutMs?: number,
): Promise<{ approved: boolean; reason?: string }> {
  return nativeCall('ACP install await consent', () =>
    invoke<{ approved: boolean; reason?: string }>("acp_install_await", { ticketId, timeoutMs }),
  );
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
  handoff?: string,
  refs?: string[],
): Promise<AcpPromptResult> {
  return nativeCall('ACP prompt', () => invoke<AcpPromptResult>("acp_prompt", {
    handle,
    text,
    ...(handoff ? { handoff } : {}),
    ...(refs?.length ? { refs } : {}),
  }));
}

/** P53.1 — the agent's live slash vocabulary for one ACP handle (from the
 * most recent `available_commands_update`; empty until the agent sends one).
 * Never a hardcoded per-harness table. */
export async function acpSessionCommands(handle: string): Promise<AvailableCommand[]> {
  return nativeCall('ACP session commands', () => invoke<AvailableCommand[]>("acp_session_commands", { handle }));
}

/** The selected external agent's own session configuration vocabulary. */
export async function acpSessionConfigOptions(handle: string): Promise<AcpConfigOption[]> {
  return nativeCall('ACP session config options', () =>
    invoke<AcpConfigOption[]>("acp_session_config_options", { handle }),
  )
}

/** Set one external agent-owned session option; returns the complete updated list. */
export async function acpSessionSetConfigOption(
  handle: string,
  configId: string,
  value: string | boolean,
): Promise<AcpConfigOption[]> {
  return nativeCall('ACP session config option', () =>
    invoke<AcpConfigOption[]>("acp_session_set_config_option", {
      handle,
      configId,
      value,
    }),
  )
}

/** P53.5 — per-session tool observability (one row per ACP turn). Metrics
 * the user can open — never imported into chat context. */
export interface AcpToolLogEntry {
  tsMs: number
  handle: string
  agentId: string
  promptPrefix: string
  stopReason: string
  toolCalls: { toolCallId: string; title: string; kind?: string; status?: string }[]
}

/** P53.5 — read the session's tool log (newest last). Empty until the first
 * ACP turn lands for that session. */
export async function acpToolLog(sessionId: string): Promise<AcpToolLogEntry[]> {
  return nativeCall('ACP tool log', () => invoke<AcpToolLogEntry[]>("acp_tool_log", { sessionId }));
}

/** P53.6 — one installed subagent CLI + its shipped vs user when-to-use. */
export interface SubagentRow {
  agentId: string
  name: string
  defaultWhenToUse: string
  whenToUse: string
  customized: boolean
  enabled: boolean
}

/** P53.6 — installed CLIs only (same `agent_installed` predicate Chief
 * occupancy uses). Empty = none installed on this machine yet. */
export async function chiefSubagents(): Promise<SubagentRow[]> {
  return nativeCall('chief subagents', () => invoke<SubagentRow[]>("chief_subagents"));
}

/** P53.6 — set (or clear, with an empty note) one installed subagent's
 * when-to-use override. Refuses unknown/uninstalled ids fail-closed. */
export async function chiefSubagentSetNote(agentId: string, note: string): Promise<string> {
  return nativeCall('chief subagent note', () => invoke<string>("chief_subagent_set_note", { agentId, note }));
}

/** P53.6 — include/exclude an installed CLI from the Chief delegation mix. */
export async function chiefSubagentSetEnabled(agentId: string, enabled: boolean): Promise<boolean> {
  return nativeCall('chief subagent enabled', () => invoke<boolean>("chief_subagent_set_enabled", { agentId, enabled }));
}

/** P53.6 — enabled installed CLIs, for handoff/delegation context. */
export async function chiefSubagentMix(): Promise<SubagentRow[]> {
  return nativeCall('chief subagent mix', () => invoke<SubagentRow[]>("chief_subagent_mix"));
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

export type AgentLifecycleState = 'discover' | 'inspect' | 'import' | 'verify' | 'ready'

export interface AgentVerificationResult {
  agentId: string
  status: 'ready' | 'degraded' | 'unavailable'
  executable?: string
  version?: string
  reason?: string
  verifiedAt: number
}

/** P66.2 — Import a user-specified executable path for an agent. */
export async function acpAgentImport(
  agentId: string,
  binaryPath: string,
): Promise<{
  agentId: string
  status: string
  binaryPath: string
  location?: unknown
  auditSeq?: number
}> {
  return nativeCall('ACP agent import', () =>
    invoke('acp_agent_import', { agentId, binaryPath }),
  )
}

/** P66.2 — Probe and verify an agent executable. */
export async function acpAgentVerify(
  agentId: string,
): Promise<AgentVerificationResult> {
  return nativeCall('ACP agent verify', () =>
    invoke<AgentVerificationResult>('acp_agent_verify', { agentId }),
  )
}

/**
 * Derive the current explicit lifecycle state for an agent.
 */
export function getAgentLifecycleState(
  status: string,
  launchable: boolean,
  verified?: boolean,
): AgentLifecycleState {
  if (status === 'installed' || (status === 'discovered' && launchable && verified)) {
    return 'ready'
  }
  if (status === 'discovered' && launchable) {
    return 'verify'
  }
  if (status === 'discovered') {
    return 'inspect'
  }
  if (status === 'updating') {
    return 'import'
  }
  return 'discover'
}

