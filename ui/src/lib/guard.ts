// P7.5 (Guard-2) / J21 — the human-in-the-loop approval-card bridge. Mirrors
// the `guard_cmds` / `PendingGuardCard` shape (camelCase); in a plain-browser
// preview the caller falls back to demo data so the card is explorable.

import { inTauri, invoke } from "./tauri";
import { bridgeCall } from './runtime';

/** The structured escalation bundle (doc 52 §2) rendered on the card. */
export interface GuardDecision {
  goal: string;
  proposedDiff: string;
  risk: string;
  affectedPaths: string[];
  scriptLines: string[];
  executionTarget: string;
  envVars: string[];
  networkDestinations: string[];
  webAction: string | null;
  confidence: number | null;
}

/** One pending Guard-2 card. */
export interface GuardTicket {
  ticketId: string;
  agentId: string;
  sessionId: string;
  toolId: string;
  operation: string;
  paths: string[];
  risk: string;
  riskTier?: string;
  approvalSource: string;
  approvalNonce: string;
  expiresAtMs: number;
  decision?: GuardDecision;
}

/** An approve/reject audit receipt. */
export interface GuardReceipt {
  receiptId: string;
  ticketId: string;
  sessionId: string;
  toolId: string;
  operation: string;
  action: "approve" | "reject";
  tsMs: number;
  hash: string;
}

/** The policy + profile + estop summary (Settings guard panel). */
export interface GuardPolicy {
  minConfidenceForAuto: number;
  userFeedbackLearning: boolean;
  profile: string;
  estopPulled: boolean;
}

/** The pending tickets waiting on a human decision (polled by the page). */
export async function guardTickets(): Promise<GuardTicket[]> {
  return bridgeCall({
    operation: 'guard tickets',
    live: () => invoke<GuardTicket[]>("guard_tickets"),
    preview: () => demoTickets(),
  });
}

/** Record a human decision: `approve` or `reject`. */
export async function guardRespond(
  ticketId: string,
  action: "approve" | "reject",
  approvalNonce: string,
): Promise<boolean> {
  return bridgeCall({
    operation: 'guard respond',
    live: () => invoke<boolean>("guard_respond", { ticketId, action, approvalNonce }),
    preview: () => true,
  });
}

/**
 * F1 — route the human to the dedicated Guard-2 approval window. The main
 * renderer displays untrusted content (browser views, generative UI, plugin
 * views); it must never be the surface that approves a ticket. This opens
 * the small `guard` window where the actual approve/reject happens (its
 * `guard_respond` is the only one Rust accepts).
 */
export async function openGuardWindow(): Promise<void> {
  if (!inTauri()) return;
  await invoke<void>("guard_open_window");
}

/** The append-only approve/reject receipts. */
export async function guardReceipts(): Promise<GuardReceipt[]> {
  return bridgeCall({
    operation: 'guard receipts',
    live: () => invoke<GuardReceipt[]>("guard_receipts"),
    preview: () => demoReceipts(),
  });
}

/** P11.5.7 — one recent-actions row (from the J5 audit store). */
export interface RecentAction {
  action: string
  target: string
  scope: string
  time: string
  status: 'ok' | 'warn' | 'err' | 'pending'
}

/** P11.5.7 — the recent-actions log (replaces the hardcoded ACTIONS array). */
export async function guardActivity(limit?: number): Promise<RecentAction[]> {
  return bridgeCall({
    operation: 'guard activity',
    live: () => invoke<RecentAction[]>('guard_activity', { limit }),
    preview: () => demoActivity(),
  })
}

/** P11.5.7 — one permissions-matrix cell (capability × scope). */
export interface MatrixCell {
  capability: string
  scope: string
  decision: 'allow' | 'ask' | 'block' | 'off'
}

/** P11.5.7 — the live 5×5 matrix from permissions.toml. */
export async function guardPermissionsMatrix(): Promise<MatrixCell[]> {
  return bridgeCall({
    operation: 'guard permissions matrix',
    live: () => invoke<MatrixCell[]>('guard_permissions_matrix'),
    preview: () => demoMatrix(),
  })
}

function demoActivity(): RecentAction[] {
  return [
    { action: 'Read', target: 'src/utils.ts', scope: 'workspace read', time: '09:15:02', status: 'ok' },
    { action: 'Write', target: 'src/api/handler.ts', scope: 'workspace write', time: '09:15:04', status: 'ok' },
    { action: 'Browser', target: 'gmail.com (read-only)', scope: 'browser (owned tabs)', time: '09:14:50', status: 'ok' },
    { action: 'Execute', target: 'npm run deploy', scope: 'shell (restricted)', time: '09:15:08', status: 'pending' },
    { action: 'Blocked', target: 'rm -rf /', scope: 'Guard-1 regex', time: '09:15:09', status: 'err' },
  ]
}

function demoMatrix(): MatrixCell[] {
  const grid: Record<string, Record<string, MatrixCell['decision']>> = {
    read: { workspace: 'allow', home: 'ask', shell: 'allow', external: 'ask', browser: 'allow' },
    write: { workspace: 'allow', home: 'block', shell: 'ask', external: 'ask', browser: 'ask' },
    execute: { workspace: 'allow', home: 'block', shell: 'allow', external: 'ask', browser: 'block' },
    network: { workspace: 'ask', home: 'block', shell: 'block', external: 'ask', browser: 'ask' },
    browser: { workspace: 'allow', home: 'ask', shell: 'allow', external: 'ask', browser: 'allow' },
  }
  const caps = ['read', 'write', 'execute', 'network', 'browser']
  const scopes = ['workspace', 'home', 'shell', 'external', 'browser']
  const out: MatrixCell[] = []
  for (const c of caps) for (const s of scopes) out.push({ capability: c, scope: s, decision: grid[c][s] })
  return out
}

/** The policy + profile + estop summary. */
export async function guardPolicy(): Promise<GuardPolicy> {
  return bridgeCall({
    operation: 'guard policy',
    live: () => invoke<GuardPolicy>("guard_policy"),
    preview: () => ({
      minConfidenceForAuto: 0.85,
      userFeedbackLearning: true,
      profile: "standard",
      estopPulled: false,
    }),
  });
}

/** Pull (`pulled=true`) or reset the global estop. */
export async function guardEstop(pulled: boolean): Promise<boolean> {
  return bridgeCall({
    operation: 'guard estop',
    live: () => invoke<boolean>("guard_estop", { pulled }),
    preview: () => pulled,
  });
}

/** P44.5 — the Rust preset name for a UI autonomy level (`maximum` ↔ `full`). */
export type AutonomyLevel =
  | "sandbox"
  | "ask"
  | "auto"
  | "maximum";

export type UIAutonomyLevel = "sandbox" | "ask" | "auto" | "full";

/** The UI `full` ↔ Rust `maximum` mapping (the UI vocabulary predates the
 * preset names; the wire uses the Rust names). */
export function toRustLevel(level: UIAutonomyLevel): AutonomyLevel {
  return level === "full" ? "maximum" : level;
}

export function toUILevel(level: AutonomyLevel): UIAutonomyLevel {
  return level === "maximum" ? "full" : level;
}

/** P44.5 — the Rust-applied H34 level + confidence floor (authoritative). */
export interface GuardAutonomy {
  autonomyLevel: AutonomyLevel;
  minConfidenceForAuto: number;
}

/**
 * P44.5 — the currently applied H34 autonomy level. The Rust preset is the
 * source of truth (the composer indicator must read this, not localStorage).
 */
export async function guardAutonomy(): Promise<UIAutonomyLevel | null> {
  if (!inTauri()) return null;
  const out = await invoke<GuardAutonomy>("guard_autonomy");
  return toUILevel(out.autonomyLevel);
}

/**
 * P44.5 — apply an H34 autonomy level on the live GuardService (as a
 * permissions.toml preset; the hard floors never move). Returns the applied
 * UI level so the caller can confirm.
 */
export async function guardSetAutonomy(level: UIAutonomyLevel): Promise<UIAutonomyLevel | null> {
  if (!inTauri()) return null;
  const out = await invoke<GuardAutonomy>("guard_set_autonomy", {
    level: toRustLevel(level),
  });
  return toUILevel(out.autonomyLevel);
}

function demoTickets(): GuardTicket[] {
  return [
    {
      ticketId: "tkt-demo-1",
      agentId: "agent-researcher",
      sessionId: "sess-q3-budget",
      toolId: "fs.write",
      operation: "write",
      paths: ["/workspace/Q3-Budget.xlsx"],
      risk: "high",
      riskTier: "R3",
      approvalSource: "policy",
      approvalNonce: "demo-approval-nonce",
      expiresAtMs: Date.now() + 60_000,
      decision: {
        goal: "Update the Q3 budget with the 14 extracted receipts",
        proposedDiff: "  cell C2: 4500.00\n- cell C2: 4200.00\n+ cell C2: 4500.00",
        risk: "high",
        affectedPaths: ["/workspace/Q3-Budget.xlsx"],
        scriptLines: [],
        executionTarget: "",
        envVars: [],
        networkDestinations: [],
        webAction: null,
        confidence: 0.93,
      },
    },
    {
      ticketId: "tkt-demo-2",
      agentId: "agent-researcher",
      sessionId: "sess-q3-budget",
      toolId: "browser.navigate",
      operation: "web_action",
      paths: ["https://invoices.example.com/pay"],
      risk: "high",
      riskTier: "R3",
      approvalSource: "policy",
      approvalNonce: "demo-approval-nonce-2",
      expiresAtMs: Date.now() + 60_000,
      decision: {
        goal: "Submit the approved invoice payment on the vendor portal",
        proposedDiff: "POST https://invoices.example.com/pay (invoice #1042)",
        risk: "high",
        affectedPaths: ["https://invoices.example.com/pay"],
        scriptLines: [],
        executionTarget: "browser (owned tab)",
        envVars: [],
        networkDestinations: ["invoices.example.com"],
        webAction: "payment",
        confidence: 0.91,
      },
    },
  ];
}

function demoReceipts(): GuardReceipt[] {
  return [
    {
      receiptId: "rcpt:0",
      ticketId: "tkt-demo-1",
      sessionId: "sess-q3-budget",
      toolId: "fs.write",
      operation: "write",
      action: "approve",
      tsMs: Date.now() - 30_000,
      hash: "0".repeat(64),
    },
  ];
}
